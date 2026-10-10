import assert from 'node:assert/strict';
import { crc32, inflateRawSync } from 'node:zlib';

/**
 * Independently inspect both ZIP directories and verify every generated part.
 * @param {Buffer} archive
 * @returns {Map<string, string>}
 */
export function readZipParts(archive) {
  const end = archive.length - 22;
  assert.equal(archive.readUInt32LE(end), 0x06054b50);
  let cursor = archive.readUInt32LE(end + 16);
  assert.equal(cursor + archive.readUInt32LE(end + 12), end);
  const parts = new Map();
  for (let index = 0; index < archive.readUInt16LE(end + 10); index += 1) {
    assert.equal(archive.readUInt32LE(cursor), 0x02014b50);
    const offset = archive.readUInt32LE(cursor + 42);
    const length = archive.readUInt16LE(cursor + 28);
    const name = archive.subarray(cursor + 46, cursor + 46 + length).toString('utf8');
    assert.equal(archive.readUInt32LE(offset), 0x04034b50);
    assert.equal(archive.readUInt16LE(offset + 8), 8);
    const start = offset + 30 + archive.readUInt16LE(offset + 26) + archive.readUInt16LE(offset + 28);
    assert.equal(archive.subarray(offset + 30, offset + 30 + length).toString(), name);
    const data = inflateRawSync(archive.subarray(start, start + archive.readUInt32LE(cursor + 20)));
    assert.equal(data.length, archive.readUInt32LE(cursor + 24));
    assert.equal(crc32(data), archive.readUInt32LE(cursor + 16));
    assert.equal(crc32(data), archive.readUInt32LE(offset + 14));
    assert.ok(!parts.has(name));
    parts.set(name, data.toString());
    cursor += 46 + length + archive.readUInt16LE(cursor + 30) + archive.readUInt16LE(cursor + 32);
  }
  assert.equal(cursor, end);
  return parts;
}

/** @param {string} sheet @param {string} address @returns {string} */
export function cellXml(sheet, address) {
  const cell = sheet.match(new RegExp(`<c r="${address}"[^>]*>.*?</c>`, 'su'));
  assert.ok(cell, `Missing cell ${address}`);
  return cell[0];
}
