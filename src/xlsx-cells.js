import { formatDecimal, formatQuantity } from './decimal.js';
import { XLSX_STYLE as STYLE } from './xlsx-styles.js';
import { escapeXml } from './xml.js';

/**
 * Convert a rational to Excel's 15-significant-digit numeric representation.
 * Reject quantities that Excel would silently change.
 * @param {import('./decimal.js').Decimal} value
 * @param {boolean} [exact=false]
 * @returns {number}
 */
export function excelNumber(value, exact = false) {
  const text = exact ? formatQuantity(value) : formatDecimal(value, 18, true);
  if (exact && text.replace(/[-.]/gu, '').replace(/^0+/u, '').replace(/0+$/u, '').length > 15) {
    throw new Error('Quantity exceeds Excel\'s 15-significant-digit precision; use CSV to preserve it.');
  }
  const number = Number(Number(text).toPrecision(15));
  if (!Number.isFinite(number)) throw new Error('Value exceeds Excel numeric limits.');
  return number;
}

/** @param {string} address @param {string} value @param {number} [style] @returns {string} */
export const textCell = (address, value, style = STYLE.text) => {
  if (value.length > 32_767) throw new Error('Text exceeds Excel\'s 32767-character cell limit.');
  return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
};

/** @param {string} address @param {number} value @param {number} [style] @returns {string} */
export const numberCell = (address, value, style = STYLE.money) => `<c r="${address}" s="${style}"><v>${value}</v></c>`;

/** @param {string} address @param {string} formula @param {number | string} cached @param {number} [style] @returns {string} */
export const formulaCell = (address, formula, cached, style = STYLE.money) => `<c r="${address}" s="${style}"${typeof cached === 'string' ? ' t="str"' : ''}><f>${escapeXml(formula)}</f><v>${escapeXml(String(cached))}</v></c>`;

/** @param {number} row @param {readonly string[]} cells @param {number} [height=21] @returns {string} */
export const rowXml = (row, cells, height = 21) => `<row r="${row}" ht="${height}" customHeight="1">${cells.join('')}</row>`;
