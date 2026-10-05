import assert from 'node:assert/strict';
import test from 'node:test';
import { columnIndexes, parseCsv, stringifyCsv, validateRowWidths } from '../src/csv.js';
import { parseTransactions } from '../src/transactions.js';
import { transactionCsv } from './support.js';

test('CSV supports BOM, CRLF, blank records, commas, escaped quotes and multiline cells', () => {
  const rows = parseCsv('\uFEFFProduct,Quantity\r\n\r\n"A, ""quoted""\r\nname",2\r\nB,3');
  assert.deepEqual(rows, [
    { cells: ['Product', 'Quantity'], line: 1 },
    { cells: ['A, "quoted"\nname', '2'], line: 3 },
    { cells: ['B', '3'], line: 5 },
  ]);
  assert.deepEqual(parseCsv('a,b\rx,y\r').map((record) => record.cells), [['a', 'b'], ['x', 'y']]);
  assert.deepEqual(parseCsv('a,""').map((record) => record.cells), [['a', '']]);
  assert.deepEqual(parseCsv('a,b,').map((record) => record.cells), [['a', 'b', '']]);
});

test('CSV serializer round-trips quoted cells', () => {
  const rows = [['Product', 'Quantity'], ['A, "quoted"\nname', '3'], ['plain', '']];
  assert.deepEqual(parseCsv(stringifyCsv(rows)).map((record) => record.cells), rows);
});

test('invalid quoting, missing columns, duplicate columns and row widths fail', () => {
  for (const value of ['a,"open', 'a,"closed"x', 'a,b"c', 'a,"""']) {
    assert.throws(() => parseCsv(value), /CSV quot/u);
  }
  assert.throws(() => columnIndexes([], ['Product']), /empty/u);
  assert.throws(() => columnIndexes(parseCsv('Product,Other'), ['Quantity']), /Missing/u);
  assert.throws(() => columnIndexes(parseCsv('Product,Product'), ['Product']), /Duplicate/u);
  assert.throws(() => validateRowWidths(parseCsv('a,b\nx,y,z')), /line 2/u);
  assert.deepEqual(columnIndexes(parseCsv('Product,,,Quantity'), ['Product', 'Quantity']), { Product: 0, Quantity: 3 });
});

test('transactions validate calendar dates, time, ISIN, signs and amounts', () => {
  const cases = [
    [{ Date: '31-02-2024' }, /calendar date/u],
    [{ Date: '1-01-2024' }, /Date or Time/u],
    [{ Date: '29-02-2023' }, /calendar date/u],
    [{ Time: '24:00' }, /Date or Time/u],
    [{ ISIN: '' }, /ISIN/u],
    [{ Product: '' }, /Product/u],
    [{ Quantity: '1', 'Value EUR': '10,00' }, /signs/u],
    [{ Quantity: '0' }, /zero-quantity/u],
    [{ 'Total EUR': '' }, /Total EUR/u],
  ];
  for (const [row, message] of cases) assert.throws(() => parseTransactions(transactionCsv([row])), message);
  assert.equal(parseTransactions(transactionCsv([{ Date: '29-02-2024' }]))[0].timestamp, '2024-02-29T10:00');
  assert.throws(() => parseTransactions(transactionCsv([])), /no transactions/u);
});
