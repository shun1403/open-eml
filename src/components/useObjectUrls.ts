import { useEffect, useState } from 'react';
import type { AttachmentNode } from '../core/types';

function toDataUrl(node: AttachmentNode): string {
  let binary = '';
  for (let i = 0; i < node.content.length; i += 0x8000) {
    binary += String.fromCharCode(...node.content.subarray(i, i + 0x8000));
  }
  return `data:${node.mimeType};base64,${btoa(binary)}`;
}

/**
 * blob: URL은 이 앱과 같은 출처라서, SVG를 새 탭에서 열면 그 안의 스크립트가 실행될 수 있다.
 * SVG는 출처가 없는 data: URL로 만들고 나머지는 blob: URL을 쓴다.
 */
function createUrl(node: AttachmentNode): { url: string; release: () => void } {
  if (node.mimeType === 'image/svg+xml') return { url: toDataUrl(node), release: () => {} };
  const url = URL.createObjectURL(new Blob([node.content as Uint8Array<ArrayBuffer>], { type: node.mimeType }));
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
      if (node.contentId && CID_TYPES.test(node.mimeType) && !created.has(node.contentId)) created.set(node.contentId, createUrl(node));
    }
    setUrls(new Map([...created].map(([id, { url }]) => [id, url])));
    return () => {
      for (const { release } of created.values()) release();
      setUrls(null);
    };
  }, [attachments]);
  return urls;
}
