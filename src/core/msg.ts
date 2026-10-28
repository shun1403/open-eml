import MsgReaderModule, { type FieldsData } from '@kenjiuno/msgreader';
import PostalMime from 'postal-mime';
import { codepageLabel, decodeText } from './encoding';
import { decompressRtf, rtfToBody } from './rtf';
import type { MailAddress, MailHeader, ParsedMail, RawAttachment } from './types';

// CommonJS 패키지라 번들러에 따라 default가 한 겹 더 감싸져 온다
const MsgReader =
  (MsgReaderModule as unknown as { default?: typeof MsgReaderModule }).default ?? MsgReaderModule;
type MsgReader = InstanceType<typeof MsgReader>;

export type MsgContent = Omit<ParsedMail, 'attachments'> & { rawAttachments: RawAttachment[] };

/** 유니코드가 아닌 문자열 속성을 해석할 때 쓸 코드페이지가 필요 없는 경우 */
const UNICODE_CODEPAGES = new Set([1200, 1201, 65001, 20127]);

function read(raw: Uint8Array, ansiEncoding?: string): { reader: MsgReader; data: FieldsData } {
  const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  const reader = new MsgReader(buffer);
  if (ansiEncoding) reader.parserConfig = { ansiEncoding };
  const data = reader.getFileData();
  if (data.error) throw new Error(data.error);
  return { reader, data };
}

/** Exchange 내부 주소(/O=EXCHANGELABS/...)는 사람에게 의미가 없어서 뺀다 */
function smtp(...candidates: Array<string | undefined>): string {
  return candidates.find((value) => value && value.includes('@') && !value.startsWith('/')) ?? '';
}

function toIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

/** 원래 인터넷 메일 헤더(PR_TRANSPORT_MESSAGE_HEADERS)가 있으면 그대로 쓴다 */
async function parseTransportHeaders(headers: string | undefined) {
  if (!headers?.trim()) return null;
  try {
    return await PostalMime.parse(`${headers.trim()}\r\n\r\n`);
  } catch {
    return null;
  }
}

function headerList(headers: string | undefined): MailHeader[] {
  if (!headers) return [];
  const unfolded = headers.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/);
  return unfolded.flatMap((line) => {
    const colon = line.indexOf(':');
    return colon > 0 ? [{ key: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() }] : [];
  });
}

/** Outlook .msg 파일을 읽는다. 첨부는 펼치지 않은 채로 돌려준다 */
export async function parseMsg(raw: Uint8Array): Promise<MsgContent> {
  let { reader, data } = read(raw);
  // 유니코드가 아닌 .msg는 문자열이 메일의 코드페이지(한국어 Outlook은 949)로 저장된다
  const codepage = data.messageCodepage ?? data.internetCodepage;
  const ansiLabel = codepage && !UNICODE_CODEPAGES.has(codepage) ? codepageLabel(codepage) : undefined;
  if (ansiLabel) ({ reader, data } = read(raw, ansiLabel));

  const recipients = (data.recipients ?? []).map((recipient) => ({
    type: recipient.recipType ?? 'to',
    address: {
      name: recipient.name ?? '',
      address: smtp(recipient.smtpAddress, recipient.email),
    } satisfies MailAddress,
  }));
  const byType = (type: string) => recipients.filter((r) => r.type === type).map((r) => r.address);

  let html = data.bodyHtml;
  if (!html && data.html) html = decodeText(data.html, codepageLabel(data.internetCodepage) ?? ansiLabel);
  let text = data.body;
  if (!html && data.compressedRtf) {
    try {
      const body = rtfToBody(decompressRtf(data.compressedRtf));
      html = body.html;
      text ??= body.text;
    } catch {
      // RTF 본문을 못 읽으면 텍스트 본문만 보여준다
    }
  }

  const transport = await parseTransportHeaders(data.headers);
  const rawAttachments: RawAttachment[] = [];
  for (const attachment of data.attachments ?? []) {
    try {
      const file = reader.getAttachment(attachment);
      const contentId = attachment.pidContentId?.replace(/^<|>$/g, '');
      rawAttachments.push({
        filename: file.fileName || attachment.fileName || attachment.fileNameShort || attachment.name,
        mimeType: attachment.innerMsgContent ? 'application/vnd.ms-outlook' : attachment.attachMimeTag,
        content: file.content,
        contentId,
        inline: Boolean(contentId && html?.includes(`cid:${contentId}`)),
      });
    } catch {
      // 읽을 수 없는 첨부 하나 때문에 메일 전체를 버리지 않는다
    }
  }

  const sender: MailAddress = {
    name: data.senderName ?? '',
    address: smtp(data.senderSmtpAddress, data.sentRepresentingSmtpAddress, data.senderEmail, data.creatorSMTPAddress),
  };

  return {
    subject: data.subject ?? transport?.subject ?? '',
    from: sender.name || sender.address ? [sender] : [],
    to: byType('to'),
    cc: byType('cc'),
    bcc: byType('bcc'),
    replyTo: [],
    date: toIsoDate(data.clientSubmitTime ?? data.messageDeliveryTime) ?? transport?.date,
    messageId: data.messageId ?? transport?.messageId,
    html,
    text,
    headers: headerList(data.headers),
    rawAttachments,
  };
}
