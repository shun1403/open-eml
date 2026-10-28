import { useState } from 'react';
import { displayName, formatDate } from '../core/format';
import type { OpenedMail } from '../App';
import { Icon } from './Icon';

interface MailListProps {
  mails: OpenedMail[];
  scans: Array<{ id: string; fileName: string; scanned: number; total: number; readPercent?: number }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

/** mbox에는 메일이 수만 통 있을 수 있어 한 번에 그리는 개수를 제한한다 */
const PAGE_SIZE = 300;

function matches(entry: OpenedMail, query: string): boolean {
  if (!query) return true;
  const mail = entry.mail;
  const people = mail ? [...mail.from, ...mail.to, ...mail.cc] : (entry.summary?.from ?? []);
  const haystack = [
    entry.fileName,
    mail?.subject ?? entry.summary?.subject,
    ...people.flatMap((a) => [a.name, a.address]),
    ...(mail?.attachments.map((node) => node.filename) ?? []),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function MailList({ mails, scans, selectedId, onSelect, onRemove, onClear }: MailListProps) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const filtered = mails.filter((entry) => matches(entry, query.trim()));
  const visible = filtered.slice(0, limit);

  return (
    <nav className="mail-list" aria-label="연 메일 목록">
      <div className="mail-list-tools">
        <label className="search">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="제목·사람·첨부 검색"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(PAGE_SIZE);
            }}
          />
        </label>
        <button type="button" className="link-button muted" onClick={onClear}>
          모두 닫기
        </button>
      </div>
      {scans.map((scan) => (
        <p key={scan.id} className="scan-progress" role="status">
          {scan.fileName} 읽는 중…{' '}
          {scan.total > 0
            ? `${scan.scanned.toLocaleString()} / ${scan.total.toLocaleString()}통`
            : scan.readPercent !== undefined && `${scan.readPercent}%`}
        </p>
      ))}
      {mails.length > 1 && (
        <p className="list-count muted">
          {query ? `${filtered.length.toLocaleString()} / ` : ''}
          {mails.length.toLocaleString()}통
        </p>
      )}
      <ul>
        {visible.map((entry) => {
          const mail = entry.mail;
          const subject = mail?.subject ?? entry.summary?.subject;
          const from = mail?.from[0] ?? entry.summary?.from[0];
          const fileCount = mail?.attachments.filter((node) => !node.inline).length ?? 0;
          return (
            <li key={entry.id} className={entry.id === selectedId ? 'is-selected' : undefined}>
              <button type="button" className="mail-item" onClick={() => onSelect(entry.id)}>
                <span className="mail-item-top">
                  <span className="mail-item-from">{from ? displayName(from) : entry.fileName}</span>
                  <span className="mail-item-date">{formatDate(mail?.date ?? entry.summary?.date)}</span>
                </span>
                <span className="mail-item-subject">
                  {entry.status === 'loading' && !subject && '여는 중…'}
                  {entry.status === 'error' && <span className="error-text">열 수 없음: {entry.error} </span>}
                  {(mail || entry.summary) && (subject || '(제목 없음)')}
                </span>
                {(fileCount > 0 || entry.mboxName) && (
                  <span className="mail-item-files">
                    {fileCount > 0 && `첨부 ${fileCount}개`}
                    {fileCount > 0 && entry.mboxName && ' · '}
                    {entry.mboxName}
                  </span>
                )}
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
        {filtered.length > limit && (
          <li className="more">
            <button type="button" className="button" onClick={() => setLimit((value) => value + PAGE_SIZE)}>
              {(filtered.length - limit).toLocaleString()}통 더 보기
            </button>
          </li>
        )}
        {filtered.length === 0 && scans.length === 0 && <li className="muted empty">검색 결과가 없습니다.</li>}
      </ul>
    </nav>
  );
}
