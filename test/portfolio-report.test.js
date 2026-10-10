import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createPortfolioReport } from 'degiro-portfolio';
import { parseCsv } from '../src/csv.js';
import { decimal } from '../src/decimal.js';
import { transactionCsv } from './support.js';

test('public report API returns the expected CSV, positions, verification and open-position count', async () => {
  const transactionsCsv = await readFile(new URL('../examples/transactions.csv', import.meta.url), 'utf8');
  const expectedQuantitiesCsv = await readFile(new URL('../examples/expected-quantities.csv', import.meta.url), 'utf8');
  const expectedCsv = await readFile(new URL('../examples/portfolio.csv', import.meta.url), 'utf8');
  const report = createPortfolioReport(transactionsCsv, { expectedQuantitiesCsv });
  assert.equal(report.csv.replaceAll('\r\n', '\n'), expectedCsv);
  assert.deepEqual(report.verification, { productCount: 5, isinCount: 4 });
  assert.equal(report.openPositionCount, 2);
  assert.equal(report.portfolio.asOf, '2024-06-12');
  assert.equal(report.portfolio.corporateActionCount, 2);
  assert.equal(report.portfolio.positions.length, 4);
  const renamed = report.portfolio.positions.find((position) => position.product === 'Demo Renamed');
  assert.deepEqual(renamed.totalCostsEur, decimal(323n));
  assert.deepEqual(renamed.saleProceedsEur, decimal(318n));
  assert.deepEqual(renamed.netCashFlowEur, decimal(-5n));
});

test('report API works without a reference and can include zero-only positions', () => {
  const transactionsCsv = transactionCsv([
    {}, { Date: '02-01-2024', Quantity: '-1', 'Value EUR': '12,00', 'Total EUR': '11,00' },
    { Product: 'Zero', ISIN: 'US0000000002', Quantity: '0', 'Value EUR': '0,00', 'Total EUR': '0,00' },
  ]);
  const report = createPortfolioReport(transactionsCsv);
  assert.equal(report.verification, null);
  assert.equal(report.openPositionCount, 0);
  assert.equal(parseCsv(report.csv).length, 2);
  const includingClosed = createPortfolioReport(transactionsCsv, { includeClosed: true });
  assert.equal(parseCsv(includingClosed.csv).length, 3);
  assert.equal(includingClosed.openPositionCount, 0);
  assert.deepEqual(includingClosed.portfolio, report.portfolio);
});

test('report API rejects invalid exports and supplied invalid references', () => {
  const transactionsCsv = transactionCsv([{}]);
  assert.throws(() => createPortfolioReport(''), /CSV is empty/u);
  assert.throws(() => createPortfolioReport(transactionsCsv, { expectedQuantitiesCsv: '' }), /CSV is empty/u);
  assert.throws(() => createPortfolioReport(transactionsCsv, {
    expectedQuantitiesCsv: 'Product,Quantity\nExample,2\n',
  }), /Quantity mismatch/u);
  assert.throws(() => createPortfolioReport(transactionCsv([
    { Quantity: '-1', 'Value EUR': '10,00', 'Total EUR': '9,00' },
  ])), /Insufficient holdings/u);
});
