import { describe, expect, it } from 'vitest';
import { parseEml } from '../src/core/parser';
import { indexMbox, summarizeMboxEntry, unescapeMboxMessage } from '../src/core/mbox';
import { encodedWord } from './fixtures';

const mail = (subject: string, body: string) =>
  `From: =?UTF-8?B?${Buffer.from('보낸이').toString('base64')}?= <a@example.com>\nSubject: ${subject}\nDate: Mon, 26 Oct 2026 10:00:00 +0900\n\n${body}\n`;

describe('mbox', () => {
  it('Gmail·Thunderbird 구분 줄로 메일을 나누고, 본문 속 "From "은 구분으로 보지 않는다', async () => {
    const mbox =
      'From 1781234567890@xxx Wed Oct 15 08:12:34 +0000 2025\n' +
      mail(encodedWord('첫 메일', 'UTF-8'), 'From now on, 잘 부탁드립니다.\n>From quoted line') +
      '\nFrom - Mon Oct 27 09:30:00 2026\r\n' +
      mail('second', 'two') +
      '\nFrom MAILER-DAEMON Fri Jul  8 12:08:34 2011\n' +
      mail('third', 'three');
    const file = new Blob([mbox]);
    const entries = await indexMbox(file);
    expect(entries).toHaveLength(3);

    const summaries = await Promise.all(entries.map((entry) => summarizeMboxEntry(file, entry)));
    expect(summaries.map((s) => s.subject)).toEqual(['첫 메일', 'second', 'third']);
    expect(summaries[0].from).toEqual([{ name: '보낸이', address: 'a@example.com' }]);

    const first = new Uint8Array(await file.slice(entries[0].start, entries[0].end).arrayBuffer());
    const parsed = await parseEml(unescapeMboxMessage(first));
    expect(parsed.text).toContain('From now on, 잘 부탁드립니다.\nFrom quoted line');
  });

  it('조각 경계에 걸친 구분 줄도 찾는다', async () => {
    const filler = 'x'.repeat(80) + '\n';
    const big = filler.repeat(Math.ceil((8 * 1024 * 1024 - 20) / filler.length));
    const mbox = `From - Mon Oct 27 09:30:00 2026\nSubject: a\n\n${big}\nFrom - Mon Oct 27 09:31:00 2026\nSubject: b\n\nbody\n`;
    const entries = await indexMbox(new Blob([mbox]));
    expect(entries).toHaveLength(2);
  });

  it('구분 줄 날짜 형식이 달라도 빈 줄 뒤의 "From "으로 나눈다', async () => {
    const mbox = 'From someone\nSubject: a\n\none\n\nFrom other\nSubject: b\n\ntwo\n';
    expect(await indexMbox(new Blob([mbox]))).toHaveLength(2);
  });
});
