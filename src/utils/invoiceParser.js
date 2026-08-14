import ExcelJS from 'exceljs';

// Reads a cell's numeric value whether it's a literal number or a formula
// cell (ExcelJS returns { formula, result } for the latter - real invoice
// files from a supplier almost always have formula-driven subtotal rows).
function getNumericValue(cell) {
  const v = cell.value;
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && typeof v.result === 'number') return v.result;
  return null;
}

function getTextValue(cell) {
  const v = cell.value;
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
  return '';
}

// Finds the column index of the header cell whose text contains any of the
// given keywords, scanned from the first few rows (the header row's exact
// position isn't assumed, only that it's near the top).
function findHeaderColumn(worksheet, keywords, maxRow = 10) {
  const lastRow = Math.min(maxRow, worksheet.rowCount || maxRow);
  for (let r = 1; r <= lastRow; r++) {
    const row = worksheet.getRow(r);
    const lastCol = row.cellCount || 60;
    for (let c = 1; c <= lastCol; c++) {
      const text = getTextValue(row.getCell(c)).toLowerCase();
      if (keywords.some(k => text.includes(k))) return c;
    }
  }
  return null;
}

/**
 * Parses a supplier invoice .xlsx into { fabric, motor, solar, remote,
 * shipping }, or null if the layout isn't recognized (no "Amount" column
 * found, or no line items matched at all) - callers should fall back to
 * manual entry in that case, not show a wrong number.
 *
 * Deliberately deterministic, no AI/OCR: finds the "Amount" column by
 * header text, then classifies every row that has a numeric amount by
 * keywords in its own label - "motor"/"recharge" -> Motor, "solar" ->
 * Solar, "remote" -> Remote, "shipment"/"shipping" -> Shipping, summary
 * rows ("goods cost", "total payment", "grand total") are skipped, and
 * everything else with a numeric amount (i.e. the individual per-window
 * fabric line items) falls into Fabric by default. This avoids needing to
 * know how many window rows there are or where they start/end.
 */
export async function parseSupplierInvoiceExcel(file) {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return null;

  const amountCol = findHeaderColumn(worksheet, ['amount']);
  if (!amountCol) return null;

  const totals = { fabric: 0, motor: 0, solar: 0, remote: 0, shipping: 0 };
  let matchedAnyRow = false;

  worksheet.eachRow((row) => {
    const amount = getNumericValue(row.getCell(amountCol));
    if (amount === null || amount === 0) return;

    // Label = first non-empty text cell at/before the Amount column - for a
    // window row that's the fabric/description text; for a hardware row
    // (motor/solar/remote/shipping) it's that row's own name.
    let label = '';
    for (let c = 1; c <= amountCol; c++) {
      const text = getTextValue(row.getCell(c)).trim();
      if (text) { label = text.toLowerCase(); break; }
    }
    if (!label) return;

    if (label.includes('goods cost') || label.includes('total payment') || label.includes('grand total')) return;

    if (label.includes('shipment') || label.includes('shipping')) {
      totals.shipping += amount;
    } else if (label.includes('solar')) {
      totals.solar += amount;
    } else if (label.includes('remote')) {
      totals.remote += amount;
    } else if (label.includes('motor') || label.includes('recharge') || label.includes('charge')) {
      totals.motor += amount;
    } else {
      totals.fabric += amount;
    }
    matchedAnyRow = true;
  });

  return matchedAnyRow ? totals : null;
}
