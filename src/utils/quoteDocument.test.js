/**
 * @jest-environment node
 */
// Run with: CI=true npx react-scripts test --watchAll=false src/utils/quoteDocument.test.js
// "Download Quote (PDF or Word)" (owner's request, 2026-11-24): the quote as
// a client document styled like the invoice. Checks that its money always
// matches the invoice / Price Breakdown math, that ranges and Roller/Zebra
// options are shown, that it never prints payment lines, and that the
// invoice itself is unchanged.
import assert from 'assert';
import { Packer } from 'docx';
import { buildInvoiceModel, buildInvoiceLineItems, computeInvoiceTotals, buildInvoiceDocument, invoiceFileName, fmtMaybeRange } from './invoiceExport';
import { buildInvoicePdf } from './invoicePdf';
import { estimateOptionTotals, optionGrandTotals } from './pricing';
import { getPricingSnapshot } from './constants';
import { formatMoney } from './formatters';

const snap = getPricingSnapshot();
const legacySnap = (() => { const s = { ...snap }; delete s.ESTIMATE_BY_BLIND_TYPE; return s; })();
const ALL_COLS = ['itemNo', 'location', 'count', 'width', 'height', 'blindType', 'fabric', 'motorSmart', 'unitPrice'];

const exactQuote = () => ({
  id: 'q-exact', clientName: 'Ann Lee', clientPhone: '214-555-0101', location: '1 Main St', pricing: snap,
  hub: { included: true, quantity: 2, price: 40 },
  editedPrices: { otherExpenses: { amount: 75, label: 'Old blind removal' } },
  rooms: [
    { id: 1, name: 'Living', fabricInput: '83003L', blindTypes: ['Zebra'], windowGroups: [{ quantity: '2', width: '35', height: '70', controlType: 'Motor', solar: 'AOK' }] },
    { id: 2, name: 'Bed', fabricInput: '82086K', blindTypes: ['Roller'], windowGroups: [{ quantity: '1', width: '30', height: '60', controlType: 'Manual' }] }
  ]
});

const optionQuote = () => ({
  id: 'q-opt', clientName: 'Ben', location: '2 Oak', pricing: snap,
  rooms: [
    { id: 1, name: 'Kitchen', fabricInput: '', blindTypes: ['Roller', 'Zebra'], windowGroups: [{ quantity: '2', width: '30', height: '40', controlType: 'Manual' }] },
    { id: 2, name: 'Office', fabricInput: '82086K', blindTypes: ['Roller'], windowGroups: [{ quantity: '1', width: '40', height: '55', controlType: 'Motor' }] }
  ]
});

// An old saved quote: no pricing snapshot flag, no fabricInput, legacy
// solar `true`, no editedPrices, no hub.
const oldQuote = () => ({
  id: 'q-old', clientName: 'Cara', location: '3 Elm', pricing: legacySnap,
  rooms: [{ id: 1, name: 'Den', blindTypes: ['Roller'], windowGroups: [{ quantity: '1', width: '30', height: '40', controlType: 'Motor', solar: true }] }]
});

const labels = (m) => m.summary.map(s => s.label);
const value = (m, label) => (m.summary.find(s => s.label === label) || {}).value;

test('exact-fabric quote: same money as the invoice, no payment lines', () => {
  const q = exactQuote();
  const quoteDoc = buildInvoiceModel(q, { docType: 'quote', columns: ALL_COLS });
  const invoice = buildInvoiceModel(q, { columns: ALL_COLS });
  assert.equal(quoteDoc.grandTotal, invoice.grandTotal);
  assert.equal(value(quoteDoc, 'Grand Total'), value(invoice, 'Grand Total'));
  assert.deepEqual(quoteDoc.rows, invoice.rows, 'exact prices print the same per window');
  assert.ok(!labels(quoteDoc).includes('Advance Payment'));
  assert.ok(!labels(quoteDoc).includes('Remaining Balance'));
  assert.ok(labels(quoteDoc).includes('Old blind removal'));
  assert.ok(labels(quoteDoc).some(l => l.startsWith('Hub 2*')));
  assert.ok(labels(quoteDoc).some(l => l.startsWith('Solar windows 2*')));
  assert.equal(quoteDoc.numberLabel, 'Quote #');
  assert.equal(quoteDoc.billToHeading, 'Prepared For:');
  assert.ok(quoteDoc.invoiceNumber.startsWith('QT-'));
  assert.deepEqual(quoteDoc.notes, []);
});

test('invoice keeps its own labels and payment lines', () => {
  const m = buildInvoiceModel(exactQuote(), { advanceAmount: 100 });
  assert.equal(m.numberLabel, 'Invoice #');
  assert.equal(m.billToHeading, 'Bill To:');
  assert.ok(m.invoiceNumber.startsWith('INV-'));
  assert.ok(labels(m).includes('Advance Payment'));
  assert.ok(labels(m).includes('Remaining Balance'));
});

test('estimate windows show their range; totals match the Price Breakdown math', () => {
  const q = optionQuote();
  const m = buildInvoiceModel(q, { docType: 'quote', columns: ALL_COLS });
  const { items } = buildInvoiceLineItems(q);
  const t = computeInvoiceTotals(q, items);
  const priceCol = m.columns.findIndex(c => c.key === 'unitPrice');
  assert.equal(m.rows[0][priceCol], fmtMaybeRange(items[0].unitPrice, items[0].unitPriceMax));
  assert.match(m.rows[0][priceCol], /^\$\d+-\$\d+$/);
  assert.equal(m.rows[2][priceCol], `$${formatMoney(items[2].unitPrice)}`, 'exact window: one price');
  assert.equal(value(m, 'Grand Total'), fmtMaybeRange(t.grandTotal, t.grandTotalMax));
  assert.equal(value(m, 'Total'), fmtMaybeRange(t.total, t.totalMax));
  assert.ok(m.notes.some(n => n.includes('range')));
});

test('Roller vs Zebra: "If all" rows equal the option totals (and follow a discount)', () => {
  const q = optionQuote();
  const { items } = buildInvoiceLineItems(q);
  const t = computeInvoiceTotals(q, items);
  const opts = estimateOptionTotals(q.rooms, () => null, q.pricing);
  const grand = optionGrandTotals(opts, { motorGrandTotal: t.motorGrandTotal, solarGrandTotal: t.solarGrandTotal, hubTotal: t.hubTotal, taxRate: t.taxRate, otherExpenses: t.otherExpensesAmount });
  const m = buildInvoiceModel(q, { docType: 'quote', columns: ALL_COLS });
  assert.equal(value(m, 'If all Roller'), fmtMaybeRange(grand.Roller.grandMin, grand.Roller.grandMax));
  assert.equal(value(m, 'If all Zebra'), fmtMaybeRange(grand.Zebra.grandMin, grand.Zebra.grandMax));
  const d = buildInvoiceModel(q, { docType: 'quote', columns: ALL_COLS, discountAmount: 100 });
  assert.equal(value(d, 'Discount'), `-$${formatMoney(100)}`);
  assert.equal(value(d, 'If all Roller'), fmtMaybeRange(grand.Roller.grandMin - 100, grand.Roller.grandMax - 100));
  assert.ok(Math.abs(d.grandTotal - (m.grandTotal - 100)) < 1e-9);
});

test('old saved quote (no fabricInput, legacy solar, no snapshot flag) works', () => {
  const m = buildInvoiceModel(oldQuote(), { docType: 'quote', columns: ALL_COLS });
  assert.ok(m.rows.length === 1);
  assert.ok(!labels(m).some(l => l.startsWith('If all')), 'no option rows for legacy estimates');
  assert.ok(labels(m).some(l => l.startsWith('Solar windows 1*')));
  assert.ok(!/NaN|undefined/.test(JSON.stringify(m)));
  // Quote with no id, no rooms at all
  const empty = buildInvoiceModel({ clientName: 'X' }, { docType: 'quote' });
  assert.equal(empty.rows.length, 0);
  assert.equal(value(empty, 'Grand Total'), `$${formatMoney(0)}`);
});

test('no Unit Price column -> only the Grand Total (no breakdown, no payments)', () => {
  const m = buildInvoiceModel(exactQuote(), { docType: 'quote', columns: ['itemNo', 'location', 'motorSmart'], showCardPrice: false });
  assert.deepEqual(labels(m), ['Grand Total']);
  const o = buildInvoiceModel(optionQuote(), { docType: 'quote', columns: ['location', 'width'], showCardPrice: false });
  assert.deepEqual(labels(o), ['Grand Total', 'If all Roller', 'If all Zebra']);
  // With the credit card price (on by default, 2026-11-26) it sits right
  // under the Grand Total, before the "If all" lines.
  const card = ['If paying by credit card: fee 3.5%', 'Grand Total by credit card'];
  assert.deepEqual(labels(buildInvoiceModel(exactQuote(), { docType: 'quote', columns: ['itemNo', 'location', 'motorSmart'] })), ['Grand Total', ...card]);
  assert.deepEqual(labels(buildInvoiceModel(optionQuote(), { docType: 'quote', columns: ['location', 'width'] })), ['Grand Total', ...card, 'If all Roller', 'If all Zebra']);
});

test('motor types from a measurement sheet show on the quote too', () => {
  const m = buildInvoiceModel(exactQuote(), { docType: 'quote', columns: ALL_COLS, motorLabels: { '1_0': ['Smart - Wired', 'Smart - Rechargeable'] } });
  const col = m.columns.findIndex(c => c.key === 'motorSmart');
  assert.equal(m.rows[0][col], 'Smart - Wired+Solar');
  assert.equal(m.rows[1][col], 'Smart - Rechargeable+Solar');
});

test('bad discount values never break the totals', () => {
  [null, NaN, -50, undefined, Infinity].forEach(d => {
    const m = buildInvoiceModel(exactQuote(), { docType: 'quote', discountAmount: d });
    assert.ok(!labels(m).includes('Discount'));
    assert.equal(m.grandTotal, buildInvoiceModel(exactQuote(), { docType: 'quote' }).grandTotal);
  });
});

test('file names', () => {
  assert.equal(invoiceFileName({ clientName: 'Ann Lee' }, 'pdf', 'quote'), 'Ann Lee-quote-zebrascreensllc.pdf');
  assert.equal(invoiceFileName({ clientName: 'Ann Lee' }, 'docx'), 'Ann Lee-invoice-zebrascreensllc.docx');
});

test('PDF and Word files build for every quote shape', async () => {
  const logo = require('fs').readFileSync(require('path').join(__dirname, '../assets/zebra-logo.png'));
  for (const q of [exactQuote(), optionQuote(), oldQuote()]) {
    for (const columns of [ALL_COLS, ['location', 'width']]) {
      const pdf = buildInvoicePdf(q, { docType: 'quote', columns }, logo);
      assert.ok(pdf.getNumberOfPages() >= 2, 'price page + terms/warranty');
      const buf = await Packer.toBuffer(buildInvoiceDocument(q, { docType: 'quote', columns }, logo));
      const xml = require('zlib') && buf.toString('latin1');
      assert.ok(buf.length > 1000 && xml.startsWith('PK'));
    }
  }
}, 60000);
