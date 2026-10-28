import { indexMbox, summarizeMboxEntry, unescapeMboxMessage, type MboxEntry } from '../core/mbox';
import { parseMailFile, unlockArchive, type MailFormat } from '../core/parser';
import type { AttachmentNode, ParsedMail } from '../core/types';
import { PasswordError } from '../core/zip';

export type WorkerRequest =
  | { id: number; type: 'parse'; source: Blob; format: MailFormat; mbox?: boolean }
  | { id: number; type: 'unlock'; archive: Pick<AttachmentNode, 'id' | 'content'>; password: string }
  | { id: number; type: 'mbox'; file: Blob };

export type WorkerResponse =
  | { id: number; type: 'mail'; mail: ParsedMail }
  | { id: number; type: 'entries'; entries: AttachmentNode[] }
  | { id: number; type: 'mbox'; entries: MboxEntry[]; scanned: number; total: number; done: boolean }
  | { id: number; type: 'mbox-reading'; percent: number }
  | { id: number; type: 'error'; error: string; password?: boolean };

const MBOX_BATCH = 200;

function collectBuffers(nodes: AttachmentNode[], buffers: Set<ArrayBuffer>): void {
  for (const node of nodes) {
    if (node.content.buffer instanceof ArrayBuffer) buffers.add(node.content.buffer);
    if (node.children?.kind === 'mail') collectBuffers(node.children.mail.attachments, buffers);
    if (node.children?.kind === 'archive') collectBuffers(node.children.entries, buffers);
  }
}

function send(response: WorkerResponse, nodes: AttachmentNode[] = []) {
  const buffers = new Set<ArrayBuffer>();
  collectBuffers(nodes, buffers);
  self.postMessage(response, { transfer: [...buffers] });
}

async function handle(request: WorkerRequest) {
  switch (request.type) {
    case 'parse': {
      let bytes: Uint8Array = new Uint8Array(await request.source.arrayBuffer());
      if (request.mbox) bytes = unescapeMboxMessage(bytes);
      const mail = await parseMailFile(bytes, request.format);
      send({ id: request.id, type: 'mail', mail }, mail.attachments);
      return;
    }
    case 'unlock': {
      const entries = await unlockArchive(request.archive, request.password);
      send({ id: request.id, type: 'entries', entries }, entries);
      return;
    }
    case 'mbox': {
      let lastPercent = -1;
      const index = await indexMbox(request.file, (bytes) => {
        const percent = Math.floor((bytes / Math.max(1, request.file.size)) * 100);
        if (percent === lastPercent) return;
        lastPercent = percent;
        send({ id: request.id, type: 'mbox-reading', percent });
      });
      let batch: MboxEntry[] = [];
      for (const [n, entry] of index.entries()) {
        try {
          batch.push(await summarizeMboxEntry(request.file, entry));
        } catch {
          batch.push({ ...entry, subject: '', from: [] });
        }
        if (batch.length === MBOX_BATCH) {
          send({ id: request.id, type: 'mbox', entries: batch, scanned: n + 1, total: index.length, done: false });
          batch = [];
        }
      }
      send({ id: request.id, type: 'mbox', entries: batch, scanned: index.length, total: index.length, done: true });
    }
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    await handle(request);
  } catch (error) {
    send({
      id: request.id,
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
      password: error instanceof PasswordError,
    });
  }
};
