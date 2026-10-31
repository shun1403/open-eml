// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { findCloudLinks } from '../src/core/links';

describe('findCloudLinks', () => {
  it('네이버 대용량 첨부의 파일 이름, 크기, 만료일을 읽는다', () => {
    const html = `
      <table><tr><td>
        <a href="https://bigfile.mail.naver.com/bigfileupload/download?fid=abc">현장사진_모음.zip</a>
        1.2GB · 2026.11.27 (금) 까지 다운로드 가능
      </td></tr></table>
      <p><a href="https://example.com/">회사 홈페이지</a></p>`;
    expect(findCloudLinks(html, undefined)).toEqual([
      {
        url: 'https://bigfile.mail.naver.com/bigfileupload/download?fid=abc',
        label: '현장사진_모음.zip',
        service: '네이버 대용량 첨부',
        size: '1.2GB',
        expires: '2026.11.27 (금)',
      },
    ]);
  });

  it('클라우드 공유 링크와 파일처럼 보이는 링크를 찾는다', () => {
    const html = `
      <p><a href="https://drive.google.com/file/d/123/view">기획서</a></p>
      <p><a href="https://1drv.ms/x/s!abc">예산.xlsx</a> 2026년 12월 1일까지</p>
      <p><a href="https://files.company.co.kr/d/9">설계도면.dwg</a></p>
      <p><a href="mailto:a@b.c">메일</a><a href="javascript:alert(1)">x.pdf</a></p>`;
    const links = findCloudLinks(html, undefined);
    expect(links.map((l) => [l.service, l.label])).toEqual([
      ['Google Drive', '기획서'],
      ['OneDrive', '예산.xlsx'],
      ['링크로 첨부된 파일', '설계도면.dwg'],
    ]);
    expect(links[1].expires).toBe('2026년 12월 1일');
  });

  it('텍스트 본문의 대용량 첨부 주소도 찾고, 같은 주소는 한 번만 넣는다', () => {
    const url = 'https://bigmail.mail.daum.net/Mail-bin/bigfile_down?uid=1&filename=%EB%B3%B4%EA%B3%A0%EC%84%9C.pdf';
    const links = findCloudLinks(`<a href="${url}">${'보고서.pdf'}</a>`, `대용량 첨부: ${url} (30MB)`);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ service: '다음 대용량 첨부', label: '보고서.pdf' });

    const fromText = findCloudLinks(undefined, `대용량 첨부: ${url} (30MB)`);
    expect(fromText[0]).toMatchObject({ label: '보고서.pdf', size: '30MB' });
  });
});

describe('정규식 지연', () => {
  it('아주 긴 링크 글자나 주소도 금방 처리한다', () => {
    const start = performance.now();
    findCloudLinks(`<a href="https://a.example/bigfile/${'a'.repeat(400000)}">${'a'.repeat(400000)}</a>`, `https://a.example/bigfile/${'a'.repeat(400000)}`);
    expect(performance.now() - start).toBeLessThan(1500);
  });
});
