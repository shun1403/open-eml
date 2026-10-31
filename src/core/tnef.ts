import { codepageLabel, decodeText } from './encoding';
import { decompressRtf, rtfToBody, type RtfBody } from './rtf';
import type { RawAttachment } from './types';

/** TNEF(winmail.dat) 파일 맨 앞 4바이트 */
export const TNEF_SIGNATURE = 0x223e9f78;

const ATT_ATTACH_RENDDATA = 0x00069002;
const ATT_ATTACH_TITLE = 0x00018010;
const ATT_ATTACH_DATA = 0x0006800f;
const ATT_ATTACHMENT = 0x00069005;
const ATT_MAPI_PROPS = 0x00069003;
const ATT_OEM_CODEPAGE = 0x00069007;
const ATT_BODY = 0x0002800c;

const PR_BODY = 0x1000;
const PR_RTF_COMPRESSED = 0x1009;
const PR_BODY_HTML = 0x1013;
const PR_DISPLAY_NAME = 0x3001;
const PR_ATTACH_DATA_OBJ = 0x3701;
const PR_ATTACH_FILENAME = 0x3704;
const PR_ATTACH_LONG_FILENAME = 0x3707;
const PR_ATTACH_MIME_TAG = 0x370e;
const PR_ATTACH_CONTENT_ID = 0x3712;
const PR_INTERNET_CPID = 0x3fde;

const PT_STRING8 = 0x001e;
const PT_UNICODE = 0x001f;
const PT_BINARY = 0x0102;
const PT_OBJECT = 0x000d;
const MV_FLAG = 0x1000;

const FIXED_SIZES: Record<number, number> = {
  0x0001: 0, 0x0002: 4, 0x0003: 4, 0x0004: 4, 0x0005: 8, 0x0006: 8, 0x0007: 8,
  0x000a: 4, 0x000b: 4, 0x0014: 8, 0x0040: 8, 0x0048: 16,
};

type PropValue = { type: number; data: Uint8Array };

export interface TnefContent {
  attachments: RawAttachment[];
  body: RtfBody;
}

export function isTnef(bytes: Uint8Array): boolean {
  return bytes.length >= 6 && new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true) === TNEF_SIGNATURE;
}

const pad4 = (n: number) => (n + 3) & ~3;

class Reader {
  private view: DataView;
  offset = 0;
  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  get remaining() {
    return this.bytes.length - this.offset;
  }
  u16() {
    this.need(2);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }
  u32() {
    this.need(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }
  take(length: number) {
    this.need(length);
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }
  skip(length: number) {
    this.need(length);
    this.offset += length;
  }
  private need(length: number) {
    if (length < 0 || this.offset + length > this.bytes.length) throw new Error('TNEF 데이터가 잘렸습니다.');
  }
}

/** attMAPIProps / attAttachment 안의 MAPI 속성 목록을 읽는다 */
function readMapiProps(data: Uint8Array): Map<number, PropValue> {
  const props = new Map<number, PropValue>();
  const reader = new Reader(data);
  const count = reader.u32();
  for (let n = 0; n < count && reader.remaining > 0; n++) {
    const type = reader.u16();
    const id = reader.u16();
    if (id >= 0x8000) {
      reader.skip(16); // 이름 붙은 속성의 GUID
      const kind = reader.u32();
      if (kind === 0) reader.skip(4);
      else reader.skip(pad4(reader.u32()));
    }

    const baseType = type & ~MV_FLAG;
    const variable = baseType === PT_STRING8 || baseType === PT_UNICODE || baseType === PT_BINARY || baseType === PT_OBJECT;
    if (variable) {
      const values = reader.u32();
      // 값 하나에 최소 4바이트가 필요하다. 남은 데이터보다 많다고 적혀 있으면 조작된 파일이다
      if (values * 4 > reader.remaining) break;
      for (let v = 0; v < values; v++) {
        const length = reader.u32();
        const value = reader.take(length);
        reader.skip(pad4(length) - length);
        if (v === 0) props.set(id, { type: baseType, data: value });
      }
    } else {
      const size = FIXED_SIZES[baseType];
      if (size === undefined) break; // 모르는 형식이면 더 읽을 수 없다
      const values = type & MV_FLAG ? reader.u32() : 1;
      if (values * size > reader.remaining) break;
      if (size === 0) continue; // 크기 0인 값을 셀 필요는 없다 (개수를 40억으로 적어 멈추게 하는 공격)
      for (let v = 0; v < values; v++) {
        const value = reader.take(size);
        if (v === 0) props.set(id, { type: baseType, data: value });
      }
    }
  }
  return props;
}

function propString(prop: PropValue | undefined, codepage: string | undefined): string | undefined {
  if (!prop) return undefined;
  const text =
    prop.type === PT_UNICODE ? new TextDecoder('utf-16le').decode(prop.data) : decodeText(prop.data, codepage);
  return text.replace(/\0+$/, '') || undefined;
}

function propLong(prop: PropValue | undefined): number | undefined {
  if (!prop || prop.data.length < 4) return undefined;
  return new DataView(prop.data.buffer, prop.data.byteOffset, 4).getUint32(0, true);
}

export function parseTnef(bytes: Uint8Array): TnefContent {
  if (!isTnef(bytes)) throw new Error('TNEF 파일이 아닙니다.');
  const reader = new Reader(bytes);
  reader.skip(6); // 서명 + key

  let codepage: string | undefined;
  const attachments: RawAttachment[] = [];
  let current: { title?: string; data?: Uint8Array; props?: Map<number, PropValue> } | null = null;
  let messageProps = new Map<number, PropValue>();
  let plainBody: string | undefined;

  const finish = () => {
    if (!current) return;
    const props = current.props ?? new Map<number, PropValue>();
    let content = current.data;
    let filename =
      propString(props.get(PR_ATTACH_LONG_FILENAME), codepage) ??
      propString(props.get(PR_DISPLAY_NAME), codepage) ??
      propString(props.get(PR_ATTACH_FILENAME), codepage) ??
      current.title;
    let mimeType = propString(props.get(PR_ATTACH_MIME_TAG), codepage);

    // 첨부된 메일(첨부 방식 5)은 속성 안에 또 하나의 TNEF로 들어 있다
    const object = props.get(PR_ATTACH_DATA_OBJ);
    if (!content && object) {
      content = object.type === PT_OBJECT ? object.data.subarray(16) : object.data;
      if (isTnef(content)) {
        filename = `${filename ?? 'message'}.dat`;
        mimeType = 'application/ms-tnef';
      }
    }
    if (content) {
      attachments.push({
        filename,
        mimeType,
        content,
        inline: false,
        contentId: propString(props.get(PR_ATTACH_CONTENT_ID), codepage),
      });
    }
    current = null;
  };

  while (reader.remaining >= 11) {
    reader.skip(1); // level
    const id = reader.u32();
    const length = reader.u32();
    const data = reader.take(length);
    reader.skip(2); // checksum

    switch (id) {
      case ATT_OEM_CODEPAGE:
        codepage = codepageLabel(new DataView(data.buffer, data.byteOffset, 4).getUint32(0, true));
        break;
      case ATT_ATTACH_RENDDATA:
        finish();
        current = {};
        break;
      case ATT_ATTACH_TITLE:
        if (current) current.title = decodeText(data, codepage).replace(/\0+$/, '');
        break;
      case ATT_ATTACH_DATA:
        if (current) current.data = data;
        break;
      case ATT_ATTACHMENT:
        if (current) current.props = readMapiProps(data);
        break;
      case ATT_MAPI_PROPS:
        messageProps = readMapiProps(data);
        break;
      case ATT_BODY:
        plainBody = decodeText(data, codepage).replace(/\0+$/, '');
        break;
    }
  }
  finish();

  const htmlCodepage = codepageLabel(propLong(messageProps.get(PR_INTERNET_CPID))) ?? codepage;
  const body: RtfBody = {};
  const html = messageProps.get(PR_BODY_HTML);
  if (html) body.html = propString(html, htmlCodepage);
  if (!body.html) {
    const rtf = messageProps.get(PR_RTF_COMPRESSED);
    if (rtf) {
      try {
        Object.assign(body, rtfToBody(decompressRtf(rtf.data)));
      } catch {
        // 본문을 못 읽어도 첨부는 돌려준다
      }
    }
  }
  body.text ??= propString(messageProps.get(PR_BODY), codepage) ?? plainBody;

  return { attachments, body };
}
