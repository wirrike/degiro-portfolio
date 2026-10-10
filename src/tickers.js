import { columnIndexes, parseCsv, validateRowWidths } from './csv.js';

/** @typedef {Readonly<{ isin: string, ticker: string }>} TickerMapping */

/**
 * Validate explicit, exchange-qualified mappings without guessing security identities.
 * ISIN checksums and the existence of tickers are deliberately not verified.
 * @param {readonly TickerMapping[]} [mappings]
 * @returns {ReadonlyMap<string, string>}
 */
export function createTickerLookup(mappings = []) {
  if (!Array.isArray(mappings)) throw new Error('Ticker mappings must be an array.');
  /** @type {Map<string, string>} */
  const lookup = new Map();
  for (const [index, mapping] of mappings.entries()) {
    const label = `ticker mapping ${index + 1}`;
    if (!mapping || typeof mapping.isin !== 'string' || typeof mapping.ticker !== 'string') {
      throw new Error(`Each ${label} must contain string isin and ticker fields.`);
    }
    const isin = mapping.isin.trim().toUpperCase();
    const ticker = mapping.ticker.trim();
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/u.test(isin)) throw new Error(`Invalid ISIN in ${label}: ${isin}.`);
    if (!/^[A-Z0-9][A-Z0-9._-]*:[A-Z0-9][A-Z0-9._/-]*$/iu.test(ticker)) {
      throw new Error(`Invalid ticker in ${label}: use an exchange-qualified symbol such as NASDAQ:NVDA.`);
    }
    if (lookup.has(isin)) throw new Error(`Duplicate ticker mapping for ISIN ${isin}. Choose one listing explicitly.`);
    lookup.set(isin, ticker);
  }
  return lookup;
}

/**
 * Parse a CSV with ISIN,Ticker columns or a JSON array of { isin, ticker } objects.
 * Return normalized, unique mappings without I/O or modifying caller-owned data.
 * @param {string} input
 * @param {{ format?: 'csv' | 'json' }} [options]
 * @returns {TickerMapping[]}
 */
export function parseTickerMappings(input, { format = 'csv' } = {}) {
  let mappings;
  if (format === 'csv') {
    const records = parseCsv(input);
    const columns = columnIndexes(records, ['ISIN', 'Ticker']);
    validateRowWidths(records);
    mappings = records.slice(1).map(({ cells }) => ({ isin: cells[columns.ISIN], ticker: cells[columns.Ticker] }));
  } else if (format === 'json') {
    try {
      mappings = JSON.parse(input.replace(/^\uFEFF/u, ''));
    } catch (error) {
      throw new Error('Invalid ticker mapping JSON.', { cause: error });
    }
  } else {
    throw new Error('Ticker mapping format must be csv or json.');
  }
  return [...createTickerLookup(mappings)].map(([isin, ticker]) => ({ isin, ticker }));
}
