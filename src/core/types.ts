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
  /** ZIP, winmail.dat처럼 파일을 담고 있는 형식. winmail.dat은 메일 본문도 담고 있을 수 있다 */
  | { kind: 'archive'; entries: AttachmentNode[]; body?: { html?: string; text?: string } };

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
  /** 암호가 걸려 있어 아직 펼치지 못한 압축 파일 */
  locked?: boolean;
  /** 첨부 안을 펼치지 못한 이유 (손상된 압축, 한도 초과 등) */
  error?: string;
}

/** 각 메일 형식의 파서가 돌려주는, 아직 펼치지 않은 첨부 */
export interface RawAttachment {
  filename?: string;
  mimeType?: string;
  inline: boolean;
  contentId?: string;
  content: Uint8Array;
}
