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

  it('CSS 속 외부 주소와 @import도 지운다', () => {
    const html = '<style>@import url("https://a.example/x.css"); @import "//a.example/y.css"; @font-face{src:url(https://a.example/f.woff)} p{color:red}</style><p style="background:url(//a.example/b.png) no-repeat">x</p>';
    const blocked = prepareHtml(html, { cidUrls: noCids, allowRemote: false });
    expect(blocked.document).not.toContain('a.example');
    expect(blocked.document).toContain('p{color:red}');
    expect(blocked.blockedCount).toBe(4);

    const allowed = prepareHtml(html, { cidUrls: noCids, allowRemote: true });
    expect(allowed.document).toContain('https://a.example/f.woff');
  });

  it('속성 값 속 "<head>"로 CSP 위치를 바꾸지 못한다', () => {
    const { document } = prepareHtml('<html title="<head>"><body><p>x</p></body></html>', { cidUrls: noCids, allowRemote: false });
    const doc = new DOMParser().parseFromString(document, 'text/html');
    const csp = doc.head.querySelector('meta[http-equiv="Content-Security-Policy"]');
    expect(csp?.parentElement).toBe(doc.head);
    expect(doc.head.firstElementChild?.nextElementSibling).toBe(csp);
  });

  it('SVG <image href>, 역슬래시 주소, image-set 문자열 주소도 막는다', () => {
    const html =
      '<svg><image href="https://t.example/1.png"/><use xlink:href="//t.example/2.svg#a"/></svg>' +
      '<img src="\\\\t.example/3.png"><img srcset="a.png 1x, https://t.example/4.png 2x">' +
      '<div style="background-image:image-set(\'https://t.example/5.png\' 1x)">x</div>' +
      '<a href="https://example.com/keep">link</a>';
    const { document, blockedCount } = prepareHtml(html, { cidUrls: noCids, allowRemote: false });
    expect(document).not.toContain('t.example');
    expect(document).toContain('href="https://example.com/keep"');
    // 일부는 DOMPurify가 먼저 지워 개수에 잡히지 않는다
    expect(blockedCount).toBeGreaterThanOrEqual(4);
  });

  it('url( 가 끝없이 반복돼도 금방 끝난다', () => {
    const start = performance.now();
    prepareHtml(`<p style="background:${'url('.repeat(20000)}">x</p><style>${'url('.repeat(20000)}</style>`, {
      cidUrls: noCids,
      allowRemote: false,
    });
    expect(performance.now() - start).toBeLessThan(1500);
  });
});
