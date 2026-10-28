import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export const OPEN_ACCEPT = '.eml,.msg,.mbox,.mbx,message/rfc822,application/vnd.ms-outlook,application/mbox';

function hasFiles(event: DragEvent): boolean {
  return Boolean(event.dataTransfer?.types.includes('Files'));
}

/** 창 어디에 끌어다 놓아도 파일을 받는다 */
export function useWindowDrop(onFiles: (files: File[]) => void): boolean {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const callback = useRef(onFiles);
  callback.current = onFiles;

  useEffect(() => {
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
    };
    const over = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      callback.current([...(event.dataTransfer?.files ?? [])]);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  return dragging;
}

export function DropOverlay() {
  return (
    <div className="drop-overlay" aria-hidden="true">
      <div className="drop-overlay-inner">
        <Icon name="upload" size={40} />
        <p>여기에 놓으면 열립니다</p>
      </div>
    </div>
  );
}

export function EmptyState({ onPick }: { onPick: () => void }) {
  return (
    <section className="empty-state">
      <div className="drop-target">
        <Icon name="mail" size={48} />
        <h1>메일 파일을 끌어다 놓으세요</h1>
        <p>본문과 첨부파일, 첨부 속 메일과 압축 파일까지 바로 열어 보고 내려받을 수 있습니다.</p>
        <p className="formats">
          <span>.eml</span> <span>.msg (Outlook)</span> <span>.mbox (Gmail·Thunderbird 백업)</span>
        </p>
        <button type="button" className="button button-primary" onClick={onPick}>
          <Icon name="upload" /> 파일 선택
        </button>
      </div>
      <p className="privacy">
        <Icon name="lock" size={14} /> 파일은 서버로 올라가지 않고 이 브라우저 안에서만 처리됩니다.
      </p>
    </section>
  );
}
