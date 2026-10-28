import { parseEml } from '../core/parser';
import type { AttachmentNode, ParsedMail } from '../core/types';

export interface ParseRequest {
  id: number;
  buffer: ArrayBuffer;
}

export type ParseResponse =
  | { id: number; ok: true; mail: ParsedMail }
  | { id: number; ok: false; error: string };

function collectBuffers(nodes: AttachmentNode[], buffers: Set<ArrayBuffer>): void {
  for (const node of nodes) {
    if (node.content.buffer instanceof ArrayBuffer) buffers.add(node.content.buffer);
    if (node.children?.kind === 'mail') collectBuffers(node.children.mail.attachments, buffers);
    if (node.children?.kind === 'archive') collectBuffers(node.children.entries, buffers);
  }
}

self.onmessage = async (event: MessageEvent<ParseRequest>) => {
  const { id, buffer } = event.data;
  try {
    const mail = await parseEml(buffer);
    const buffers = new Set<ArrayBuffer>();
    collectBuffers(mail.attachments, buffers);
    const response: ParseResponse = { id, ok: true, mail };
    self.postMessage(response, { transfer: [...buffers] });
  } catch (error) {
    const response: ParseResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};
