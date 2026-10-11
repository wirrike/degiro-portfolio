import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { link, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseCsv } from '../src/csv.js';
import { cellXml, readZipParts } from './xlsx-support.js';

const cli = fileURLToPath(new URL('../bin/degiro-portfolio.js', import.meta.url));
const input = fileURLToPath(new URL('../examples/transactions.csv', import.meta.url));
const reference = fileURLToPath(new URL('../examples/expected-quantities.csv', import.meta.url));
const tickers = fileURLToPath(new URL('../examples/tickers.csv', import.meta.url));

/** @param {readonly string[]} args @returns {import('node:child_process').SpawnSyncReturns<string>} */
const run = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

test('CLI exposes help, version and argument errors without writing files', () => {
  assert.equal(run(['--help']).status, 0);
  assert.match(run(['--help']).stdout, /Použití/u);
  assert.equal(run(['--version']).stdout.trim(), '1.6.0');
  assert.equal(run([]).status, 1);
  assert.equal(run(['--unknown']).status, 1);
});

test('CLI maps CSV and JSON tickers, reports missing entries and protects the mapping file', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'degiro-tickers-test-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, 'mapped.xlsx');
  const result = run(['-i', input, '-o', output, '--tickers', tickers, '--include-closed']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Tickery: 3 vyplněných pozic; bez mapování: 1/u);
  assert.match(result.stderr, /Chybějící tickery \(ISIN\): US0000000004/u);
  const sheet = readZipParts(await readFile(output)).get('xl/worksheets/sheet1.xml');
  assert.match(cellXml(sheet, 'C6'), /XDEM:CLOSED/u);
  assert.match(cellXml(sheet, 'C8'), /XDEM:DEMO/u);
  const mappingJson = join(directory, 'mapping.JSON');
  await writeFile(mappingJson, await readFile(new URL('../examples/tickers.json', import.meta.url)));
  const csvOutput = join(directory, 'mapped.csv');
  const jsonResult = run(['-i', input, '-o', csvOutput, '--tickers', mappingJson]);
  assert.equal(jsonResult.status, 0, jsonResult.stderr);
  assert.match(jsonResult.stderr, /Tickery: 3 vyplněných pozic; bez mapování: 0/u);
  assert.equal(parseCsv(await readFile(csvOutput, 'utf8'))[0].cells.at(-1), 'Ticker');
  const mapping = join(directory, 'mapping.csv');
  const original = await readFile(tickers, 'utf8');
  await writeFile(mapping, original);
  const alias = join(directory, 'mapping-alias.csv');
  await symlink(mapping, alias);
  const hardLink = join(directory, 'mapping-hard-link.csv');
  await link(mapping, hardLink);
  for (const destination of [mapping, alias, hardLink]) {
    const protectedResult = run(['-i', input, '-o', destination, '--tickers', mapping, '--force']);
    assert.equal(protectedResult.status, 1);
    assert.match(protectedResult.stderr, /must not overwrite/u);
    assert.equal(await readFile(mapping, 'utf8'), original);
  }
});

test('CLI rejects invalid ticker files before creating or overwriting any output', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'degiro-invalid-tickers-test-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const mapping = join(directory, 'invalid.csv');
  await writeFile(mapping, 'ISIN,Ticker\nUS0000000001,XDEM:DEMO\nUS0000000001,LON:OTHER\n');
  const output = join(directory, 'portfolio.csv');
  assert.equal(run(['-i', input, '-o', output, '--tickers', mapping]).status, 1);
  await assert.rejects(readFile(output), { code: 'ENOENT' });
  await writeFile(output, 'existing report');
  const invalid = run(['-i', input, '-o', output, '--tickers', mapping, '--force']);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Duplicate ticker mapping/u);
  assert.equal(await readFile(output, 'utf8'), 'existing report');
  const unsupported = join(directory, 'mapping.txt');
  await writeFile(unsupported, '[]');
  assert.match(run(['-i', input, '-o', output, '--tickers', unsupported, '--force']).stderr, /format must be csv or json/u);
  assert.equal(run(['-i', input, '-o', output, '--tickers', join(directory, 'missing.csv')]).status, 1);
  assert.match(run(['-i', input, '-o', output, '--tickers=']).stderr, /non-empty file path/u);
});

test('CLI selects XLSX by extension and rejects unsupported output formats without writing', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'degiro-xlsx-test-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, 'portfolio.XLSX');
  const args = ['-i', input, '-o', output, '--verify', reference];
  const result = run(args);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Google Sheets.*GOOGLEFINANCE/u);
  const workbook = await readFile(output);
  assert.equal(workbook.readUInt32LE(0), 0x04034b50);
  assert.equal(run(args).status, 1);
  assert.equal(run([...args, '--force']).status, 0);
  const unsupported = join(directory, 'portfolio.pdf');
  const invalid = run(['-i', input, '-o', unsupported]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /format must be csv or xlsx/u);
  await assert.rejects(readFile(unsupported), { code: 'ENOENT' });
});

test('CLI supports manual EUR prices and rejects invalid pricing before overwriting output', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'degiro-pricing-test-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, 'manual.xlsx');
  const args = ['-i', input, '-o', output, '--price-source', 'manual'];
  const result = run(args);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /aktuální ceny v EUR/u);
  assert.doesNotMatch(result.stderr, /GOOGLEFINANCE/u);
  const original = await readFile(output);
  assert.doesNotMatch(readZipParts(original).get('xl/worksheets/sheet1.xml'), /GOOGLEFINANCE/u);
  for (const priceSource of ['unknown', '']) {
    const invalid = run(['-i', input, '-o', output, '--price-source', priceSource, '--force']);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Price source must be/u);
    assert.deepEqual(await readFile(output), original);
  }
  const csvOutput = join(directory, 'portfolio.csv');
  const invalid = run(['-i', input, '-o', csvOutput, '--price-source', 'googlefinance']);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /only available for XLSX/u);
  await assert.rejects(readFile(csvOutput), { code: 'ENOENT' });
});

test('CLI verifies before writing, requires explicit overwrite, and protects inputs and aliases', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'degiro-portfolio-test-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, 'portfolio.csv');
  const args = ['--input', input, '--output', output, '--verify', reference];
  const result = run(args);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /5 názvů produktů, 4 ISIN/u);
  const expected = await readFile(new URL('../examples/portfolio.csv', import.meta.url), 'utf8');
  assert.equal((await readFile(output, 'utf8')).replaceAll('\r\n', '\n'), expected);
  assert.equal(run(args).status, 1);
  assert.equal(run([...args, '--force']).status, 0);

  const brokenReference = join(directory, 'broken-reference.csv');
  await writeFile(brokenReference, 'Product,Quantity\nDemo Equity,999\n');
  const invalidResult = run(['-i', input, '-o', output, '--verify', brokenReference, '--force']);
  assert.equal(invalidResult.status, 1);
  assert.match(invalidResult.stderr, /mismatch/u);
  assert.equal((await readFile(output, 'utf8')).replaceAll('\r\n', '\n'), expected);

  const alias = join(directory, 'input-alias.csv');
  await symlink(input, alias);
  for (const destination of [input, alias, reference]) {
    const protectedResult = run(['-i', input, '-o', destination, '--verify', reference, '--force']);
    assert.equal(protectedResult.status, 1);
    assert.match(protectedResult.stderr, /must not overwrite/u);
  }
  const localInput = join(directory, 'input.csv');
  await writeFile(localInput, await readFile(input));
  const hardLink = join(directory, 'hard-link.csv');
  await link(localInput, hardLink);
  assert.match(run(['-i', localInput, '-o', hardLink, '--force']).stderr, /must not overwrite/u);
  assert.equal(run(['-i', join(directory, 'missing.csv'), '-o', output]).status, 1);
});
