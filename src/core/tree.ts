import type { AttachmentNode } from './types';

export function childrenOf(node: AttachmentNode): AttachmentNode[] {
  if (node.children?.kind === 'mail') return node.children.mail.attachments;
  if (node.children?.kind === 'archive') return node.children.entries;
  return [];
}

/** 루트 첨부 목록에서 대상 첨부까지 거쳐 가는 노드들 (대상 포함) */
export function findPath(nodes: AttachmentNode[], target: AttachmentNode): AttachmentNode[] | null {
  for (const node of nodes) {
    if (node === target) return [node];
    const rest = findPath(childrenOf(node), target);
    if (rest) return [node, ...rest];
  }
  return null;
}
