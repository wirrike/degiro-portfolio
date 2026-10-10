import { stringifyCsv } from './csv.js';
import { compare, formatDecimal, formatQuantity, ZERO } from './decimal.js';

/**
 * Protect human-readable CSV text against spreadsheet formula interpretation.
 * @param {string} text
 * @returns {string}
 */
const safeText = (text) => /^[\s\u0000-\u001f]*[=+@-]/u.test(text) ? `'${text}` : text;

/**
 * Select the same positions for every output format.
 * @param {import('./portfolio.js').Portfolio} portfolio
 * @param {{ includeClosed?: boolean }} [options]
 * @returns {import('./portfolio.js').Position[]}
 */
export const selectReportPositions = (portfolio, { includeClosed = false } = {}) => portfolio.positions.filter((position) => includeClosed
  || compare(position.quantity, ZERO) !== 0
  || compare(position.totalCostsEur, ZERO) !== 0
  || compare(position.saleProceedsEur, ZERO) !== 0);

/**
 * Render positions with holdings or lifetime transaction cash flows in EUR.
 * @param {import('./portfolio.js').Portfolio} portfolio
 * @param {{ includeClosed?: boolean }} [options]
 * @returns {string}
 */
export function createPortfolioCsv(portfolio, { includeClosed = false } = {}) {
  const positions = selectReportPositions(portfolio, { includeClosed });
  return stringifyCsv([
    [
      'Product', 'ISIN', 'Quantity', 'Average cost EUR', 'Cost basis EUR',
      'Total costs EUR', 'Total income EUR', 'Net cash flow EUR', 'Currency', 'As of', 'Cost basis method',
    ],
    ...positions.map((position) => [
      safeText(position.product), position.isin, formatQuantity(position.quantity),
      formatDecimal(position.averageCostEur, 6), formatDecimal(position.costBasisEur),
      formatDecimal(position.totalCostsEur), formatDecimal(position.saleProceedsEur), formatDecimal(position.netCashFlowEur),
      'EUR', portfolio.asOf, 'weighted-average',
    ]),
  ]);
}
