import { compare, ZERO } from './decimal.js';
import { calculatePortfolio } from './portfolio.js';
import { createPortfolioCsv } from './report.js';
import { parseTransactions } from './transactions.js';
import { verifyQuantities } from './verification.js';
import { createPortfolioXlsx } from './xlsx.js';

/**
 * @typedef {Readonly<{
 *   format?: 'csv' | 'xlsx',
 *   includeClosed?: boolean,
 *   expectedQuantitiesCsv?: string
 * }>} PortfolioReportOptions
 */
/**
 * @typedef {Readonly<{
 *   csv: string,
 *   xlsx: Buffer | null,
 *   portfolio: import('./portfolio.js').Portfolio,
 *   verification: Readonly<{ productCount: number, isinCount: number }> | null,
 *   openPositionCount: number
 * }>} PortfolioReport
 */

/**
 * Parse a Transactions export, calculate positions, optionally verify and render them.
 * This pure function performs no I/O and does not access CLI arguments or process state.
 * @param {string} transactionsCsv
 * @param {PortfolioReportOptions} [options]
 * @returns {PortfolioReport}
 */
export function createPortfolioReport(transactionsCsv, { format = 'csv', includeClosed = false, expectedQuantitiesCsv } = {}) {
  if (format !== 'csv' && format !== 'xlsx') throw new Error('Output format must be csv or xlsx.');
  const transactions = parseTransactions(transactionsCsv);
  const portfolio = calculatePortfolio(transactions);
  const verification = expectedQuantitiesCsv === undefined
    ? null
    : verifyQuantities(transactions, portfolio, expectedQuantitiesCsv);
  return {
    csv: createPortfolioCsv(portfolio, { includeClosed }),
    xlsx: format === 'xlsx' ? createPortfolioXlsx(portfolio, { includeClosed }) : null,
    portfolio,
    verification,
    openPositionCount: portfolio.positions.filter((position) => compare(position.quantity, ZERO) !== 0).length,
  };
}
