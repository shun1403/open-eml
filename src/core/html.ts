import DOMPurify from 'dompurify';

export interface PreparedHtml {
  /** iframe srcdoc에 그대로 넣을 수 있는 문서 */
  document: string;
  /** 차단된 외부 리소스(이미지, 배경, 스타일시트) 개수 */
  blockedCount: number;
}

export interface PrepareHtmlOptions {
  /** Content-ID → object URL. 본문의 `cid:` 참조를 바꿔 끼운다 */
  cidUrls: Map<string, string>;
  allowRemote: boolean;
}

/** http(s):, ftp:, //host, \\host (브라우저는 역슬래시도 슬래시로 읽는다) */
const REMOTE_URL = /^\s*(?:(?:https?|ftp):|[\\/]{2})/i;
const REMOTE_ANYWHERE = /(?:https?|ftp):|[\\/]{2}/i;
// 길이를 제한해 "url(url(url(..." 같은 입력에서 정규식이 오래 걸리지 않게 한다
const CSS_URL = /url\(\s*(['"]?)([^)'"]{0,4096})\1\s*\)/gi;
const CSS_REMOTE_STRING = /(['"])\s*(?:(?:https?|ftp):|[\\/]{2})[^'"]{0,4096}\1/gi;
const CSS_IMPORT = /@import\s+[^;]{0,4096};?/gi;
/** 리소스를 불러오는 속성. href는 <a>가 아닌 요소(SVG <image>, <use> 등)에서만 본다 */
const URL_ATTRIBUTES = ['src', 'background', 'poster', 'href', 'xlink:href'];

function contentSecurityPolicy(allowRemote: boolean): string {
  const remote = allowRemote ? ' https: http:' : '';
  return [
    "default-src 'none'",
    `img-src data: blob:${remote}`,
    `media-src data: blob:${remote}`,
    `style-src 'unsafe-inline'${remote}`,
    `font-src data:${remote}`,
  ].join('; ');
}

const BASE_STYLE = `
  html { color-scheme: light; }
  body { margin: 0; padding: 16px; background: #fff; color: #1f2328;
         font-family: system-ui, -apple-system, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
         font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
  img { max-width: 100%; height: auto; }
  pre { white-space: pre-wrap; }
`;

/**
 * 메일 HTML을 정화하고 인라인 이미지를 연결한 뒤, 스크립트·외부 요청이 막힌 문서로 감싼다.
 * 실제 차단은 문서에 넣는 CSP와 iframe sandbox가 맡고, 여기서 세는 개수는 안내용이다.
 */
export function prepareHtml(html: string, { cidUrls, allowRemote }: PrepareHtmlOptions): PreparedHtml {
  let blockedCount = 0;

  const resolveCid = (value: string): string => {
    const match = /^cid:(.+)$/i.exec(value.trim());
    if (!match) return value;
    const id = decodeURIComponent(match[1]).replace(/^<|>$/g, '');
    return cidUrls.get(id) ?? value;
  };

  const rewriteCss = (css: string): string => {
    // CSP가 막지만, 외부 스타일·배경 그림·글꼴 요청을 시도하지도 않도록 주소를 지운다
    const withoutImports = allowRemote
      ? css
      : css.replace(CSS_IMPORT, () => {
          blockedCount++;
          return '';
        });
    const withoutUrls = withoutImports.replace(CSS_URL, (whole, quote: string, url: string) => {
      const resolved = resolveCid(url);
      if (resolved !== url) return `url(${quote}${resolved}${quote})`;
      if (allowRemote || !REMOTE_URL.test(url)) return whole;
      blockedCount++;
      return 'none';
    });
    if (allowRemote) return withoutUrls;
    // image-set("https://...")처럼 url() 없이 따옴표로 쓴 주소
    return withoutUrls.replace(CSS_REMOTE_STRING, () => {
      blockedCount++;
      return '""';
    });
  };

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const isLink = node.tagName.toLowerCase() === 'a';
    for (const name of URL_ATTRIBUTES) {
      if (isLink && name.endsWith('href')) continue;
      const value = node.getAttribute(name);
      if (!value) continue;
      const resolved = resolveCid(value);
      if (resolved !== value) {
        node.setAttribute(name, resolved);
      } else if (!allowRemote && REMOTE_URL.test(value)) {
        // CSP가 막지만, 요청 시도 자체가 없도록 주소를 빼 둔다
        node.removeAttribute(name);
        blockedCount++;
      }
    }
    const srcset = node.getAttribute('srcset');
    if (srcset && !allowRemote && REMOTE_ANYWHERE.test(srcset)) {
      node.removeAttribute('srcset');
      blockedCount++;
    }

    const style = node.getAttribute('style');
    if (style) node.setAttribute('style', rewriteCss(style));

    if (node.tagName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  DOMPurify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'style' && node.textContent) {
      node.textContent = rewriteCss(node.textContent);
    }
  });

  let body: string;
  try {
    body = DOMPurify.sanitize(html, {
      WHOLE_DOCUMENT: true,
      FORBID_TAGS: ['base', 'meta', 'link', 'form', 'object', 'embed', 'iframe', 'frame', 'frameset'],
      FORBID_ATTR: ['action', 'formaction'],
    });
  } finally {
    DOMPurify.removeAllHooks();
  }

  // CSP를 문서 맨 앞에 둔다. 브라우저는 이 meta를 <head>의 첫 요소로 넣으므로,
  // 메일 속 어떤 태그나 속성 값(예: title="<head>")으로도 CSP 앞에 끼어들 수 없다
  const head =
    `<meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(allowRemote)}">` +
    `<style>${BASE_STYLE}</style>`;
  return { document: `<!doctype html>${head}${body}`, blockedCount };
}

