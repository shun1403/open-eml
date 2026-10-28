import { describe, expect, it } from 'vitest';
import { TextReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';
import { parseEml, unlockArchive } from '../src/core/parser';
import { base64, message, multipart } from './fixtures';

async function encryptedZip(files: Record<string, string>, password: string, zipCrypto: boolean) {
  const writer = new ZipWriter(new Uint8ArrayWriter(), { password, zipCrypto, useWebWorkers: false });
  for (const [name, content] of Object.entries(files)) await writer.add(name, new TextReader(content));
  return writer.close();
}

function mailWithZip(zip: Uint8Array) {
  return new TextEncoder().encode(
    message(
      { Subject: '암호 압축' },
      multipart('multipart/mixed', 'z', [
        { headers: { 'Content-Type': 'text/plain' }, body: '암호는 별도 메일로 보냅니다' },
        {
          headers: {
            'Content-Type': 'application/zip',
            'Content-Transfer-Encoding': 'base64',
            'Content-Disposition': 'attachment; filename="secret.zip"',
          },
          body: base64(zip),
        },
      ]),
    ),
  );
}

describe('암호 ZIP', () => {
  for (const zipCrypto of [false, true]) {
    it(`${zipCrypto ? 'ZipCrypto' : 'AES'} 암호 ZIP은 잠긴 채로 두고, 맞는 암호로 연다`, async () => {
      const zip = await encryptedZip({ '급여명세서.txt': '비밀', 'inner/a.txt': 'a' }, 'pw1234', zipCrypto);
      const mail = await parseEml(mailWithZip(zip));
      const node = mail.attachments[0];
      expect(node.locked).toBe(true);
      expect(node.children).toBeUndefined();
      expect(node.error).toBeUndefined();

      await expect(unlockArchive(node, 'wrong')).rejects.toThrow('암호가 틀렸습니다.');

      const entries = await unlockArchive(node, 'pw1234');
      expect(entries.map((e) => [e.id, e.filename])).toEqual([
        ['0/0', '급여명세서.txt'],
        ['0/1', 'inner/a.txt'],
      ]);
      expect(new TextDecoder().decode(entries[0].content)).toBe('비밀');
    });
  }
});
