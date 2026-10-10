import { stringifyCsv } from './csv.js';
import { compare, formatDecimal, formatQuantity, ZERO } from './decimal.js';

/**
 * Protect human-readable CSV text against spreadsheet formula interpretation.
 * @param {string} text
 * @returns {string}
 */
const safeText = (text) => /^[\s\u0000-\u001f]*[=+@-]/u.test(text) ? `'${text}` : text;

/**
 * Render open positions and positions with non-zero cumulative net sale proceeds in EUR.
 * @param {import('./portfolio.js').Portfolio} portfolio
 * @param {{ includeClosed?: boolean }} [options]
 * @returns {string}
 */
export function createPortfolioCsv(portfolio, { includeClosed = false } = {}) {
  const positions = portfolio.positions.filter((position) => includeClosed
    || compare(position.quantity, ZERO) !== 0
    || compare(position.saleProceedsEur, ZERO) !== 0);
  return stringifyCsv([
    ['Product', 'ISIN', 'Quantity', 'Average cost EUR', 'Cost basis EUR', 'Sale proceeds EUR', 'Currency', 'As of', 'Cost basis method'],
    ...positions.map((position) => [
      safeText(position.product), position.isin, formatQuantity(position.quantity),
      formatDecimal(position.averageCostEur, 6), formatDecimal(position.costBasisEur),
      formatDecimal(position.saleProceedsEur),
      'EUR', portfolio.asOf, 'weighted-average',
    ]),
  ]);
}
