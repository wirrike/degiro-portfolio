import assert from 'node:assert/strict';
import { crc32, inflateRawSync } from 'node:zlib';
import test from 'node:test';
import { createZip } from '../src/zip.js';
import { escapeXml } from '../src/xml.js';

test('ZIP entries use correct UTF-8 headers, checksums, offsets and deterministic bytes', () => {
  const entries = [{ name: 'xl/žluťoučký.xml', content: 'Portfolio €' }, { name: 'empty.xml', content: '' }];
  const archive = createZip(entries);
  assert.deepEqual(createZip(entries), archive);
  let offset = 0;
  for (const entry of entries) {
    assert.equal(archive.readUInt32LE(offset), 0x04034b50);
    assert.equal(archive.readUInt16LE(offset + 6), 0x0800);
    assert.equal(archive.readUInt16LE(offset + 8), 8);
    const size = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    assert.equal(archive.subarray(offset + 30, offset + 30 + nameLength).toString(), entry.name);
    const data = inflateRawSync(archive.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size));
    assert.equal(data.toString(), entry.content);
    assert.equal(data.length, archive.readUInt32LE(offset + 22));
    assert.equal(crc32(data), archive.readUInt32LE(offset + 14));
    offset += 30 + nameLength + size;
  }
  assert.equal(archive.readUInt32LE(offset), 0x02014b50);
  const end = archive.length - 22;
  assert.equal(archive.readUInt32LE(end), 0x06054b50);
  assert.equal(archive.readUInt16LE(end + 10), entries.length);
  assert.equal(archive.readUInt32LE(end + 16), offset);
  let centralOffset = offset;
  let localOffset = 0;
  for (const entry of entries) {
    assert.equal(archive.readUInt32LE(centralOffset + 42), localOffset);
    const nameLength = archive.readUInt16LE(centralOffset + 28);
    assert.equal(archive.subarray(centralOffset + 46, centralOffset + 46 + nameLength).toString(), entry.name);
    localOffset += 30 + nameLength + archive.readUInt32LE(centralOffset + 20);
    centralOffset += 46 + nameLength;
  }
  assert.equal(centralOffset, end);
});

test('ZIP rejects ambiguous paths, duplicates and classic ZIP limits', () => {
  for (const name of ['', '/absolute', '../escape', 'xl/../escape', 'xl//empty', 'xl/./dot', 'xl\\windows', 'bad\0name']) {
    assert.throws(() => createZip([{ name, content: '' }]), /Invalid/u);
  }
  assert.throws(() => createZip([{ name: 'same', content: '' }, { name: 'same', content: '' }]), /duplicate/u);
  assert.throws(() => createZip(Array(65_536)), /Too many entries/u);
  assert.throws(() => createZip([{ name: 'a'.repeat(65_536), content: '' }]), /too long/u);
});

test('XML escapes text and attributes without allowing malformed XML characters', () => {
  assert.equal(escapeXml('<Company & "ticker" \'€\'>'), '&lt;Company &amp; &quot;ticker&quot; &apos;€&apos;&gt;');
  assert.equal(escapeXml('Příjem\n\t'), 'Příjem\n\t');
  for (const text of ['bad\0', '\u000b', '\ufffe', '\ud800']) assert.throws(() => escapeXml(text), /XML 1.0/u);
});
