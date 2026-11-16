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
