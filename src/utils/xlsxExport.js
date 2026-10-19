import ExcelJS from 'exceljs';
import { computeRemoteLabels, buildRowExportFields, mergeSheetsForExport } from './measurementUtils';

const YELLOW = 'FFFFFF00';

const HEADERS = [
  { header: 'S No', key: 'sNo', width: 8 },
  { header: 'Client name', key: 'clientName', width: 14 },
  { header: 'LOCATION', key: 'location', width: 16 },
  { header: 'Comment', key: 'comment', width: 16 },
  { header: 'Manual/Smart', key: 'manualSmart', width: 18 },
  { header: 'Motor-type', key: 'motorType', width: 14 },
  { header: 'Remote', key: 'remote', width: 13 },
  { header: 'CASSETTE', key: 'cassette', width: 50 },
  { header: 'MOUNT', key: 'mount', width: 22 },
  { header: 'FABRIC MODEL', key: 'fabricNumber', width: 14 },
  { header: 'Width (Inches)', key: 'width', width: 14 },
  { header: 'Height (Inches)', key: 'height', width: 14 },
  { header: 'Blind Type', key: 'blindType', width: 12 }
];

/**
 * Builds a real .xlsx workbook (not CSV - CSV cannot hold cell color at all)
 * matching the supplier's reference format: same headers, same Comment
 * column, and the same yellow-highlight convention for anything that needs
 * a second look - a filled-in comment, a motor variant (Solar/Left side),
 * or a non-default mount. Returns a Buffer for the caller to wrap in a Blob
 * and trigger a download, same separation of concerns as sheetToCSV.
 */
export async function sheetToExcelBuffer(sheet, rows) {
  const sheetName = (sheet?.address || 'Measurements').replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 31) || 'Measurements';
  return buildWorkbookBuffer(sheetName, rows, (sheet?.hub || '').trim());
}

/**
 * One worksheet containing every selected sheet's windows back to back (see
 * mergeSheetsForExport for how remote groups and the hub count are merged),
 * in the same format and with the same highlighting as a single sheet.
 * Callers must validate each sheet first - this doesn't re-check.
 */
export async function combinedSheetsToExcelBuffer(sheets) {
  const { rows, hub } = mergeSheetsForExport(sheets);
  return buildWorkbookBuffer('Combined', rows, hub);
}

async function buildWorkbookBuffer(sheetName, rows, hubCount) {
  const remoteLabels = computeRemoteLabels(rows);

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(sheetName);
  ws.columns = HEADERS;
  ws.getRow(1).font = { bold: true };

  rows.forEach((row, idx) => {
    const f = buildRowExportFields(row, idx, remoteLabels);
    const excelRow = ws.addRow({
      sNo: f.sNo,
      clientName: f.clientName,
      location: f.location,
      comment: f.comment,
      manualSmart: f.manualSmart,
      motorType: f.motorType,
      remote: f.remote,
      cassette: f.cassette,
      mount: f.mount,
      fabricNumber: f.fabricNumber,
      width: f.width,
      height: f.height,
      blindType: f.blindType
    });

    const highlight = (key) => {
      excelRow.getCell(key).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
    };
    if (f.hasComment) highlight('comment');
    if (f.hasMotorVariant) highlight('manualSmart');
    if (f.hasNonDefaultMount) highlight('mount');
  });

  // ✅ NEW: Hub is one count for the whole order (a smart-home hub covers
  // many windows, it isn't per-window), so it's a single highlighted summary
  // row after every window - "HUB | 2" - not a column repeated on every row.
  if (hubCount) {
    const hubRow = ws.addRow({ clientName: 'HUB', location: hubCount });
    ['clientName', 'location'].forEach(key => {
      hubRow.getCell(key).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
      hubRow.getCell(key).font = { bold: true };
    });
  }

  return workbook.xlsx.writeBuffer();
}
