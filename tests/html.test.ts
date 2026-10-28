// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { prepareHtml } from '../src/core/html';

const noCids = new Map<string, string>();

describe('prepareHtml', () => {
  it('스크립트와 이벤트 핸들러를 제거한다', () => {
    const { document } = prepareHtml(
      '<p onclick="alert(1)">hi</p><script>alert(2)</script><a href="javascript:alert(3)">x</a>',
      { cidUrls: noCids, allowRemote: false },
    );
    expect(document).not.toMatch(/<script|onclick|javascript:/i);
    expect(document).toContain('<p>hi</p>');
  });

  it('cid: 참조를 object URL로 바꾼다', () => {
    const cidUrls = new Map([['logo@example', 'blob:http://localhost/abc']]);
    const { document } = prepareHtml(
      '<img src="cid:logo@example"><div style="background:url(cid:logo@example)"></div>',
      { cidUrls, allowRemote: false },
    );
    expect(document).toContain('src="blob:http://localhost/abc"');
    expect(document).toContain('url(blob:http://localhost/abc)');
  });

  it('외부 이미지는 CSP로 막고 개수를 센다', () => {
    const html = '<img src="https://tracker.example/p.gif"><div style="background-image:url(\'http://x.example/bg.png\')"></div>';
    const blocked = prepareHtml(html, { cidUrls: noCids, allowRemote: false });
    expect(blocked.blockedCount).toBe(2);
    expect(blocked.document).toContain("img-src data: blob:;");
    expect(blocked.document).not.toContain('tracker.example');

    const allowed = prepareHtml(html, { cidUrls: noCids, allowRemote: true });
    expect(allowed.blockedCount).toBe(0);
    expect(allowed.document).toContain('img-src data: blob: https: http:');
    expect(allowed.document).toContain('src="https://tracker.example/p.gif"');
  });

  it('<style>은 남기고 <base>, <meta>, <form>은 지운다', () => {
    const { document } = prepareHtml(
      '<html><head><style>p{color:red}</style><base href="https://evil.example/"><meta http-equiv="refresh" content="0;url=https://evil.example"></head><body><form action="https://evil.example"><input></form><p>x</p></body></html>',
      { cidUrls: noCids, allowRemote: false },
    );
    expect(document).toContain('p{color:red}');
    expect(document).not.toMatch(/<base|http-equiv="refresh"|<form/i);
    expect(document.indexOf('Content-Security-Policy')).toBeLessThan(document.indexOf('p{color:red}'));
  });

  it('링크는 새 창으로 연다', () => {
    const { document } = prepareHtml('<a href="https://example.com">link</a>', { cidUrls: noCids, allowRemote: false });
    expect(document).toContain('target="_blank"');
    expect(document).toContain('rel="noopener noreferrer"');
  });
});
