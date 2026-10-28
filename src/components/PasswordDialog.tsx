import { useEffect, useRef, useState } from 'react';
import type { AttachmentNode } from '../core/types';
import { Icon } from './Icon';

interface PasswordDialogProps {
  node: AttachmentNode;
  onSubmit: (password: string) => Promise<void>;
  onClose: () => void;
}

export function PasswordDialog({ node, onSubmit, onClose }: PasswordDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog ref={dialogRef} className="password-dialog" onClose={onClose} aria-label="압축 파일 암호 입력">
      <form
        method="dialog"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!password || busy) return;
          setBusy(true);
          setError(null);
          try {
            await onSubmit(password);
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
            setBusy(false);
          }
        }}
      >
        <h2>
          <Icon name="lock" /> 암호가 걸린 압축 파일
        </h2>
        <p className="muted" title={node.filename}>
          {node.filename}
        </p>
        <input
          type="password"
          autoFocus
          autoComplete="off"
          placeholder="압축 암호"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={Boolean(error)}
        />
        {error && <p className="error-text small">{error}</p>}
        <p className="muted small">암호는 이 브라우저 안에서만 쓰이고 어디에도 저장되지 않습니다.</p>
        <div className="dialog-actions">
          <button type="button" className="button" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="button button-primary" disabled={!password || busy}>
            {busy ? '여는 중…' : '열기'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
