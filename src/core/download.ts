import { zipSync, type Zippable } from 'fflate';
import { extensionOf, safeFilename } from './files';
import type { AttachmentNode } from './types';

/** 이미 압축된 형식은 다시 압축해도 작아지지 않으니 그대로 담는다 */
const STORED_EXTENSIONS = new Set([
  'zip', '7z', 'rar', 'gz', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif',
  'mp3', 'm4a', 'mp4', 'mov', 'webm', 'pdf', 'docx', 'xlsx', 'pptx', 'hwpx',
]);

export function downloadBytes(content: Uint8Array, filename: string): void {
  // 브라우저가 내용을 해석해 페이지로 열지 않도록 형식을 지정하지 않고 내려받는다
  const blob = new Blob([content as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeFilename(filename);
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function uniqueName(name: string, used: Set<string>): string {
  const key = (value: string) => value.toLowerCase();
  if (!used.has(key(name))) {
    used.add(key(name));
    return name;
  }
  const ext = extensionOf(name);
  const stem = ext ? name.slice(0, -(ext.length + 1)) : name;
  for (let n = 1; ; n++) {
    const candidate = ext ? `${stem} (${n}).${ext}` : `${stem} (${n})`;
    if (!used.has(key(candidate))) {
      used.add(key(candidate));
      return candidate;
    }
  }
}

function addNodes(target: Zippable, nodes: AttachmentNode[]): void {
  const used = new Set<string>();
  for (const node of nodes) {
    const name = uniqueName(safeFilename(node.filename, 'file'), used);
    const level = STORED_EXTENSIONS.has(extensionOf(name)) ? 0 : 6;
    target[name] = [node.content, { level }];

    // 첨부된 메일은 그 안의 첨부도 "메일이름_첨부" 폴더에 함께 담는다
    if (node.children?.kind === 'mail') {
      const inner = node.children.mail.attachments.filter((child) => !child.inline);
      if (inner.length > 0) {
        const folder: Zippable = {};
        addNodes(folder, inner);
        target[uniqueName(`${name.replace(/\.eml$/i, '')}_첨부`, used)] = folder;
      }
    }
  }
}

/** 첨부 목록을 하나의 ZIP으로 묶는다. 압축 파일은 풀지 않고 원본 그대로 담는다 */
export function buildZip(nodes: AttachmentNode[]): Uint8Array {
  const root: Zippable = {};
  addNodes(root, nodes);
  return zipSync(root);
}

export function downloadZip(nodes: AttachmentNode[], zipName: string): void {
  downloadBytes(buildZip(nodes), `${safeFilename(zipName, 'attachments')}.zip`);
}
