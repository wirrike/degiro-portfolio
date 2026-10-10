import { add, compare, divide, multiply, negate, subtract, sum, ZERO } from './decimal.js';

/** @typedef {import('./transactions.js').Transaction} Transaction */
/** @typedef {import('./decimal.js').Decimal} Decimal */
/**
 * @typedef {Readonly<{
 *   product: string,
 *   isin: string,
 *   quantity: Decimal,
 *   costBasisEur: Decimal,
 *   averageCostEur: Decimal,
 *   totalCostsEur: Decimal,
 *   saleProceedsEur: Decimal,
 *   netCashFlowEur: Decimal
 * }>} Position
 */
/** @typedef {Readonly<{ asOf: string, positions: readonly Position[], corporateActionCount: number }>} Portfolio */

/**
 * Recognize a cash-neutral administrative rebooking within one ISIN and minute.
 * @param {readonly Transaction[]} transactions
 * @returns {boolean}
 */
function isCorporateAction(transactions) {
  return transactions.some((row) => compare(row.quantity, ZERO) > 0)
    && transactions.some((row) => compare(row.quantity, ZERO) < 0)
    && transactions.every((row) => row.venue === '' && compare(row.valueEur, row.totalEur) === 0)
    && compare(sum(transactions.map((row) => row.totalEur)), ZERO) === 0;
}

/**
 * Apply a timestamp group without mutating the previous position or input rows.
 * @param {Position} position
 * @param {readonly Transaction[]} rows
 * @param {boolean} corporateAction
 * @returns {Position}
 */
function applyGroup(position, rows, corporateAction) {
  const buys = rows.filter((row) => compare(row.quantity, ZERO) > 0);
  const sells = rows.filter((row) => compare(row.quantity, ZERO) < 0);
  const incoming = sum(buys.map((row) => row.quantity));
  const outgoing = negate(sum(sells.map((row) => row.quantity)));
  const context = `${position.isin} at ${rows[0].timestamp} (CSV lines ${rows.map((row) => row.line).join(', ')})`;
  if (compare(outgoing, position.quantity) > 0) {
    throw new Error(`Insufficient holdings for ${context}. Provide the complete history; short positions are unsupported.`);
  }
  if (!corporateAction && buys.length > 0 && sells.length > 0) {
    throw new Error(`Ambiguous buy/sell order for ${context}. Minute-level timestamps do not establish execution order.`);
  }
  if (!corporateAction && rows.some((row) => compare(row.quantity, ZERO) !== 0 && compare(row.valueEur, ZERO) === 0)) {
    throw new Error(`Unpaired zero-value movement for ${context}. Its cost basis cannot be inferred.`);
  }
  const quantity = subtract(add(position.quantity, incoming), outgoing);
  const purchaseCost = negate(sum(buys.map((row) => row.totalEur)));
  if (!corporateAction && compare(purchaseCost, ZERO) < 0) throw new Error(`Negative purchase cost for ${context}.`);

  // Při splitu či přejmenování se mění počet nebo název, nikoliv pořizovací hodnota.
  const costBasisEur = corporateAction
    ? position.costBasisEur
    : buys.length > 0
      ? add(position.costBasisEur, purchaseCost)
      : compare(position.quantity, ZERO) === 0
        ? ZERO
        : multiply(position.costBasisEur, divide(quantity, position.quantity));
  // Celkové peněžní toky zachováváme i po uzavření; administrativní převody je nemění.
  const totalCostsEur = corporateAction
    ? position.totalCostsEur
    : add(position.totalCostsEur, purchaseCost);
  const saleProceedsEur = corporateAction
    ? position.saleProceedsEur
    : add(position.saleProceedsEur, sum(sells.map((row) => row.totalEur)));
  const names = (buys.length > 0 ? buys : rows).map((row) => row.product).sort();
  return {
    ...position,
    product: names.at(-1) ?? position.product,
    quantity,
    costBasisEur,
    averageCostEur: compare(quantity, ZERO) === 0 ? ZERO : divide(costBasisEur, quantity),
    totalCostsEur,
    saleProceedsEur,
    netCashFlowEur: subtract(saleProceedsEur, totalCostsEur),
  };
}

/**
 * Compute long positions, weighted-average costs and lifetime transaction cash flows.
 * All positions, including closed ones, are retained for independent validation.
 * @param {readonly Transaction[]} transactions
 * @returns {Portfolio}
 */
export function calculatePortfolio(transactions) {
  if (transactions.length === 0) throw new Error('No transactions to calculate.');
  const chronological = transactions.toSorted((a, b) => a.timestamp.localeCompare(b.timestamp) || a.isin.localeCompare(b.isin));
  const groups = Map.groupBy(chronological, (row) => `${row.timestamp}/${row.isin}`);
  /** @type {Map<string, Position>} */
  const positions = new Map();
  let corporateActionCount = 0;
  for (const rows of groups.values()) {
    const { isin, product } = rows[0];
    const previous = positions.get(isin) ?? {
      isin, product, quantity: ZERO, costBasisEur: ZERO, averageCostEur: ZERO,
      totalCostsEur: ZERO, saleProceedsEur: ZERO, netCashFlowEur: ZERO,
    };
    const corporateAction = isCorporateAction(rows);
    if (corporateAction) corporateActionCount += 1;
    positions.set(isin, applyGroup(previous, rows, corporateAction));
  }
  return {
    asOf: chronological.at(-1).timestamp.slice(0, 10),
    positions: [...positions.values()].sort((a, b) => a.product.localeCompare(b.product, 'en', { numeric: true }) || a.isin.localeCompare(b.isin)),
    corporateActionCount,
  };
}
