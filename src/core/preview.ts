import { containerKind, extensionOf } from './files';
import type { AttachmentNode } from './types';

export type PreviewKind = 'image' | 'pdf' | 'text' | 'audio' | 'video' | 'docx' | 'sheet' | 'hwp' | 'hwpx';

/** <img>로 띄워도 안전한 형식만 허용한다 */
const IMAGE_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/avif', 'image/svg+xml', 'image/x-icon',
]);
const TEXT_TYPES = new Set([
  'application/json', 'application/xml', 'application/javascript', 'application/x-sh', 'application/rtf',
]);
const SHEET_EXTENSIONS = new Set(['xlsx', 'xlsm', 'xlsb', 'xls', 'ods', 'csv', 'tsv']);

/** 미리보기로 보여줄 텍스트의 최대 길이 */
export const MAX_TEXT_PREVIEW = 1024 * 1024;

export function previewKind(node: AttachmentNode): PreviewKind | null {
  const type = node.mimeType;
  const ext = extensionOf(node.filename);
  if (containerKind(node) && containerKind(node) !== 'zip') return null;
  if (ext === 'docx' || type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (SHEET_EXTENSIONS.has(ext) || type.includes('spreadsheetml') || type === 'application/vnd.ms-excel') return 'sheet';
  if (ext === 'hwp' || type === 'application/x-hwp') return 'hwp';
  if (ext === 'hwpx' || type === 'application/hwp+zip') return 'hwpx';
  if (IMAGE_TYPES.has(type)) return 'image';
  if (type === 'application/pdf') return 'pdf';
  if (type.startsWith('text/') || TEXT_TYPES.has(type) || type.endsWith('+xml')) return 'text';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  return null;
}
