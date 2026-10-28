import { decompressRTF } from '@kenjiuno/decompressrtf';
import { codepageLabel } from './encoding';

export interface RtfBody {
  html?: string;
  text?: string;
}

/** Outlook이 압축해 저장하는 RTF 본문(PR_RTF_COMPRESSED)을 푼다 */
export function decompressRtf(bytes: Uint8Array): Uint8Array {
  return Uint8Array.from(decompressRTF(Array.from(bytes)));
}

/** RTF \fcharset 값 → Windows 코드페이지 */
const CHARSET_CODEPAGES: Record<number, number> = {
  0: 1252, 128: 932, 129: 949, 130: 1361, 134: 936, 136: 950, 161: 1253, 162: 1254,
  163: 1258, 177: 1255, 178: 1256, 186: 1257, 204: 1251, 222: 874, 238: 1250,
};

/** 본문으로 나오지 않는 RTF 그룹 */
const SKIPPED_DESTINATIONS = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer', 'headerl', 'headerr',
  'footerl', 'footerr', 'footnote', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl',
  'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'pgdsctbl', 'filetbl', 'revtbl',
  'fldinst', 'bkmkstart', 'bkmkend', 'nonshppict', 'shpinst', 'datafield', 'mmathPr', 'wgrffmtfilter',
]);

const SYMBOLS: Record<string, string> = {
  emdash: '—', endash: '–', bullet: '•', lquote: '‘', rquote: '’',
  ldblquote: '“', rdblquote: '”', emspace: ' ', enspace: ' ', qmspace: ' ',
};

interface GroupState {
  skip: boolean;
  /** \htmlrtf로 감싼 부분: 원래 HTML에는 없던 RTF 전용 내용 */
  htmlrtf: boolean;
  /** {\*\htmltag ...}: 원래 HTML 태그 */
  htmltag: boolean;
  fonttbl: boolean;
  font?: number;
  uc: number;
}

const isLetter = (byte: number) => (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a);
const isDigit = (byte: number) => byte >= 0x30 && byte <= 0x39;
const HEX = /^[0-9a-f]{2}$/i;

/**
 * RTF에서 본문을 꺼낸다. HTML을 감싼 RTF(\fromhtml1)면 원래 HTML을 되살리고 (MS-OXRTFEX),
 * 일반 서식 RTF면 텍스트만 꺼낸다.
 */
export function rtfToBody(rtf: Uint8Array): RtfBody {
  const fonts = new Map<number, number>();
  let defaultCodepage = 1252;
  let defaultFont: number | undefined;
  let mode = 'rtf' as 'html' | 'text' | 'rtf';

  let state: GroupState = { skip: false, htmlrtf: false, htmltag: false, fonttbl: false, uc: 1 };
  const stack: GroupState[] = [];
  let out = '';
  let pendingBytes: number[] = [];
  let skipChars = 0;
  let starred = false;
  let groupStart = false;
  let fontDef: number | undefined;

  const visible = () => {
    if (state.skip || state.fonttbl) return false;
    if (mode === 'html') return state.htmltag || !state.htmlrtf;
    return !state.htmlrtf;
  };

  const flushBytes = () => {
    if (pendingBytes.length === 0) return;
    const font = state.font ?? defaultFont;
    const codepage = (font !== undefined ? fonts.get(font) : undefined) ?? defaultCodepage;
    const label = codepageLabel(codepage) ?? 'windows-1252';
    try {
      out += new TextDecoder(label).decode(Uint8Array.from(pendingBytes));
    } catch {
      out += new TextDecoder('windows-1252').decode(Uint8Array.from(pendingBytes));
    }
    pendingBytes = [];
  };

  const emitText = (text: string) => {
    if (skipChars > 0) {
      skipChars -= 1;
      return;
    }
    if (!visible()) return;
    flushBytes();
    out += text;
  };

  const emitByte = (byte: number) => {
    if (skipChars > 0) {
      skipChars -= 1;
      return;
    }
    if (visible()) pendingBytes.push(byte);
  };

  const controlWord = (word: string, param: number | undefined) => {
    const isDestinationStart = groupStart;
    groupStart = false;

    if (starred) {
      starred = false;
      if (word === 'htmltag') {
        state.htmltag = true;
        state.skip = false;
      } else {
        state.skip = true;
      }
      return;
    }
    if (isDestinationStart && SKIPPED_DESTINATIONS.has(word)) {
      if (word === 'fonttbl') state.fonttbl = true;
      else state.skip = true;
      return;
    }

    switch (word) {
      case 'fromhtml':
        mode = 'html';
        return;
      case 'fromtext':
        mode = 'text';
        return;
      case 'ansicpg':
        if (param) defaultCodepage = param;
        return;
      case 'deff':
        defaultFont = param;
        return;
      case 'f':
        if (state.fonttbl) fontDef = param;
        else state.font = param;
        return;
      case 'fcharset':
        if (state.fonttbl && fontDef !== undefined && param !== undefined) {
          const codepage = CHARSET_CODEPAGES[param];
          if (codepage) fonts.set(fontDef, codepage);
        }
        return;
      case 'cpg':
        if (state.fonttbl && fontDef !== undefined && param) fonts.set(fontDef, param);
        return;
      case 'htmlrtf':
        state.htmlrtf = param !== 0;
        return;
      case 'uc':
        state.uc = param ?? 1;
        return;
      case 'u': {
        if (param === undefined) return;
        const saved = skipChars;
        skipChars = 0;
        emitText(String.fromCharCode(param < 0 ? param + 0x10000 : param));
        skipChars = saved + state.uc;
        return;
      }
      case 'par':
      case 'line':
        emitText(mode === 'html' && !state.htmltag ? '\r\n' : '\n');
        return;
      case 'tab':
        emitText('\t');
        return;
      default:
        if (SYMBOLS[word]) emitText(SYMBOLS[word]);
    }
  };

  let i = 0;
  while (i < rtf.length) {
    const byte = rtf[i];
    if (byte === 0x7b /* { */) {
      flushBytes();
      stack.push(state);
      state = { ...state };
      groupStart = true;
      i++;
    } else if (byte === 0x7d /* } */) {
      flushBytes();
      if (state.fonttbl && !stack[stack.length - 1]?.fonttbl) fontDef = undefined;
      state = stack.pop() ?? state;
      groupStart = false;
      starred = false;
      i++;
    } else if (byte === 0x5c /* \ */) {
      const next = rtf[i + 1];
      if (next !== undefined && isLetter(next)) {
        let end = i + 1;
        while (end < rtf.length && isLetter(rtf[end])) end++;
        const word = String.fromCharCode(...rtf.subarray(i + 1, end));
        let paramEnd = end;
        if (rtf[paramEnd] === 0x2d /* - */) paramEnd++;
        while (paramEnd < rtf.length && isDigit(rtf[paramEnd])) paramEnd++;
        const paramText = String.fromCharCode(...rtf.subarray(end, paramEnd));
        const param = paramText && paramText !== '-' ? Number(paramText) : undefined;
        i = rtf[paramEnd] === 0x20 ? paramEnd + 1 : paramEnd;
        if (word !== 'u') flushBytes();
        controlWord(word, param);
      } else if (next === 0x27 /* ' */) {
        const hex = String.fromCharCode(rtf[i + 2] ?? 0, rtf[i + 3] ?? 0);
        if (HEX.test(hex)) emitByte(parseInt(hex, 16));
        groupStart = false;
        i += 4;
      } else if (next === 0x2a /* * */) {
        starred = true;
        i += 2;
      } else {
        groupStart = false;
        if (next === 0x5c || next === 0x7b || next === 0x7d) emitText(String.fromCharCode(next));
        else if (next === 0x7e /* ~ */) emitText(' ');
        else if (next === 0x5f /* _ */) emitText('-');
        else if (next === 0x0a || next === 0x0d) emitText('\n');
        i += 2;
      }
    } else if (byte === 0x0a || byte === 0x0d) {
      i++;
    } else {
      groupStart = false;
      if (byte < 0x80) emitText(String.fromCharCode(byte));
      else emitByte(byte);
      i++;
    }
  }
  flushBytes();

  if (mode === 'html') return { html: out };
  return { text: out.replace(/\r\n/g, '\n').trim() };
}
