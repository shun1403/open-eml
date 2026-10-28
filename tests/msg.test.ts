import { describe, expect, it } from 'vitest';
import { parseMailFile } from '../src/core/parser';
import { MSG, buildMsg, uncompressedRtf } from './outlook-fixtures';
import { base64, message, multipart } from './fixtures';

describe('Outlook .msg', () => {
  it('유니코드 .msg의 헤더, 본문, 받는 사람, 첨부를 읽는다', async () => {
    const msg = buildMsg({
      props: [
        { id: MSG.SUBJECT, value: '분기 보고서' },
        { id: MSG.BODY, value: '본문입니다' },
        { id: MSG.SENDER_NAME, value: '홍길동' },
        { id: MSG.SENDER_SMTP, value: 'hong@example.com' },
      ],
      recipients: [
        [
          { id: MSG.DISPLAY_NAME, value: '이영희' },
          { id: MSG.SMTP, value: 'lee@example.com' },
          { id: MSG.EMAIL, value: '/O=EXCHANGELABS/OU=X/CN=LEE' },
          { id: MSG.RECIPIENT_TYPE, value: 1 },
        ],
        [
          { id: MSG.DISPLAY_NAME, value: 'Park' },
          { id: MSG.EMAIL, value: 'park@example.com' },
          { id: MSG.RECIPIENT_TYPE, value: 2 },
        ],
      ],
      attachments: [
        [
          { id: MSG.ATTACH_LONG_FILENAME, value: '자료.txt' },
          { id: MSG.ATTACH_DATA, value: new TextEncoder().encode('hello') },
          { id: MSG.ATTACH_METHOD, value: 1 },
        ],
      ],
    });

    const mail = await parseMailFile(msg, 'msg');
    expect(mail.subject).toBe('분기 보고서');
    expect(mail.text).toBe('본문입니다');
    expect(mail.from).toEqual([{ name: '홍길동', address: 'hong@example.com' }]);
    expect(mail.to).toEqual([{ name: '이영희', address: 'lee@example.com' }]);
    expect(mail.cc).toEqual([{ name: 'Park', address: 'park@example.com' }]);
    expect(mail.attachments[0]).toMatchObject({ filename: '자료.txt', mimeType: 'text/plain' });
    expect(new TextDecoder().decode(mail.attachments[0].content)).toBe('hello');
  });
});

describe('Outlook .msg (한국어 Outlook, 서식 본문, 중첩)', () => {
  it('유니코드가 아닌 .msg는 메일 코드페이지(949)로 문자열을 읽는다', async () => {
    const msg = buildMsg({
      props: [
        { id: MSG.SUBJECT, value: '회의 안내', ansi: 'cp949' },
        { id: MSG.SENDER_NAME, value: '김철수', ansi: 'cp949' },
        { id: MSG.MESSAGE_CODEPAGE, value: 949 },
      ],
    });
    const mail = await parseMailFile(msg, 'msg');
    expect(mail.subject).toBe('회의 안내');
    expect(mail.from[0].name).toBe('김철수');
  });

  it('RTF로만 저장된 본문에서 HTML을 되살리고 인라인 이미지를 구분한다', async () => {
    const rtf = new TextEncoder().encode(
      '{\\rtf1\\ansi\\fromhtml1 {\\*\\htmltag <html><body><p>}Hi{\\*\\htmltag <img src="cid:pic@x">}{\\*\\htmltag </p></body></html>}}',
    );
    const msg = buildMsg({
      props: [
        { id: MSG.SUBJECT, value: 'rtf' },
        { id: MSG.RTF_COMPRESSED, value: uncompressedRtf(rtf) },
      ],
      attachments: [
        [
          { id: MSG.ATTACH_LONG_FILENAME, value: 'pic.png' },
          { id: MSG.ATTACH_DATA, value: Uint8Array.of(0x89, 0x50, 0x4e, 0x47) },
          { id: MSG.ATTACH_CONTENT_ID, value: 'pic@x' },
          { id: MSG.ATTACH_METHOD, value: 1 },
        ],
      ],
    });
    const mail = await parseMailFile(msg, 'msg');
    expect(mail.html).toBe('<html><body><p>Hi<img src="cid:pic@x"></p></body></html>');
    expect(mail.attachments[0]).toMatchObject({ inline: true, contentId: 'pic@x', mimeType: 'image/png' });
  });

  it('.eml에 첨부된 .msg도 메일로 펼친다', async () => {
    const inner = buildMsg({ props: [{ id: MSG.SUBJECT, value: '첨부된 Outlook 메일' }, { id: MSG.BODY, value: '안쪽' }] });
    const eml = message(
      { Subject: 'outer' },
      multipart('multipart/mixed', 'm', [
        { headers: { 'Content-Type': 'text/plain' }, body: 'outer' },
        {
          headers: {
            'Content-Type': 'application/vnd.ms-outlook',
            'Content-Transfer-Encoding': 'base64',
            'Content-Disposition': 'attachment; filename="forward.msg"',
          },
          body: base64(inner),
        },
      ]),
    );
    const mail = await parseMailFile(new TextEncoder().encode(eml), 'eml');
    const node = mail.attachments[0];
    expect(node.children?.kind).toBe('mail');
    if (node.children?.kind !== 'mail') return;
    expect(node.children.mail.subject).toBe('첨부된 Outlook 메일');
    expect(node.children.mail.text).toBe('안쪽');
  });
});

describe('Outlook .msg 안의 .msg', () => {
  it('Outlook에서 메일을 첨부로 넣은 경우(첨부 방식 5)도 펼친다', async () => {
    const msg = buildMsg({
      props: [{ id: MSG.SUBJECT, value: '전달: 견적' }],
      attachments: [
        {
          props: [
            { id: MSG.DISPLAY_NAME, value: '견적 메일' },
            { id: MSG.ATTACH_METHOD, value: 5 },
          ],
          embedded: {
            props: [{ id: MSG.SUBJECT, value: '견적' }, { id: MSG.BODY, value: '견적서 첨부' }],
            attachments: [[{ id: MSG.ATTACH_LONG_FILENAME, value: '견적서.txt' }, { id: MSG.ATTACH_DATA, value: new TextEncoder().encode('100') }]],
          },
        },
      ],
    });
    const mail = await parseMailFile(msg, 'msg');
    const node = mail.attachments[0];
    expect(node.filename).toBe('견적 메일.msg');
    expect(node.children?.kind).toBe('mail');
    if (node.children?.kind !== 'mail') return;
    expect(node.children.mail.subject).toBe('견적');
    expect(node.children.mail.attachments[0].filename).toBe('견적서.txt');
  });
});
