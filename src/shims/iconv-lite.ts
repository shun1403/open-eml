/**
 * msgreader가 쓰는 iconv-lite는 Node의 Buffer가 필요해 브라우저에서 동작하지 않는다.
 * 문자열 해석만 쓰므로 브라우저 내장 TextDecoder로 대신한다. (vite.config.ts에서 연결)
 */
import { normalizeCharset } from '../core/encoding';

export function decode(bytes: Uint8Array, encoding: string): string {
  try {
    return new TextDecoder(normalizeCharset(encoding)).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export function encodingExists(encoding: string): boolean {
  try {
    new TextDecoder(normalizeCharset(encoding));
    return true;
  } catch {
    return false;
  }
}

export function encode(): never {
  throw new Error('iconv-lite encode is not supported in the browser shim');
}

export default { decode, encode, encodingExists };
