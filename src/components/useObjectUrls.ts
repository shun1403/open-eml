import { useEffect, useState } from 'react';
import { mimeEssence } from '../core/files';
import type { AttachmentNode } from '../core/types';

/** 새 탭에서 열어도 문서로 해석되지 않는(스크립트를 실행할 수 없는) 형식 */
const INERT_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/avif', 'image/x-icon',
]);
const isInert = (type: string) => INERT_TYPES.has(type) || (/^(?:audio|video)\//.test(type) && !type.includes('xml'));

function toDataUrl(content: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < content.length; i += 0x8000) {
    binary += String.fromCharCode(...content.subarray(i, i + 0x8000));
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/**
 * blob: URL은 이 앱과 같은 출처라서, 문서로 해석되는 형식(SVG, HTML, XML 등)을 새 탭에서 열면
 * 그 안의 스크립트가 이 앱 권한으로 실행될 수 있다.
 * - 래스터 이미지·오디오·비디오: 그 형식 그대로 blob: URL
 * - SVG: 출처가 없는 data: URL (새 탭에서 열어도 이 앱과 분리된다)
 * - 그 밖의 형식: 브라우저가 해석하지 않도록 application/octet-stream
 */
function createUrl(node: AttachmentNode): { url: string; release: () => void } {
  const type = mimeEssence(node.mimeType);
  if (type === 'image/svg+xml') return { url: toDataUrl(node.content), release: () => {} };
  const blobType = isInert(type) ? type : 'application/octet-stream';
  const url = URL.createObjectURL(new Blob([node.content as Uint8Array<ArrayBuffer>], { type: blobType }));
  return { url, release: () => URL.revokeObjectURL(url) };
}

/** 첨부 하나를 가리키는 URL. 컴포넌트가 사라지면 해제한다 */
export function useObjectUrl(node: AttachmentNode | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!node) return;
    const created = createUrl(node);
    setUrl(created.url);
    return () => {
      created.release();
      setUrl(null);
    };
  }, [node]);
  return url;
}

const CID_TYPES = /^(?:image|audio|video)\//;

/**
 * 본문의 `cid:` 참조에 쓸 Content-ID → URL 표.
 * HTML 같은 문서 형식은 새 탭에서 열면 실행될 수 있어 이미지·미디어만 연결한다.
 */
export function useCidUrls(attachments: AttachmentNode[]): Map<string, string> | null {
  const [urls, setUrls] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    const created = new Map<string, ReturnType<typeof createUrl>>();
    for (const node of attachments) {
      if (node.contentId && CID_TYPES.test(mimeEssence(node.mimeType)) && !created.has(node.contentId)) created.set(node.contentId, createUrl(node));
    }
    setUrls(new Map([...created].map(([id, { url }]) => [id, url])));
    return () => {
      for (const { release } of created.values()) release();
      setUrls(null);
    };
  }, [attachments]);
  return urls;
}
