const FALLBACK_CHARSETS = ['euc-kr', 'shift_jis', 'gb18030', 'windows-1252'];

function tryDecode(bytes: Uint8Array, charset: string, fatal: boolean): string | null {
  try {
    return new TextDecoder(charset, { fatal }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * 문자셋 정보가 없거나 틀린 바이트열을 문자열로 바꾼다.
 * BOM → 지정된 문자셋 → UTF-8 → 한국어 환경에서 흔한 레거시 인코딩 순으로 시도한다.
 */
export function decodeText(bytes: Uint8Array, charsetHint?: string): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));

  if (charsetHint) {
    const hinted = tryDecode(bytes, charsetHint, true);
    if (hinted !== null) return hinted;
  }
  const utf8 = tryDecode(bytes, 'utf-8', true);
  if (utf8 !== null) return utf8;
  for (const charset of FALLBACK_CHARSETS) {
    const decoded = tryDecode(bytes, charset, true);
    if (decoded !== null) return decoded;
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * fflate는 UTF-8 플래그가 없는 ZIP 항목 이름을 latin1로 읽는다.
 * 한국어 Windows에서 만든 ZIP은 대부분 CP949 이름이라, 원래 바이트로 되돌려 다시 해석한다.
 */
export function recoverLatin1Name(name: string): string {
  let hasHighByte = false;
  const bytes = new Uint8Array(name.length);
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code > 0xff) return name;
    if (code > 0x7f) hasHighByte = true;
    bytes[i] = code;
  }
  return hasHighByte ? decodeText(bytes) : name;
}
