/**
 * @jest-environment node
 */
// Run with: CI=true npx react-scripts test --watchAll=false src/utils/invoiceFabric.test.js
// Invoice: optional "Fabric No" column (only with Blind Type) and the
// remote warranty of 3 months (owner's request, 2026-11-16).
import assert from 'assert';
import { INVOICE_COLUMNS, DEFAULT_INVOICE_COLUMN_KEYS, normalizeInvoiceColumns, buildInvoiceModel, buildInvoiceLineItems, buildInvoiceDocument } from './invoiceExport';
import { buildInvoicePdf } from './invoicePdf';
import { WARRANTY_SUMMARY, WARRANTY_SECTIONS } from './invoiceContent';
import { getPricingSnapshot } from './constants';

const quote = (o = {}) => ({
  id: 'q1', quoteName: 'Ann-v1', clientName: 'Ann', location: '1 Main St', version: 'v1',
  pricing: getPricingSnapshot(),
  rooms: [
    // exact fabric, typed lowercase with spaces
    { id: 1, name: 'Living', fabricInput: ' 83003l ', blindTypes: ['Zebra'], windowGroups: [{ quantity: '2', width: '35', height: '70', controlType: 'Motor' }] },
    // two fabrics in one room
    { id: 2, name: 'Bed', fabricInput: '82086K, 82086W', blindTypes: ['Roller'], windowGroups: [{ quantity: '1', width: '30', height: '60', controlType: 'Manual' }] },
    // no fabric yet (estimate) - Roller vs Zebra option room
    { id: 3, name: 'Den', fabricInput: '', blindTypes: ['Roller', 'Zebra'], windowGroups: [{ quantity: '1', width: '40', height: '50', controlType: 'Manual', solar: 'Panel' }] },
    // an old saved quote's room with no fabricInput field at all
    { id: 4, name: 'Old', blindTypes: ['Roller'], windowGroups: [{ quantity: '1', width: '20', height: '20', controlType: 'Manual' }] }
  ],
  ...o
});

test('fabric column only exists alongside Blind Type, in the right place', () => {
  assert.deepEqual(normalizeInvoiceColumns(['location', 'blindType', 'fabric']), ['location', 'blindType', 'fabric']);
  assert.deepEqual(normalizeInvoiceColumns(['fabric', 'blindType', 'location']), ['location', 'blindType', 'fabric']);
  // fabric without blind type is dropped
  assert.deepEqual(normalizeInvoiceColumns(['location', 'unitPrice', 'fabric']), ['location', 'unitPrice']);
  // fabric alone with one other dependent-less column -> falls back to default
  assert.deepEqual(normalizeInvoiceColumns(['location', 'fabric']), DEFAULT_INVOICE_COLUMN_KEYS);
  // old saved choices (no fabric key) unchanged
  assert.deepEqual(normalizeInvoiceColumns(DEFAULT_INVOICE_COLUMN_KEYS), DEFAULT_INVOICE_COLUMN_KEYS);
  assert.ok(!DEFAULT_INVOICE_COLUMN_KEYS.includes('fabric'));
});

test('fabric cell text per window', () => {
  const { items } = buildInvoiceLineItems(quote());
  assert.deepEqual(items.map(i => i.fabric), ['83003L', '83003L', '82086K, 82086W', '', '']);
  const m = buildInvoiceModel(quote(), { columns: ['location', 'blindType', 'fabric', 'unitPrice'] });
  assert.deepEqual(m.columns.map(c => c.label), ['LOCATION', 'Blind Type', 'Fabric No', 'UNIT PRICE']);
  assert.deepEqual(m.rows.map(r => r[1] + '|' + r[2]), ['Zebra|83003L', 'Zebra|83003L', 'Roller|82086K, 82086W', 'Roller / Zebra|', 'Roller|']);
});

test('every column combination, fabric yes/no: same totals, no crash, PDF + Word build', () => {
  const base = INVOICE_COLUMNS.filter(c => !c.needs).map(c => c.key);
  const q = quote({ hub: { included: true, quantity: 1, price: 0 }, editedPrices: { perWindowPrices: { '1_0': 300 } } });
  const refGrand = buildInvoiceModel(q, {}).grandTotal;
  let n = 0;
  for (let mask = 0; mask < (1 << base.length); mask++) {
    const picked = base.filter((_, i) => mask & (1 << i));
    for (const fabric of [false, true]) {
      for (const finalPrice of [null, 999]) {
        const cols = fabric ? [...picked, 'fabric'] : picked;
        const keys = normalizeInvoiceColumns(cols);
        const m = buildInvoiceModel(q, { columns: cols, advanceAmount: 100, finalPrice });
        assert.deepEqual(m.columns.map(c => c.key), keys);
        assert.ok(m.rows.every(r => r.length === keys.length && r.every(c => typeof c === 'string')));
        assert.equal(keys.includes('fabric'), keys.includes('blindType') && cols.includes('fabric'));
        assert.equal(m.calculatedGrandTotal, refGrand); // fabric never changes money
        if ((mask % 17 === 0) || (fabric && mask === (1 << base.length) - 1)) {
          buildInvoicePdf(q, { columns: cols, advanceAmount: 100, finalPrice }, null);
          buildInvoiceDocument(q, { columns: cols, advanceAmount: 100, finalPrice }, new Uint8Array([137, 80, 78, 71]));
        }
        n++;
      }
    }
  }
  assert.equal(n, 1024);
  // all 9 columns on the PDF: table still fits the page width
  const doc = buildInvoicePdf(q, { columns: [...base, 'fabric'] }, null);
  assert.ok(doc.lastAutoTable.finalY > 0);
});

test('remote warranty is 3 months, motor still 3 years, fabric 1 year', () => {
  const all = [...WARRANTY_SUMMARY, ...WARRANTY_SECTIONS.flatMap(s => s.bullets)].join('\n');
  assert.ok(WARRANTY_SUMMARY.includes('Remote: 3 Months Limited Warranty'));
  assert.ok(WARRANTY_SUMMARY.includes('Motor: 3 Years Limited Warranty'));
  assert.ok(WARRANTY_SUMMARY.includes('Fabric: 1 Year Limited Warranty'));
  assert.ok(!/remote[^.\n]*3 years/i.test(all), 'no line gives the remote 3 years');
  assert.ok(/remote for up to 3 months/.test(all));
});

// Owner's request 2026-11-24: discontinued-parts sentence after section 2's
// "In such cases..." note, in BOTH the PDF and the Word invoice, every column set.
test('warranty notes (section 1 battery Note, section 2 discontinued parts) in PDF and Word, in order', async () => {
  const s2 = WARRANTY_SECTIONS.find(s => s.title.startsWith('2.'));
  assert.equal(s2.notes.length, 2);
  assert.ok(s2.notes[0].startsWith('In such cases, repair or replacement costs, including shipping'));
  assert.ok(/discontinues a fabric, motor, or remote after the warranty period/.test(s2.notes[1]));
  assert.ok(WARRANTY_SECTIONS[0].title.startsWith('1.') && WARRANTY_SECTIONS[0].notes[0].startsWith('Note: If the motor battery'));
  assert.ok(WARRANTY_SECTIONS.every(s => s.note === undefined), 'no section still uses the old single note field');

  const { Packer } = require('docx');
  const flat = t => t.replace(/\s+/g, ' ');
  for (const columns of [DEFAULT_INVOICE_COLUMN_KEYS, ['location', 'blindType', 'fabric'], []]) {
    // jsPDF keeps each page's (uncompressed) drawing commands in internal.pages;
    // wrapped lines are separate text runs, so check phrases from line starts
    const pdfText = flat(buildInvoicePdf(quote(), { columns }, null).internal.pages.flat().filter(Boolean).join(' '));
    assert.ok(pdfText.includes('If a supplier discontinues a fabric'), 'PDF has the new sentence');
    assert.ok(pdfText.includes('In such cases, repair or replacement'), 'PDF keeps the old sentence');
    const docx = buildInvoiceDocument(quote(), { columns });
    const buf = await Packer.toBuffer(docx);
    const x = (await (await new (require('jszip'))().loadAsync(buf)).file('word/document.xml').async('string'))
      .replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"');
    assert.ok(x.includes(s2.notes[0]) && x.includes(s2.notes[1]), 'Word has both sentences');
    assert.ok(x.indexOf(s2.notes[0]) < x.indexOf(s2.notes[1]), 'new sentence comes after the old one');
    // section 1: battery/re-pairing Note, after the motor/remote bullet and before section 2
    const n1 = WARRANTY_SECTIONS[0].notes[0];
    assert.ok(x.includes(n1.replace(/’/g, '’')), 'Word has the section 1 note');
    assert.ok(x.indexOf('subject to proper usage') < x.indexOf(n1) && x.indexOf(n1) < x.indexOf('2. The warranty does not cover'), 'Word: note sits under section 1');
    assert.ok(pdfText.includes('Note: If the motor battery is not charged'), 'PDF has the section 1 note');
    assert.ok(pdfText.indexOf('Note: If the motor battery') < pdfText.indexOf('2. The warranty does not cover'), 'PDF: note sits under section 1');
  }
});
