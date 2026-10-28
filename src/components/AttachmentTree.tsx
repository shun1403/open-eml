import { useEffect, useRef, useState } from 'react';
import { formatBytes, isRiskyFile } from '../core/files';
import { previewKind } from '../core/preview';
import { childrenOf } from '../core/tree';
import type { AttachmentNode } from '../core/types';
import { Icon, type IconName } from './Icon';

export interface AttachmentActions {
  onPreview: (node: AttachmentNode) => void;
  onOpenMail: (node: AttachmentNode) => void;
  onDownload: (node: AttachmentNode) => void;
  onUnlock: (node: AttachmentNode) => void;
}

interface AttachmentTreeProps extends AttachmentActions {
  nodes: AttachmentNode[];
}

function iconFor(node: AttachmentNode): IconName {
  if (node.children?.kind === 'mail') return 'mail';
  if (node.children?.kind === 'archive') return 'archive';
  if (node.locked) return 'lock';
  const kind = previewKind(node);
  if (kind === 'image') return 'image';
  if (kind === 'pdf') return 'pdf';
  if (kind === 'audio' || kind === 'video') return 'media';
  return 'file';
}

function childNodes(node: AttachmentNode): AttachmentNode[] {
  return childrenOf(node).filter((child) => !child.inline);
}

export function AttachmentTree({ nodes, ...actions }: AttachmentTreeProps) {
  return (
    <ul className="tree" role="tree">
      {nodes.map((node) => (
        <AttachmentRow key={node.id} node={node} depth={0} {...actions} />
      ))}
    </ul>
  );
}

function AttachmentRow({ node, depth, ...actions }: AttachmentActions & { node: AttachmentNode; depth: number }) {
  const children = childNodes(node);
  const [expanded, setExpanded] = useState(depth === 0 && children.length > 0 && children.length <= 20);
  const isMail = node.children?.kind === 'mail';
  const canPreview = previewKind(node) !== null;
  const risky = isRiskyFile(node.filename);

  // 암호를 풀어 내용이 생기면 바로 펼쳐 보여준다
  const wasLocked = useRef(Boolean(node.locked));
  useEffect(() => {
    if (wasLocked.current && !node.locked && children.length > 0) setExpanded(true);
    wasLocked.current = Boolean(node.locked);
  }, [node.locked, children.length]);

  return (
    <li role="treeitem" aria-expanded={children.length > 0 ? expanded : undefined}>
      <div className="tree-row" style={{ paddingLeft: `${depth * 20 + 8}px` }}>
        <button
          type="button"
          className={`tree-toggle${expanded ? ' is-open' : ''}`}
          onClick={() => setExpanded((value) => !value)}
          disabled={children.length === 0}
          aria-label={expanded ? '접기' : '펼치기'}
        >
          {children.length > 0 && <Icon name="chevron" size={14} />}
        </button>
        <span className="tree-icon">
          <Icon name={iconFor(node)} />
        </span>
        <span className="tree-name" title={node.filename}>
          {isMail || canPreview ? (
            <button
              type="button"
              className="link-button"
              onClick={() => (isMail ? actions.onOpenMail(node) : actions.onPreview(node))}
            >
              {node.filename}
            </button>
          ) : (
            node.filename
          )}
          {risky && (
            <span className="badge badge-warning" title="실행 파일이나 매크로가 들어 있을 수 있습니다">
              <Icon name="warning" size={12} /> 주의
            </span>
          )}
          {node.locked && (
            <button type="button" className="badge badge-lock" onClick={() => actions.onUnlock(node)}>
              <Icon name="lock" size={12} /> 암호 입력
            </button>
          )}
          {node.error && <span className="tree-error">{node.error}</span>}
        </span>
        <span className="tree-size">{formatBytes(node.size)}</span>
        <span className="tree-actions">
          {isMail && (
            <button type="button" className="icon-button" onClick={() => actions.onOpenMail(node)} title="메일 열기">
              <Icon name="mail" />
            </button>
          )}
          {canPreview && (
            <button type="button" className="icon-button" onClick={() => actions.onPreview(node)} title="미리보기">
              <Icon name="eye" />
            </button>
          )}
          <button type="button" className="icon-button" onClick={() => actions.onDownload(node)} title="내려받기">
            <Icon name="download" />
          </button>
        </span>
      </div>
      {expanded && children.length > 0 && (
        <ul role="group">
          {children.map((child) => (
            <AttachmentRow key={child.id} node={child} depth={depth + 1} {...actions} />
          ))}
        </ul>
      )}
    </li>
  );
}
