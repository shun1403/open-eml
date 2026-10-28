import { useState } from 'react';
import { displayName, formatDate } from '../core/format';
import type { OpenedMail } from '../App';
import { Icon } from './Icon';

interface MailListProps {
  mails: OpenedMail[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

function matches(entry: OpenedMail, query: string): boolean {
  if (!query) return true;
  const mail = entry.mail;
  const haystack = [
    entry.fileName,
    mail?.subject,
    ...(mail ? [...mail.from, ...mail.to, ...mail.cc].flatMap((a) => [a.name, a.address]) : []),
    ...(mail?.attachments.map((node) => node.filename) ?? []),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function MailList({ mails, selectedId, onSelect, onRemove, onClear }: MailListProps) {
  const [query, setQuery] = useState('');
  const visible = mails.filter((entry) => matches(entry, query.trim()));

  return (
    <nav className="mail-list" aria-label="연 메일 목록">
      <div className="mail-list-tools">
        <label className="search">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="제목·사람·첨부 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button type="button" className="link-button muted" onClick={onClear}>
          모두 닫기
        </button>
      </div>
      <ul>
        {visible.map((entry) => {
          const mail = entry.mail;
          const fileCount = mail?.attachments.filter((node) => !node.inline).length ?? 0;
          return (
            <li key={entry.id} className={entry.id === selectedId ? 'is-selected' : undefined}>
              <button type="button" className="mail-item" onClick={() => onSelect(entry.id)}>
                <span className="mail-item-top">
                  <span className="mail-item-from">
                    {mail?.from[0] ? displayName(mail.from[0]) : entry.fileName}
                  </span>
                  <span className="mail-item-date">{formatDate(mail?.date)}</span>
                </span>
                <span className="mail-item-subject">
                  {entry.status === 'loading' && '여는 중…'}
                  {entry.status === 'error' && <span className="error-text">열 수 없음: {entry.error}</span>}
                  {mail && (mail.subject || '(제목 없음)')}
                </span>
                {fileCount > 0 && <span className="mail-item-files">첨부 {fileCount}개</span>}
              </button>
              <button
                type="button"
                className="icon-button mail-item-remove"
                onClick={() => onRemove(entry.id)}
                aria-label={`${entry.fileName} 닫기`}
              >
                <Icon name="close" size={14} />
              </button>
            </li>
          );
        })}
        {visible.length === 0 && <li className="muted empty">검색 결과가 없습니다.</li>}
      </ul>
    </nav>
  );
}
