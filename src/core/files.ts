const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  avif: 'image/avif',
  pdf: 'application/pdf',
  txt: 'text/plain',
  log: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  json: 'application/json',
  xml: 'application/xml',
  html: 'text/html',
  htm: 'text/html',
  ics: 'text/calendar',
  vcf: 'text/vcard',
  eml: 'message/rfc822',
  msg: 'application/vnd.ms-outlook',
  mbox: 'application/mbox',
  zip: 'application/zip',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  hwp: 'application/x-hwp',
  hwpx: 'application/hwp+zip',
};

const EXTENSION_BY_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_BY_EXTENSION)
    .reverse()
    .map(([ext, mime]) => [mime, ext]),
);

/** 실행되거나 매크로가 들어 있을 수 있어 내려받기 전에 경고할 확장자 */
const RISKY_EXTENSIONS = new Set([
  'exe', 'msi', 'msp', 'com', 'scr', 'pif', 'cpl', 'dll', 'sys',
  'bat', 'cmd', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'hta',
  'jar', 'lnk', 'reg', 'scf', 'url', 'iso', 'img', 'vhd', 'vhdx',
  'apk', 'app', 'dmg', 'pkg', 'sh', 'command',
  'docm', 'xlsm', 'pptm', 'dotm', 'xltm',
]);

export function extensionOf(filename: string): string {
  const base = baseName(filename);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function mimeFromFilename(filename: string): string | undefined {
  return MIME_BY_EXTENSION[extensionOf(filename)];
}

export function extensionFromMime(mimeType: string): string | undefined {
  return EXTENSION_BY_MIME[mimeType.toLowerCase()];
}

/** "Image/SVG+XML; charset=x"처럼 매개변수나 대소문자가 섞인 형식을 "image/svg+xml"로 맞춘다 */
export function mimeEssence(type: string | undefined): string {
  const essence = (type ?? '').split(';')[0].trim().toLowerCase();
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(essence) ? essence : '';
}

/** 첨부 헤더의 형식이 너무 일반적이면 파일 이름에서 형식을 추정한다 */
export function resolveMimeType(filename: string, declared?: string): string {
  const normalized = mimeEssence(declared);
  if (normalized && normalized !== 'application/octet-stream' && normalized !== 'application/unknown') {
    return normalized;
  }
  return mimeFromFilename(filename) ?? (normalized || 'application/octet-stream');
}

/** 원래 이름과, 실제로 저장될 이름 둘 중 하나라도 위험한 확장자면 경고한다 */
export function isRiskyFile(filename: string): boolean {
  return RISKY_EXTENSIONS.has(extensionOf(filename)) || RISKY_EXTENSIONS.has(extensionOf(safeFilename(filename)));
}

export function isMailFile(filename: string, mimeType: string): boolean {
  return mimeType === 'message/rfc822' || extensionOf(filename) === 'eml';
}

export function isMsgFile(filename: string, mimeType: string): boolean {
  return mimeType === 'application/vnd.ms-outlook' || extensionOf(filename) === 'msg';
}

const TNEF_TYPES = new Set(['application/ms-tnef', 'application/vnd.ms-tnef']);

function hasTnefSignature(content: Uint8Array): boolean {
  return content[0] === 0x78 && content[1] === 0x9f && content[2] === 0x3e && content[3] === 0x22;
}

export function isTnefFile(filename: string, mimeType: string, content?: Uint8Array): boolean {
  if (TNEF_TYPES.has(mimeType) || /^win(?:mail)?\.dat$/i.test(baseName(filename))) return true;
  return extensionOf(filename) === 'dat' && content !== undefined && hasTnefSignature(content);
}

export type ContainerKind = 'eml' | 'msg' | 'tnef' | 'zip';

/** 안에 다른 파일이나 메일이 들어 있어 펼칠 수 있는 형식인지 */
export function containerKind(node: { filename: string; mimeType: string; content: Uint8Array }): ContainerKind | null {
  if (isMailFile(node.filename, node.mimeType)) return 'eml';
  if (isMsgFile(node.filename, node.mimeType)) return 'msg';
  if (isTnefFile(node.filename, node.mimeType, node.content)) return 'tnef';
  if (isZipFile(node.filename, node.mimeType)) return 'zip';
  return null;
}

export function isZipFile(filename: string, mimeType: string): boolean {
  return (
    mimeType === 'application/zip' ||
    mimeType === 'application/x-zip-compressed' ||
    mimeType === 'application/x-zip' ||
    extensionOf(filename) === 'zip'
  );
}

/**
 * 글자 방향을 뒤집거나 보이지 않는 문자를 지운다.
 * "invoice.pdf\u202Eexe.scr"가 화면에 "invoice.pdfrcs.exe"처럼 보이는 위장을 막는다.
 */
export function stripInvisible(name: string): string {
  return name.replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, '');
}

const MAX_FILENAME = 200;

/** 다운로드나 ZIP 항목 이름으로 쓸 수 없는 문자를 바꾼다 */
export function safeFilename(name: string, fallback = 'file'): string {
  const cleaned = baseName(stripInvisible(name))
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '');
  if (!cleaned) return fallback;
  if (cleaned.length <= MAX_FILENAME) return cleaned;
  // 긴 이름은 앞부분을 줄이고 확장자는 남긴다 (잘라 낸 결과가 다른 확장자가 되지 않게)
  const ext = extensionOf(cleaned);
  const tail = ext && ext.length < 20 ? `.${ext}` : '';
  return cleaned.slice(0, MAX_FILENAME - tail.length) + tail;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
