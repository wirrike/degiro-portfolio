import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { calculatePortfolio, createPortfolioCsv, parseTransactions, verifyQuantities } from '../src/index.js';
import { parseCsv } from '../src/csv.js';
import { decimal, formatDecimal, formatQuantity, ZERO } from '../src/decimal.js';
import { transactionCsv } from './support.js';

const exampleUrl = new URL('../examples/transactions.csv', import.meta.url);

test('synthetic end-to-end fixture covers splits, renames, partial sales, GBX and identical fills', async () => {
  const transactions = parseTransactions(await readFile(exampleUrl, 'utf8'));
  const portfolio = calculatePortfolio(transactions);
  assert.deepEqual(verifyQuantities(transactions, portfolio, await readFile(new URL('../examples/expected-quantities.csv', import.meta.url), 'utf8')), { productCount: 5, isinCount: 4 });
  const expected = await readFile(new URL('../examples/portfolio.csv', import.meta.url), 'utf8');
  assert.equal(createPortfolioCsv(portfolio).replaceAll('\r\n', '\n'), expected);
  assert.equal(portfolio.corporateActionCount, 2);
  assert.equal(portfolio.asOf, '2024-06-12');
  assert.equal(parseCsv(createPortfolioCsv(portfolio, { includeClosed: true })).length, 5);
  assert.deepEqual(calculatePortfolio(transactions.toReversed()), portfolio);
  const shuffled = [...transactions.filter((_, index) => index % 2 === 0), ...transactions.filter((_, index) => index % 2 !== 0)];
  assert.deepEqual(calculatePortfolio(shuffled), portfolio);
});

test('partial sales remove average acquisition cost, not sale proceeds', () => {
  const rows = [
    { Quantity: '2', 'Value EUR': '-20,00', 'Total EUR': '-21,00' },
    { Date: '02-01-2024', Quantity: '1', 'Value EUR': '-15,00', 'Total EUR': '-16,00' },
    { Date: '03-01-2024', Quantity: '-1', 'Value EUR': '100,00', 'Total EUR': '98,00' },
  ];
  const transactions = parseTransactions(transactionCsv(rows));
  const before = structuredClone(transactions);
  const [position] = calculatePortfolio(transactions).positions;
  assert.equal(formatQuantity(position.quantity), '2');
  assert.deepEqual(position.costBasisEur, decimal(74n, 3n));
  assert.deepEqual(position.averageCostEur, decimal(37n, 3n));
  assert.deepEqual(transactions, before);
  const soldAtLoss = rows.map((row) => row.Quantity === '-1' ? { ...row, 'Value EUR': '0,50', 'Total EUR': '-0,50' } : row);
  assert.deepEqual(calculatePortfolio(parseTransactions(transactionCsv(soldAtLoss))).positions, [position]);
});

test('fees are taken once from Total EUR, and closing then reopening starts a new cost basis', () => {
  const positions = calculatePortfolio(parseTransactions(transactionCsv([
    { Quantity: '3', 'Total EUR': '-10,00' },
    { Date: '02-01-2024', Quantity: '-1', 'Value EUR': '4,00', 'Total EUR': '3,00' },
    { Date: '03-01-2024', Quantity: '-2', 'Value EUR': '8,00', 'Total EUR': '7,00' },
    { Date: '04-01-2024', Quantity: '2', 'Value EUR': '-40,00', 'Total EUR': '-41,00' },
  ]))).positions;
  assert.deepEqual(positions[0].costBasisEur, decimal(41n));
  assert.equal(formatQuantity(positions[0].quantity), '2');
});

test('a reverse split preserves all acquisition costs', () => {
  const portfolio = calculatePortfolio(parseTransactions(transactionCsv([
    { Quantity: '20', 'Value EUR': '-100,00', 'Total EUR': '-102,00' },
    { Date: '02-01-2024', Venue: '', Quantity: '-20', 'Value EUR': '200,00', 'Total EUR': '200,00' },
    { Date: '02-01-2024', Venue: '', Quantity: '2', 'Value EUR': '-200,00', 'Total EUR': '-200,00' },
  ])));
  assert.equal(formatQuantity(portfolio.positions[0].quantity), '2');
  assert.equal(formatDecimal(portfolio.positions[0].costBasisEur), '102.00');
  assert.equal(formatDecimal(portfolio.positions[0].averageCostEur), '51.00');
});

test('fractional quantities and repeated equal orders remain exact', () => {
  const row = { Quantity: '0,1', 'Value EUR': '-0,01', 'Total EUR': '-0,01' };
  const [position] = calculatePortfolio(parseTransactions(transactionCsv([row, row, row]))).positions;
  assert.equal(formatQuantity(position.quantity), '0.3');
  assert.equal(formatDecimal(position.costBasisEur), '0.03');
});

test('closed portfolios produce a header and optional zero positions', () => {
  const portfolio = calculatePortfolio(parseTransactions(transactionCsv([
    {}, { Date: '02-01-2024', Quantity: '-1', 'Value EUR': '12,00', 'Total EUR': '11,00' },
  ])));
  assert.equal(parseCsv(createPortfolioCsv(portfolio)).length, 1);
  assert.equal(parseCsv(createPortfolioCsv(portfolio, { includeClosed: true })).length, 2);
  assert.deepEqual(portfolio.positions[0].costBasisEur, ZERO);
});

test('unknown opening cost, incomplete history, short positions and ambiguous order fail', () => {
  assert.throws(() => calculatePortfolio([]), /No transactions/u);
  const cases = [
    [[{ Quantity: '-1', 'Value EUR': '10,00', 'Total EUR': '9,00' }], /Insufficient holdings/u],
    [[{ Quantity: '1', 'Value EUR': '0,00', 'Total EUR': '0,00' }], /Unpaired/u],
    [[{}, { Date: '02-01-2024', Quantity: '-1', 'Value EUR': '0,00', 'Total EUR': '0,00' }], /Unpaired/u],
    [[{}, { Date: '02-01-2024', Quantity: '1' }, { Date: '02-01-2024', Quantity: '-1', 'Value EUR': '10,00', 'Total EUR': '10,00' }], /Ambiguous/u],
    [[{ 'Total EUR': '1,00' }], /Negative purchase cost/u],
  ];
  for (const [rows, message] of cases) assert.throws(() => calculatePortfolio(parseTransactions(transactionCsv(rows))), message);
});

test('renamed instruments consolidate by ISIN, and spreadsheet formulas are escaped', () => {
  const portfolio = calculatePortfolio(parseTransactions(transactionCsv([
    { Product: 'Old' }, { Date: '02-01-2024', Product: '=HYPERLINK("https://example.invalid")' },
  ])));
  const records = parseCsv(createPortfolioCsv(portfolio));
  assert.equal(records.length, 2);
  assert.equal(records[1].cells[2], '2');
  assert.ok(records[1].cells[0].startsWith("'="));
});

test('reference verification rejects a mismatch, missing rows, duplicates and corrupt portfolio totals', () => {
  const transactions = parseTransactions(transactionCsv([{}]));
  const portfolio = calculatePortfolio(transactions);
  for (const [reference, pattern] of [
    ['Product,Quantity\nExample,2\n', /Quantity mismatch/u],
    ['Product,Quantity\n', /Missing reference/u],
    ['Product,Quantity\nOther,1\n', /absent/u],
    ['Product,Quantity\nExample,1\nExample,1\n', /Duplicate/u],
  ]) assert.throws(() => verifyQuantities(transactions, portfolio, reference), pattern);
  const broken = { ...portfolio, positions: [{ ...portfolio.positions[0], quantity: decimal(2n) }] };
  assert.throws(() => verifyQuantities(transactions, broken, 'Product,Quantity\nExample,1'), /portfolio quantity mismatch/u);
  const ambiguous = parseTransactions(transactionCsv([{}, { ISIN: 'GB0000000002' }]));
  assert.throws(() => verifyQuantities(ambiguous, calculatePortfolio(ambiguous), 'Product,Quantity\nExample,2'), /ambiguous/u);
});
