import { describe, expect, it } from 'vitest';
import iconv from 'iconv-lite';
import { decompressRtf, rtfToBody } from '../src/core/rtf';
import { uncompressedRtf } from './outlook-fixtures';

const ascii = (text: string) => new TextEncoder().encode(text);

describe('decompressRtf', () => {
  it('MS-OXRTFCP 예제의 압축 RTF를 푼다', () => {
    const compressed = Uint8Array.from([
      0x2d, 0x00, 0x00, 0x00, 0x2b, 0x00, 0x00, 0x00, 0x4c, 0x5a, 0x46, 0x75, 0xf1, 0xc5, 0xc7, 0xa7, 0x03, 0x00,
      0x0a, 0x00, 0x72, 0x63, 0x70, 0x67, 0x31, 0x32, 0x35, 0x42, 0x32, 0x0a, 0xf3, 0x20, 0x68, 0x65, 0x6c, 0x09,
      0x00, 0x20, 0x62, 0x77, 0x05, 0xb0, 0x6c, 0x64, 0x7d, 0x0a, 0x80, 0x0f, 0xa0,
    ]);
    expect(new TextDecoder().decode(decompressRtf(compressed))).toBe('{\\rtf1\\ansi\\ansicpg1252\\pard hello world}\r\n');
  });

  it('압축하지 않은 RTF도 그대로 돌려준다', () => {
    const rtf = ascii('{\\rtf1 hi}');
    expect(decompressRtf(uncompressedRtf(rtf))).toEqual(rtf);
  });
});

describe('rtfToBody', () => {
  it('HTML을 감싼 RTF에서 원래 HTML을 되살린다', () => {
    const rtf = ascii(
      '{\\rtf1\\ansi\\ansicpg1252\\fromhtml1 \\deff0{\\fonttbl{\\f0\\fswiss Arial;}}' +
        '{\\*\\htmltag19 <html>}{\\*\\htmltag34 <body>}\\htmlrtf {\\htmlrtf0 ' +
        '{\\*\\htmltag64 <p>}Hello \\{world\\}\\htmlrtf\\par\\htmlrtf0{\\*\\htmltag72 </p>}}' +
        '{\\*\\htmltag42 </body>}{\\*\\htmltag27 </html>}}',
    );
    const body = rtfToBody(rtf);
    expect(body.html?.replace(/\s+/g, '')).toBe('<html><body><p>Hello{world}</p></body></html>');
  });

  it('글꼴 문자셋(129)으로 한글 바이트를 해석하고 \\u 문자를 처리한다', () => {
    const hangul = [...iconv.encode('안녕', 'cp949')].map((b) => `\\'${b.toString(16)}`).join('');
    const rtf = ascii(
      `{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\fnil\\fcharset129 Gulim;}}\\f0 ${hangul}\\par \\u54620?\\u44544? end}`,
    );
    expect(rtfToBody(rtf).text).toBe('안녕\n한글 end');
  });

  it('일반 서식 RTF는 텍스트로 꺼낸다', () => {
    const rtf = ascii('{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}{\\colortbl;\\red0\\green0\\blue0;}{\\*\\generator X;}\\b Bold\\b0  text\\par next}');
    expect(rtfToBody(rtf)).toEqual({ text: 'Bold text\nnext' });
  });
});
