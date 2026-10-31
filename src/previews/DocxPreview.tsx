import { useEffect, useState } from 'react';
import mammoth from 'mammoth';
import { prepareHtml } from '../core/html';
import type { AttachmentNode } from '../core/types';
import { HtmlFrame } from '../components/HtmlFrame';
import { zipUncompressedSize } from '../core/zip';

const MAX_UNZIPPED = 100 * 1024 * 1024;

export default function DocxPreview({ node }: { node: AttachmentNode }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const arrayBuffer = node.content.slice().buffer;
    zipUncompressedSize(node.content)
      .then((size) => {
        // 압축을 풀면 지나치게 커지는 문서(압축 폭탄)는 미리보지 않는다
        if (size > MAX_UNZIPPED) throw new Error('too large');
        return mammoth.convertToHtml({ arrayBuffer });
      })
      .then((result) => {
        if (cancelled) return;
        // 문서 속 그림은 data: URL로 들어오고, 외부 링크 그림은 막힌다
        setHtml(prepareHtml(`<div class="docx">${result.value}</div>`, { cidUrls: new Map(), allowRemote: false }).document);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [node]);

  if (error) return <p className="muted preview-message">문서를 열지 못했습니다. 내려받아 확인하세요.</p>;
  if (!html) return <p className="muted preview-message">문서를 여는 중…</p>;
  return (
    <div className="docx-preview">
      <p className="muted preview-note">글자와 표, 그림만 간단히 보여줍니다. 원래 모양은 내려받아 확인하세요.</p>
      <HtmlFrame document={html} title={node.filename} />
    </div>
  );
}
