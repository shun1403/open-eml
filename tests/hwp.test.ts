// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import CFB from 'cfb';
import { deflateSync, strToU8, zipSync } from 'fflate';
import { readHwp, readHwpx } from '../src/core/hwp';
import { PNG } from './fixtures';

function record(tag: number, data: Uint8Array) {
  const out = new Uint8Array(4 + data.length);
  new DataView(out.buffer).setUint32(0, (data.length << 20) | tag, true);
  out.set(data, 4);
  return out;
}

/** 문단 글자 레코드. 탭(인라인 컨트롤, 8글자)과 문단 끝(13)을 넣는다 */
function paraText(text: string) {
  const units: number[] = [];
  for (const char of text) {
    if (char === '\t') units.push(9, 0, 0, 0, 0, 0, 0, 9);
    else units.push(char.charCodeAt(0));
  }
  units.push(13);
  const data = new Uint8Array(units.length * 2);
  units.forEach((unit, i) => new DataView(data.buffer).setUint16(i * 2, unit, true));
  return record(67, data);
}

function buildHwp(paragraphs: string[], flags = 1) {
  const header = new Uint8Array(256);
  header.set(strToU8('HWP Document File'));
  new DataView(header.buffer).setUint32(36, flags, true);
  const section = paragraphs.map((p) => [record(66, new Uint8Array(22)), paraText(p)]).flat();
  const raw = new Uint8Array(section.reduce((sum, r) => sum + r.length, 0));
  let offset = 0;
  for (const r of section) {
    raw.set(r, offset);
    offset += r.length;
  }
  const cfb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb, '/FileHeader', header);
  CFB.utils.cfb_add(cfb, '/BodyText/Section0', flags & 1 ? deflateSync(raw) : raw);
  CFB.utils.cfb_add(cfb, '/PrvImage', PNG);
  const prv = new Uint8Array(new Uint16Array([...'미리보기 글'].map((c) => c.charCodeAt(0))).buffer);
  CFB.utils.cfb_add(cfb, '/PrvText', prv);
  CFB.utils.cfb_del(cfb, '/\u0001Sh33tJ5');
  return Uint8Array.from(CFB.write(cfb, { type: 'array', fileType: 'cfb' }) as number[]);
}

describe('readHwp', () => {
  it('압축된 본문 섹션에서 문단과 탭을 읽고 미리보기 그림을 꺼낸다', () => {
    const result = readHwp(buildHwp(['제목: 사업 계획서', '항목\t금액']));
    expect(result.paragraphs).toEqual(['제목: 사업 계획서', '항목\t금액']);
    expect(result.previewImage?.mimeType).toBe('image/png');
    expect(result.limited).toBeUndefined();
  });

  it('배포용 문서는 미리보기 글만 보여준다', () => {
    const result = readHwp(buildHwp(['숨은 본문'], 1 | 4));
    expect(result.limited).toBe('distribution');
    expect(result.paragraphs).toEqual(['미리보기 글']);
  });
});

describe('readHwpx', () => {
  it('섹션 XML의 문단을 순서대로 읽는다', () => {
    const ns = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"';
    const section0 = `<?xml version="1.0"?><hs:sec ${ns}><hp:p><hp:run><hp:t>첫 문단</hp:t></hp:run></hp:p>` +
      `<hp:p><hp:run><hp:t>표 앞</hp:t><hp:tbl><hp:tr><hp:tc><hp:subList><hp:p><hp:run><hp:t>칸</hp:t><hp:tab/><hp:t>1</hp:t></hp:run></hp:p></hp:subList></hp:tc></hp:tr></hp:tbl></hp:run></hp:p></hs:sec>`;
    const section1 = `<?xml version="1.0"?><hs:sec ${ns}><hp:p><hp:run><hp:t>둘째 구역</hp:t></hp:run></hp:p></hs:sec>`;
    const hwpx = zipSync({
      mimetype: strToU8('application/hwp+zip'),
      'Contents/section1.xml': strToU8(section1),
      'Contents/section0.xml': strToU8(section0),
      'Preview/PrvImage.png': PNG,
    });
    const result = readHwpx(hwpx);
    expect(result.paragraphs).toEqual(['첫 문단', '표 앞', '칸\t1', '둘째 구역']);
    expect(result.previewImage?.mimeType).toBe('image/png');
  });
});

describe('압축 폭탄', () => {
  it('본문이 한도보다 크게 풀리면 멈춘다', () => {
    const header = new Uint8Array(256);
    header.set(strToU8('HWP Document File'));
    new DataView(header.buffer).setUint32(36, 1, true);
    const cfb = CFB.utils.cfb_new();
    CFB.utils.cfb_add(cfb, '/FileHeader', header);
    CFB.utils.cfb_add(cfb, '/BodyText/Section0', deflateSync(new Uint8Array(80 * 1024 * 1024)));
    CFB.utils.cfb_del(cfb, '/\u0001Sh33tJ5');
    const hwp = Uint8Array.from(CFB.write(cfb, { type: 'array', fileType: 'cfb' }) as number[]);
    expect(hwp.length).toBeLessThan(1024 * 1024);
    expect(() => readHwp(hwp)).toThrow(/너무 커서/);
  });
});
