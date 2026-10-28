export interface CloudLink {
  url: string;
  /** 링크 글자 또는 주소에서 뽑은 파일 이름 */
  label: string;
  service: string;
  size?: string;
  expires?: string;
}

interface ServiceRule {
  service: string;
  match: (url: URL) => boolean;
}

const host = (url: URL, ...domains: string[]) =>
  domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
const BIG_FILE_HINT = /big[-_]?file|large[-_]?file|big[-_]?attach|bigmail|mass[-_]?file|file[-_]?link/i;

const SERVICES: ServiceRule[] = [
  { service: '네이버 대용량 첨부', match: (u) => host(u, 'naver.com') && BIG_FILE_HINT.test(u.hostname + u.pathname) },
  { service: '다음 대용량 첨부', match: (u) => host(u, 'daum.net', 'kakao.com') && BIG_FILE_HINT.test(u.hostname + u.pathname) },
  { service: 'Google Drive', match: (u) => host(u, 'drive.google.com', 'docs.google.com', 'drive.usercontent.google.com') },
  { service: 'OneDrive', match: (u) => host(u, '1drv.ms', 'onedrive.live.com', 'sharepoint.com') },
  { service: 'Dropbox', match: (u) => host(u, 'dropbox.com', 'db.tt', 'dropboxusercontent.com') },
  { service: 'WeTransfer', match: (u) => host(u, 'wetransfer.com', 'we.tl') },
  { service: 'iCloud Mail Drop', match: (u) => host(u, 'icloud.com') && /attachment|iclouddrive/i.test(u.pathname) },
  { service: 'Box', match: (u) => host(u, 'box.com') && /\/s\/|\/file\//.test(u.pathname) },
  { service: 'MEGA', match: (u) => host(u, 'mega.nz') },
  { service: '대용량 첨부', match: (u) => BIG_FILE_HINT.test(u.hostname + u.pathname) },
];

const FILE_NAME = /[^\\/:*?"<>|\s][^\\/:*?"<>|]*\.[a-z0-9]{2,5}$/i;
const SIZE = /\d+(?:[.,]\d+)?\s?(?:KB|MB|GB|TB)\b/i;
const EXPIRES =
  /(\d{4}\s?[.\-/년]\s?\d{1,2}\s?[.\-/월]\s?\d{1,2}일?\.?(?:\s?\(?[월화수목금토일]\)?)?(?:\s?\d{1,2}:\d{2})?)\s*(?:까지|만료)/;

function toUrl(href: string | null | undefined): URL | null {
  if (!href) return null;
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function fileNameFromUrl(url: URL): string | undefined {
  for (const value of [url.searchParams.get('filename'), url.searchParams.get('name'), url.pathname.split('/').pop()]) {
    if (!value) continue;
    try {
      const decoded = decodeURIComponent(value);
      if (FILE_NAME.test(decoded)) return decoded;
    } catch {
      // 잘못 인코딩된 주소는 건너뛴다
    }
  }
  return undefined;
}

function classify(url: URL, text: string): string | null {
  const rule = SERVICES.find((candidate) => candidate.match(url));
  if (rule) return rule.service;
  // 서비스는 모르지만 링크 글자가 파일 이름처럼 생겼으면 파일 링크로 본다
  return FILE_NAME.test(text.trim()) ? '링크로 첨부된 파일' : null;
}

/** 본문에서 대용량 첨부·클라우드 공유 링크를 찾는다 */
export function findCloudLinks(html: string | undefined, text: string | undefined): CloudLink[] {
  const links = new Map<string, CloudLink>();
  const add = (url: URL, label: string, context: string) => {
    const service = classify(url, label);
    if (!service || links.has(url.href)) return;
    links.set(url.href, {
      url: url.href,
      label: (FILE_NAME.test(label.trim()) ? label.trim() : fileNameFromUrl(url)) ?? (label.trim() || url.hostname),
      service,
      size: SIZE.exec(context)?.[0],
      expires: EXPIRES.exec(context)?.[1],
    });
  };

  if (html && typeof DOMParser !== 'undefined') {
    // DOMParser로 만든 문서는 이미지나 스크립트를 불러오지 않는다
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const anchor of doc.querySelectorAll('a[href]')) {
      const url = toUrl(anchor.getAttribute('href'));
      if (!url) continue;
      const container = anchor.closest('tr, li, p, td, div') ?? anchor.parentElement;
      add(url, anchor.textContent ?? '', (container?.textContent ?? '').slice(0, 500));
    }
  }
  if (text) {
    for (const match of text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
      const url = toUrl(match[0]);
      if (!url) continue;
      const start = match.index ?? 0;
      add(url, '', text.slice(Math.max(0, start - 200), start + match[0].length + 200));
    }
  }
  return [...links.values()];
}
