import CFB from 'cfb';
import { Inflate, unzipSync } from 'fflate';
import { decodeText } from './encoding';

export interface HwpPreview {
  paragraphs: string[];
  /** 문서에 저장된 첫 쪽 미리보기 그림 */
  previewImage?: { mimeType: string; content: Uint8Array };
  /** 암호가 걸렸거나 배포용 문서라 본문을 읽을 수 없어 미리보기 글만 보여주는 경우 */
  limited?: 'encrypted' | 'distribution';
}

const HWPTAG_PARA_TEXT = 0x10 + 51;
/** 미리보기로 풀어 볼 본문의 최대 크기 (압축 폭탄 방지) */
const MAX_BODY_BYTES = 64 * 1024 * 1024;

/** 정해진 크기를 넘으면 멈추는 압축 풀기 */
function inflateLimited(data: Uint8Array, limit: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const inflater = new Inflate((chunk) => {
    total += chunk.length;
    if (total > limit) throw new Error('본문이 너무 커서 미리보기를 만들지 않았습니다.');
    chunks.push(chunk);
  });
  inflater.push(data, true);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
/** 문자 컨트롤(1글자)을 뺀 나머지 컨트롤 문자는 8글자(16바이트)를 차지한다 */
const CHAR_CONTROLS = new Set([0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31]);

function imageType(bytes: Uint8Array): string | undefined {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';
  return undefined;
}

function paraText(record: Uint8Array): string {
  const view = new DataView(record.buffer, record.byteOffset, record.byteLength);
  let text = '';
  for (let i = 0; i + 1 < record.length; ) {
    const code = view.getUint16(i, true);
    if (code >= 32) {
      text += String.fromCharCode(code);
      i += 2;
    } else if (CHAR_CONTROLS.has(code)) {
      if (code === 10) text += '\n';
      else if (code === 30 || code === 31) text += ' ';
      else if (code === 24) text += '-';
      i += 2;
    } else {
      if (code === 9) text += '\t';
      i += 16;
    }
  }
  return text;
}

/** 본문 섹션의 레코드에서 문단 글자만 꺼낸다 */
function sectionParagraphs(section: Uint8Array): string[] {
  const view = new DataView(section.buffer, section.byteOffset, section.byteLength);
  const paragraphs: string[] = [];
  let offset = 0;
  while (offset + 4 <= section.length) {
    const header = view.getUint32(offset, true);
    offset += 4;
    const tag = header & 0x3ff;
    let size = header >>> 20;
    if (size === 0xfff) {
      if (offset + 4 > section.length) break;
      size = view.getUint32(offset, true);
      offset += 4;
    }
    if (offset + size > section.length) break;
    if (tag === HWPTAG_PARA_TEXT) paragraphs.push(paraText(section.subarray(offset, offset + size)));
    offset += size;
  }
  return paragraphs;
}

function streamContent(cfb: CFB.CFB$Container, path: string): Uint8Array | undefined {
  const entry = CFB.find(cfb, path);
  if (!entry?.content) return undefined;
  return entry.content instanceof Uint8Array ? entry.content : Uint8Array.from(entry.content as ArrayLike<number>);
}

/** HWP 5.0 문서의 글과 미리보기 그림을 꺼낸다 */
export function readHwp(bytes: Uint8Array): HwpPreview {
  const cfb = CFB.read(bytes, { type: 'array' });
  const header = streamContent(cfb, '/FileHeader');
  if (!header || decodeText(header.subarray(0, 17)) !== 'HWP Document File') throw new Error('HWP 문서가 아닙니다.');
  const flags = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(36, true);
  const compressed = (flags & 1) !== 0;
  const limited = flags & 2 ? 'encrypted' : flags & 4 ? 'distribution' : undefined;

  const image = streamContent(cfb, '/PrvImage');
  const previewImage = image && imageType(image) ? { mimeType: imageType(image)!, content: image } : undefined;

  const paragraphs: string[] = [];
  if (!limited) {
    let budget = MAX_BODY_BYTES;
    for (let index = 0; ; index++) {
      const raw = streamContent(cfb, `/BodyText/Section${index}`);
      if (!raw) break;
      const section = compressed ? inflateLimited(raw, budget) : raw;
      budget -= section.length;
      paragraphs.push(...sectionParagraphs(section));
    }
  }
  if (paragraphs.length === 0) {
    const preview = streamContent(cfb, '/PrvText');
    if (preview) paragraphs.push(...new TextDecoder('utf-16le').decode(preview).split(/\r?\n/));
  }
  return { paragraphs, previewImage, limited };
}

/** XML을 돌며 문단(p)마다 글자(t)를 모은다. 표 안의 문단도 차례대로 나온다 */
function collectParagraphs(root: Element, lines: string[], current: { text: string } | null) {
  for (const child of Array.from(root.children)) {
    if (child.localName === 'p') {
      const line = { text: '' };
      const index = lines.push('') - 1;
      collectParagraphs(child, lines, line);
      lines[index] = line.text;
    } else if (child.localName === 't' && current) {
      current.text += child.textContent ?? '';
    } else if (child.localName === 'tab' && current) {
      current.text += '\t';
    } else {
      collectParagraphs(child, lines, current);
    }
  }
}

/** HWPX(OWPML) 문서의 글과 미리보기 그림을 꺼낸다 */
export function readHwpx(bytes: Uint8Array): HwpPreview {
  let declared = 0;
  const files = unzipSync(bytes, {
    filter: (file) => {
      if (!/^Contents\/section\d+\.xml$|^Preview\/PrvImage\./i.test(file.name)) return false;
      declared += file.originalSize;
      if (declared > MAX_BODY_BYTES) throw new Error('본문이 너무 커서 미리보기를 만들지 않았습니다.');
      return true;
    },
  });
  const sections = Object.keys(files)
    .filter((name) => name.startsWith('Contents/'))
    .sort((a, b) => Number(/\d+/.exec(a)?.[0]) - Number(/\d+/.exec(b)?.[0]));
  if (sections.length === 0) throw new Error('HWPX 문서가 아닙니다.');

  const paragraphs: string[] = [];
  for (const name of sections) {
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(files[name]), 'application/xml');
    collectParagraphs(doc.documentElement, paragraphs, null);
  }
  const imageName = Object.keys(files).find((name) => name.startsWith('Preview/'));
  const image = imageName ? files[imageName] : undefined;
  const previewImage = image && imageType(image) ? { mimeType: imageType(image)!, content: image } : undefined;
  return { paragraphs, previewImage };
}
