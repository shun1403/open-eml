import { useCallback, useEffect, useRef } from 'react';

interface HtmlFrameProps {
  document: string;
  title: string;
}

/**
 * 정화된 메일 HTML을 스크립트가 실행되지 않는 iframe에 띄운다.
 * 높이는 내용에 맞춰 늘려서 페이지 전체가 한 번에 스크롤되도록 한다.
 */
export function HtmlFrame({ document, title }: HtmlFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const fitHeight = useCallback(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc?.documentElement) return;
    frame.style.height = `${Math.max(doc.documentElement.scrollHeight, 120)}px`;
  }, []);

  const handleLoad = useCallback(() => {
    cleanupRef.current?.();
    const doc = frameRef.current?.contentDocument;
    if (!doc?.body) return;
    fitHeight();
    const observer = new ResizeObserver(fitHeight);
    observer.observe(doc.body);
    // 이미지가 늦게 로드되면 높이가 바뀐다
    doc.addEventListener('load', fitHeight, true);
    cleanupRef.current = () => {
      observer.disconnect();
      doc.removeEventListener('load', fitHeight, true);
    };
  }, [fitHeight]);

  useEffect(() => () => cleanupRef.current?.(), []);

  return (
    <iframe
      ref={frameRef}
      className="html-frame"
      title={title}
      srcDoc={document}
      onLoad={handleLoad}
      // allow-scripts가 없으므로 같은 출처여도 메일 안의 코드는 실행되지 않는다
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
    />
  );
}
