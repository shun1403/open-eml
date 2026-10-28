import { describe, expect, it } from 'vitest';
import { parseEml } from '../src/core/parser';
import { parseTnef } from '../src/core/tnef';
import { base64, message, multipart } from './fixtures';
import { buildTnef } from './outlook-fixtures';

const text = (value: string) => new TextEncoder().encode(value);

describe('parseTnef', () => {
  it('첨부를 꺼내고 긴 파일 이름과 CP949 이름을 읽는다', () => {
    const tnef = buildTnef([
      { title: '보고서.txt', data: text('report') },
      { title: 'LONGFI~1.PDF', longName: '아주 긴 파일 이름의 계약서.pdf', data: text('%PDF') },
    ]);
    const { attachments } = parseTnef(tnef);
    expect(attachments.map((a) => a.filename)).toEqual(['보고서.txt', '아주 긴 파일 이름의 계약서.pdf']);
    expect(new TextDecoder().decode(attachments[0].content)).toBe('report');
  });

  it('메시지 속성의 HTML 본문을 읽는다', () => {
    const { body } = parseTnef(buildTnef([], { html: '<p>서식 있는 본문</p>' }));
    expect(body.html).toBe('<p>서식 있는 본문</p>');
  });

  it('TNEF가 아니면 오류를 낸다', () => {
    expect(() => parseTnef(text('not tnef'))).toThrow();
  });
});

describe('winmail.dat 첨부', () => {
  it('메일 안의 winmail.dat을 펼치고, 메일에 없던 서식 본문을 채운다', async () => {
    const tnef = buildTnef([{ title: '견적서.xlsx', data: text('xlsx') }], { html: '<b>견적</b>' });
    const eml = message(
      { Subject: 'from outlook' },
      multipart('multipart/mixed', 'w', [
        { headers: { 'Content-Type': 'text/plain' }, body: 'plain body' },
        {
          headers: {
            'Content-Type': 'application/ms-tnef; name="winmail.dat"',
            'Content-Transfer-Encoding': 'base64',
            'Content-Disposition': 'attachment; filename="winmail.dat"',
          },
          body: base64(tnef),
        },
      ]),
    );
    const mail = await parseEml(text(eml));
    expect(mail.html).toBe('<b>견적</b>');
    const node = mail.attachments[0];
    expect(node.children?.kind).toBe('archive');
    if (node.children?.kind !== 'archive') return;
    expect(node.children.entries[0]).toMatchObject({
      id: '0/0',
      filename: '견적서.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  });
});
