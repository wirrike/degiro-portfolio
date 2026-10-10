import { xmlDocument } from './xml.js';

export const XLSX_STYLE = Object.freeze({
  text: 0, title: 1, cardLabel: 2, cardValue: 3, header: 4,
  quantity: 5, money: 6, percentage: 7, inputText: 8, inputMoney: 9,
  allocation: 10, context: 11,
});

/** @returns {string} */
export function createXlsxStyles() {
  const fonts = [
    '<sz val="10"/><color rgb="FF000000"/>',
    '<b/><sz val="16"/><color rgb="FF000000"/>',
    '<b/><sz val="12"/><color rgb="FF000000"/>',
    '<b/><sz val="10"/><color rgb="FFFFFFFF"/>',
    '<sz val="10"/><color rgb="FF0000FF"/>',
    '<i/><sz val="10"/><color rgb="FF666666"/>',
  ].map((content) => `<font>${content}<name val="Arial"/></font>`).join('');
  const fills = ['<patternFill patternType="none"/>', '<patternFill patternType="gray125"/>',
    ...['EFEFEF', '338590', 'FFF2CC'].map((color) => `<patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill>`),
  ].map((content) => `<fill>${content}</fill>`).join('');
  const styles = [
    [0, 0, 0, 'left'], [1, 0, 0, 'left'], [2, 2, 0, 'left'], [2, 2, 164, 'right'],
    [3, 3, 0, 'center'], [0, 0, 0, 'right'], [0, 0, 164, 'right'], [0, 0, 10, 'right'],
    [4, 4, 0, 'left'], [4, 4, 164, 'right'], [0, 0, 165, 'right'], [5, 0, 0, 'left'],
  ].map(([font, fill, format, alignment], index) => `<xf fontId="${font}" fillId="${fill}" borderId="0" numFmtId="${format}" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="${alignment}" vertical="center"${index === XLSX_STYLE.header ? ' wrapText="1"' : ''}/></xf>`).join('');
  return xmlDocument(`<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="[$€]#,##0.00"/><numFmt numFmtId="165" formatCode=";;;"/></numFmts><fonts count="6">${fonts}</fonts><fills count="5">${fills}</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf fontId="0" fillId="0" borderId="0" numFmtId="0"/></cellStyleXfs><cellXfs count="12">${styles}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="2"><dxf><font><color rgb="FF007356"/></font></dxf><dxf><font><color rgb="FFEA4335"/></font></dxf></dxfs></styleSheet>`);
}
