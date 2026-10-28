import PostalMime, { type Address } from 'postal-mime';
import { containerKind, extensionFromMime, resolveMimeType, safeFilename } from './files';
import { parseMsg, type MsgContent } from './msg';
import { parseTnef } from './tnef';
import type { AttachmentNode, MailAddress, ParsedMail, RawAttachment } from './types';
import { LimitError, readZip, type ZipBudget } from './zip';

export type MailFormat = 'eml' | 'msg';

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

interface Budget extends ZipBudget {
  limits: ParseLimits;
}

function newBudget(limits: ParseLimits): Budget {
  return { limits, bytesLeft: limits.maxExtractedBytes, entriesLeft: limits.maxExtractedEntries };
}

export function parseEml(raw: Uint8Array | ArrayBuffer, limits: ParseLimits = DEFAULT_LIMITS): Promise<ParsedMail> {
  return parseMailFile(raw, 'eml', limits);
}

export function parseMailFile(
  raw: Uint8Array | ArrayBuffer,
  format: MailFormat,
  limits: ParseLimits = DEFAULT_LIMITS,
): Promise<ParsedMail> {
  return parseMail(toBytes(raw), format, '', 0, newBudget(limits));
}

/** 암호가 걸린 ZIP 첨부를 암호로 열어 그 안의 항목을 돌려준다 */
export async function unlockArchive(
  archive: Pick<AttachmentNode, 'id' | 'content'>,
  password: string,
  limits: ParseLimits = DEFAULT_LIMITS,
): Promise<AttachmentNode[]> {
  const budget = newBudget(limits);
  const listing = await readZip(archive.content, budget, password);
  const raws = listing.files.map((file): RawAttachment => ({ filename: file.name, content: file.content, inline: false }));
  return buildNodes(raws, `${archive.id}/`, 1, budget);
}

async function parseMail(raw: Uint8Array, format: MailFormat, idPrefix: string, depth: number, budget: Budget) {
  const content = format === 'msg' ? await parseMsg(raw) : await parseEmlContent(raw);
  const { rawAttachments, ...mail } = content;
  const attachments = await buildNodes(rawAttachments, idPrefix, depth, budget);

  // Outlook이 보낸 메일은 서식 있는 본문이 winmail.dat 안에만 들어 있기도 하다
  for (const node of attachments) {
    if (node.children?.kind !== 'archive' || !node.children.body) continue;
    mail.html ??= node.children.body.html;
    mail.text ??= node.children.body.text;
  }
  return { ...mail, attachments } satisfies ParsedMail;
}

async function parseEmlContent(raw: Uint8Array): Promise<MsgContent> {
  // 중첩 메일은 postal-mime이 본문에 합쳐 버리지 않도록 첨부로 받아서 직접 펼친다
  const email = await PostalMime.parse(raw, {
    forceRfc822Attachments: true,
    attachmentEncoding: 'arraybuffer',
  });
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
    rawAttachments: email.attachments.map((attachment) => ({
      filename: attachment.filename ?? undefined,
      mimeType: attachment.mimeType,
      inline: Boolean(attachment.related),
      contentId: attachment.contentId,
      content: toBytes(attachment.content),
    })),
  };
}

async function buildNodes(raws: RawAttachment[], idPrefix: string, depth: number, budget: Budget) {
  const nodes: AttachmentNode[] = [];
  for (const [index, raw] of raws.entries()) {
    const node = toNode(raw, `${idPrefix}${index}`, index);
    await expand(node, depth, budget);
    if (!raw.filename?.trim() && node.children?.kind === 'mail' && node.children.mail.subject) {
      node.filename = `${safeFilename(node.children.mail.subject, 'message')}.${node.filename.split('.').pop()}`;
    }
    nodes.push(node);
  }
  return nodes;
}

function toNode(raw: RawAttachment, id: string, index: number): AttachmentNode {
  const filename = raw.filename?.trim() || fallbackFilename(raw.mimeType, index);
  return {
    id,
    filename,
    mimeType: resolveMimeType(filename, raw.mimeType),
    size: raw.content.byteLength,
    inline: raw.inline,
    contentId: raw.contentId?.replace(/^<|>$/g, ''),
    content: raw.content,
  };
}

function fallbackFilename(mimeType: string | undefined, index: number): string {
  const type = mimeType?.toLowerCase() ?? '';
  if (type === 'application/ms-tnef' || type === 'application/vnd.ms-tnef') return 'winmail.dat';
  const ext = extensionFromMime(type) ?? 'bin';
  return `${ext === 'eml' || ext === 'msg' ? 'message' : 'attachment'}-${index + 1}.${ext}`;
}

async function expand(node: AttachmentNode, depth: number, budget: Budget): Promise<void> {
  const kind = containerKind(node);
  if (!kind) return;
  if (depth + 1 > budget.limits.maxDepth) {
    node.error = '너무 깊이 중첩되어 있어 펼치지 않았습니다.';
    return;
  }

  try {
    if (kind === 'eml' || kind === 'msg') {
      node.children = { kind: 'mail', mail: await parseMail(node.content, kind, `${node.id}/`, depth + 1, budget) };
    } else if (kind === 'tnef') {
      const tnef = parseTnef(node.content);
      const entries = await buildNodes(tnef.attachments, `${node.id}/`, depth + 1, budget);
      node.children = { kind: 'archive', entries, body: tnef.body };
    } else {
      const listing = await readZip(node.content, budget);
      if (listing.encrypted) {
        node.locked = true;
        return;
      }
      const raws = listing.files.map((file): RawAttachment => ({ filename: file.name, content: file.content, inline: false }));
      node.children = { kind: 'archive', entries: await buildNodes(raws, `${node.id}/`, depth + 1, budget) };
    }
  } catch (error) {
    node.error = error instanceof LimitError ? error.message : '파일이 손상되었거나 지원하지 않는 형식입니다.';
  }
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
