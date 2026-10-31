import { createReadStream, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

const iconvShim = fileURLToPath(new URL('./src/shims/iconv-lite.ts', import.meta.url));
const pdfjsRoot = fileURLToPath(new URL('./node_modules/pdfjs-dist/', import.meta.url));
/** 한글 PDF의 글꼴 맵, 표준 글꼴, 이미지 디코더 */
const PDFJS_ASSET_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];

/** msgreader가 불러오는 iconv-lite만 브라우저용 대체 모듈로 바꾼다 (테스트 코드는 진짜 iconv-lite를 쓴다) */
function msgreaderIconvShim(): Plugin {
  return {
    name: 'msgreader-iconv-shim',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === 'iconv-lite' && importer?.includes('@kenjiuno/msgreader')) return iconvShim;
      return null;
    },
  };
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** PDF.js가 필요할 때 불러오는 파일들을 /pdfjs/ 아래에 둔다 */
function pdfjsAssets(): Plugin {
  return {
    name: 'pdfjs-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const path = join(pdfjsRoot, decodeURIComponent((req.url ?? '').split('?')[0]));
        const inside = PDFJS_ASSET_DIRS.some((dir) => !relative(join(pdfjsRoot, dir), path).startsWith('..'));
        if (!inside) return next();
        try {
          if (!statSync(path).isFile()) return next();
        } catch {
          return next();
        }
        createReadStream(path).pipe(res);
      });
    },
    generateBundle() {
      for (const dir of PDFJS_ASSET_DIRS) {
        for (const file of walk(join(pdfjsRoot, dir))) {
          this.emitFile({ type: 'asset', fileName: `pdfjs/${relative(pdfjsRoot, file)}`, source: readFileSync(file) });
        }
      }
    },
  };
}

/**
 * 배포 빌드에만 넣는 앱 전체 CSP. 이 앱의 스크립트(와 PDF.js의 wasm)만 실행되게 해서,
 * 메일 속 내용이 어떤 경로로든 이 앱 출처에서 스크립트를 실행하지 못하게 하는 마지막 방어선이다.
 * 메일 본문 iframe은 이 정책을 물려받은 뒤 자체 CSP로 외부 리소스를 다시 막고,
 * "이미지 표시"를 누른 경우에만 외부 이미지·스타일·글꼴을 허용한다.
 * (개발 서버는 인라인 스크립트를 쓰므로 적용하지 않는다)
 */
const APP_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https: http:",
  "img-src 'self' data: blob: https: http:",
  "media-src 'self' data: blob: https: http:",
  "font-src 'self' data: https: http:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function productionCsp(): Plugin {
  return {
    name: 'production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${APP_CSP}" />`);
    },
  };
}

export default defineConfig({
  plugins: [msgreaderIconvShim(), pdfjsAssets(), productionCsp(), react()],
  base: './',
  worker: { format: 'es', plugins: () => [msgreaderIconvShim()] },
  test: {
    environment: 'node',
    server: { deps: { inline: ['@kenjiuno/msgreader'] } },
  },
});
