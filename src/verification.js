import { columnIndexes, parseCsv, validateRowWidths } from './csv.js';
import { add, compare, formatQuantity, parseDecimal, ZERO } from './decimal.js';

/** @typedef {import('./decimal.js').Decimal} Decimal */
/**
 * Verify every reference product and then the actual calculated ISIN positions.
 * @param {readonly import('./transactions.js').Transaction[]} transactions
 * @param {import('./portfolio.js').Portfolio} portfolio
 * @param {string} expectedCsv
 * @returns {{ productCount: number, isinCount: number }}
 */
export function verifyQuantities(transactions, portfolio, expectedCsv) {
  const records = parseCsv(expectedCsv);
  const columns = columnIndexes(records, ['Product', 'Quantity']);
  validateRowWidths(records);
  /** @type {Map<string, { isin: string, quantity: Decimal }>} */
  const actualProducts = new Map();
  for (const row of transactions) {
    const previous = actualProducts.get(row.product);
    if (previous && previous.isin !== row.isin) {
      throw new Error(`Reference Product is ambiguous across ISINs: ${row.product}.`);
    }
    actualProducts.set(row.product, { isin: row.isin, quantity: add(previous?.quantity ?? ZERO, row.quantity) });
  }
  /** @type {Map<string, Decimal>} */
  const expectedProducts = new Map();
  /** @type {Map<string, Decimal>} */
  const expectedIsins = new Map();
  for (const { cells, line } of records.slice(1)) {
    const product = cells[columns.Product].trim();
    const expected = parseDecimal(cells[columns.Quantity], { separator: '.', label: `reference Quantity at line ${line}` });
    if (expectedProducts.has(product)) throw new Error(`Duplicate reference Product: ${product}.`);
    expectedProducts.set(product, expected);
    const actual = actualProducts.get(product);
    if (!actual) throw new Error(`Reference Product is absent from transactions: ${product}.`);
    if (compare(actual.quantity, expected) !== 0) {
      throw new Error(`Quantity mismatch for ${product}: expected ${formatQuantity(expected)}, got ${formatQuantity(actual.quantity)}.`);
    }
    expectedIsins.set(actual.isin, add(expectedIsins.get(actual.isin) ?? ZERO, expected));
  }
  for (const product of actualProducts.keys()) {
    if (!expectedProducts.has(product)) throw new Error(`Missing reference Product: ${product}.`);
  }
  const actualIsins = new Map(portfolio.positions.map((position) => [position.isin, position.quantity]));
  for (const [isin, expected] of expectedIsins) {
    const actual = actualIsins.get(isin);
    if (!actual || compare(actual, expected) !== 0) throw new Error(`Calculated portfolio quantity mismatch for ISIN ${isin}.`);
  }
  for (const isin of actualIsins.keys()) {
    if (!expectedIsins.has(isin)) throw new Error(`Unexpected portfolio ISIN: ${isin}.`);
  }
  return { productCount: expectedProducts.size, isinCount: expectedIsins.size };
}
