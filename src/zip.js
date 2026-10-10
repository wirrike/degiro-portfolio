import { crc32, deflateRawSync } from 'node:zlib';

/** @typedef {Readonly<{ name: string, content: string | Uint8Array }>} ZipEntry */

/**
 * Create a deterministic, UTF-8 classic ZIP archive using only Node.js primitives.
 * ZIP64, encryption and arbitrary archive paths are intentionally unsupported.
 * @param {readonly ZipEntry[]} entries
 * @returns {Buffer}
 */
export function createZip(entries) {
  if (entries.length > 65_535) throw new Error('Too many entries for a classic ZIP archive.');
  const names = new Set();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith('/') || entry.name.includes('\\')
      || entry.name.split('/').some((part) => !part || part === '.' || part === '..')
      || entry.name.includes('\0') || names.has(entry.name)) {
      throw new Error(`Invalid or duplicate ZIP entry name: ${JSON.stringify(entry.name)}.`);
    }
    names.add(entry.name);
    const name = Buffer.from(entry.name, 'utf8');
    if (name.length > 65_535) throw new Error('ZIP entry name is too long.');
    const data = Buffer.from(entry.content);
    const compressed = deflateRawSync(data);
    if (Math.max(data.length, compressed.length, offset) > 0xffff_ffff) {
      throw new Error('ZIP64 is required for this archive size.');
    }
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(33, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(centralParts);
  if (offset + directory.length + 22 > 0xffff_ffff) throw new Error('ZIP64 is required for this archive size.');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, directory, end]);
}
