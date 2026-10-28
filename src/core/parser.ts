import PostalMime, { type Address, type Attachment } from 'postal-mime';
import { unzipSync } from 'fflate';
import { recoverLatin1Name } from './encoding';
import {
  extensionFromMime,
  isMailFile,
  isZipFile,
  mimeFromFilename,
  resolveMimeType,
  safeFilename,
} from './files';
import type { AttachmentNode, MailAddress, ParsedMail } from './types';

export interface ParseLimits {
  /** 첨부 속 메일·압축 파일을 몇 단계까지 펼칠지 */
  maxDepth: number;
  /** 메일 하나에서 압축을 풀 수 있는 총 바이트 수 (압축 폭탄 방지) */
  maxExtractedBytes: number;
  /** 메일 하나에서 압축을 풀 수 있는 총 항목 수 */
  maxExtractedEntries: number;
}

export const DEFAULT_LIMITS: ParseLimits = {
  maxDepth: 5,
  maxExtractedBytes: 512 * 1024 * 1024,
  maxExtractedEntries: 5000,
};

interface Budget {
  limits: ParseLimits;
  bytesLeft: number;
  entriesLeft: number;
}

export async function parseEml(
  raw: Uint8Array | ArrayBuffer,
  limits: ParseLimits = DEFAULT_LIMITS,
): Promise<ParsedMail> {
  const budget: Budget = {
    limits,
    bytesLeft: limits.maxExtractedBytes,
    entriesLeft: limits.maxExtractedEntries,
  };
  return parseMail(toBytes(raw), '', 0, budget);
}

async function parseMail(raw: Uint8Array, idPrefix: string, depth: number, budget: Budget): Promise<ParsedMail> {
  // 중첩 메일은 postal-mime이 본문에 합쳐 버리지 않도록 첨부로 받아서 직접 펼친다
  const email = await PostalMime.parse(raw, {
    forceRfc822Attachments: true,
    attachmentEncoding: 'arraybuffer',
  });

  const attachments: AttachmentNode[] = [];
  for (const [index, attachment] of email.attachments.entries()) {
    const node = toNode(attachment, `${idPrefix}${index}`, index);
    await expand(node, depth, budget);
    if (!attachment.filename?.trim() && node.children?.kind === 'mail' && node.children.mail.subject) {
      node.filename = `${safeFilename(node.children.mail.subject, 'message')}.eml`;
    }
    attachments.push(node);
  }

  return {
    subject: email.subject ?? '',
    from: flattenAddresses(email.from ? [email.from] : []),
    to: flattenAddresses(email.to),
    cc: flattenAddresses(email.cc),
    bcc: flattenAddresses(email.bcc),
    replyTo: flattenAddresses(email.replyTo),
    date: email.date,
    messageId: email.messageId,
    html: email.html,
    text: email.text,
    headers: email.headers.map((header) => ({ key: header.originalKey, value: header.value })),
    attachments,
  };
}

function toNode(attachment: Attachment, id: string, index: number): AttachmentNode {
  const content = toBytes(attachment.content);
  const declaredType = attachment.mimeType || 'application/octet-stream';
  const filename = attachment.filename?.trim() || fallbackFilename(declaredType, index);
  return {
    id,
    filename,
    mimeType: resolveMimeType(filename, declaredType),
    size: content.byteLength,
    inline: Boolean(attachment.related),
    contentId: attachment.contentId?.replace(/^<|>$/g, ''),
    content,
  };
}

function fallbackFilename(mimeType: string, index: number): string {
  const ext = extensionFromMime(mimeType) ?? 'bin';
  return `${ext === 'eml' ? 'message' : 'attachment'}-${index + 1}.${ext}`;
}

async function expand(node: AttachmentNode, depth: number, budget: Budget): Promise<void> {
  const isMail = isMailFile(node.filename, node.mimeType);
  const isZip = !isMail && isZipFile(node.filename, node.mimeType);
  if (!isMail && !isZip) return;
  if (depth + 1 > budget.limits.maxDepth) {
    node.error = '너무 깊이 중첩되어 있어 펼치지 않았습니다.';
    return;
  }

  try {
    if (isMail) {
      const mail = await parseMail(node.content, `${node.id}/`, depth + 1, budget);
      node.children = { kind: 'mail', mail };
    } else {
      node.children = { kind: 'archive', entries: await unzipEntries(node, depth + 1, budget) };
    }
  } catch (error) {
    node.error = error instanceof LimitError ? error.message : '파일이 손상되었거나 지원하지 않는 형식입니다.';
  }
}

class LimitError extends Error {}

async function unzipEntries(archive: AttachmentNode, depth: number, budget: Budget): Promise<AttachmentNode[]> {
  let declaredBytes = 0;
  let declaredEntries = 0;
  const files = unzipSync(archive.content, {
    filter(file) {
      if (file.name.endsWith('/')) return false;
      declaredBytes += file.originalSize;
      declaredEntries += 1;
      if (declaredBytes > budget.bytesLeft || declaredEntries > budget.entriesLeft) {
        throw new LimitError('압축을 풀면 너무 커서 내용을 펼치지 않았습니다.');
      }
      return true;
    },
  });

  const entries: AttachmentNode[] = [];
  for (const [index, [rawName, content]] of Object.entries(files).entries()) {
    budget.bytesLeft -= content.byteLength;
    budget.entriesLeft -= 1;
    if (budget.bytesLeft < 0) throw new LimitError('압축을 풀면 너무 커서 내용을 펼치지 않았습니다.');

    const filename = recoverLatin1Name(rawName);
    const node: AttachmentNode = {
      id: `${archive.id}/${index}`,
      filename,
      mimeType: mimeFromFilename(filename) ?? 'application/octet-stream',
      size: content.byteLength,
      inline: false,
      content,
    };
    await expand(node, depth, budget);
    entries.push(node);
  }
  return entries;
}

function flattenAddresses(addresses: Address[] | undefined): MailAddress[] {
  if (!addresses) return [];
  return addresses.flatMap((address) =>
    address.group
      ? address.group.map(({ name, address }) => ({ name, address }))
      : [{ name: address.name, address: address.address }],
  );
}

function toBytes(content: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (typeof content === 'string') return new TextEncoder().encode(content);
  return content instanceof Uint8Array ? content : new Uint8Array(content);
}
