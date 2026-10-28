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

export default defineConfig({
  plugins: [msgreaderIconvShim(), pdfjsAssets(), react()],
  base: './',
  worker: { format: 'es', plugins: () => [msgreaderIconvShim()] },
  test: {
    environment: 'node',
    server: { deps: { inline: ['@kenjiuno/msgreader'] } },
  },
});
