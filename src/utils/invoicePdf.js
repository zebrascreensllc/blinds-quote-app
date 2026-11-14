import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { buildInvoiceModel, loadLogoBytes } from './invoiceExport';
import { INVOICE_BUSINESS, TERMS_AND_CONDITIONS, WARRANTY_SUMMARY, WARRANTY_SECTIONS } from './invoiceContent';

// PDF version of the invoice. It prints exactly what the Word invoice
// prints - both are built from buildInvoiceModel() (same columns, rows and
// totals) - laid out like the business's reference invoice: logo and
// letterhead, Bill To, a dark-header item table with the totals underneath,
// then Terms and Conditions / Warranty Coverage on the next page.

const PAGE_MARGIN = 40;
const LOGO_WIDTH = 160;
const LOGO_HEIGHT = 160 * (446 / 1502); // zebra-logo.png is 1502 x 446
const WATERMARK_OPACITY = 0.08;

const hexToRgb = (hex) => {
  const clean = String(hex || '000000').replace('#', '');
  return [0, 2, 4].map(i => parseInt(clean.slice(i, i + 2), 16) || 0);
};

/**
 * Builds the jsPDF document. Split out from generateInvoicePdf so it can be
 * run in Node with logo bytes read from disk (no browser fetch needed).
 */
export function buildInvoicePdf(quote, options = {}, logoBytes) {
  const model = buildInvoiceModel(quote, options);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;

  // ---- letterhead ----
  let y = PAGE_MARGIN;
  if (logoBytes) {
    doc.addImage(new Uint8Array(logoBytes), 'PNG', PAGE_MARGIN, y, LOGO_WIDTH, LOGO_HEIGHT, 'zebra-logo');
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Invoice #: ${model.invoiceNumber}`, pageWidth - PAGE_MARGIN, y + 10, { align: 'right' });
  doc.text(`Date: ${model.dateText}`, pageWidth - PAGE_MARGIN, y + 26, { align: 'right' });

  y += LOGO_HEIGHT + 16;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(10);
  doc.text(INVOICE_BUSINESS.tagline, PAGE_MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(85, 85, 85);
  [INVOICE_BUSINESS.addressLine1, INVOICE_BUSINESS.addressLine2, `Phone: ${INVOICE_BUSINESS.phone}`, `Email: ${INVOICE_BUSINESS.email}`]
    .forEach(line => { y += 12; doc.text(line, PAGE_MARGIN, y); });

  // ---- bill to ----
  y += 24;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Bill To:', PAGE_MARGIN, y);
  model.billTo.filter(line => line).forEach((line, i) => {
    y += 13;
    doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
    // A long address wraps instead of running off the page.
    const wrapped = doc.splitTextToSize(line, contentWidth * 0.6);
    doc.text(wrapped, PAGE_MARGIN, y);
    y += (wrapped.length - 1) * 12;
  });

  // ---- item table + totals ----
  // Column widths follow each column's weight, but the last column (where
  // every totals value sits) is never narrower than "Complimentary" /
  // "$12345.67" needs; Location takes up whatever is left.
  const colCount = model.columns.length;
  const totalWeight = model.columns.reduce((s, c) => s + c.weight, 0);
  const widths = model.columns.map(c => (contentWidth * c.weight) / totalWeight);
  const minLast = 76;
  if (widths[colCount - 1] < minLast) {
    const extra = minLast - widths[colCount - 1];
    widths[colCount - 1] = minLast;
    const shrinkIdx = model.columns.findIndex(c => c.key === 'location');
    const donor = shrinkIdx >= 0 && shrinkIdx !== colCount - 1 ? shrinkIdx : 0;
    widths[donor] -= extra;
  }
  const columnStyles = {};
  model.columns.forEach((c, i) => {
    columnStyles[i] = { halign: c.align, cellWidth: widths[i] };
  });

  const summaryBody = model.summary.map(s => {
    const style = { halign: 'right', fontStyle: s.bold ? 'bold' : 'normal' };
    return [
      { content: s.label, colSpan: colCount - 1, styles: style },
      { content: s.value, styles: { ...style, textColor: hexToRgb(s.color) } }
    ];
  });

  autoTable(doc, {
    startY: y + 20,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    head: [model.columns.map(c => ({ content: c.label, styles: { halign: c.align } }))],
    body: [...model.rows, ...summaryBody],
    columnStyles,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 4, lineColor: [153, 153, 153], lineWidth: 0.5, textColor: [0, 0, 0], valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: [42, 42, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    // Repeat the dark header row when the table runs onto a second page.
    showHead: 'everyPage'
  });

  // ---- terms & warranty (always start on a fresh page, like the Word file) ----
  doc.addPage();
  y = PAGE_MARGIN;
  const ensureRoom = (needed) => {
    if (y + needed > pageHeight - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
  };
  const heading = (text, size) => {
    ensureRoom(size + 10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    y += size;
    doc.text(text, PAGE_MARGIN, y);
    y += 8;
  };
  const paragraph = (text, { bullet = false, italic = false } = {}) => {
    doc.setFont('helvetica', italic ? 'italic' : 'normal');
    doc.setFontSize(10);
    const indent = bullet ? 14 : 0;
    const lines = doc.splitTextToSize(text, contentWidth - indent);
    lines.forEach((line, i) => {
      ensureRoom(13);
      y += 13;
      if (bullet && i === 0) doc.text('•', PAGE_MARGIN + 3, y);
      doc.text(line, PAGE_MARGIN + indent, y);
    });
    y += 3;
  };

  heading('Terms and Conditions', 14);
  TERMS_AND_CONDITIONS.forEach(t => paragraph(t, { bullet: true }));
  y += 12;
  heading('Warranty Coverage', 14);
  WARRANTY_SUMMARY.forEach(t => paragraph(t, { bullet: true }));
  WARRANTY_SECTIONS.forEach(section => {
    y += 8;
    heading(section.title, 11);
    section.bullets.forEach(b => paragraph(b, { bullet: true }));
    if (section.note) paragraph(section.note, { italic: true });
  });

  // ---- watermark: a faded Zebra logo in the middle of every page, like
  // the business's reference invoice. Drawn last at low opacity so it sits
  // over the table/fills without hiding any text.
  if (logoBytes) {
    const wmWidth = contentWidth * 0.8;
    const wmHeight = wmWidth * (446 / 1502);
    const logoData = new Uint8Array(logoBytes);
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.saveGraphicsState();
      doc.setGState(new doc.GState({ opacity: WATERMARK_OPACITY }));
      doc.addImage(logoData, 'PNG', (pageWidth - wmWidth) / 2, (pageHeight - wmHeight) / 2, wmWidth, wmHeight, 'zebra-logo');
      doc.restoreGraphicsState();
    }
  }

  return doc;
}

/**
 * Generates the invoice PDF as a Blob for the browser to download.
 * options: { advanceAmount, discountAmount, columns }.
 */
export async function generateInvoicePdf(quote, options = {}) {
  const logoBytes = await loadLogoBytes();
  const doc = buildInvoicePdf(quote, options, logoBytes);
  return doc.output('blob');
}
