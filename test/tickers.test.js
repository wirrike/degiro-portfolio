import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseTickerMappings } from 'degiro-portfolio';
import { createTickerLookup } from '../src/tickers.js';

test('CSV and JSON ticker mappings normalize keys and preserve exchange-qualified symbols', async () => {
  const csv = await readFile(new URL('../examples/tickers.csv', import.meta.url), 'utf8');
  const json = await readFile(new URL('../examples/tickers.json', import.meta.url), 'utf8');
  const expected = parseTickerMappings(csv);
  assert.deepEqual(parseTickerMappings(json, { format: 'json' }), expected);
  assert.deepEqual(parseTickerMappings('\uFEFFTicker,Note,ISIN\r\n" NASDAQ:BRK.B ","a,b", us0000000001 \r\n'), [
    { isin: 'US0000000001', ticker: 'NASDAQ:BRK.B' },
  ]);
  assert.deepEqual(parseTickerMappings('\uFEFF[]', { format: 'json' }), []);
  assert.deepEqual(parseTickerMappings('ISIN,Ticker\n'), []);
  assert.deepEqual([...createTickerLookup()], []);
  for (const ticker of ['LON:0ABC', 'NYSE:BRK-B', 'XDEM:ABC/DEF', 'nasdaq:DEMO']) {
    assert.equal(createTickerLookup([{ isin: 'US0000000001', ticker }]).get('US0000000001'), ticker);
  }
});

test('ticker mappings reject malformed input, blank symbols and duplicate ISINs instead of guessing', () => {
  assert.throws(() => parseTickerMappings(''), /CSV is empty/u);
  assert.throws(() => parseTickerMappings('ISIN,Symbol\n'), /Missing CSV column: Ticker/u);
  assert.throws(() => parseTickerMappings('ISIN,Ticker,Ticker\n'), /Duplicate CSV column/u);
  assert.throws(() => parseTickerMappings('ISIN,Ticker\nUS0000000001,XDEM:DEMO,extra\n'), /number of CSV fields/u);
  assert.throws(() => parseTickerMappings('ISIN,Ticker\n"unfinished'), /Unclosed CSV/u);
  assert.throws(() => parseTickerMappings('not JSON', { format: 'json' }), /Invalid ticker mapping JSON/u);
  assert.throws(() => parseTickerMappings('[]', { format: 'xml' }), /format must be csv or json/u);
  for (const value of ['{}', 'null', '123', '[null]', '[{}]', '[{"isin":123,"ticker":"XDEM:DEMO"}]']) {
    assert.throws(() => parseTickerMappings(value, { format: 'json' }), /must be an array|must contain string/u);
  }
  assert.throws(() => createTickerLookup([{ isin: 'wrong', ticker: 'XDEM:DEMO' }]), /Invalid ISIN/u);
  for (const ticker of ['', 'DEMO', 'XDEM:', ':DEMO', '=1+2', 'XDEM:DEMO\nOTHER', 'XDEM:DEMO,OTHER', 'XDEM:DEMO+OTHER']) {
    assert.throws(() => createTickerLookup([{ isin: 'US0000000001', ticker }]), /Invalid ticker/u);
  }
  for (const second of ['XDEM:DEMO', 'LON:OTHER']) {
    assert.throws(() => createTickerLookup([
      { isin: ' US0000000001 ', ticker: 'XDEM:DEMO' },
      { isin: 'us0000000001', ticker: second },
    ]), /Duplicate ticker mapping.*Choose one listing/u);
  }
});

test('ticker validation returns a fresh lookup and does not mutate explicit mappings', () => {
  const mappings = Object.freeze([Object.freeze({ isin: ' us0000000001 ', ticker: ' XDEM:DEMO ' })]);
  assert.equal(createTickerLookup(mappings).get('US0000000001'), 'XDEM:DEMO');
  assert.deepEqual(mappings, [{ isin: ' us0000000001 ', ticker: ' XDEM:DEMO ' }]);
});
