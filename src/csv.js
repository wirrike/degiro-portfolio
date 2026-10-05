/** @typedef {Readonly<{ cells: readonly string[], line: number }>} CsvRecord */

/**
 * Parse comma-delimited CSV with escaped quotes, BOM and embedded newlines.
 * @param {string} input
 * @returns {CsvRecord[]}
 */
export function parseCsv(input) {
  const text = input.replace(/^\uFEFF/u, '');
  /** @type {CsvRecord[]} */
  const records = [];
  /** @type {string[]} */
  let cells = [];
  let field = '';
  let quoted = false;
  let closed = false;
  let line = 1;
  let startLine = 1;

  /** @returns {void} */
  const finishField = () => {
    cells.push(field);
    field = '';
    closed = false;
  };
  /** @returns {void} */
  const finishRecord = () => {
    finishField();
    if (cells.some((cell) => cell.trim() !== '')) records.push({ cells, line: startLine });
    cells = [];
    startLine = line + 1;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          closed = true;
        }
      } else if (character === '\r' || character === '\n') {
        field += '\n';
        if (character === '\r' && text[index + 1] === '\n') index += 1;
        line += 1;
      } else {
        field += character;
      }
    } else if (character === ',') {
      finishField();
    } else if (character === '\r' || character === '\n') {
      finishRecord();
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      line += 1;
    } else if (character === '"' && field === '' && !closed) {
      quoted = true;
    } else if (character === '"' || closed) {
      throw new Error(`Invalid CSV quoting at line ${line}.`);
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error(`Unclosed CSV quote starting at line ${startLine}.`);
  if (field !== '' || cells.length > 0 || closed) finishRecord();
  return records;
}

/**
 * Resolve required, uniquely named columns; unnamed DEGIRO columns are allowed.
 * @param {readonly CsvRecord[]} records
 * @param {readonly string[]} required
 * @returns {Record<string, number>}
 */
export function columnIndexes(records, required) {
  if (records.length === 0) throw new Error('CSV is empty.');
  const header = records[0].cells.map((cell) => cell.trim());
  return Object.fromEntries(required.map((name) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`Missing CSV column: ${name}.`);
    if (header.lastIndexOf(name) !== index) throw new Error(`Duplicate CSV column: ${name}.`);
    return [name, index];
  }));
}

/**
 * Enforce a rectangular CSV before interpreting any row.
 * @param {readonly CsvRecord[]} records
 * @returns {void}
 */
export function validateRowWidths(records) {
  for (const record of records.slice(1)) {
    if (record.cells.length !== records[0].cells.length) {
      throw new Error(`Unexpected number of CSV fields at line ${record.line}.`);
    }
  }
}

/**
 * Serialize RFC 4180-style CSV using CRLF record separators.
 * @param {readonly (readonly string[])[]} rows
 * @returns {string}
 */
export function stringifyCsv(rows) {
  return rows.map((row) => row.map((cell) => /[",\r\n]/u.test(cell)
    ? `"${cell.replaceAll('"', '""')}"` : cell).join(',')).join('\r\n') + '\r\n';
}
