import { useEffect, useMemo, useRef } from 'react';
import { decodeText } from '../core/encoding';
import { formatBytes } from '../core/files';
import { MAX_TEXT_PREVIEW, previewKind } from '../core/preview';
import type { AttachmentNode } from '../core/types';
import { Icon } from './Icon';
import { useObjectUrl } from './useObjectUrls';

interface PreviewModalProps {
  node: AttachmentNode;
  onClose: () => void;
  onDownload: (node: AttachmentNode) => void;
}

export function PreviewModal({ node, onClose, onDownload }: PreviewModalProps) {
  const kind = previewKind(node);
  const url = useObjectUrl(kind && kind !== 'text' ? node : null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const text = useMemo(() => {
    if (kind !== 'text') return null;
    const truncated = node.content.byteLength > MAX_TEXT_PREVIEW;
    return { value: decodeText(node.content.subarray(0, MAX_TEXT_PREVIEW)), truncated };
  }, [kind, node]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="preview"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-label={`${node.filename} 미리보기`}
    >
      <header className="preview-header">
        <div className="preview-title">
          <strong title={node.filename}>{node.filename}</strong>
          <span>
            {node.mimeType} · {formatBytes(node.size)}
          </span>
        </div>
        <button type="button" className="button" onClick={() => onDownload(node)}>
          <Icon name="download" /> 내려받기
        </button>
        <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">
          <Icon name="close" />
        </button>
      </header>
      <div className={`preview-body preview-${kind ?? 'none'}`}>
        {kind === 'image' && url && <img src={url} alt={node.filename} />}
        {kind === 'pdf' && url && (
          <object data={url} type="application/pdf" aria-label={node.filename}>
            <p className="muted">이 브라우저는 PDF 미리보기를 지원하지 않습니다. 내려받아 확인하세요.</p>
          </object>
        )}
        {kind === 'audio' && url && <audio src={url} controls />}
        {kind === 'video' && url && <video src={url} controls />}
        {text && (
          <>
            <pre>{text.value}</pre>
            {text.truncated && <p className="muted">앞부분 1MB만 표시했습니다. 전체 내용은 내려받아 확인하세요.</p>}
          </>
        )}
        {!kind && <p className="muted">이 형식은 미리보기를 지원하지 않습니다. 내려받아 확인하세요.</p>}
      </div>
    </dialog>
  );
}
