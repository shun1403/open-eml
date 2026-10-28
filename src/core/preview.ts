import { isMailFile } from './files';
import type { AttachmentNode } from './types';

export type PreviewKind = 'image' | 'pdf' | 'text' | 'audio' | 'video';

/** <img>로 띄워도 안전한 형식만 허용한다 */
const IMAGE_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/avif', 'image/svg+xml', 'image/x-icon',
]);
const TEXT_TYPES = new Set([
  'application/json', 'application/xml', 'application/javascript', 'application/x-sh', 'application/rtf',
]);

/** 미리보기로 보여줄 텍스트의 최대 길이 */
export const MAX_TEXT_PREVIEW = 1024 * 1024;

export function previewKind(node: AttachmentNode): PreviewKind | null {
  const type = node.mimeType;
  if (isMailFile(node.filename, type)) return null;
  if (IMAGE_TYPES.has(type)) return 'image';
  if (type === 'application/pdf') return 'pdf';
  if (type.startsWith('text/') || TEXT_TYPES.has(type) || type.endsWith('+xml')) return 'text';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  return null;
}
