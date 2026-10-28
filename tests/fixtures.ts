import iconv from 'iconv-lite';
import { strToU8, zipSync } from 'fflate';

const CRLF = '\r\n';

export function base64(data: Uint8Array | string, charset = 'utf-8'): string {
  const bytes = typeof data === 'string' ? iconv.encode(data, charset) : Buffer.from(data);
  return bytes.toString('base64').replace(/.{76}(?=.)/g, `$&${CRLF}`);
}

/** RFC 2047 encoded-word */
export function encodedWord(text: string, charset: string): string {
  return `=?${charset}?B?${iconv.encode(text, charset).toString('base64')}?=`;
}

export interface Part {
  headers: Record<string, string>;
  body: string;
}

export function multipart(type: string, boundary: string, parts: Part[]): Part {
  const body = parts
    .map((part) => `--${boundary}${CRLF}${headerBlock(part.headers)}${CRLF}${part.body}`)
    .join(CRLF);
  return {
    headers: { 'Content-Type': `${type}; boundary="${boundary}"` },
    body: `${body}${CRLF}--${boundary}--${CRLF}`,
  };
}

function headerBlock(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}${CRLF}`)
    .join('');
}

export function message(headers: Record<string, string>, root: Part): string {
  return headerBlock({ 'MIME-Version': '1.0', ...headers, ...root.headers }) + CRLF + root.body;
}

/** 1x1 투명 PNG */
export const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
);

/**
 * 한국어 Windows 압축 프로그램처럼 UTF-8 플래그 없이 CP949로 이름을 적은 ZIP을 만든다.
 * 같은 바이트 길이의 ASCII 이름으로 만든 뒤 헤더 속 이름 바이트만 바꿔치기한다.
 */
export function cp949Zip(files: Record<string, string>): Uint8Array {
  const placeholders: Record<string, Uint8Array> = {};
  const replacements: Array<[Uint8Array, Uint8Array]> = [];
  Object.entries(files).forEach(([name, text], index) => {
    const encoded = Uint8Array.from(iconv.encode(name, 'cp949'));
    const placeholder = `${String(index).padStart(2, '0')}`.padEnd(encoded.length, '#');
    placeholders[placeholder] = strToU8(text);
    replacements.push([strToU8(placeholder), encoded]);
  });
  const zip = zipSync(placeholders, { level: 0 });
  for (const [from, to] of replacements) {
    for (let i = 0; i <= zip.length - from.length; i++) {
      if (from.every((byte, j) => zip[i + j] === byte)) zip.set(to, i);
    }
  }
  return zip;
}
