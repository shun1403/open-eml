import { useEffect, useState } from 'react';
import * as XLSX from '@e965/xlsx';
import { decodeText } from '../core/encoding';
import { extensionOf } from '../core/files';
import type { AttachmentNode } from '../core/types';
import { zipUncompressedSize } from '../core/zip';

const MAX_ROWS = 1000;
const MAX_COLUMNS = 60;

interface Sheet {
  name: string;
  rows: string[][];
  truncated: boolean;
}

function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

function readSheets(node: AttachmentNode): Sheet[] {
  const ext = extensionOf(node.filename);
  const options = { dense: true, sheetRows: MAX_ROWS + 1, cellFormula: false, cellHTML: false } as const;
  // CSV는 인코딩 정보가 없으므로 한국어 엑셀이 저장한 CP949인지 먼저 가려 읽는다
  const workbook =
    ext === 'csv' || ext === 'tsv'
      ? XLSX.read(decodeText(node.content), { ...options, type: 'string', FS: ext === 'tsv' ? '\t' : undefined })
      : XLSX.read(node.content, { ...options, type: 'array' });

  return workbook.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, raw: false, defval: '' });
    return {
      name,
      rows: rows.slice(0, MAX_ROWS).map((row) => row.slice(0, MAX_COLUMNS).map((cell) => String(cell ?? ''))),
      truncated: rows.length > MAX_ROWS || rows.some((row) => row.length > MAX_COLUMNS),
    };
  });
}

/** 압축을 풀면 이보다 커지는 파일은 미리보지 않는다 (압축 폭탄으로 탭이 멈추는 것 방지) */
const MAX_UNZIPPED = 100 * 1024 * 1024;

type Result = { sheets: Sheet[]; error?: string };

async function load(node: AttachmentNode): Promise<Result> {
  const isZip = node.content[0] === 0x50 && node.content[1] === 0x4b;
  if (isZip && (await zipUncompressedSize(node.content)) > MAX_UNZIPPED) {
    return { sheets: [], error: '파일이 너무 커서 미리보기를 만들지 않았습니다. 내려받아 확인하세요.' };
  }
  return { sheets: readSheets(node) };
}

export default function SheetPreview({ node }: { node: AttachmentNode }) {
  const [result, setResult] = useState<Result | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load(node)
      .catch((): Result => ({ sheets: [], error: '표를 열지 못했습니다. 내려받아 확인하세요.' }))
      .then((value) => !cancelled && setResult(value));
    return () => {
      cancelled = true;
    };
  }, [node]);

  if (!result) return <p className="muted preview-message">표를 여는 중…</p>;
  if (result.error) return <p className="muted preview-message">{result.error}</p>;
  const sheet = result.sheets[active];
  if (!sheet) return <p className="muted preview-message">내용이 없습니다.</p>;
  const columns = Math.max(0, ...sheet.rows.map((row) => row.length));

  return (
    <div className="sheet-preview">
      {result.sheets.length > 1 && (
        <div className="tabs sheet-tabs" role="tablist">
          {result.sheets.map((item, index) => (
            <button key={item.name} type="button" role="tab" aria-selected={index === active} onClick={() => setActive(index)}>
              {item.name}
            </button>
          ))}
        </div>
      )}
      <div className="sheet-scroll">
        <table className="sheet-table">
          <thead>
            <tr>
              <th />
              {Array.from({ length: columns }, (_, index) => (
                <th key={index} scope="col">{columnName(index)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th scope="row">{rowIndex + 1}</th>
                {Array.from({ length: columns }, (_, index) => (
                  <td key={index}>{row[index] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sheet.truncated && (
        <p className="muted preview-note">앞 {MAX_ROWS}행, {MAX_COLUMNS}열까지만 표시했습니다.</p>
      )}
    </div>
  );
}
