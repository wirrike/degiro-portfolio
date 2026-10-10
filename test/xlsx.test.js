import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createPortfolioReport, createPortfolioXlsx } from 'degiro-portfolio';
import { decimal } from '../src/decimal.js';
import { transactionCsv } from './support.js';
import { cellXml, readZipParts } from './xlsx-support.js';

test('XLSX report preserves CSV API and emits the dashboard layout with typed data and native formulas', async () => {
  const csv = await readFile(new URL('../examples/transactions.csv', import.meta.url), 'utf8');
  const baseline = createPortfolioReport(csv);
  assert.equal(baseline.xlsx, null);
  const report = createPortfolioReport(csv, { format: 'xlsx' });
  assert.equal(report.csv, baseline.csv);
  assert.deepEqual(report.portfolio, baseline.portfolio);
  assert.deepEqual(report.xlsx, createPortfolioXlsx(report.portfolio));
  const parts = readZipParts(report.xlsx);
  assert.equal(parts.size, 6);
  assert.match(parts.get('[Content_Types].xml'), /spreadsheetml.sheet.main\+xml/u);
  assert.match(parts.get('xl/workbook.xml'), /calcMode="auto" fullCalcOnLoad="1"/u);
  assert.match(parts.get('xl/_rels/workbook.xml.rels'), /Target="worksheets\/sheet1.xml"/u);
  const sheet = parts.get('xl/worksheets/sheet1.xml');
  assert.match(sheet, /Securities Portfolio Dashboard/u);
  assert.match(sheet, /mergeCell ref="A1:C3"/u);
  assert.match(sheet, /mergeCell ref="K5:L5"/u);
  assert.match(sheet, /pane ySplit="5"/u);
  assert.match(sheet, /dataBar.*showValue="0"/u);
  assert.match(sheet, /sqref="G6:G8"/u);
  assert.match(sheet, /338590/u);
  assert.match(cellXml(sheet, 'B6'), /Demo Closed/u);
  assert.match(cellXml(sheet, 'D6'), /<v>0<\/v>/u);
  assert.match(cellXml(sheet, 'N6'), /<v>21<\/v>/u);
  assert.match(cellXml(sheet, 'O6'), /<v>27<\/v>/u);
  assert.match(cellXml(sheet, 'F6'), /<f>N6-O6<\/f><v>-6<\/v>/u);
  assert.match(cellXml(sheet, 'P6'), /<f>O6-N6<\/f><v>6<\/v>/u);
  assert.match(cellXml(sheet, 'J6'), /<v>6<\/v>/u);
  assert.match(cellXml(sheet, 'R6'), /<v>0<\/v>/u);
  assert.match(cellXml(sheet, 'Q8'), /<v>161.5<\/v>/u);
  assert.match(cellXml(sheet, 'F8'), /<v>5<\/v>/u);
  assert.match(cellXml(sheet, 'E8'), /Q8\/D8/u);
  assert.match(cellXml(sheet, 'G8'), /t="inlineStr".*<t xml:space="preserve"><\/t>/u);
  assert.match(cellXml(sheet, 'H8'), /ISNUMBER\(G8\).*<v>n.a.<\/v>/u);
  assert.match(cellXml(sheet, 'I8'), /J8\/N8/u);
  assert.match(cellXml(sheet, 'L8'), /H8\/\$H\$3/u);
  assert.match(cellXml(sheet, 'H3'), /COUNT\(H6:H8\)=ROWS\(H6:H8\).*<v>n.a.<\/v>/u);
  assert.doesNotMatch(sheet, /GOOGLEFINANCE|DUMMYFUNCTION|SPARKLINE|#REF!|#DIV\/0!/u);
  const styles = parts.get('xl/styles.xml');
  assert.match(styles, /338590/u);
  assert.match(styles, /EFEFEF/u);
  assert.match(styles, /name val="Arial"/u);
});

test('XLSX includes closed history and optionally zero-only rows without dividing by zero', () => {
  const csv = transactionCsv([
    {}, { Date: '02-01-2024', Quantity: '-1', 'Value EUR': '12,00', 'Total EUR': '11,00' },
    { Product: 'Zero', ISIN: 'US0000000002', Quantity: '0', 'Value EUR': '0,00', 'Total EUR': '0,00' },
  ]);
  const report = createPortfolioReport(csv, { format: 'xlsx', includeClosed: true });
  const sheet = readZipParts(report.xlsx).get('xl/worksheets/sheet1.xml');
  assert.match(cellXml(sheet, 'E7'), /IF\(D7=0,0,Q7\/D7\).*<v>0<\/v>/u);
  assert.match(cellXml(sheet, 'H7'), /<v>0<\/v>/u);
  assert.match(cellXml(sheet, 'I7'), /<v>n.a.<\/v>/u);
  assert.match(cellXml(sheet, 'H3'), /<v>0<\/v>/u);
  assert.match(cellXml(sheet, 'L6'), /<v>n.a.<\/v>/u);
  const empty = readZipParts(createPortfolioXlsx({ ...report.portfolio, positions: [] })).get('xl/worksheets/sheet1.xml');
  assert.match(cellXml(empty, 'F3'), /<f>0<\/f><v>0<\/v>/u);
  assert.doesNotMatch(empty, /F6:F5|H6:H5|dataValidations/u);
});

test('XLSX text is literal and escaped, numeric precision limits cannot silently change quantities', () => {
  const report = createPortfolioReport(transactionCsv([{ Product: '=1+2 <A & B> "€"' }]), { format: 'xlsx' });
  const sheet = readZipParts(report.xlsx).get('xl/worksheets/sheet1.xml');
  assert.match(cellXml(sheet, 'B6'), /t="inlineStr".*=1\+2 &lt;A &amp; B&gt; &quot;€/u);
  assert.doesNotMatch(cellXml(sheet, 'B6'), /<f>/u);
  const position = report.portfolio.positions[0];
  assert.throws(() => createPortfolioXlsx({ ...report.portfolio, positions: [{ ...position, quantity: decimal(10_000_000_000_000_001n) }] }), /15-significant-digit/u);
  assert.throws(() => createPortfolioReport(transactionCsv([{ Product: 'bad\u0000' }]), { format: 'xlsx' }), /XML 1.0/u);
  assert.throws(() => createPortfolioReport('', { format: 'pdf' }), /format must be csv or xlsx/u);
  assert.throws(() => createPortfolioReport(transactionCsv([{}]), { format: 'xlsx', expectedQuantitiesCsv: '' }), /CSV is empty/u);
});

test('XLSX formulas and ranges extend consistently to later positions', () => {
  const csv = transactionCsv(Array.from({ length: 30 }, (_, index) => ({
    Product: `Example ${String(index).padStart(2, '0')}`, ISIN: `US${String(index).padStart(10, '0')}`,
  })));
  const sheet = readZipParts(createPortfolioReport(csv, { format: 'xlsx' }).xlsx).get('xl/worksheets/sheet1.xml');
  for (const row of [6, 20, 35]) {
    assert.match(cellXml(sheet, `E${row}`), new RegExp(`Q${row}/D${row}`, 'u'));
    assert.match(cellXml(sheet, `J${row}`), new RegExp(`H${row}-F${row}`, 'u'));
    assert.match(cellXml(sheet, `L${row}`), new RegExp(`H${row}/\\$H\\$3`, 'u'));
  }
  assert.match(cellXml(sheet, 'H3'), /COUNT\(H6:H35\)/u);
  assert.match(sheet, /sqref="K6:K35"/u);
});

test('XLSX fills literal tickers by ISIN while keeping prices, formulas and styles unchanged', async () => {
  const csv = await readFile(new URL('../examples/transactions.csv', import.meta.url), 'utf8');
  const baseline = readZipParts(createPortfolioReport(csv, { format: 'xlsx' }).xlsx);
  const tickerMappings = [{ isin: 'US0000000001', ticker: 'NASDAQ:LONG_DEMO_SYMBOL' }];
  const report = createPortfolioReport(csv, { format: 'xlsx', tickerMappings });
  assert.deepEqual(report.xlsx, createPortfolioXlsx(report.portfolio, { tickerMappings }));
  const parts = readZipParts(report.xlsx);
  const sheet = parts.get('xl/worksheets/sheet1.xml');
  assert.match(cellXml(sheet, 'C8'), /s="8" t="inlineStr".*NASDAQ:LONG_DEMO_SYMBOL/u);
  assert.doesNotMatch(cellXml(sheet, 'C8'), /<f>/u);
  assert.equal(cellXml(sheet, 'C6'), cellXml(baseline.get('xl/worksheets/sheet1.xml'), 'C6'));
  for (const row of [6, 7, 8]) {
    for (const column of ['A', 'B', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'N', 'O', 'P', 'Q', 'R']) {
      assert.equal(cellXml(sheet, `${column}${row}`), cellXml(baseline.get('xl/worksheets/sheet1.xml'), `${column}${row}`));
    }
  }
  for (const [name, contents] of baseline) {
    if (name !== 'xl/worksheets/sheet1.xml') assert.equal(parts.get(name), contents);
  }
  assert.match(sheet, /<col min="3" max="3" width="25"/u);
  assert.throws(() => createPortfolioXlsx(report.portfolio, { tickerMappings: [{ isin: 'US0000000001', ticker: '=1+2' }] }), /Invalid ticker/u);
});
