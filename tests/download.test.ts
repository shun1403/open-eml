import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync } from 'fflate';
import { buildZip } from '../src/core/download';
import type { AttachmentNode } from '../src/core/types';

function node(filename: string, text: string, extra: Partial<AttachmentNode> = {}): AttachmentNode {
  const content = strToU8(text);
  return { id: filename, filename, mimeType: 'text/plain', size: content.length, inline: false, content, ...extra };
}

describe('buildZip', () => {
  it('같은 이름은 번호를 붙이고, 첨부 메일의 첨부는 폴더에 담는다', () => {
    const forwarded = node('원본 메일.eml', 'raw eml', {
      children: {
        kind: 'mail',
        mail: {
          subject: '원본 메일', from: [], to: [], cc: [], bcc: [], replyTo: [], headers: [],
          attachments: [node('memo.txt', 'memo'), node('logo.png', 'png', { inline: true })],
        },
      },
    });
    const files = unzipSync(buildZip([node('보고서.pdf', 'a'), node('보고서.pdf', 'b'), node('../evil.txt', 'c'), forwarded]));

    expect(Object.keys(files).filter((name) => !name.endsWith('/')).sort()).toEqual(
      ['evil.txt', '보고서 (1).pdf', '보고서.pdf', '원본 메일.eml', '원본 메일_첨부/memo.txt'].sort(),
    );
    expect(strFromU8(files['보고서 (1).pdf'])).toBe('b');
  });
});
