import assert from 'node:assert/strict';
import test from 'node:test';
import { add, compare, decimal, divide, formatDecimal, formatQuantity, multiply, negate, parseDecimal, subtract, sum, ZERO } from '../src/decimal.js';

test('decimal arithmetic is exact, including values beyond Number.MAX_SAFE_INTEGER', () => {
  assert.deepEqual(add(parseDecimal('0,1'), parseDecimal('0,2')), parseDecimal('0,3'));
  assert.equal(formatQuantity(parseDecimal('9007199254740993,000000000000000001')), '9007199254740993.000000000000000001');
  assert.deepEqual(parseDecimal('-1.234.567,8900'), decimal(-123456789n, 100n));
  assert.equal(formatQuantity(parseDecimal('1000')), '1000');
  assert.equal(formatQuantity(parseDecimal('-0,00')), '0');
  assert.deepEqual(parseDecimal('+12.5', { separator: '.' }), decimal(25n, 2n));
  assert.deepEqual(decimal(2n, -4n), decimal(-1n, 2n));
  assert.deepEqual(subtract(decimal(5n), decimal(3n)), decimal(2n));
  assert.deepEqual(multiply(decimal(2n, 3n), decimal(3n, 4n)), decimal(1n, 2n));
  assert.deepEqual(negate(decimal(2n)), decimal(-2n));
  assert.equal(compare(decimal(1n), decimal(2n)), -1);
  assert.equal(compare(decimal(2n), decimal(1n)), 1);
  assert.deepEqual(sum([]), ZERO);
});

test('rounding happens only on output and uses half away from zero', () => {
  assert.equal(formatDecimal(parseDecimal('1,005')), '1.01');
  assert.equal(formatDecimal(parseDecimal('-1,005')), '-1.01');
  assert.equal(formatDecimal(parseDecimal('-0,004')), '0.00');
  assert.equal(formatDecimal(decimal(2n, 3n), 6), '0.666667');
  assert.equal(formatDecimal(parseDecimal('99,999')), '100.00');
  assert.equal(formatDecimal(parseDecimal('9,5'), 0), '10');
  assert.deepEqual(multiply(divide(decimal(1n), decimal(3n)), decimal(3n)), decimal(1n));
});

test('malformed, ambiguous and excessively precise numbers are rejected', () => {
  for (const value of ['', 'NaN', 'Infinity', '1e2', '1,2junk', '1.5', '1.23,4', '1,000.50', '1 234,5']) {
    assert.throws(() => parseDecimal(value), /Invalid/u);
  }
  assert.throws(() => parseDecimal('0,0000000000000000001'), /Too many/u);
  assert.throws(() => parseDecimal('1'.repeat(101)), /Invalid/u);
  assert.throws(() => divide(decimal(1n), ZERO), /Division by zero/u);
  assert.throws(() => formatDecimal(ZERO, -1), /precision/u);
});
