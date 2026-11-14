import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  AlignmentType, WidthType, BorderStyle, VerticalAlign, ShadingType, HeadingLevel
} from 'docx';
import { PRICING_DATA } from '../data/pricingData';
import { SALES_TAX_RATE } from './constants';
import { calculateGroupQuote, getBlindTypeFromFabric, getHubTotal, estimateBlindTypes } from './pricing';
import { formatMoney } from './formatters';
import { INVOICE_BUSINESS, TERMS_AND_CONDITIONS, WARRANTY_SUMMARY, WARRANTY_SECTIONS } from './invoiceContent';
import zebraLogoUrl from '../assets/zebra-logo.png';

const isRangeOverride = (v) => v !== null && typeof v === 'object' && typeof v.min === 'number' && typeof v.max === 'number';

/**
 * Expands a quote's rooms/windowGroups into one line item PER WINDOW (same
 * "expand every window as its own row" approach as Supplier Measurements'
 * expandQuoteIntoRows, kept separate here since this needs the price/motor
 * fields Supplier Measurements deliberately never touches - see
 * measurementUtils.js's isolation note). Unit price is each window's
 * effective per-window price EXCLUDING motor/solar margin (baseMinQuote or
 * its saved override) - same "shown separately, never swallowed into one
 * number" rule the rest of the app already follows for Motor/Solar.
 *
 * Returns { items, hasRangePricing } - hasRangePricing is true if any
 * window still has no exact fabric/price resolved, so the caller can warn
 * before generating a client-facing invoice with an estimate still baked in.
 */
export function buildInvoiceLineItems(quote) {
  const storedPricing = quote.pricing || null;
  const fabricData = storedPricing?.PRICING_DATA || PRICING_DATA;
  const items = [];
  let hasRangePricing = false;

  (quote.rooms || []).forEach(room => {
    const fabricNumbers = (room.fabricInput || '').split(',').map(f => f.trim()).filter(f => f);
    let actualBlindType = (room.blindTypes || ['Roller'])[0];
    if (fabricNumbers.length > 0) {
      for (const fabricNum of fabricNumbers) {
        const detectedType = getBlindTypeFromFabric(fabricNum, fabricData);
        if (detectedType) { actualBlindType = detectedType; break; }
      }
    }
    const motorizedCount = room.windowGroups.filter(w => w.controlType === 'Motor').length;

    room.windowGroups.forEach((group, groupIdx) => {
      const q = calculateGroupQuote(group, fabricNumbers, estimateBlindTypes(room, fabricNumbers, actualBlindType), motorizedCount, storedPricing);
      const quantity = parseInt(group.quantity) || 1;
      const priceKey = `${room.id}_${groupIdx}`;
      const savedPrice = quote.editedPrices?.perWindowPrices?.[priceKey];

      // perWindowPrice is the LOW end (what the single-number invoice uses);
      // perWindowPriceMax is the high end, equal to it unless this window is
      // still a range - a custom Min-Max override, or an estimate with no
      // exact fabric. Mirrors how the on-screen totals add up (override min/
      // max, else baseMinQuote/baseMaxQuote), so the Price Breakdown can show
      // exactly the range the quote screen shows instead of only its low end.
      let perWindowPrice;
      let perWindowPriceMax;
      if (typeof savedPrice === 'number') {
        perWindowPrice = savedPrice;
        perWindowPriceMax = savedPrice;
      } else if (isRangeOverride(savedPrice)) {
        perWindowPrice = savedPrice.min;
        perWindowPriceMax = savedPrice.max;
        hasRangePricing = true;
      } else if (q.isRange) {
        perWindowPrice = q.baseMinQuote / quantity;
        perWindowPriceMax = q.baseMaxQuote / quantity;
        hasRangePricing = true;
      } else {
        perWindowPrice = q.baseMinQuote / quantity;
        perWindowPriceMax = q.baseMaxQuote / quantity;
      }

      for (let i = 0; i < quantity; i++) {
        items.push({
          location: room.name || 'Room',
          width: group.width || '',
          height: group.height || '',
          motorSmart: group.controlType === 'Motor' ? 'Smart' : 'Manual',
          // The exact type when a fabric is picked; otherwise every type
          // the room is still choosing between ("Roller / Zebra").
          blindType: fabricNumbers.length > 0 ? actualBlindType : (room.blindTypes || [actualBlindType]).join(' / '),
          // ✅ FIX: `!!group.solar` coerced away which panel/wire was
          // actually selected, collapsing it back down to a plain boolean -
          // exactly the "field exists, one consumer forgets to read it
          // properly" bug class. Keep the real value (a panel name string,
          // legacy `true`, or `false`) so callers can still tell which.
          solar: group.solar || false,
          unitPrice: perWindowPrice,
          unitPriceMax: perWindowPriceMax
        });
      }
    });
  });

  // Number same-named locations ("Living Room 1", "Living Room 2"...),
  // matching the reference invoice's format - same idea as Supplier
  // Measurements' getLocationLabel, kept separate since these are
  // deliberately isolated data models (see measurementUtils.js's note).
  const counts = {};
  items.forEach(it => { counts[it.location] = (counts[it.location] || 0) + 1; });
  const seen = {};
  items.forEach(it => {
    seen[it.location] = (seen[it.location] || 0) + 1;
    it.locationLabel = counts[it.location] > 1 ? `${it.location} ${seen[it.location]}` : it.location;
  });

  return { items, hasRangePricing };
}

// ---- docx building helpers --------------------------------------------

const CELL_MARGIN = { top: 60, bottom: 60, left: 100, right: 100 };
const THIN_BORDER = { style: BorderStyle.SINGLE, size: 2, color: '999999' };
const CELL_BORDERS = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };
const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
};

const headerCell = (text, widthDxa) => new TableCell({
  width: widthDxa ? { size: widthDxa, type: WidthType.DXA } : { size: 100, type: WidthType.PERCENTAGE },
  borders: CELL_BORDERS,
  margins: CELL_MARGIN,
  shading: { type: ShadingType.SOLID, color: '2a2a2a', fill: '2a2a2a' },
  verticalAlign: VerticalAlign.CENTER,
  children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20, color: 'FFFFFF' })] })]
});

const bodyCell = (text, { align = AlignmentType.LEFT, bold = false, widthDxa } = {}) => new TableCell({
  width: widthDxa ? { size: widthDxa, type: WidthType.DXA } : { size: 100, type: WidthType.PERCENTAGE },
  borders: CELL_BORDERS,
  margins: CELL_MARGIN,
  verticalAlign: VerticalAlign.CENTER,
  children: [new Paragraph({ alignment: align, children: [new TextRun({ text: String(text), bold, size: 20 })] })]
});

// A totals row: the label spans every column but the last, the value sits
// under the last column - works for any number of chosen columns (>= 2).
// keepNext keeps every totals row on the same page as the row after it, so
// Word never splits the totals block across two pages.
const summaryRow = (label, value, colCount, { bold = false, valueColor = '000000', keepNext = false } = {}) => new TableRow({
  cantSplit: true,
  children: [
    new TableCell({
      columnSpan: colCount - 1,
      borders: CELL_BORDERS,
      margins: CELL_MARGIN,
      children: [new Paragraph({ keepNext, alignment: AlignmentType.RIGHT, children: [new TextRun({ text: label, bold, size: 20 })] })]
    }),
    new TableCell({
      borders: CELL_BORDERS,
      margins: CELL_MARGIN,
      children: [new Paragraph({ keepNext, alignment: AlignmentType.RIGHT, children: [new TextRun({ text: value, bold, size: 20, color: valueColor })] })]
    })
  ]
});

const TABLE_WIDTH_DXA = 10800; // 8.5in page - 2 x 0.5in margins

const DOCX_ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT };

const bulletParagraph = (text) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 80 }, children: [new TextRun({ text, size: 20 })] });

/**
 * Builds the invoice number + line for record-keeping - there's no
 * persisted sequence counter, so this derives a stable, sortable, unique-
 * per-quote id from the creation date + the quote's own id rather than
 * needing new Firestore-backed state just for this.
 */
function buildInvoiceNumber(quote) {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const idTail = (quote.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-5).toUpperCase() || '00000';
  return `INV-${datePart}-${idTail}`;
}

/**
 * Cost math shared by the invoice and the price breakdown Excel - keeping
 * this in one place means the two can never disagree on Motor/Solar/Hub/
 * Tax/Grand Total for the same quote.
 */
export function computeInvoiceTotals(quote, items, { advanceAmount = 0, discountAmount = 0 } = {}) {
  const storedPricing = quote.pricing || null;
  const motorCount = items.filter(it => it.motorSmart === 'Smart').length;
  const solarCount = (quote.rooms || []).reduce((sum, room) => sum + room.windowGroups.filter(g => g.solar).reduce((s2, g) => s2 + (parseInt(g.quantity) || 0), 0), 0);
  const effectiveMotorCost = typeof quote.editedPrices?.motorCost === 'number' ? quote.editedPrices.motorCost : (storedPricing?.MOTOR_COST_CLIENT || 80);
  const effectiveSolarCost = typeof quote.editedPrices?.solarCost === 'number' ? quote.editedPrices.solarCost : (storedPricing?.SOLAR_COST_CLIENT || 40);
  const motorGrandTotal = motorCount * effectiveMotorCost;
  const solarGrandTotal = solarCount * effectiveSolarCost;
  const hubTotal = getHubTotal(quote);

  const itemsSubtotal = items.reduce((sum, it) => sum + it.unitPrice, 0);
  const itemsSubtotalMax = items.reduce((sum, it) => sum + (typeof it.unitPriceMax === 'number' ? it.unitPriceMax : it.unitPrice), 0);
  const total = itemsSubtotal + motorGrandTotal + solarGrandTotal + hubTotal;
  const totalMax = itemsSubtotalMax + motorGrandTotal + solarGrandTotal + hubTotal;
  const taxRate = typeof quote.editedPrices?.taxRate === 'number' ? quote.editedPrices.taxRate : (storedPricing?.SALES_TAX_RATE || SALES_TAX_RATE);
  const salesTax = total * taxRate;
  const salesTaxMax = totalMax * taxRate;
  // ✅ NEW: Other Expenses - flat, untaxed, quote-level charge (old blind
  // removal, misc fees). Added after tax, same as discountAmount above -
  // matches QuoteDetailScreen.js's grandMin/grandMax so this invoice can
  // never disagree with what the client already saw on-screen.
  const otherExpensesAmount = typeof quote.editedPrices?.otherExpenses?.amount === 'number' ? quote.editedPrices.otherExpenses.amount : 0;
  const otherExpensesLabel = quote.editedPrices?.otherExpenses?.label || 'Other Expenses';
  const grandTotal = total + salesTax - discountAmount + otherExpensesAmount;
  const grandTotalMax = totalMax + salesTaxMax - discountAmount + otherExpensesAmount;
  const remainingBalance = grandTotal - advanceAmount;

  return {
    motorCount, solarCount, effectiveMotorCost, effectiveSolarCost, motorGrandTotal, solarGrandTotal, hubTotal,
    itemsSubtotal, itemsSubtotalMax, total, totalMax, taxRate, salesTax, salesTaxMax, otherExpensesAmount, otherExpensesLabel, grandTotal, grandTotalMax, remainingBalance
  };
}

// ---- invoice table: the owner picks which columns appear ----------------

/**
 * Every column the line-item table can show, in display order. The owner
 * ticks which ones they want each time they create an invoice; the Word
 * and the PDF invoice are both built from buildInvoiceModel() below, so the
 * two formats always show the same columns, rows and totals.
 */
export const INVOICE_COLUMNS = [
  { key: 'itemNo', label: 'Item No', align: 'center', weight: 0.9 },
  { key: 'location', label: 'LOCATION', align: 'left', weight: 2.2 },
  { key: 'count', label: 'Count', align: 'center', weight: 0.8 },
  { key: 'width', label: 'Width (Inches)', align: 'center', weight: 1.1 },
  { key: 'height', label: 'Height (Inches)', align: 'center', weight: 1.1 },
  { key: 'blindType', label: 'Blind Type', align: 'center', weight: 1.3 },
  { key: 'motorSmart', label: 'Manual/Smart', align: 'center', weight: 1.4 },
  { key: 'unitPrice', label: 'UNIT PRICE', align: 'right', weight: 1.4 }
];

// Used the first time (before the owner has made a choice on this phone):
// the columns of the business's reference invoice.
export const DEFAULT_INVOICE_COLUMN_KEYS = ['itemNo', 'location', 'count', 'width', 'height', 'motorSmart', 'unitPrice'];

/**
 * Turns any saved/passed column choice into a safe, ordered list of known
 * column keys. Unknown keys are dropped, order always follows
 * INVOICE_COLUMNS, and anything that leaves fewer than 2 columns (the
 * totals rows need a label cell AND a value cell) falls back to the
 * default set, so a bad saved choice can never produce a broken table.
 */
export function normalizeInvoiceColumns(keys) {
  const wanted = new Set(Array.isArray(keys) ? keys : []);
  const cleaned = INVOICE_COLUMNS.filter(c => wanted.has(c.key)).map(c => c.key);
  return cleaned.length >= 2 ? cleaned : [...DEFAULT_INVOICE_COLUMN_KEYS];
}

const blankIfMissing = (v) => (v === null || v === undefined ? '' : String(v).trim());

function invoiceCellText(key, it, idx) {
  switch (key) {
    case 'itemNo': return String(idx + 1);
    case 'location': return it.locationLabel;
    case 'count': return '1';
    case 'width': return blankIfMissing(it.width);
    case 'height': return blankIfMissing(it.height);
    case 'blindType': return blankIfMissing(it.blindType);
    case 'motorSmart': return it.motorSmart === 'Smart' && it.solar ? 'Smart+Solar' : it.motorSmart;
    case 'unitPrice': return `$${formatMoney(it.unitPrice)}`;
    default: return '';
  }
}

/**
 * Everything both invoice formats print, as plain data: header facts, the
 * chosen columns, one row of cell text per window, and the totals rows.
 * advanceAmount/discountAmount are plain numbers (0 if not applicable).
 *
 * finalPrice (optional number): a final price agreed with the client
 * instead of the calculated one. When set, the totals block shows only
 * Grand Total (= finalPrice), Advance Payment and Remaining Balance - no
 * Motor/Solar/Hub/Total/Sales Tax/Discount lines, since those would no
 * longer add up to the agreed price. discountAmount is ignored then (the
 * agreed price already includes any discount).
 */
export function buildInvoiceModel(quote, { advanceAmount = 0, discountAmount = 0, columns, finalPrice = null } = {}) {
  const useFinalPrice = typeof finalPrice === 'number' && Number.isFinite(finalPrice) && finalPrice >= 0;
  if (useFinalPrice) discountAmount = 0;
  const { items } = buildInvoiceLineItems(quote);
  const {
    motorCount, solarCount, effectiveMotorCost, effectiveSolarCost, motorGrandTotal, solarGrandTotal, hubTotal,
    total, taxRate, salesTax, otherExpensesAmount, otherExpensesLabel, grandTotal, remainingBalance
  } = computeInvoiceTotals(quote, items, { advanceAmount, discountAmount });

  const columnKeys = normalizeInvoiceColumns(columns || DEFAULT_INVOICE_COLUMN_KEYS);
  const cols = columnKeys.map(k => INVOICE_COLUMNS.find(c => c.key === k));
  const rows = items.map((it, idx) => cols.map(c => invoiceCellText(c.key, it, idx)));

  const summary = [];
  if (useFinalPrice) {
    summary.push({ label: 'Grand Total', value: `$${formatMoney(finalPrice)}`, bold: true });
    summary.push({ label: 'Advance Payment', value: `$${formatMoney(advanceAmount)}`, bold: true, color: '0e7490' });
    summary.push({ label: 'Remaining Balance', value: `$${formatMoney(finalPrice - advanceAmount)}`, bold: true, color: '0e7490' });
    return finishModel(quote, cols, rows, summary, grandTotal, finalPrice, finalPrice - advanceAmount);
  }
  if (motorCount > 0) summary.push({ label: `Motor windows ${motorCount}*$${formatMoney(effectiveMotorCost)}`, value: `$${formatMoney(motorGrandTotal)}` });
  if (solarCount > 0) summary.push({ label: `Solar windows ${solarCount}*$${formatMoney(effectiveSolarCost)}`, value: `$${formatMoney(solarGrandTotal)}` });
  if (quote.hub?.included) {
    const hubLabel = quote.hub.quantity > 1 ? `Hub ${quote.hub.quantity}*$${formatMoney(quote.hub.price)}` : 'Hub';
    summary.push({ label: hubLabel, value: hubTotal === 0 ? 'Complimentary' : `$${formatMoney(hubTotal)}` });
  }
  summary.push({ label: 'Total', value: `$${formatMoney(total)}`, bold: true });
  summary.push({ label: `Sales Tax ${formatMoney(taxRate * 100)}%`, value: `$${formatMoney(salesTax)}` });
  if (discountAmount > 0) summary.push({ label: 'Discount', value: `-$${formatMoney(discountAmount)}`, color: 'CC0000' });
  if (otherExpensesAmount > 0) summary.push({ label: otherExpensesLabel, value: `$${formatMoney(otherExpensesAmount)}` });
  summary.push({ label: 'Grand Total', value: `$${formatMoney(grandTotal)}`, bold: true });
  summary.push({ label: 'Advance Payment', value: `$${formatMoney(advanceAmount)}`, bold: true, color: '0e7490' });
  summary.push({ label: 'Remaining Balance', value: `$${formatMoney(remainingBalance)}`, bold: true, color: '0e7490' });

  return finishModel(quote, cols, rows, summary, grandTotal, grandTotal, remainingBalance);
}

function finishModel(quote, cols, rows, summary, calculatedGrandTotal, grandTotal, remainingBalance) {
  return {
    invoiceNumber: buildInvoiceNumber(quote),
    dateText: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    // Client name, then phone, then address - the order the owner asked
    // for. Blank lines are dropped so nothing leaves a gap.
    billTo: [quote.clientName, quote.clientPhone, quote.location].map(v => String(v || '').trim()).filter(Boolean),
    columns: cols,
    rows,
    summary,
    calculatedGrandTotal,
    grandTotal,
    remainingBalance
  };
}

/** Safe download file name for an invoice of this quote. */
export function invoiceFileName(quote, ext) {
  return `${(quote.quoteName || 'quote').replace(/[^a-z0-9]/gi, '_')}_invoice.${ext}`;
}

export async function loadLogoBytes() {
  const response = await fetch(zebraLogoUrl);
  if (!response.ok) throw new Error(`Logo request failed (${response.status})`);
  return response.arrayBuffer();
}

/**
 * Builds the docx.Document object (not yet packed to a file) - split out
 * from generateInvoiceDocx so it can be exercised directly in a Node test
 * with real logo bytes from disk, without needing the browser's fetch API.
 */
export function buildInvoiceDocument(quote, options = {}, logoBytes) {
  const model = buildInvoiceModel(quote, options);
  const colCount = model.columns.length;
  // Same relative column widths as the PDF (Location wider, Count narrow),
  // in twentieths of a point across the 7.5in printable width.
  const totalWeight = model.columns.reduce((s, c) => s + c.weight, 0);
  const widthsDxa = model.columns.map(c => Math.round((c.weight / totalWeight) * TABLE_WIDTH_DXA));

  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 60, type: WidthType.PERCENTAGE },
            borders: NO_BORDERS,
            children: [
              new Paragraph({ children: [new ImageRun({ type: 'png', data: logoBytes, transformation: { width: 200, height: 59 } })] }),
              new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: INVOICE_BUSINESS.tagline, italics: true, size: 20 })] }),
              new Paragraph({ children: [new TextRun({ text: INVOICE_BUSINESS.addressLine1, size: 18, color: '555555' })] }),
              new Paragraph({ children: [new TextRun({ text: INVOICE_BUSINESS.addressLine2, size: 18, color: '555555' })] }),
              new Paragraph({ children: [new TextRun({ text: `Phone: ${INVOICE_BUSINESS.phone}`, size: 18, color: '555555' })] }),
              new Paragraph({ children: [new TextRun({ text: `Email: ${INVOICE_BUSINESS.email}`, size: 18, color: '555555' })] })
            ]
          }),
          new TableCell({
            width: { size: 40, type: WidthType.PERCENTAGE },
            borders: NO_BORDERS,
            children: [
              new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Invoice #: ${model.invoiceNumber}`, bold: true, size: 20 })] }),
              new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 60 }, children: [new TextRun({ text: `Date: ${model.dateText}`, bold: true, size: 20 })] })
            ]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: NO_BORDERS,
            children: [
              new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: 'Bill To:', bold: true, size: 20 })] }),
              ...model.billTo.map((line, i) => new Paragraph({ children: [new TextRun({ text: line, bold: i === 0, size: 20 })] }))
            ]
          }),
          new TableCell({ borders: NO_BORDERS, children: [new Paragraph({ children: [] })] })
        ]
      })
    ]
  });

  const itemRows = model.rows.map(cells => new TableRow({
    children: cells.map((text, i) => bodyCell(text, { align: DOCX_ALIGN[model.columns[i].align], widthDxa: widthsDxa[i] }))
  }));

  const summaryRows = model.summary.map((s, i) => summaryRow(s.label, s.value, colCount, { bold: !!s.bold, valueColor: s.color || '000000', keepNext: i < model.summary.length - 1 }));

  const itemsTable = new Table({
    width: { size: TABLE_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: widthsDxa,
    rows: [
      new TableRow({ tableHeader: true, children: model.columns.map((c, i) => headerCell(c.label, widthsDxa[i])) }),
      ...itemRows,
      ...summaryRows
    ]
  });

  const termsParagraphs = [
    new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_2, spacing: { after: 160 }, children: [new TextRun({ text: 'Terms and Conditions', bold: true })] }),
    ...TERMS_AND_CONDITIONS.map(bulletParagraph),
    new Paragraph({ spacing: { before: 300, after: 160 }, heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Warranty Coverage', bold: true })] }),
    ...WARRANTY_SUMMARY.map(bulletParagraph),
    ...WARRANTY_SECTIONS.flatMap(section => [
      new Paragraph({ spacing: { before: 200, after: 80 }, children: [new TextRun({ text: section.title, bold: true, size: 22 })] }),
      ...section.bullets.map(bulletParagraph),
      ...(section.note ? [new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: section.note, italics: true, size: 20 })] })] : [])
    ])
  ];

  return new Document({
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      children: [
        headerTable,
        new Paragraph({ spacing: { before: 200, after: 200 }, children: [] }),
        itemsTable,
        ...termsParagraphs
      ]
    }]
  });
}

/**
 * Generates the invoice .docx as a Blob for the browser to download -
 * fetches the logo bytes, then delegates the actual document assembly to
 * buildInvoiceDocument. options: { advanceAmount, discountAmount, columns }.
 */
export async function generateInvoiceDocx(quote, options = {}) {
  const logoBytes = await loadLogoBytes();
  const doc = buildInvoiceDocument(quote, options, logoBytes);
  return Packer.toBlob(doc);
}
