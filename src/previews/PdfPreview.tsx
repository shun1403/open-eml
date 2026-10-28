import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { AttachmentNode } from '../core/types';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** 한 번에 그리는 최대 쪽 수 */
const MAX_PAGES = 300;

function PdfPage({ doc, number }: { doc: PDFDocumentProxy; number: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(number <= 2);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || visible) return;
    // 화면 근처에 온 쪽만 그린다
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
    }, { rootMargin: '600px' });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | null = null;
    doc.getPage(number).then((page) => {
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      // 쪽 목록의 안쪽 너비(좌우 여백 제외)에 맞추되, 너무 크게 키우지는 않는다
      const width = Math.min((canvas.parentElement?.clientWidth ?? 832) - 32, 1000);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(width / base.width, 2);
      const ratio = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: scale * ratio });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / ratio}px`;
      canvas.style.height = `${viewport.height / ratio}px`;
      task = page.render({ canvas, viewport });
      task.promise.catch(() => {});
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, number, visible]);

  return <canvas ref={canvasRef} className="pdf-page" aria-label={`${number}쪽`} />;
}

export default function PdfPreview({ node }: { node: AttachmentNode }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base = new URL('pdfjs/', document.baseURI).href;
    // PDF.js가 데이터를 워커로 넘기며 비우므로 복사본을 준다
    const task = pdfjs.getDocument({
      data: node.content.slice(),
      cMapUrl: `${base}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${base}standard_fonts/`,
      wasmUrl: `${base}wasm/`,
      iccUrl: `${base}iccs/`,
      enableXfa: false,
    });
    task.promise.then(setDoc, (reason: unknown) => {
      const name = (reason as { name?: string })?.name;
      setError(name === 'PasswordException' ? '암호가 걸린 PDF입니다. 내려받아 확인하세요.' : 'PDF를 열지 못했습니다.');
    });
    return () => {
      task.destroy();
    };
  }, [node]);

  if (error) return <p className="muted preview-message">{error}</p>;
  if (!doc) return <p className="muted preview-message">PDF를 여는 중…</p>;
  const pages = Math.min(doc.numPages, MAX_PAGES);
  return (
    <div className="pdf-pages">
      {Array.from({ length: pages }, (_, index) => (
        <PdfPage key={index} doc={doc} number={index + 1} />
      ))}
      {doc.numPages > MAX_PAGES && (
        <p className="muted preview-message">앞 {MAX_PAGES}쪽만 표시했습니다. 전체는 내려받아 확인하세요.</p>
      )}
    </div>
  );
}
