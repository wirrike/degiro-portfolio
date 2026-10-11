/** @typedef {'googlefinance' | 'manual'} PriceSource */

/**
 * Validate the pricing mode without performing any network requests.
 * @param {PriceSource} [priceSource]
 * @returns {PriceSource}
 */
export function validatePriceSource(priceSource = 'googlefinance') {
  if (priceSource !== 'googlefinance' && priceSource !== 'manual') {
    throw new Error('Price source must be googlefinance or manual.');
  }
  return priceSource;
}

/**
 * Build Google Sheets formulas; all references point to the same position row.
 * Missing tickers and closed positions do not request market data.
 * Provider errors remain visible, never converted into zero-valued quotes.
 * @param {number} row
 * @returns {Readonly<{ priceEur: string, quote: string, currency: string, unitFactor: string, fx: string, quoteTime: string }>}
 */
export function createGoogleFinanceFormulas(row) {
  const ticker = `C${row}`;
  const currency = `T${row}`;
  // EXACT odlišuje britské pence GBp od liber GBP; běžné porovnání velikost písmen nerozlišuje.
  const pence = `OR(EXACT(${currency},"GBX"),EXACT(${currency},"GBp"))`;
  /** @param {string} expression @returns {string} */
  const guarded = (expression) => `IF(D${row}=0,"n.a.",IF(${ticker}="","n.a.",${expression}))`;
  return {
    priceEur: `IF(D${row}=0,0,IF(${ticker}="","n.a.",S${row}*U${row}*V${row}))`,
    quote: guarded(`GOOGLEFINANCE(${ticker},"price")`),
    currency: guarded(`GOOGLEFINANCE(${ticker},"currency")`),
    unitFactor: guarded(`IF(${pence},0.01,1)`),
    fx: guarded(`IF(${currency}="EUR",1,GOOGLEFINANCE("CURRENCY:"&IF(${pence},"GBP",${currency})&"EUR","price"))`),
    quoteTime: guarded(`GOOGLEFINANCE(${ticker},"tradetime")`),
  };
}
