import { compare, ZERO } from './decimal.js';
import { validatePriceSource } from './googlefinance.js';
import { calculatePortfolio } from './portfolio.js';
import { createPortfolioCsv, selectReportPositions } from './report.js';
import { createTickerLookup } from './tickers.js';
import { parseTransactions } from './transactions.js';
import { verifyQuantities } from './verification.js';
import { createPortfolioXlsx } from './xlsx.js';

/**
 * @typedef {Readonly<{
 *   format?: 'csv' | 'xlsx',
 *   includeClosed?: boolean,
 *   expectedQuantitiesCsv?: string,
 *   tickerMappings?: readonly import('./tickers.js').TickerMapping[],
 *   priceSource?: import('./googlefinance.js').PriceSource
 * }>} PortfolioReportOptions
 */
/**
 * @typedef {Readonly<{
 *   csv: string,
 *   xlsx: Buffer | null,
 *   portfolio: import('./portfolio.js').Portfolio,
 *   verification: Readonly<{ productCount: number, isinCount: number }> | null,
 *   openPositionCount: number,
 *   tickerCoverage: Readonly<{ mappedPositionCount: number, unmappedIsins: readonly string[] }> | null
 * }>} PortfolioReport
 */

/**
 * Parse a Transactions export, calculate positions, optionally verify and render them.
 * This pure function performs no I/O and does not access CLI arguments or process state.
 * @param {string} transactionsCsv
 * @param {PortfolioReportOptions} [options]
 * @returns {PortfolioReport}
 */
export function createPortfolioReport(transactionsCsv, {
  format = 'csv', includeClosed = false, expectedQuantitiesCsv, tickerMappings, priceSource,
} = {}) {
  if (format !== 'csv' && format !== 'xlsx') throw new Error('Output format must be csv or xlsx.');
  if (format !== 'xlsx' && priceSource !== undefined) throw new Error('Price source is only available for XLSX output.');
  const pricing = validatePriceSource(priceSource);
  const transactions = parseTransactions(transactionsCsv);
  const portfolio = calculatePortfolio(transactions);
  const verification = expectedQuantitiesCsv === undefined
    ? null
    : verifyQuantities(transactions, portfolio, expectedQuantitiesCsv);
  const tickers = createTickerLookup(tickerMappings);
  const positions = selectReportPositions(portfolio, { includeClosed });
  const unmappedIsins = positions.filter((position) => !tickers.has(position.isin)).map((position) => position.isin);
  return {
    csv: createPortfolioCsv(portfolio, { includeClosed, tickerMappings }),
    xlsx: format === 'xlsx' ? createPortfolioXlsx(portfolio, { includeClosed, tickerMappings, priceSource: pricing }) : null,
    portfolio,
    verification,
    openPositionCount: portfolio.positions.filter((position) => compare(position.quantity, ZERO) !== 0).length,
    tickerCoverage: tickerMappings === undefined ? null : {
      mappedPositionCount: positions.length - unmappedIsins.length, unmappedIsins,
    },
  };
}
