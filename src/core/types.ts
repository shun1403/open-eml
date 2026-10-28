export interface MailAddress {
  name: string;
  address: string;
}

export interface MailHeader {
  key: string;
  value: string;
}

export interface ParsedMail {
  subject: string;
  from: MailAddress[];
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  replyTo: MailAddress[];
  /** ISO 8601 문자열. 날짜를 해석하지 못하면 원래 헤더 값 */
  date?: string;
  messageId?: string;
  html?: string;
  text?: string;
  headers: MailHeader[];
  attachments: AttachmentNode[];
}

export type AttachmentChildren =
  | { kind: 'mail'; mail: ParsedMail }
  | { kind: 'archive'; entries: AttachmentNode[] };

export interface AttachmentNode {
  /** 메일 안에서 고유한 경로형 ID (예: "2", "2/0", "2/0/3") */
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  /** 본문에 삽입된 이미지처럼 첨부 목록에 따로 보일 필요가 없는 파트 */
  inline: boolean;
  /** 꺾쇠괄호를 뗀 Content-ID */
  contentId?: string;
  content: Uint8Array;
  children?: AttachmentChildren;
  /** 첨부 안을 펼치지 못한 이유 (손상된 압축, 한도 초과 등) */
  error?: string;
}
