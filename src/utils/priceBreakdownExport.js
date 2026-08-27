import ExcelJS from 'exceljs';
import { formatMoney } from './formatters';
import { buildInvoiceLineItems, computeInvoiceTotals } from './invoiceExport';

const HEADERS = [
  { header: 'Item No', key: 'itemNo', width: 8 },
  { header: 'Location', key: 'location', width: 18 },
  { header: 'Width (Inches)', key: 'width', width: 14 },
  { header: 'Height (Inches)', key: 'height', width: 14 },
  { header: 'Type', key: 'type', width: 16 },
  { header: 'Price', key: 'price', width: 12 }
];

/**
 * Builds a client-facing "here's the breakdown" Excel workbook - the same
 * per-window prices Copy/Share already communicate as text, but with
 * dimensions and one row per window instead of a room-level summary line,
 * for the occasional client who wants the detail spelled out. Reuses
 * buildInvoiceLineItems/computeInvoiceTotals so this can never disagree
 * with the invoice or Current Pricing on the same numbers.
 */
export async function generatePriceBreakdownExcel(quote) {
  const { items } = buildInvoiceLineItems(quote);
  const totals = computeInvoiceTotals(quote, items);

  const workbook = new ExcelJS.Workbook();
  const sheetName = (quote.clientName || 'Quote').replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 31) || 'Quote';
  const ws = workbook.addWorksheet(sheetName);
  ws.columns = HEADERS;
  ws.getRow(1).font = { bold: true };

  items.forEach((it, idx) => {
    const type = it.motorSmart === 'Smart' ? `Smart${it.solar ? ' + Solar' : ''}` : 'Manual';
    ws.addRow({
      itemNo: idx + 1,
      location: it.locationLabel,
      width: it.width,
      height: it.height,
      type,
      price: `$${formatMoney(it.unitPrice)}`
    });
  });

  // ✅ FIX: summary rows used to put the label under "Type" (column E) and
  // the value under "Price" (column F, the last one) - on a phone, most
  // spreadsheet apps only show the first 2-3 columns without scrolling
  // right, so every summary row (including Total) looked blank unless you
  // scrolled. Merging the row into one full-width cell with "Label: $Value"
  // combined means it's readable starting from column A, no scrolling
  // needed on any screen size.
  const summaryRow = (label, value, bold = false) => {
    const row = ws.addRow([]);
    ws.mergeCells(`A${row.number}:F${row.number}`);
    const cell = row.getCell(1);
    cell.value = `${label}: ${value}`;
    if (bold) cell.font = { bold: true };
    return row;
  };

  ws.addRow([]);
  if (totals.motorCount > 0) summaryRow(`Motor windows ${totals.motorCount} x $${formatMoney(totals.effectiveMotorCost)}`, `$${formatMoney(totals.motorGrandTotal)}`);
  if (totals.solarCount > 0) summaryRow(`Solar windows ${totals.solarCount} x $${formatMoney(totals.effectiveSolarCost)}`, `$${formatMoney(totals.solarGrandTotal)}`);
  if (quote.hub?.included) {
    const hubLabel = quote.hub.quantity > 1 ? `Hub ${quote.hub.quantity} x $${formatMoney(quote.hub.price)}` : 'Hub';
    summaryRow(hubLabel, totals.hubTotal === 0 ? 'Complimentary' : `$${formatMoney(totals.hubTotal)}`);
  }
  summaryRow('Total', `$${formatMoney(totals.total)}`, true);
  summaryRow(`Sales Tax ${formatMoney(totals.taxRate * 100)}%`, `$${formatMoney(totals.salesTax)}`);
  summaryRow('Grand Total', `$${formatMoney(totals.grandTotal)}`, true);

  return workbook.xlsx.writeBuffer();
}
