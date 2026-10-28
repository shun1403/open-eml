import { Component, Suspense, lazy, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { decodeText } from '../core/encoding';
import { formatBytes } from '../core/files';
import { MAX_TEXT_PREVIEW, previewKind } from '../core/preview';
import type { AttachmentNode } from '../core/types';
import { Icon } from './Icon';
import { useObjectUrl } from './useObjectUrls';

// 무거운 미리보기 라이브러리는 그 형식을 처음 열 때만 불러온다
const PdfPreview = lazy(() => import('../previews/PdfPreview'));
const DocxPreview = lazy(() => import('../previews/DocxPreview'));
const SheetPreview = lazy(() => import('../previews/SheetPreview'));
const HwpPreview = lazy(() => import('../previews/HwpPreview'));

interface PreviewModalProps {
  node: AttachmentNode;
  onClose: () => void;
  onDownload: (node: AttachmentNode) => void;
}

class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return <p className="muted preview-message">미리보기를 만들지 못했습니다. 내려받아 확인하세요.</p>;
    }
    return this.props.children;
  }
}

const MEDIA_KINDS = new Set(['image', 'audio', 'video']);

export function PreviewModal({ node, onClose, onDownload }: PreviewModalProps) {
  const kind = previewKind(node);
  const url = useObjectUrl(kind && MEDIA_KINDS.has(kind) ? node : null);
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
        <PreviewBoundary>
          <Suspense fallback={<p className="muted preview-message">미리보기를 준비하는 중…</p>}>
            {kind === 'image' && url && <img src={url} alt={node.filename} />}
            {kind === 'audio' && url && <audio src={url} controls />}
            {kind === 'video' && url && <video src={url} controls />}
            {kind === 'pdf' && <PdfPreview node={node} />}
            {kind === 'docx' && <DocxPreview node={node} />}
            {kind === 'sheet' && <SheetPreview node={node} />}
            {(kind === 'hwp' || kind === 'hwpx') && <HwpPreview node={node} format={kind} />}
            {text && (
              <>
                <pre>{text.value}</pre>
                {text.truncated && <p className="muted">앞부분 1MB만 표시했습니다. 전체 내용은 내려받아 확인하세요.</p>}
              </>
            )}
            {!kind && <p className="muted preview-message">이 형식은 미리보기를 지원하지 않습니다. 내려받아 확인하세요.</p>}
          </Suspense>
        </PreviewBoundary>
      </div>
    </dialog>
  );
}
