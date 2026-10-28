import PostalMime from 'postal-mime';
import type { MailAddress } from './types';

export interface MboxEntry {
  /** 메일 본문(구분 줄 다음)의 시작 바이트 */
  start: number;
  /** 다음 구분 줄의 시작 바이트 */
  end: number;
  subject: string;
  from: MailAddress[];
  date?: string;
}

const CHUNK_SIZE = 8 * 1024 * 1024;
/** 구분 줄이 조각 경계에 걸쳐도 놓치지 않도록 겹쳐 읽는 길이 */
const OVERLAP = 4096;
const HEADER_PEEK = 64 * 1024;

/**
 * mbox 구분 줄: "From 보낸이 요일 월 일 시:분[:초] [시간대] 연도"
 * (Gmail: "From 17...@xxx Wed Oct 15 08:12:34 +0000 2025", Thunderbird: "From - Mon Oct 27 09:30:00 2026")
 */
const SEPARATOR =
  /^From \S+ +(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) +(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) +\d{1,2} +\d{1,2}:\d{2}(?::\d{2})?(?: +[A-Za-z+-][\w+-]*)? +\d{4}/;

// windows-1252는 모든 바이트를 문자 하나로 바꾸므로 문자열 위치 = 바이트 위치다
const latin1 = new TextDecoder('windows-1252');

interface Separator {
  lineStart: number;
  bodyStart: number;
}

async function findSeparators(file: Blob, strict: boolean, onProgress?: (bytes: number) => void): Promise<Separator[]> {
  const found: Separator[] = [];
  let lastLineStart = -1;
  let offset = 0;

  while (offset < file.size) {
    const end = Math.min(file.size, offset + CHUNK_SIZE);
    const text = latin1.decode(await file.slice(offset, end).arrayBuffer());
    const atEnd = end >= file.size;

    const check = (lineIndex: number): boolean => {
      const lineStart = offset + lineIndex;
      if (lineStart <= lastLineStart) return true;
      let lineEnd = text.indexOf('\n', lineIndex);
      if (lineEnd === -1) {
        if (!atEnd) return false; // 다음 조각에서 다시 본다
        lineEnd = text.length;
      }
      const line = text.slice(lineIndex, lineEnd).replace(/\r$/, '');
      const previousBlank =
        lineIndex === 0 || text[lineIndex - 2] === '\n' || (text[lineIndex - 2] === '\r' && text[lineIndex - 3] === '\n');
      if (strict ? SEPARATOR.test(line) : previousBlank && line.startsWith('From ')) {
        found.push({ lineStart, bodyStart: offset + lineEnd + 1 });
        lastLineStart = lineStart;
      }
      return true;
    };

    if (offset === 0 && text.startsWith('From ')) check(0);
    const pattern = /\nFrom /g;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      if (!check(match.index + 1)) break;
    }
    onProgress?.(end);
    if (atEnd) break;
    offset = end - OVERLAP;
  }
  return found;
}

/** mbox 파일에서 메일 위치를 찾는다. 구분 줄 규칙이 엄격한 쪽부터 시도한다 */
export async function indexMbox(
  file: Blob,
  onProgress?: (bytes: number) => void,
): Promise<Array<Pick<MboxEntry, 'start' | 'end'>>> {
  let separators = await findSeparators(file, true, onProgress);
  if (separators.length === 0) separators = await findSeparators(file, false, onProgress);
  return separators.map((separator, index) => ({
    start: Math.min(separator.bodyStart, file.size),
    end: separators[index + 1]?.lineStart ?? file.size,
  }));
}

function headerBlock(bytes: Uint8Array): Uint8Array {
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] !== 0x0a) continue;
    if (bytes[i + 1] === 0x0a) return bytes.subarray(0, i + 1);
    if (bytes[i + 1] === 0x0d && bytes[i + 2] === 0x0a) return bytes.subarray(0, i + 1);
  }
  return bytes;
}

/** 목록에 보여줄 제목·보낸 사람·날짜만 헤더에서 읽는다 */
export async function summarizeMboxEntry(file: Blob, entry: Pick<MboxEntry, 'start' | 'end'>): Promise<MboxEntry> {
  const peek = new Uint8Array(await file.slice(entry.start, Math.min(entry.end, entry.start + HEADER_PEEK)).arrayBuffer());
  const headers = headerBlock(peek);
  const email = await PostalMime.parse(new Blob([headers as Uint8Array<ArrayBuffer>, '\r\n']));
  const from = email.from && !email.from.group ? [{ name: email.from.name, address: email.from.address }] : [];
  return { ...entry, subject: email.subject ?? '', from, date: email.date };
}

/** mboxrd 방식으로 ">From "처럼 막아 둔 줄을 되돌린다 */
export function unescapeMboxMessage(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  let length = 0;
  let lineStart = true;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (lineStart && byte === 0x3e /* > */) {
      let j = i;
      while (bytes[j] === 0x3e) j++;
      if (bytes[j] === 0x46 && bytes[j + 1] === 0x72 && bytes[j + 2] === 0x6f && bytes[j + 3] === 0x6d && bytes[j + 4] === 0x20) {
        lineStart = false;
        continue; // 맨 앞 '>' 하나만 뺀다
      }
    }
    out[length++] = byte;
    lineStart = byte === 0x0a;
  }
  return out.subarray(0, length);
}
