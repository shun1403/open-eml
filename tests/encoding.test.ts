import { describe, expect, it } from 'vitest';
import iconv from 'iconv-lite';
import { decodeText, recoverLatin1Name } from '../src/core/encoding';
import { formatBytes, isRiskyFile, resolveMimeType, safeFilename } from '../src/core/files';

describe('decodeText', () => {
  it('UTF-8, BOM, EUC-KR을 구분해 읽는다', () => {
    expect(decodeText(new TextEncoder().encode('한글'))).toBe('한글');
    expect(decodeText(Uint8Array.from([0xef, 0xbb, 0xbf, 0x41]))).toBe('A');
    expect(decodeText(Uint8Array.from(iconv.encode('안녕하세요', 'euc-kr')))).toBe('안녕하세요');
  });
});

describe('recoverLatin1Name', () => {
  it('latin1로 잘못 읽힌 CP949 이름을 되돌린다', () => {
    const latin1 = String.fromCharCode(...iconv.encode('보고서.hwp', 'cp949'));
    expect(recoverLatin1Name(latin1)).toBe('보고서.hwp');
    expect(recoverLatin1Name('report.pdf')).toBe('report.pdf');
  });
});

describe('files', () => {
  it('일반적인 형식이면 확장자로 추정한다', () => {
    expect(resolveMimeType('a.PDF', 'application/octet-stream')).toBe('application/pdf');
    expect(resolveMimeType('a.pdf', 'image/png')).toBe('image/png');
    expect(resolveMimeType('noext', undefined)).toBe('application/octet-stream');
  });

  it('위험한 확장자를 알아본다', () => {
    expect(isRiskyFile('invoice.pdf.exe')).toBe(true);
    expect(isRiskyFile('매크로.xlsm')).toBe(true);
    expect(isRiskyFile('photo.jpg')).toBe(false);
  });

  it('파일 이름에 쓸 수 없는 문자를 바꾼다', () => {
    expect(safeFilename('a:b*c?.txt')).toBe('a_b_c_.txt');
    expect(safeFilename('../../etc/passwd')).toBe('passwd');
    expect(safeFilename('...')).toBe('file');
  });

  it('크기를 읽기 쉽게 표시한다', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB');
  });
});
