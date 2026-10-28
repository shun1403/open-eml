import { useCallback, useEffect, useRef, useState } from 'react';
import { parseFile } from './core/client';
import { downloadBytes } from './core/download';
import { extensionOf, isRiskyFile } from './core/files';
import { findPath } from './core/tree';
import type { AttachmentNode, ParsedMail } from './core/types';
import { DropOverlay, EML_ACCEPT, EmptyState, useWindowDrop } from './components/DropZone';
import { Icon } from './components/Icon';
import { MailList } from './components/MailList';
import { MailView } from './components/MailView';
import { PreviewModal } from './components/PreviewModal';

export interface OpenedMail {
  id: string;
  fileName: string;
  status: 'loading' | 'ready' | 'error';
  mail?: ParsedMail;
  error?: string;
}

let nextId = 0;

function isEmlFile(file: File): boolean {
  return extensionOf(file.name) === 'eml' || file.type === 'message/rfc822';
}

export function App() {
  const [mails, setMails] = useState<OpenedMail[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** 첨부된 메일 안으로 들어간 경로 */
  const [trail, setTrail] = useState<AttachmentNode[]>([]);
  const [preview, setPreview] = useState<AttachmentNode | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const update = (id: string, patch: Partial<OpenedMail>) =>
    setMails((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));

  const openFiles = useCallback((files: File[]) => {
    const accepted = files.filter(isEmlFile);
    const rejected = files.length - accepted.length;
    if (rejected > 0) setToast(`.eml 파일이 아닌 ${rejected}개는 열지 않았습니다.`);
    if (accepted.length === 0) return;

    const entries = accepted.map((file) => ({ id: `mail-${nextId++}`, fileName: file.name, status: 'loading' as const }));
    setMails((current) => [...current, ...entries]);
    setSelectedId(entries[0].id);
    setTrail([]);

    accepted.forEach((file, index) => {
      const { id } = entries[index];
      parseFile(file)
        .then((mail) => update(id, { status: 'ready', mail }))
        .catch((error: unknown) =>
          update(id, { status: 'error', error: error instanceof Error ? error.message : String(error) }),
        );
    });
  }, []);

  const dragging = useWindowDrop(openFiles);

  const select = (id: string | null) => {
    setSelectedId(id);
    setTrail([]);
  };

  const remove = (id: string) => {
    setMails((current) => current.filter((entry) => entry.id !== id));
    if (id === selectedId) select(null);
  };

  const download = (node: AttachmentNode) => {
    if (
      isRiskyFile(node.filename) &&
      !window.confirm(
        `"${node.filename}"은(는) 실행 파일이거나 매크로가 들어 있을 수 있습니다.\n보낸 사람을 신뢰할 수 있을 때만 여세요. 내려받을까요?`,
      )
    ) {
      return;
    }
    downloadBytes(node.content, node.filename);
  };

  const selected = mails.find((entry) => entry.id === selectedId) ?? null;

  const openMail = (node: AttachmentNode) => {
    const root = selected?.mail;
    if (!root || node.children?.kind !== 'mail') return;
    // 펼친 트리에서 바로 열어도 경로에 중간 메일들이 빠지지 않게 루트부터 찾는다
    const path = findPath(root.attachments, node) ?? [node];
    setTrail(path.filter((step) => step.children?.kind === 'mail'));
    window.scrollTo({ top: 0 });
  };

  const last = trail[trail.length - 1];
  const currentMail = last?.children?.kind === 'mail' ? last.children.mail : selected?.mail;

  return (
    <div className={`app${selected ? ' has-selection' : ''}`}>
      <header className="topbar">
        <a className="brand" href="./" aria-label="open-eml 처음으로">
          <Icon name="mail" size={20} /> open-eml
        </a>
        <span className="topbar-note">
          <Icon name="lock" size={14} /> 파일은 이 기기 밖으로 전송되지 않습니다
        </span>
        <button type="button" className="button button-primary" onClick={() => inputRef.current?.click()}>
          <Icon name="upload" /> 파일 열기
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={EML_ACCEPT}
          multiple
          hidden
          onChange={(event) => {
            openFiles([...(event.target.files ?? [])]);
            event.target.value = '';
          }}
        />
      </header>

      {mails.length === 0 ? (
        <EmptyState onPick={() => inputRef.current?.click()} />
      ) : (
        <div className="layout">
          <MailList
            mails={mails}
            selectedId={selectedId}
            onSelect={select}
            onRemove={remove}
            onClear={() => {
              setMails([]);
              select(null);
            }}
          />
          <main className="viewer">
            {selected && (
              <nav className="breadcrumb" aria-label="메일 경로">
                <button type="button" className="link-button mobile-only" onClick={() => select(null)}>
                  <Icon name="back" size={16} /> 목록
                </button>
                <button type="button" className="link-button" onClick={() => setTrail([])} disabled={trail.length === 0}>
                  {selected.fileName}
                </button>
                {trail.map((node, index) => (
                  <span key={node.id} className="breadcrumb-item">
                    <Icon name="chevron" size={14} />
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setTrail(trail.slice(0, index + 1))}
                      disabled={index === trail.length - 1}
                    >
                      {node.filename}
                    </button>
                  </span>
                ))}
              </nav>
            )}
            {selected?.status === 'loading' && <p className="muted center">메일을 여는 중입니다…</p>}
            {selected?.status === 'error' && (
              <p className="error-text center">
                메일을 열 수 없습니다: {selected.error}
              </p>
            )}
            {currentMail && (
              <MailView
                key={`${selected?.id}:${last?.id ?? ''}`}
                mail={currentMail}
                fallbackTitle={last?.filename ?? selected?.fileName ?? 'mail'}
                onPreview={setPreview}
                onOpenMail={openMail}
                onDownload={download}
              />
            )}
            {!selected && <p className="muted center desktop-only">왼쪽 목록에서 메일을 고르세요.</p>}
          </main>
        </div>
      )}

      {preview && <PreviewModal node={preview} onClose={() => setPreview(null)} onDownload={download} />}
      {dragging && <DropOverlay />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
