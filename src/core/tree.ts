import type { AttachmentNode, ParsedMail } from './types';

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

export function findById(nodes: AttachmentNode[], id: string): AttachmentNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (id.startsWith(`${node.id}/`)) return findById(childrenOf(node), id);
  }
  return null;
}

/** 첨부 하나를 바꾼 새 메일을 만든다. 경로에 있는 노드만 새로 만든다 */
export function updateNode(
  mail: ParsedMail,
  id: string,
  update: (node: AttachmentNode) => AttachmentNode,
): ParsedMail {
  return { ...mail, attachments: updateNodes(mail.attachments, id, update) };
}

function updateNodes(
  nodes: AttachmentNode[],
  id: string,
  update: (node: AttachmentNode) => AttachmentNode,
): AttachmentNode[] {
  return nodes.map((node) => {
    if (node.id === id) return update(node);
    if (!id.startsWith(`${node.id}/`) || !node.children) return node;
    if (node.children.kind === 'mail') {
      return { ...node, children: { kind: 'mail', mail: updateNode(node.children.mail, id, update) } };
    }
    return { ...node, children: { ...node.children, entries: updateNodes(node.children.entries, id, update) } };
  });
}
