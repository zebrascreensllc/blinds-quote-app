import ExcelJS from 'exceljs';
import { computeRemoteLabels, buildRowExportFields } from './measurementUtils';

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
  const remoteLabels = computeRemoteLabels(rows);

  const workbook = new ExcelJS.Workbook();
  const sheetName = (sheet?.address || 'Measurements').replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 31) || 'Measurements';
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

  return workbook.xlsx.writeBuffer();
}
