import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createPortfolioReport, createPortfolioXlsx } from 'degiro-portfolio';
import { createGoogleFinanceFormulas } from '../src/googlefinance.js';
import { transactionCsv } from './support.js';
import { cellXml, readZipParts } from './xlsx-support.js';

/** @param {Buffer} workbook @returns {string} */
const worksheet = (workbook) => readZipParts(workbook).get('xl/worksheets/sheet1.xml');

/** @param {string} sheet @param {string} address @returns {string} */
const formula = (sheet, address) => cellXml(sheet, address).match(/<f>(.*?)<\/f>/su)[1]
  .replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>');

test('default XLSX pricing uses native Google Sheets formulas and auditable EUR conversion', async () => {
  const csv = await readFile(new URL('../examples/transactions.csv', import.meta.url), 'utf8');
  const report = createPortfolioReport(csv, { format: 'xlsx' });
  const sheet = worksheet(report.xlsx);
  assert.deepEqual(report.xlsx, createPortfolioReport(csv, { format: 'xlsx', priceSource: 'googlefinance' }).xlsx);
  assert.deepEqual(report.xlsx, createPortfolioXlsx(report.portfolio));
  assert.equal(report.csv, createPortfolioReport(csv).csv);
  assert.deepEqual(report.portfolio, createPortfolioReport(csv, { format: 'xlsx', priceSource: 'manual' }).portfolio);
  assert.match(sheet, /dimension ref="A1:W8"/u);
  assert.match(sheet, /Transactions through 2024-06-12/u);
  assert.match(sheet, /Quote Price.*Quote Currency.*Unit Factor.*FX to EUR.*Quote Time/u);
  assert.doesNotMatch(sheet, /DUMMYFUNCTION|_xlfn\.|dataValidations|IFERROR/u);
  assert.equal(formula(sheet, 'S8'), 'IF(D8=0,"n.a.",IF(C8="","n.a.",GOOGLEFINANCE(C8,"price")))');
  assert.equal(formula(sheet, 'T8'), 'IF(D8=0,"n.a.",IF(C8="","n.a.",GOOGLEFINANCE(C8,"currency")))');
  assert.equal(formula(sheet, 'W8'), 'IF(D8=0,"n.a.",IF(C8="","n.a.",GOOGLEFINANCE(C8,"tradetime")))');
  assert.equal(formula(sheet, 'G8'), 'IF(D8=0,0,IF(C8="","n.a.",S8*U8*V8))');
  assert.match(cellXml(sheet, 'G8'), /s="6".*<v>n.a.<\/v>/u);
  assert.match(cellXml(sheet, 'G6'), /<v>0<\/v>/u);
  assert.match(cellXml(sheet, 'H3'), /<v>n.a.<\/v>/u);
  assert.match(cellXml(sheet, 'W8'), /s="14".*<v>n.a.<\/v>/u);
  assert.match(readZipParts(report.xlsx).get('xl/styles.xml'), /yyyy-mm-dd hh:mm:ss/u);
});

test('GBP is not confused with GBp; pence scaling and currency conversion are separate formulas', () => {
  const prices = createGoogleFinanceFormulas(6);
  assert.equal(prices.unitFactor, 'IF(D6=0,"n.a.",IF(C6="","n.a.",IF(OR(EXACT(T6,"GBX"),EXACT(T6,"GBp")),0.01,1)))');
  assert.equal(prices.fx, 'IF(D6=0,"n.a.",IF(C6="","n.a.",IF(T6="EUR",1,GOOGLEFINANCE("CURRENCY:"&IF(OR(EXACT(T6,"GBX"),EXACT(T6,"GBp")),"GBP",T6)&"EUR","price"))))');
  assert.doesNotMatch(prices.fx, /CURRENCY:EUREUR/u);
  for (const expression of [prices.quote, prices.currency, prices.unitFactor, prices.fx, prices.quoteTime]) {
    assert.ok(expression.startsWith('IF(D6=0,"n.a.",IF(C6="","n.a.",'));
  }
});

test('market formulas use same-row references for first, middle and last positions', () => {
  const csv = transactionCsv(Array.from({ length: 30 }, (_, index) => ({
    Product: `Example ${String(index).padStart(2, '0')}`, ISIN: `US${String(index).padStart(10, '0')}`,
  })));
  const sheet = worksheet(createPortfolioReport(csv, { format: 'xlsx' }).xlsx);
  for (const row of [6, 20, 35]) {
    const prices = createGoogleFinanceFormulas(row);
    for (const [column, key] of [['G', 'priceEur'], ['S', 'quote'], ['T', 'currency'], ['U', 'unitFactor'], ['V', 'fx'], ['W', 'quoteTime']]) {
      assert.equal(formula(sheet, `${column}${row}`), prices[key]);
    }
  }
  assert.match(sheet, /dimension ref="A1:W35"/u);
});

test('manual prices retain the Excel layout; invalid sources and CSV pricing are rejected', () => {
  const csv = transactionCsv([{}]);
  const report = createPortfolioReport(csv, { format: 'xlsx', priceSource: 'manual' });
  const sheet = worksheet(report.xlsx);
  assert.match(sheet, /dimension ref="A1:R6"/u);
  assert.match(sheet, /dataValidations/u);
  assert.match(cellXml(sheet, 'G6'), /s="9" t="inlineStr"/u);
  assert.doesNotMatch(sheet, /GOOGLEFINANCE|Quote Currency|FX to EUR/u);
  for (const priceSource of ['', 'yahoo', null]) {
    assert.throws(() => createPortfolioReport(csv, { format: 'xlsx', priceSource }), /Price source must be googlefinance or manual/u);
    assert.throws(() => createPortfolioXlsx(report.portfolio, { priceSource }), /Price source must be googlefinance or manual/u);
  }
  for (const priceSource of ['manual', 'googlefinance']) {
    assert.throws(() => createPortfolioReport(csv, { priceSource }), /only available for XLSX/u);
  }
});
