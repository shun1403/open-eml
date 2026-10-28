import { useCallback, useEffect, useRef, useState } from 'react';
import { WrongPasswordError, parseSource, scanMbox, unlockZip } from './core/client';
import { downloadBytes } from './core/download';
import { extensionOf, isRiskyFile } from './core/files';
import type { MailFormat } from './core/parser';
import { findById, findPath, updateNode } from './core/tree';
import type { AttachmentNode, MailAddress, ParsedMail } from './core/types';
import { DropOverlay, EmptyState, OPEN_ACCEPT, useWindowDrop } from './components/DropZone';
import { Icon } from './components/Icon';
import { MailList } from './components/MailList';
import { MailView } from './components/MailView';
import { PasswordDialog } from './components/PasswordDialog';
import { PreviewModal } from './components/PreviewModal';

export interface OpenedMail {
  id: string;
  fileName: string;
  /** pending: mbox 목록에만 올라 있고 아직 열지 않은 메일 */
  status: 'pending' | 'loading' | 'ready' | 'error';
  format: MailFormat;
  source: Blob;
  /** mbox에서 꺼낸 메일이면 원래 mbox 파일 이름 */
  mboxName?: string;
  summary?: { subject: string; from: MailAddress[]; date?: string };
  mail?: ParsedMail;
  error?: string;
}

interface MboxScan {
  fileName: string;
  scanned: number;
  total: number;
  readPercent?: number;
}

let nextId = 0;

function fileKind(file: File): MailFormat | 'mbox' | null {
  const ext = extensionOf(file.name);
  if (ext === 'eml' || file.type === 'message/rfc822') return 'eml';
  if (ext === 'msg' || file.type === 'application/vnd.ms-outlook') return 'msg';
  if (ext === 'mbox' || ext === 'mbx' || file.type === 'application/mbox') return 'mbox';
  return null;
}

export function App() {
  const [mails, setMails] = useState<OpenedMail[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** 첨부된 메일 안으로 들어간 경로 (첨부 ID 목록) */
  const [trail, setTrail] = useState<string[]>([]);
  const [preview, setPreview] = useState<AttachmentNode | null>(null);
  const [unlocking, setUnlocking] = useState<AttachmentNode | null>(null);
  const [scans, setScans] = useState<Record<string, MboxScan>>({});
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const update = useCallback(
    (id: string, patch: Partial<OpenedMail> | ((entry: OpenedMail) => Partial<OpenedMail>)) =>
      setMails((current) =>
        current.map((entry) =>
          entry.id === id ? { ...entry, ...(typeof patch === 'function' ? patch(entry) : patch) } : entry,
        ),
      ),
    [],
  );

  const load = useCallback(
    (entry: OpenedMail) => {
      update(entry.id, { status: 'loading' });
      parseSource(entry.source, entry.format, { mbox: Boolean(entry.mboxName) })
        .then((mail) => update(entry.id, { status: 'ready', mail }))
        .catch((error: unknown) =>
          update(entry.id, { status: 'error', error: error instanceof Error ? error.message : String(error) }),
        );
    },
    [update],
  );

  const openMbox = useCallback(
    (file: File, selectFirst: boolean) => {
      const scanId = `scan-${nextId++}`;
      let first = selectFirst;
      setScans((current) => ({ ...current, [scanId]: { fileName: file.name, scanned: 0, total: 0 } }));
      scanMbox(file, ({ entries, scanned, total, readPercent }) => {
        setScans((current) => ({ ...current, [scanId]: { fileName: file.name, scanned, total, readPercent } }));
        if (entries.length === 0) return;
        const created = entries.map(
          (entry, index): OpenedMail => ({
            id: `mail-${nextId++}`,
            fileName: `${file.name} #${scanned - entries.length + index + 1}`,
            status: 'pending',
            format: 'eml',
            source: file.slice(entry.start, entry.end),
            mboxName: file.name,
            summary: { subject: entry.subject, from: entry.from, date: entry.date },
          }),
        );
        setMails((current) => [...current, ...created]);
        if (first && created.length > 0) {
          first = false;
          setSelectedId(created[0].id);
          setTrail([]);
          load(created[0]);
        }
      })
        .then((total) => {
          if (total === 0) setToast(`${file.name}에서 메일을 찾지 못했습니다.`);
        })
        .catch(() => setToast(`${file.name}을(를) 읽지 못했습니다.`))
        .finally(() =>
          setScans((current) => {
            const { [scanId]: _, ...rest } = current;
            return rest;
          }),
        );
    },
    [load],
  );

  const openFiles = useCallback(
    (files: File[]) => {
      const rejected = files.filter((file) => !fileKind(file)).length;
      if (rejected > 0) setToast(`.eml, .msg, .mbox 파일이 아닌 ${rejected}개는 열지 않았습니다.`);

      let selected = false;
      for (const file of files) {
        const kind = fileKind(file);
        if (!kind) continue;
        if (kind === 'mbox') {
          openMbox(file, !selected);
          selected = true;
          continue;
        }
        const entry: OpenedMail = { id: `mail-${nextId++}`, fileName: file.name, status: 'loading', format: kind, source: file };
        setMails((current) => [...current, entry]);
        if (!selected) {
          selected = true;
          setSelectedId(entry.id);
          setTrail([]);
        }
        load(entry);
      }
    },
    [load, openMbox],
  );

  const dragging = useWindowDrop(openFiles);

  const select = (id: string | null) => {
    setSelectedId(id);
    setTrail([]);
    const entry = mails.find((item) => item.id === id);
    if (entry?.status === 'pending') load(entry);
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
  const root = selected?.mail;
  const trailNodes = root ? trail.map((id) => findById(root.attachments, id)).filter((node) => node !== null) : [];
  const last = trailNodes[trailNodes.length - 1];
  const currentMail = last?.children?.kind === 'mail' ? last.children.mail : root;

  const openMail = (node: AttachmentNode) => {
    if (!root || node.children?.kind !== 'mail') return;
    // 펼친 트리에서 바로 열어도 경로에 중간 메일들이 빠지지 않게 루트부터 찾는다
    const path = findPath(root.attachments, node) ?? [node];
    setTrail(path.filter((step) => step.children?.kind === 'mail').map((step) => step.id));
    window.scrollTo({ top: 0 });
  };

  const unlock = async (password: string) => {
    if (!selected || !unlocking) return;
    let entries: AttachmentNode[];
    try {
      entries = await unlockZip(unlocking, password);
    } catch (error) {
      if (error instanceof WrongPasswordError) throw new Error('암호가 틀렸습니다. 다시 입력해 주세요.');
      throw new Error(`압축을 풀지 못했습니다. ${error instanceof Error ? error.message : ''}`.trim());
    }
    const nodeId = unlocking.id;
    update(selected.id, (entry) => ({
      mail: entry.mail
        ? updateNode(entry.mail, nodeId, (node) => ({ ...node, locked: false, children: { kind: 'archive', entries } }))
        : entry.mail,
    }));
    setUnlocking(null);
  };

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
          accept={OPEN_ACCEPT}
          multiple
          hidden
          onChange={(event) => {
            openFiles([...(event.target.files ?? [])]);
            event.target.value = '';
          }}
        />
      </header>

      {mails.length === 0 && Object.keys(scans).length === 0 ? (
        <EmptyState onPick={() => inputRef.current?.click()} />
      ) : (
        <div className="layout">
          <MailList
            mails={mails}
            scans={Object.entries(scans).map(([id, scan]) => ({ id, ...scan }))}
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
                {trailNodes.map((node, index) => (
                  <span key={node.id} className="breadcrumb-item">
                    <Icon name="chevron" size={14} />
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setTrail(trail.slice(0, index + 1))}
                      disabled={index === trailNodes.length - 1}
                    >
                      {node.filename}
                    </button>
                  </span>
                ))}
              </nav>
            )}
            {(selected?.status === 'loading' || selected?.status === 'pending') && (
              <p className="muted center">메일을 여는 중입니다…</p>
            )}
            {selected?.status === 'error' && (
              <p className="error-text center">메일을 열 수 없습니다: {selected.error}</p>
            )}
            {currentMail && (
              <MailView
                key={`${selected?.id}:${last?.id ?? ''}`}
                mail={currentMail}
                fallbackTitle={last?.filename ?? selected?.fileName ?? 'mail'}
                onPreview={setPreview}
                onOpenMail={openMail}
                onDownload={download}
                onUnlock={setUnlocking}
              />
            )}
            {!selected && <p className="muted center desktop-only">왼쪽 목록에서 메일을 고르세요.</p>}
          </main>
        </div>
      )}

      {preview && <PreviewModal node={preview} onClose={() => setPreview(null)} onDownload={download} />}
      {unlocking && <PasswordDialog node={unlocking} onSubmit={unlock} onClose={() => setUnlocking(null)} />}
      {dragging && <DropOverlay />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
