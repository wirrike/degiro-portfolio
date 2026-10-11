import { compare, ZERO } from './decimal.js';
import { createGoogleFinanceFormulas, validatePriceSource } from './googlefinance.js';
import { selectReportPositions } from './report.js';
import { createTickerLookup } from './tickers.js';
import { excelNumber, formulaCell, numberCell, rowXml, textCell } from './xlsx-cells.js';
import { createXlsxPackage, WORKSHEET_NAMESPACE } from './xlsx-package.js';
import { XLSX_STYLE as STYLE } from './xlsx-styles.js';
import { xmlDocument } from './xml.js';

const MISSING = 'n.a.';
const FIRST_DATA_ROW = 6;

/** @param {readonly number[]} values @returns {number} */
const total = (values) => values.reduce((result, value) => result + value, 0);

/**
 * Render a dashboard inspired by the template's v4 layout, without copying its data.
 * Use Google Sheets market formulas by default, or editable EUR prices in manual mode.
 * Tickers may come from an explicit mapping, never a guess.
 * @param {import('./portfolio.js').Portfolio} portfolio
 * @param {{ includeClosed?: boolean, tickerMappings?: readonly import('./tickers.js').TickerMapping[], priceSource?: import('./googlefinance.js').PriceSource }} [options]
 * @returns {Buffer}
 */
export function createPortfolioXlsx(portfolio, { includeClosed = false, tickerMappings, priceSource } = {}) {
  const automatic = validatePriceSource(priceSource) === 'googlefinance';
  const positions = selectReportPositions(portfolio, { includeClosed });
  const tickers = createTickerLookup(tickerMappings);
  if (positions.length > 1_048_576 - FIRST_DATA_ROW + 1) throw new Error('Too many positions for an Excel worksheet.');
  const lastRow = FIRST_DATA_ROW + positions.length - 1;
  const numeric = positions.map((position) => ({
    quantity: excelNumber(position.quantity, true),
    costs: excelNumber(position.totalCostsEur), income: excelNumber(position.saleProceedsEur),
    basis: excelNumber(position.costBasisEur),
  }));
  const complete = numeric.every((position) => position.quantity === 0);
  const netCost = total(numeric.map((position) => position.costs - position.income));
  const cardColumns = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const labels = new Map([['F', 'Total Cost'], ['H', 'Total Value'], ['J', 'Total Gain/Loss']]);
  const cardValues = new Map([
    ['F', formulaCell('F3', positions.length ? `SUM(F6:F${lastRow})` : '0', netCost, STYLE.cardValue)],
    ['H', formulaCell('H3', positions.length ? `IF(COUNT(H6:H${lastRow})=ROWS(H6:H${lastRow}),SUM(H6:H${lastRow}),"${MISSING}")` : '0', complete ? 0 : MISSING, STYLE.cardValue)],
    ['J', formulaCell('J3', `IF(ISNUMBER(H3),H3-F3,"${MISSING}")`, complete ? -netCost : MISSING, STYLE.cardValue)],
  ]);
  const summary = [
    rowXml(1, [textCell('A1', 'Securities Portfolio Dashboard', STYLE.title),
      ...cardColumns.map((column) => textCell(`${column}1`, labels.get(column) ?? '', STYLE.cardLabel))], 24),
    rowXml(2, cardColumns.map((column) => textCell(`${column}2`, '', STYLE.cardLabel)), 12),
    rowXml(3, cardColumns.map((column) => cardValues.get(column) ?? textCell(`${column}3`, '', STYLE.cardLabel)), 25),
    rowXml(4, [textCell('A4', `${automatic ? 'Transactions through' : 'As of'} ${portfolio.asOf} (EUR)`, STYLE.context),
      textCell('E4', automatic ? 'Google Sheets: enter exchange-qualified tickers; live prices are converted to EUR.'
        : 'Ticker(s) and Current Price are editable. Enter prices in EUR.', STYLE.context),
      ...(automatic ? [textCell('S4', 'Market data: Google Finance (Google Sheets)', STYLE.context)] : [])], 23),
    rowXml(5, ['ISIN', 'Company', 'Ticker(s)', 'Quantity', 'Bought Price', 'Total Cost',
      'Current Price', 'Total Value', 'Total Return %', 'Gain/Loss', 'Allocation', '', '',
      'Total Purchases', 'Total Sale Income', 'Net Cash Flow', 'Cost Basis', 'Unrealised G/L',
      ...(automatic ? ['Quote Price', 'Quote Currency', 'Unit Factor', 'FX to EUR', 'Quote Time'] : []),
    ].map((heading, index) => heading ? textCell(`${String.fromCharCode(65 + index)}5`, heading, STYLE.header) : ''), 32),
  ];
  const rows = positions.map((position, index) => {
    const row = index + FIRST_DATA_ROW;
    const { quantity, costs, income, basis } = numeric[index];
    const closed = compare(position.quantity, ZERO) === 0;
    const invested = costs - income;
    const value = closed ? 0 : MISSING;
    const gain = closed ? -invested : MISSING;
    const prices = createGoogleFinanceFormulas(row);
    return rowXml(row, [
      textCell(`A${row}`, position.isin), textCell(`B${row}`, position.product),
      textCell(`C${row}`, tickers.get(position.isin) ?? '', STYLE.inputText), numberCell(`D${row}`, quantity, STYLE.quantity),
      formulaCell(`E${row}`, `IF(D${row}=0,0,Q${row}/D${row})`, closed ? 0 : basis / quantity),
      formulaCell(`F${row}`, `N${row}-O${row}`, invested),
      automatic ? formulaCell(`G${row}`, prices.priceEur, closed ? 0 : MISSING)
        : textCell(`G${row}`, '', STYLE.inputMoney),
      formulaCell(`H${row}`, `IF(D${row}=0,0,IF(AND(ISNUMBER(G${row}),G${row}>=0),D${row}*G${row},"${MISSING}"))`, value),
      formulaCell(`I${row}`, `IF(AND(ISNUMBER(J${row}),N${row}>0),J${row}/N${row},"${MISSING}")`, closed && costs > 0 ? -invested / costs : MISSING, STYLE.percentage),
      formulaCell(`J${row}`, `IF(ISNUMBER(H${row}),H${row}-F${row},"${MISSING}")`, gain),
      formulaCell(`K${row}`, `IF(ISNUMBER(L${row}),L${row},"")`, '', STYLE.allocation),
      formulaCell(`L${row}`, `IF(AND(ISNUMBER(H${row}),ISNUMBER($H$3),$H$3>0),H${row}/$H$3,"${MISSING}")`, MISSING, STYLE.percentage),
      numberCell(`N${row}`, costs), numberCell(`O${row}`, income),
      formulaCell(`P${row}`, `O${row}-N${row}`, -invested), numberCell(`Q${row}`, basis),
      formulaCell(`R${row}`, `IF(ISNUMBER(H${row}),H${row}-Q${row},"${MISSING}")`, closed ? 0 : MISSING),
      ...(automatic ? [
        formulaCell(`S${row}`, prices.quote, MISSING, STYLE.quote),
        formulaCell(`T${row}`, prices.currency, MISSING, STYLE.text),
        formulaCell(`U${row}`, prices.unitFactor, MISSING, STYLE.rate),
        formulaCell(`V${row}`, prices.fx, MISSING, STYLE.rate),
        formulaCell(`W${row}`, prices.quoteTime, MISSING, STYLE.timestamp),
      ] : []),
    ]);
  });
  const widths = [16, Math.min(65, positions.reduce((width, position) => Math.max(width, position.product.length + 2), 30)),
    Math.min(65, positions.reduce((width, position) => Math.max(width, (tickers.get(position.isin)?.length ?? 0) + 2), 16)),
    12, 15, 16, 15, 16, 16, 18, 12, 11, 3, 17, 18, 17, 17, 18,
    ...(automatic ? [16, 17, 13, 15, 24] : [])];
  const columns = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');
  const validation = !automatic && positions.length ? `<dataValidations count="1"><dataValidation type="decimal" operator="greaterThanOrEqual" allowBlank="1" showErrorMessage="1" errorTitle="Invalid EUR price" error="Enter a non-negative numeric price in EUR." sqref="G6:G${lastRow}"><formula1>0</formula1></dataValidation></dataValidations>` : '';
  const formats = positions.length ? `<conditionalFormatting sqref="I6:J${lastRow} P6:P${lastRow} R6:R${lastRow}"><cfRule type="cellIs" dxfId="0" priority="1" operator="greaterThan"><formula>0</formula></cfRule><cfRule type="cellIs" dxfId="1" priority="2" operator="lessThan"><formula>0</formula></cfRule></conditionalFormatting><conditionalFormatting sqref="J3"><cfRule type="cellIs" dxfId="0" priority="3" operator="greaterThan"><formula>0</formula></cfRule><cfRule type="cellIs" dxfId="1" priority="4" operator="lessThan"><formula>0</formula></cfRule></conditionalFormatting><conditionalFormatting sqref="K6:K${lastRow}"><cfRule type="dataBar" priority="5"><dataBar minLength="0" maxLength="100" showValue="0"><cfvo type="num" val="0"/><cfvo type="num" val="1"/><color rgb="FF338590"/></dataBar></cfRule></conditionalFormatting>` : '';
  const sheet = xmlDocument([
    `<worksheet xmlns="${WORKSHEET_NAMESPACE}"><dimension ref="A1:${automatic ? 'W' : 'R'}${Math.max(5, lastRow)}"/>`,
    '<sheetViews><sheetView workbookViewId="0" showGridLines="1"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A6" sqref="A6"/></sheetView></sheetViews>',
    `<sheetFormatPr defaultRowHeight="21"/><cols>${columns}</cols>`,
    `<sheetData>${summary.join('')}${rows.join('')}</sheetData>`,
    '<mergeCells count="3"><mergeCell ref="A1:C3"/><mergeCell ref="E4:L4"/><mergeCell ref="K5:L5"/></mergeCells>',
    formats,
    validation,
    '<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.25" footer="0.25"/>',
    '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>',
  ].join(''));
  return createXlsxPackage(sheet);
}
