/** @typedef {Readonly<{ numerator: bigint, denominator: bigint }>} Decimal */

/** @type {Decimal} */
export const ZERO = Object.freeze({ numerator: 0n, denominator: 1n });

/**
 * Reduce an exact rational number to its canonical representation.
 * @param {bigint} numerator
 * @param {bigint} [denominator=1n]
 * @returns {Decimal}
 */
export function decimal(numerator, denominator = 1n) {
  if (denominator === 0n) throw new Error('Division by zero.');
  if (numerator === 0n) return ZERO;
  const sign = denominator < 0n ? -1n : 1n;
  let a = numerator < 0n ? -numerator : numerator;
  let b = denominator < 0n ? -denominator : denominator;
  while (b !== 0n) [a, b] = [b, a % b];
  return { numerator: numerator / a * sign, denominator: denominator / a * sign };
}

/**
 * Parse a decimal without passing through binary floating point.
 * @param {string} text
 * @param {{ separator?: ',' | '.', label?: string }} [options]
 * @returns {Decimal}
 */
export function parseDecimal(text, { separator = ',', label = 'number' } = {}) {
  const value = text.trim();
  const pattern = separator === ','
    ? /^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/u
    : /^[+-]?\d+(?:\.\d+)?$/u;
  if (!pattern.test(value) || value.length > 100) {
    throw new Error(`Invalid ${label}: ${JSON.stringify(text)}.`);
  }
  const normalized = separator === ',' ? value.replaceAll('.', '').replace(',', '.') : value;
  const [whole, fraction = ''] = normalized.replace(/^[+-]/u, '').split('.');
  if (fraction.length > 18) throw new Error(`Too many decimal places in ${label} (maximum 18).`);
  return decimal(BigInt(whole + fraction) * (value.startsWith('-') ? -1n : 1n), 10n ** BigInt(fraction.length));
}

/** @param {Decimal} a @param {Decimal} b @returns {Decimal} */
export const add = (a, b) => decimal(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator);

/** @param {Decimal} a @returns {Decimal} */
export const negate = (a) => decimal(-a.numerator, a.denominator);

/** @param {Decimal} a @param {Decimal} b @returns {Decimal} */
export const subtract = (a, b) => add(a, negate(b));

/** @param {Decimal} a @param {Decimal} b @returns {Decimal} */
export const multiply = (a, b) => decimal(a.numerator * b.numerator, a.denominator * b.denominator);

/** @param {Decimal} a @param {Decimal} b @returns {Decimal} */
export const divide = (a, b) => decimal(a.numerator * b.denominator, a.denominator * b.numerator);

/** @param {Decimal} a @param {Decimal} b @returns {number} */
export const compare = (a, b) => {
  const difference = a.numerator * b.denominator - b.numerator * a.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
};

/** @param {readonly Decimal[]} values @returns {Decimal} */
export const sum = (values) => values.reduce(add, ZERO);

/**
 * Round half away from zero only when formatting the final result.
 * @param {Decimal} value
 * @param {number} [places=2]
 * @param {boolean} [trim=false]
 * @returns {string}
 */
export function formatDecimal(value, places = 2, trim = false) {
  if (!Number.isInteger(places) || places < 0 || places > 18) throw new Error('Invalid decimal precision.');
  const magnitude = value.numerator < 0n ? -value.numerator : value.numerator;
  const scaled = magnitude * 10n ** BigInt(places);
  const rounded = scaled / value.denominator + (scaled % value.denominator * 2n >= value.denominator ? 1n : 0n);
  const digits = rounded.toString().padStart(places + 1, '0');
  const result = places === 0 ? digits : `${digits.slice(0, -places)}.${digits.slice(-places)}`;
  const signed = value.numerator < 0n && rounded !== 0n ? `-${result}` : result;
  return trim && places > 0 ? signed.replace(/\.?0+$/u, '') : signed;
}

/** @param {Decimal} quantity @returns {string} */
export const formatQuantity = (quantity) => formatDecimal(quantity, 18, true);
