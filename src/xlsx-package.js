import { createXlsxStyles } from './xlsx-styles.js';
import { xmlDocument } from './xml.js';
import { createZip } from './zip.js';

export const WORKSHEET_NAMESPACE = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

/**
 * Package one Portfolio worksheet and its styles as a recalculating XLSX workbook.
 * @param {string} sheet
 * @returns {Buffer}
 */
export function createXlsxPackage(sheet) {
  const types = xmlDocument([
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    '</Types>',
  ].join(''));
  const workbook = xmlDocument([
    `<workbook xmlns="${WORKSHEET_NAMESPACE}" xmlns:r="${REL_NS}">`,
    '<bookViews><workbookView/></bookViews>',
    '<sheets><sheet name="Portfolio" sheetId="1" r:id="rId1"/></sheets>',
    '<calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>',
    '</workbook>',
  ].join(''));
  return createZip([
    { name: '[Content_Types].xml', content: types },
    { name: '_rels/.rels', content: xmlDocument(`<Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: 'xl/workbook.xml', content: workbook },
    { name: 'xl/_rels/workbook.xml.rels', content: xmlDocument(`<Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rId1" Type="${REL_NS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL_NS}/styles" Target="styles.xml"/></Relationships>`) },
    { name: 'xl/styles.xml', content: createXlsxStyles() },
    { name: 'xl/worksheets/sheet1.xml', content: sheet },
  ]);
}
