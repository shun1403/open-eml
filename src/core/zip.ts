import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader, configure, type FileEntry } from '@zip.js/zip.js';
import { decodeText } from './encoding';

// 이미 Web Worker 안에서 돌고 있으므로 zip.js가 따로 워커를 만들지 않게 한다
configure({ useWebWorkers: false });

export class LimitError extends Error {}
export class PasswordError extends Error {}

export interface ZipBudget {
  bytesLeft: number;
  entriesLeft: number;
}

export interface ZipFile {
  name: string;
  content: Uint8Array;
}

export interface ZipListing {
  encrypted: boolean;
  files: ZipFile[];
}

const LIMIT_MESSAGE = '압축을 풀면 너무 커서 내용을 펼치지 않았습니다.';

/** UTF-8 플래그가 없는 이름은 대부분 CP949(한국어 Windows)라서 직접 해석한다 */
function entryName(entry: FileEntry): string {
  if (entry.filenameUTF8 || !entry.rawFilename) return entry.filename;
  return decodeText(entry.rawFilename);
}

/**
 * ZIP을 연다. 암호가 걸린 항목이 있는데 암호를 받지 않았으면 내용 없이 encrypted만 알려준다.
 * 암호가 틀리면 PasswordError를 던진다.
 */
export async function readZip(content: Uint8Array, budget: ZipBudget, password?: string): Promise<ZipListing> {
  const reader = new ZipReader(new Uint8ArrayReader(content));
  try {
    const entries = (await reader.getEntries()).filter((entry): entry is FileEntry => !entry.directory);
    const encrypted = entries.some((entry) => entry.encrypted);
    if (encrypted && password === undefined) return { encrypted, files: [] };

    const declared = entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
    if (declared > budget.bytesLeft || entries.length > budget.entriesLeft) throw new LimitError(LIMIT_MESSAGE);

    const files: ZipFile[] = [];
    for (const entry of entries) {
      let data: Uint8Array;
      try {
        data = await entry.getData(new Uint8ArrayWriter(), entry.encrypted ? { password } : {});
      } catch (error) {
        if (error instanceof Error && /password/i.test(error.message)) throw new PasswordError('암호가 틀렸습니다.');
        throw error;
      }
      budget.bytesLeft -= data.byteLength;
      budget.entriesLeft -= 1;
      if (budget.bytesLeft < 0) throw new LimitError(LIMIT_MESSAGE);
      files.push({ name: entryName(entry), content: data });
    }
    return { encrypted, files };
  } finally {
    await reader.close();
  }
}
