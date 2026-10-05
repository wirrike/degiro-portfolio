import { columnIndexes, parseCsv, validateRowWidths } from './csv.js';
import { compare, parseDecimal, ZERO } from './decimal.js';

/** @typedef {import('./decimal.js').Decimal} Decimal */
/**
 * @typedef {Readonly<{
 *   product: string,
 *   isin: string,
 *   venue: string,
 *   quantity: Decimal,
 *   valueEur: Decimal,
 *   totalEur: Decimal,
 *   timestamp: string,
 *   line: number
 * }>} Transaction
 */

const REQUIRED_COLUMNS = ['Date', 'Time', 'Product', 'ISIN', 'Venue', 'Quantity', 'Value EUR', 'Total EUR'];

/**
 * Parse and validate a timezone-free DEGIRO local date and time.
 * @param {string} date
 * @param {string} time
 * @param {number} line
 * @returns {string}
 */
function parseTimestamp(date, time, line) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/u.exec(date);
  if (!match || !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(time)) {
    throw new Error(`Invalid Date or Time at line ${line}. Expected DD-MM-YYYY and HH:mm.`);
  }
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) {
    throw new Error(`Invalid calendar date at line ${line}: ${date}.`);
  }
  return `${iso}T${time}`;
}

/**
 * Read the English DEGIRO Transactions export with European decimal notation.
 * @param {string} csv
 * @returns {Transaction[]}
 */
export function parseTransactions(csv) {
  const records = parseCsv(csv);
  const columns = columnIndexes(records, REQUIRED_COLUMNS);
  validateRowWidths(records);
  if (records.length === 1) throw new Error('The transaction export contains no transactions.');
  return records.slice(1).map(({ cells, line }) => {
    /** @param {string} name @returns {string} */
    const field = (name) => cells[columns[name]].trim();
    /** @param {string} name @returns {Decimal} */
    const number = (name) => parseDecimal(field(name), { label: `${name} at line ${line}` });
    const product = field('Product');
    const isin = field('ISIN');
    if (!product) throw new Error(`Empty Product at line ${line}.`);
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/u.test(isin)) throw new Error(`Invalid ISIN at line ${line}: ${isin}.`);
    const quantity = number('Quantity');
    const valueEur = number('Value EUR');
    const totalEur = number('Total EUR');
    if (compare(quantity, ZERO) * compare(valueEur, ZERO) > 0) {
      throw new Error(`Quantity and Value EUR have inconsistent signs at line ${line}.`);
    }
    if (compare(quantity, ZERO) === 0 && (compare(valueEur, ZERO) !== 0 || compare(totalEur, ZERO) !== 0)) {
      throw new Error(`A zero-quantity row has a non-zero amount at line ${line}.`);
    }
    return {
      product, isin, quantity, valueEur, totalEur, line,
      venue: field('Venue'),
      timestamp: parseTimestamp(field('Date'), field('Time'), line),
    };
  });
}
