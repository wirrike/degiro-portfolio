import { stringifyCsv } from './csv.js';
import { compare, formatDecimal, formatQuantity, ZERO } from './decimal.js';

/**
 * Protect human-readable CSV text against spreadsheet formula interpretation.
 * @param {string} text
 * @returns {string}
 */
const safeText = (text) => /^[\s\u0000-\u001f]*[=+@-]/u.test(text) ? `'${text}` : text;

/**
 * Render one row per ISIN with EUR acquisition costs, never market valuations.
 * @param {import('./portfolio.js').Portfolio} portfolio
 * @param {{ includeClosed?: boolean }} [options]
 * @returns {string}
 */
export function createPortfolioCsv(portfolio, { includeClosed = false } = {}) {
  const positions = portfolio.positions.filter((position) => includeClosed || compare(position.quantity, ZERO) !== 0);
  return stringifyCsv([
    ['Product', 'ISIN', 'Quantity', 'Average cost EUR', 'Cost basis EUR', 'Currency', 'As of', 'Cost basis method'],
    ...positions.map((position) => [
      safeText(position.product), position.isin, formatQuantity(position.quantity),
      formatDecimal(position.averageCostEur, 6), formatDecimal(position.costBasisEur),
      'EUR', portfolio.asOf, 'weighted-average',
    ]),
  ]);
}
