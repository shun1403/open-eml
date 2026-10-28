import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseEml } from '../src/core/parser';
import { PNG, base64, cp949Zip, encodedWord, message, multipart } from './fixtures';

const bytes = (eml: string) => strToU8(eml);

function koreanMail(): string {
  const html = multipart('multipart/related', 'rel', [
    {
      headers: {
        'Content-Type': 'text/html; charset="euc-kr"',
        'Content-Transfer-Encoding': 'base64',
      },
      body: base64('<p>안녕하세요, 보고서 보내드립니다.</p><img src="cid:logo@example">', 'euc-kr'),
    },
    {
      headers: {
        'Content-Type': 'image/png',
        'Content-Transfer-Encoding': 'base64',
        'Content-ID': '<logo@example>',
        'Content-Disposition': 'inline',
      },
      body: base64(PNG),
    },
  ]);
  const root = multipart('multipart/mixed', 'mix', [
    html,
    {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Transfer-Encoding': 'base64',
        'Content-Disposition': "attachment; filename*=UTF-8''%EB%B3%B4%EA%B3%A0%EC%84%9C.pdf",
      },
      body: base64('%PDF-1.4 test'),
    },
    {
      headers: {
        'Content-Type': `application/vnd.ms-excel; name="${encodedWord('매출표.xls', 'EUC-KR')}"`,
        'Content-Transfer-Encoding': 'base64',
        'Content-Disposition': 'attachment',
      },
      body: base64('xls'),
    },
  ]);
  return message(
    {
      From: `${encodedWord('홍길동', 'EUC-KR')} <hong@example.com>`,
      To: 'Kim <kim@example.com>, lee@example.com',
      Cc: 'Team: park@example.com, choi@example.com;',
      Subject: encodedWord('3분기 보고서', 'EUC-KR'),
      Date: 'Tue, 27 Oct 2026 09:30:00 +0900',
    },
    root,
  );
}

describe('parseEml', () => {
  it('EUC-KR로 인코딩된 헤더, 본문, 첨부 이름을 읽는다', async () => {
    const mail = await parseEml(bytes(koreanMail()));

    expect(mail.subject).toBe('3분기 보고서');
    expect(mail.from).toEqual([{ name: '홍길동', address: 'hong@example.com' }]);
    expect(mail.to.map((a) => a.address)).toEqual(['kim@example.com', 'lee@example.com']);
    expect(mail.cc.map((a) => a.address)).toEqual(['park@example.com', 'choi@example.com']);
    expect(mail.date).toBe('2026-10-27T00:30:00.000Z');
    expect(mail.html).toContain('안녕하세요, 보고서 보내드립니다.');
    expect(mail.headers.find((h) => h.key === 'Subject')).toBeDefined();
  });

  it('인라인 이미지와 일반 첨부를 구분하고 형식을 추정한다', async () => {
    const mail = await parseEml(bytes(koreanMail()));
    const [logo, pdf, xls] = mail.attachments;

    expect(logo).toMatchObject({ inline: true, contentId: 'logo@example', mimeType: 'image/png' });
    expect(logo.content).toEqual(PNG);
    expect(pdf).toMatchObject({ filename: '보고서.pdf', mimeType: 'application/pdf', inline: false });
    expect(new TextDecoder().decode(pdf.content)).toBe('%PDF-1.4 test');
    expect(xls.filename).toBe('매출표.xls');
  });

  it('첨부된 메일을 재귀로 펼친다', async () => {
    const innerWithAttachment = message(
      { From: 'a@example.com', Subject: '원본 메일' },
      multipart('multipart/mixed', 'in', [
        { headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: '본문입니다' },
        {
          headers: { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="memo.txt"' },
          body: 'memo',
        },
      ]),
    );
    const outer = message(
      { From: 'b@example.com', Subject: 'Fwd: 원본 메일' },
      multipart('multipart/mixed', 'out', [
        { headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: '전달합니다' },
        {
          headers: { 'Content-Type': 'message/rfc822', 'Content-Transfer-Encoding': 'base64' },
          body: base64(innerWithAttachment),
        },
      ]),
    );

    const mail = await parseEml(bytes(outer));
    expect(mail.text?.trim()).toBe('전달합니다');
    expect(mail.attachments).toHaveLength(1);

    const forwarded = mail.attachments[0];
    expect(forwarded.filename).toBe('원본 메일.eml');
    expect(forwarded.children?.kind).toBe('mail');
    if (forwarded.children?.kind !== 'mail') return;
    expect(forwarded.children.mail.text?.trim()).toBe('본문입니다');
    expect(forwarded.children.mail.attachments[0]).toMatchObject({ id: '0/0', filename: 'memo.txt' });
  });

  it('ZIP 첨부를 펼치고 CP949 파일 이름을 복원한다', async () => {
    const zip = cp949Zip({ '한글 문서.txt': 'hello', '폴더/사진.png': 'png' });
    const mail = await parseEml(
      bytes(
        message(
          { Subject: 'zip' },
          multipart('multipart/mixed', 'z', [
            { headers: { 'Content-Type': 'text/plain' }, body: 'see zip' },
            {
              headers: {
                'Content-Type': 'application/zip',
                'Content-Transfer-Encoding': 'base64',
                'Content-Disposition': 'attachment; filename="files.zip"',
              },
              body: base64(zip),
            },
          ]),
        ),
      ),
    );

    const archive = mail.attachments[0];
    expect(archive.children?.kind).toBe('archive');
    if (archive.children?.kind !== 'archive') return;
    expect(archive.children.entries.map((e) => e.filename)).toEqual(['한글 문서.txt', '폴더/사진.png']);
    expect(archive.children.entries[1].mimeType).toBe('image/png');
    expect(new TextDecoder().decode(archive.children.entries[0].content)).toBe('hello');
  });

  it('압축 해제 한도를 넘으면 펼치지 않고 이유를 남긴다', async () => {
    const zip = zipSync({ 'big.txt': new Uint8Array(4096) });
    const mail = await parseEml(
      bytes(
        message(
          { Subject: 'bomb' },
          multipart('multipart/mixed', 'b', [
            {
              headers: {
                'Content-Type': 'application/zip',
                'Content-Transfer-Encoding': 'base64',
                'Content-Disposition': 'attachment; filename="big.zip"',
              },
              body: base64(zip),
            },
          ]),
        ),
      ),
      { maxDepth: 5, maxExtractedBytes: 1024, maxExtractedEntries: 10 },
    );

    expect(mail.attachments[0].children).toBeUndefined();
    expect(mail.attachments[0].error).toMatch(/너무 커서/);
  });

  it('손상된 ZIP이어도 메일 자체는 연다', async () => {
    const mail = await parseEml(
      bytes(
        message(
          { Subject: 'broken' },
          multipart('multipart/mixed', 'x', [
            {
              headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="bad.zip"' },
              body: 'not a zip',
            },
          ]),
        ),
      ),
    );
    expect(mail.subject).toBe('broken');
    expect(mail.attachments[0].error).toBeDefined();
  });
});
