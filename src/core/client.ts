import type { WorkerRequest, WorkerResponse } from '../worker/parse.worker';
import type { MboxEntry } from './mbox';
import type { MailFormat } from './parser';
import type { AttachmentNode, ParsedMail } from './types';

type Pending = (response: WorkerResponse) => boolean;

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, Pending>();

export class WrongPasswordError extends Error {}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../worker/parse.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const handler = pending.get(event.data.id);
    // 처리기가 true를 돌려주면 그 요청은 끝난 것이다 (mbox는 여러 번 나눠 온다)
    if (handler?.(event.data)) pending.delete(event.data.id);
  };
  worker.onerror = (event) => {
    const error: WorkerResponse = { id: -1, type: 'error', error: event.message || '메일을 읽지 못했습니다.' };
    for (const handler of pending.values()) handler(error);
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

type RequestBody = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, 'id'> : never) : never;

function request(body: RequestBody, handler: Pending): void {
  const id = nextId++;
  pending.set(id, handler);
  getWorker().postMessage({ ...body, id } as WorkerRequest);
}

function toError(response: Extract<WorkerResponse, { type: 'error' }>): Error {
  return response.password ? new WrongPasswordError(response.error) : new Error(response.error);
}

/** 큰 메일도 화면이 멈추지 않도록 Web Worker에서 파싱한다 */
export function parseSource(source: Blob, format: MailFormat, options: { mbox?: boolean } = {}): Promise<ParsedMail> {
  return new Promise((resolve, reject) => {
    request({ type: 'parse', source, format, mbox: options.mbox }, (response) => {
      if (response.type === 'mail') resolve(response.mail);
      else if (response.type === 'error') reject(toError(response));
      return true;
    });
  });
}

/** 암호 ZIP을 연다. 암호가 틀리면 WrongPasswordError */
export function unlockZip(archive: AttachmentNode, password: string): Promise<AttachmentNode[]> {
  return new Promise((resolve, reject) => {
    request({ type: 'unlock', archive: { id: archive.id, content: archive.content }, password }, (response) => {
      if (response.type === 'entries') resolve(response.entries);
      else if (response.type === 'error') reject(toError(response));
      return true;
    });
  });
}

export interface MboxProgress {
  entries: MboxEntry[];
  scanned: number;
  total: number;
  /** 메일 위치를 찾느라 파일을 읽은 비율 (목록을 만들기 전 단계) */
  readPercent?: number;
}

/** mbox를 훑으며 메일 목록을 조금씩 넘겨준다 */
export function scanMbox(file: Blob, onProgress: (progress: MboxProgress) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    request({ type: 'mbox', file }, (response) => {
      if (response.type === 'error') {
        reject(toError(response));
        return true;
      }
      if (response.type === 'mbox-reading') {
        onProgress({ entries: [], scanned: 0, total: 0, readPercent: response.percent });
        return false;
      }
      if (response.type !== 'mbox') return false;
      onProgress(response);
      if (response.done) resolve(response.total);
      return response.done;
    });
  });
}
