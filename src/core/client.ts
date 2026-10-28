import type { ParseRequest, ParseResponse } from '../worker/parse.worker';
import type { ParsedMail } from './types';

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (mail: ParsedMail) => void; reject: (error: Error) => void }>();

function getWorker(): Worker | null {
  if (worker || typeof Worker === 'undefined') return worker;
  worker = new Worker(new URL('../worker/parse.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<ParseResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.ok) request.resolve(response.mail);
    else request.reject(new Error(response.error));
  };
  worker.onerror = (event) => {
    for (const request of pending.values()) request.reject(new Error(event.message || '메일을 읽지 못했습니다.'));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

/** 큰 메일도 화면이 멈추지 않도록 Web Worker에서 파싱한다 */
export async function parseFile(file: Blob): Promise<ParsedMail> {
  const buffer = await file.arrayBuffer();
  const target = getWorker();
  if (!target) {
    const { parseEml } = await import('./parser');
    return parseEml(buffer);
  }
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    const request: ParseRequest = { id, buffer };
    target.postMessage(request, [buffer]);
  });
}
