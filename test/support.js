import { stringifyCsv } from '../src/csv.js';

/**
 * Build an English transaction export with deliberately non-authoritative FX data.
 * @param {readonly Record<string, string>[]} rows
 * @returns {string}
 */
export function transactionCsv(rows) {
  const header = ['Date', 'Time', 'Product', 'ISIN', 'Venue', 'Quantity', 'Value EUR', 'Total EUR', 'Price', 'Exchange rate', 'AutoFX Fee', 'Order ID'];
  const defaults = {
    Date: '01-01-2024', Time: '10:00', Product: 'Example', ISIN: 'US0000000001',
    Venue: 'XDEM', Quantity: '1', 'Value EUR': '-10,00', 'Total EUR': '-11,00',
    Price: '999,9999', 'Exchange rate': '888,88', 'AutoFX Fee': '-7,77', 'Order ID': 'same-order',
  };
  return stringifyCsv([header, ...rows.map((row) => {
    const values = { ...defaults, ...row };
    return header.map((column) => values[column]);
  })]);
}
