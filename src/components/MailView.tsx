import { useMemo, useState } from 'react';
import { downloadZip, riskyFilesIn } from '../core/download';
import { formatAddress, formatDate } from '../core/format';
import { prepareHtml } from '../core/html';
import { findCloudLinks, type CloudLink } from '../core/links';
import type { MailAddress, ParsedMail } from '../core/types';
import { AttachmentTree, type AttachmentActions } from './AttachmentTree';
import { HtmlFrame } from './HtmlFrame';
import { Icon } from './Icon';
import { useCidUrls } from './useObjectUrls';

type BodyTab = 'html' | 'text' | 'headers';

interface MailViewProps extends AttachmentActions {
  mail: ParsedMail;
  fallbackTitle: string;
}

function AddressLine({ label, addresses }: { label: string; addresses: MailAddress[] }) {
  if (addresses.length === 0) return null;
  return (
    <div className="address-line">
      <dt>{label}</dt>
      <dd>
        {addresses.map((address, index) => (
          <span key={index} className="address" title={address.address}>
            {formatAddress(address)}
          </span>
        ))}
      </dd>
    </div>
  );
}

function CloudLinks({ links }: { links: CloudLink[] }) {
  return (
    <section className="attachments cloud-links" aria-label="링크로 받는 첨부">
      <div className="section-bar">
        <h2>
          링크로 받는 첨부 <span className="count">{links.length}</span>
        </h2>
        <span className="muted small">보낸 사람이 올려 둔 외부 사이트에서 내려받습니다</span>
      </div>
      <ul className="tree">
        {links.map((link) => (
          <li key={link.url}>
            <div className="tree-row link-row">
              <span />
              <span className="tree-icon">
                <Icon name="cloud" />
              </span>
              <span className="tree-name" title={link.url}>
                <a className="link-button" href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.label}
                </a>
                <span className="badge badge-service">{link.service}</span>
                {link.expires && <span className="tree-error">{link.expires}까지</span>}
              </span>
              <span className="tree-size">{link.size ?? ''}</span>
              <span className="tree-actions">
                <a className="icon-button" href={link.url} target="_blank" rel="noopener noreferrer" title="새 창에서 열기">
                  <Icon name="external" />
                </a>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MailView({ mail, fallbackTitle, ...actions }: MailViewProps) {
  const [tab, setTab] = useState<BodyTab>(mail.html ? 'html' : mail.text ? 'text' : 'headers');
  const [allowRemote, setAllowRemote] = useState(false);
  const [showInline, setShowInline] = useState(false);
  const cidUrls = useCidUrls(mail.attachments);

  const prepared = useMemo(
    () => (mail.html && cidUrls ? prepareHtml(mail.html, { cidUrls, allowRemote }) : null),
    [mail.html, cidUrls, allowRemote],
  );

  const links = useMemo(() => findCloudLinks(mail.html, mail.text), [mail.html, mail.text]);
  const files = mail.attachments.filter((node) => !node.inline);
  const inlineCount = mail.attachments.length - files.length;
  const listed = showInline ? mail.attachments : files;
  const title = mail.subject || '(제목 없음)';

  return (
    <article className="mail">
      <header className="mail-header">
        <h1>{title}</h1>
        <dl className="mail-meta">
          <AddressLine label="보낸 사람" addresses={mail.from} />
          <AddressLine label="받는 사람" addresses={mail.to} />
          <AddressLine label="참조" addresses={mail.cc} />
          <AddressLine label="숨은 참조" addresses={mail.bcc} />
          {mail.date && (
            <div className="address-line">
              <dt>날짜</dt>
              <dd>{formatDate(mail.date)}</dd>
            </div>
          )}
        </dl>
      </header>

      {mail.attachments.length > 0 && (
        <section className="attachments" aria-label="첨부파일">
          <div className="section-bar">
            <h2>
              첨부파일 <span className="count">{files.length}</span>
            </h2>
            {inlineCount > 0 && (
              <label className="checkbox">
                <input type="checkbox" checked={showInline} onChange={(e) => setShowInline(e.target.checked)} />
                본문 이미지 {inlineCount}개 포함
              </label>
            )}
            {listed.length > 0 && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  const risky = riskyFilesIn(listed);
                  const ok =
                    risky.length === 0 ||
                    window.confirm(
                      `실행 파일이거나 매크로가 들어 있을 수 있는 파일 ${risky.length}개가 함께 담깁니다.\n${risky.slice(0, 5).join('\n')}\n\n보낸 사람을 신뢰할 수 있을 때만 여세요. 내려받을까요?`,
                    );
                  if (ok) downloadZip(listed, mail.subject || fallbackTitle);
                }}
              >
                <Icon name="download" /> 전체 ZIP으로 받기
              </button>
            )}
          </div>
          {listed.length > 0 ? (
            <AttachmentTree nodes={listed} {...actions} />
          ) : (
            <p className="muted">본문에 들어간 이미지만 있습니다.</p>
          )}
        </section>
      )}

      {links.length > 0 && <CloudLinks links={links} />}

      <section className="body" aria-label="본문">
        <div className="tabs" role="tablist">
          {mail.html && (
            <button type="button" role="tab" aria-selected={tab === 'html'} onClick={() => setTab('html')}>
              HTML
            </button>
          )}
          {mail.text && (
            <button type="button" role="tab" aria-selected={tab === 'text'} onClick={() => setTab('text')}>
              텍스트
            </button>
          )}
          <button type="button" role="tab" aria-selected={tab === 'headers'} onClick={() => setTab('headers')}>
            원본 헤더
          </button>
        </div>

        {!mail.html && !mail.text && <p className="muted">본문이 없는 메일입니다.</p>}
        {tab === 'html' && prepared && (
          <>
            {prepared.blockedCount > 0 && !allowRemote && (
              <div className="notice">
                <Icon name="lock" />
                <span>개인정보 보호를 위해 외부 이미지 {prepared.blockedCount}개를 차단했습니다.</span>
                <button type="button" className="button button-small" onClick={() => setAllowRemote(true)}>
                  이미지 표시
                </button>
              </div>
            )}
            <HtmlFrame document={prepared.document} title={`${title} 본문`} />
          </>
        )}
        {tab === 'text' && <pre className="text-body">{mail.text}</pre>}
        {tab === 'headers' && (
          <table className="headers-table">
            <tbody>
              {mail.headers.map((header, index) => (
                <tr key={index}>
                  <th scope="row">{header.key}</th>
                  <td>{header.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </article>
  );
}
