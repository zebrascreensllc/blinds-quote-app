import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  AlignmentType, WidthType, BorderStyle, VerticalAlign, ShadingType, HeadingLevel
} from 'docx';
import { PRICING_DATA } from '../data/pricingData';
import { SALES_TAX_RATE } from './constants';
import { calculateGroupQuote, getBlindTypeFromFabric, getHubTotal } from './pricing';
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
      const q = calculateGroupQuote(group, fabricNumbers, actualBlindType, motorizedCount, storedPricing);
      const quantity = parseInt(group.quantity) || 1;
      const priceKey = `${room.id}_${groupIdx}`;
      const savedPrice = quote.editedPrices?.perWindowPrices?.[priceKey];

      let perWindowPrice;
      if (typeof savedPrice === 'number') {
        perWindowPrice = savedPrice;
      } else if (isRangeOverride(savedPrice)) {
        perWindowPrice = savedPrice.min;
        hasRangePricing = true;
      } else if (q.isRange) {
        perWindowPrice = q.baseMinQuote / quantity;
        hasRangePricing = true;
      } else {
        perWindowPrice = q.baseMinQuote / quantity;
      }

      for (let i = 0; i < quantity; i++) {
        items.push({
          location: room.name || 'Room',
          width: group.width || '',
          height: group.height || '',
          motorSmart: group.controlType === 'Motor' ? 'Smart' : 'Manual',
          solar: !!group.solar,
          unitPrice: perWindowPrice
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

const headerCell = (text) => new TableCell({
  width: { size: 100, type: WidthType.PERCENTAGE },
  borders: CELL_BORDERS,
  margins: CELL_MARGIN,
  shading: { type: ShadingType.SOLID, color: '2a2a2a', fill: '2a2a2a' },
  verticalAlign: VerticalAlign.CENTER,
  children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20, color: 'FFFFFF' })] })]
});

const bodyCell = (text, { align = AlignmentType.LEFT, bold = false } = {}) => new TableCell({
  width: { size: 100, type: WidthType.PERCENTAGE },
  borders: CELL_BORDERS,
  margins: CELL_MARGIN,
  verticalAlign: VerticalAlign.CENTER,
  children: [new Paragraph({ alignment: align, children: [new TextRun({ text: String(text), bold, size: 20 })] })]
});

const summaryRow = (label, value, { bold = false, valueColor = '000000' } = {}) => new TableRow({
  children: [
    new TableCell({
      columnSpan: 6,
      borders: CELL_BORDERS,
      margins: CELL_MARGIN,
      children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: label, bold, size: 20 })] })]
    }),
    new TableCell({
      borders: CELL_BORDERS,
      margins: CELL_MARGIN,
      children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: value, bold, size: 20, color: valueColor })] })]
    })
  ]
});

const bulletParagraph = (text) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 80 }, children: [new TextRun({ text, size: 20 })] });

async function loadLogoBytes() {
  const response = await fetch(zebraLogoUrl);
  return response.arrayBuffer();
}

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
 * Generates the invoice .docx as a Blob. advanceAmount/discountAmount are
 * plain numbers (0 if not applicable) - the caller (QuoteDetailScreen)
 * collects those before calling this.
 */
/**
 * Builds the docx.Document object (not yet packed to a file) - split out
 * from generateInvoiceDocx so it can be exercised directly in a Node test
 * with real logo bytes from disk, without needing the browser's fetch API.
 */
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
  const total = itemsSubtotal + motorGrandTotal + solarGrandTotal + hubTotal;
  const taxRate = typeof quote.editedPrices?.taxRate === 'number' ? quote.editedPrices.taxRate : (storedPricing?.SALES_TAX_RATE || SALES_TAX_RATE);
  const salesTax = total * taxRate;
  const grandTotal = total + salesTax - discountAmount;
  const remainingBalance = grandTotal - advanceAmount;

  return {
    motorCount, solarCount, effectiveMotorCost, effectiveSolarCost, motorGrandTotal, solarGrandTotal, hubTotal,
    itemsSubtotal, total, taxRate, salesTax, grandTotal, remainingBalance
  };
}

export function buildInvoiceDocument(quote, { advanceAmount = 0, discountAmount = 0 } = {}, logoBytes) {
  const { items } = buildInvoiceLineItems(quote);
  const {
    motorCount, solarCount, effectiveMotorCost, effectiveSolarCost, motorGrandTotal, solarGrandTotal, hubTotal,
    total, taxRate, salesTax, grandTotal, remainingBalance
  } = computeInvoiceTotals(quote, items, { advanceAmount, discountAmount });

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
              new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Invoice #: ${buildInvoiceNumber(quote)}`, bold: true, size: 20 })] }),
              new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 60 }, children: [new TextRun({ text: `Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, bold: true, size: 20 })] })
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
              new Paragraph({ children: [new TextRun({ text: quote.clientName || '', bold: true, size: 20 })] }),
              new Paragraph({ children: [new TextRun({ text: quote.location || '', size: 20 })] }),
              new Paragraph({ children: [new TextRun({ text: quote.clientPhone || '', size: 20 })] })
            ]
          }),
          new TableCell({ borders: NO_BORDERS, children: [new Paragraph({ children: [] })] })
        ]
      })
    ]
  });

  const itemRows = items.map((it, idx) => new TableRow({
    children: [
      bodyCell(idx + 1, { align: AlignmentType.CENTER }),
      bodyCell(it.locationLabel),
      bodyCell(1, { align: AlignmentType.CENTER }),
      bodyCell('', { align: AlignmentType.CENTER }),
      bodyCell('', { align: AlignmentType.CENTER }),
      bodyCell(it.motorSmart, { align: AlignmentType.CENTER }),
      bodyCell(`$${formatMoney(it.unitPrice)}`, { align: AlignmentType.RIGHT })
    ]
  }));

  const summaryRows = [];
  if (motorCount > 0) summaryRows.push(summaryRow(`Motor windows ${motorCount}*$${formatMoney(effectiveMotorCost)}`, `$${formatMoney(motorGrandTotal)}`));
  if (solarCount > 0) summaryRows.push(summaryRow(`Solar windows ${solarCount}*$${formatMoney(effectiveSolarCost)}`, `$${formatMoney(solarGrandTotal)}`));
  if (quote.hub?.included) {
    const hubLabel = quote.hub.quantity > 1 ? `Hub ${quote.hub.quantity}*$${formatMoney(quote.hub.price)}` : 'Hub';
    summaryRows.push(summaryRow(hubLabel, hubTotal === 0 ? 'Complimentary' : `$${formatMoney(hubTotal)}`));
  }
  summaryRows.push(summaryRow('Total', `$${formatMoney(total)}`, { bold: true }));
  summaryRows.push(summaryRow(`Sales Tax ${formatMoney(taxRate * 100)}%`, `$${formatMoney(salesTax)}`));
  if (discountAmount > 0) summaryRows.push(summaryRow('Discount', `-$${formatMoney(discountAmount)}`, { valueColor: 'CC0000' }));
  summaryRows.push(summaryRow('Grand Total', `$${formatMoney(grandTotal)}`, { bold: true }));
  // ✅ NEW: the two rows this feature was specifically requested for.
  summaryRows.push(summaryRow('Advance Payment', `$${formatMoney(advanceAmount)}`, { bold: true, valueColor: '0e7490' }));
  summaryRows.push(summaryRow('Remaining Balance', `$${formatMoney(remainingBalance)}`, { bold: true, valueColor: '0e7490' }));

  const itemsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          headerCell('Item No'), headerCell('LOCATION'), headerCell('Count'),
          headerCell('Width (Inches)'), headerCell('Height (Inches)'), headerCell('Motor/Smart'), headerCell('UNIT PRICE')
        ]
      }),
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
 * buildInvoiceDocument. advanceAmount/discountAmount are plain numbers (0
 * if not applicable) - the caller (QuoteDetailScreen) collects those
 * before calling this.
 */
export async function generateInvoiceDocx(quote, options = {}) {
  const logoBytes = await loadLogoBytes();
  const doc = buildInvoiceDocument(quote, options, logoBytes);
  return Packer.toBlob(doc);
}
