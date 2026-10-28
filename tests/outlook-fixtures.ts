import CFB from 'cfb';
import iconv from 'iconv-lite';

const PT_LONG = 0x0003;
const PT_STRING8 = 0x001e;
const PT_UNICODE = 0x001f;
const PT_BINARY = 0x0102;

type PropValue = string | number | Uint8Array;
export interface MsgProp {
  id: number;
  value: PropValue;
  /** 문자열을 유니코드 대신 이 코드페이지로 저장한다 */
  ansi?: string;
}

const hex = (n: number, width: number) => n.toString(16).toUpperCase().padStart(width, '0');

function propertyStream(props: MsgProp[], headerSize: number, counts?: { recipients: number; attachments: number }) {
  const fixed = props.filter((p) => typeof p.value === 'number');
  const stream = new Uint8Array(headerSize + fixed.length * 16);
  const view = new DataView(stream.buffer);
  if (counts) {
    view.setUint32(8, counts.recipients, true);
    view.setUint32(12, counts.attachments, true);
    view.setUint32(16, counts.recipients, true);
    view.setUint32(20, counts.attachments, true);
  }
  fixed.forEach((prop, index) => {
    const offset = headerSize + index * 16;
    view.setUint32(offset, ((prop.id << 16) | PT_LONG) >>> 0, true);
    view.setUint32(offset + 4, 6, true);
    view.setUint32(offset + 8, prop.value as number, true);
  });
  return stream;
}

function addProps(cfb: CFB.CFB$Container, folder: string, props: MsgProp[]) {
  for (const prop of props) {
    if (typeof prop.value === 'number') continue;
    let type = PT_BINARY;
    let data: Uint8Array;
    if (typeof prop.value === 'string') {
      type = prop.ansi ? PT_STRING8 : PT_UNICODE;
      data = Uint8Array.from(prop.ansi ? iconv.encode(prop.value, prop.ansi) : iconv.encode(prop.value, 'utf-16le'));
    } else {
      data = prop.value;
    }
    CFB.utils.cfb_add(cfb, `${folder}__substg1.0_${hex(prop.id, 4)}${hex(type, 4)}`, data);
  }
}

export interface MsgSpec {
  props: MsgProp[];
  recipients?: MsgProp[][];
  /** 첨부 속성. embedded가 있으면 그 메일을 첨부로 넣는다 (첨부 방식 5) */
  attachments?: Array<MsgProp[] | { props: MsgProp[]; embedded: MsgSpec }>;
}

function addMessage(cfb: CFB.CFB$Container, folder: string, spec: MsgSpec, topLevel: boolean) {
  const { props, recipients = [], attachments = [] } = spec;
  addProps(cfb, folder, props);
  CFB.utils.cfb_add(
    cfb,
    `${folder}__properties_version1.0`,
    propertyStream(props, topLevel ? 32 : 24, { recipients: recipients.length, attachments: attachments.length }),
  );
  recipients.forEach((recipient, index) => {
    const sub = `${folder}__recip_version1.0_#${hex(index, 8)}/`;
    addProps(cfb, sub, recipient);
    CFB.utils.cfb_add(cfb, `${sub}__properties_version1.0`, propertyStream(recipient, 8));
  });
  attachments.forEach((attachment, index) => {
    const sub = `${folder}__attach_version1.0_#${hex(index, 8)}/`;
    const attachProps = Array.isArray(attachment) ? attachment : attachment.props;
    addProps(cfb, sub, attachProps);
    CFB.utils.cfb_add(cfb, `${sub}__properties_version1.0`, propertyStream(attachProps, 8));
    if (!Array.isArray(attachment)) addMessage(cfb, `${sub}__substg1.0_3701000D/`, attachment.embedded, false);
  });
}

/** Outlook .msg(복합 문서) 파일을 만든다 */
export function buildMsg(spec: MsgSpec): Uint8Array {
  const cfb = CFB.utils.cfb_new();
  addMessage(cfb, '/', spec, true);
  for (const name of ['00020102', '00030102', '00040102']) {
    CFB.utils.cfb_add(cfb, `/__nameid_version1.0/__substg1.0_${name}`, new Uint8Array(0));
  }
  CFB.utils.cfb_del(cfb, '/\u0001Sh33tJ5');
  return Uint8Array.from(CFB.write(cfb, { type: 'array', fileType: 'cfb' }) as number[]);
}

export const MSG = {
  SUBJECT: 0x0037,
  BODY: 0x1000,
  RTF_COMPRESSED: 0x1009,
  BODY_HTML: 0x1013,
  SENDER_NAME: 0x0c1a,
  SENDER_SMTP: 0x5d01,
  CLIENT_SUBMIT_TIME: 0x0039,
  MESSAGE_CODEPAGE: 0x3ffd,
  DISPLAY_NAME: 0x3001,
  EMAIL: 0x3003,
  SMTP: 0x39fe,
  RECIPIENT_TYPE: 0x0c15,
  ATTACH_DATA: 0x3701,
  ATTACH_LONG_FILENAME: 0x3707,
  ATTACH_MIME_TAG: 0x370e,
  ATTACH_CONTENT_ID: 0x3712,
  ATTACH_METHOD: 0x3705,
} as const;

/* ---------- TNEF (winmail.dat) ---------- */

function u32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}
function u16(value: number) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}
function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
function attribute(level: number, id: number, data: Uint8Array) {
  const checksum = data.reduce((sum, byte) => (sum + byte) & 0xffff, 0);
  return concat([Uint8Array.of(level), u32(id), u32(data.length), data, u16(checksum)]);
}
const pad = (data: Uint8Array) => concat([data, new Uint8Array(((data.length + 3) & ~3) - data.length)]);

/** MAPI 속성 목록 (문자열은 UTF-16, 바이트는 PT_BINARY) */
function mapiProps(props: Array<{ id: number; value: string | Uint8Array }>) {
  return concat([
    u32(props.length),
    ...props.map(({ id, value }) => {
      const unicode = typeof value === 'string';
      const data = unicode ? Uint8Array.from(iconv.encode(`${value}\0`, 'utf-16le')) : value;
      return concat([u16(unicode ? PT_UNICODE : PT_BINARY), u16(id), u32(1), u32(data.length), pad(data)]);
    }),
  ]);
}

export interface TnefAttachmentSpec {
  title: string;
  longName?: string;
  data: Uint8Array;
}

export function buildTnef(attachments: TnefAttachmentSpec[], body?: { html?: string }): Uint8Array {
  const parts = [u32(0x223e9f78), u16(0x0001), attribute(1, 0x00069007, concat([u32(949), u32(0)]))];
  if (body?.html) parts.push(attribute(1, 0x00069003, mapiProps([{ id: 0x1013, value: new TextEncoder().encode(body.html) }])));
  for (const attachment of attachments) {
    parts.push(attribute(2, 0x00069002, new Uint8Array(14)));
    parts.push(attribute(2, 0x00018010, concat([Uint8Array.from(iconv.encode(attachment.title, 'cp949')), Uint8Array.of(0)])));
    parts.push(attribute(2, 0x0006800f, attachment.data));
    if (attachment.longName) parts.push(attribute(2, 0x00069005, mapiProps([{ id: 0x3707, value: attachment.longName }])));
  }
  return concat(parts);
}

/** 압축하지 않은 형식(MELA)으로 감싼 RTF */
export function uncompressedRtf(rtf: Uint8Array): Uint8Array {
  const out = new Uint8Array(16 + rtf.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, rtf.length + 12, true);
  view.setUint32(4, rtf.length, true);
  view.setUint32(8, 0x414c454d, true);
  out.set(rtf, 16);
  return out;
}

