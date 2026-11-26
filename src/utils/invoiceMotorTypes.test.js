/**
 * @jest-environment node
 */
// Run with: CI=true npx react-scripts test --watchAll=false src/utils/invoiceMotorTypes.test.js
// Invoice Manual/Smart column shows the motor/chain type from the client's
// measurement sheet (owner's request, 2026-11-16).
import assert from 'assert';
import { invoiceMotorLabel, invoiceMotorLabels } from './invoiceMotorTypes';
import { buildInvoiceModel } from './invoiceExport';
import { buildInvoicePdf } from './invoicePdf';
import { getPricingSnapshot } from './constants';

const rooms = () => [
  { id: 1, name: 'Living', fabricInput: '83003L', blindTypes: ['Zebra'], windowGroups: [
    { quantity: '3', width: '35', height: '70', controlType: 'Motor', solar: false },
    { quantity: '1', width: '35', height: '35', controlType: 'Manual', solar: false }
  ] },
  { id: 2, name: 'Bed', fabricInput: '82086K', blindTypes: ['Roller'], windowGroups: [
    { quantity: '2', width: '30', height: '60', controlType: 'Motor', solar: 'AOK' }
  ] }
];
const Q = (id, v, o = {}) => ({ id, lineageId: 'L', version: 'v' + v, quoteName: 'Ann-q-v' + v, clientName: 'Ann Smith', location: 'Argyle', updatedDate: '2026-11-1' + v, pricing: getPricingSnapshot(), rooms: rooms(), ...o });
const R = (q, room, g, base, idx, w, h, motor, o = {}) => ({ id: `${base}${idx}${g}`, sourceQuoteId: q, sourceRoomId: room, sourceGroupIdx: g, clientName: 'Ann Smith', locationBase: base, locationIndex: idx, totalInLocation: 4, width: w, height: h, motor, ...o });
const pulledRows = q => [
  R(q, 1, 0, 'Living', 1, '35', '70', 'motor-wire-zigbee'),
  R(q, 1, 0, 'Living', 2, '35', '70', 'motor-recharge'),
  R(q, 1, 0, 'Living', 3, '35', '70', 'Custom', { motorCustomText: 'Somfy hardwired' }),
  R(q, 1, 1, 'Living', 4, '35', '35', 'Manual - Chain wand - White'),
  R(q, 2, 0, 'Bed', 1, '30', '60', 'motor-Zigbee', { solar: 'AOK' }),
  R(q, 2, 0, 'Bed', 2, '30', '60', 'motor-wire-zigbee', { solar: 'AOK' })
];
const sheet = (rows, o = {}) => ({ id: 's1', clientNames: ['Ann Smith'], address: 'Argyle', updatedDate: '2026-11-16', rows, ...o });
const EXPECT = ['Smart - Wired', 'Smart - Rechargeable', 'Smart - Somfy hardwired', 'Manual - Chain wand - White', 'Smart motor+Solar', 'Smart - Wired+Solar'];
const cells = (quote, info) => buildInvoiceModel(quote, { columns: ['location', 'motorSmart', 'unitPrice'], motorLabels: info ? info.labels : null }).rows.map(r => r[1]);

test('labels for every motor option', () => {
  assert.equal(invoiceMotorLabel({ motor: 'Manual' }), 'Manual');
  assert.equal(invoiceMotorLabel({ motor: 'Manual - Custom', motorCustomText: 'chain 6ft' }), 'Manual - chain 6ft');
  assert.equal(invoiceMotorLabel({ motor: 'Manual - Custom', motorCustomText: '  ' }), 'Manual');
  assert.equal(invoiceMotorLabel({ motor: 'Manual - Chain wand - Black' }), 'Manual - Chain wand - Black');
  assert.equal(invoiceMotorLabel({ motor: 'motor-wire-zigbee' }), 'Smart - Wired');
  assert.equal(invoiceMotorLabel({ motor: 'Custom', motorCustomText: '' }), 'Smart');
  assert.equal(invoiceMotorLabel({ motor: '' }), null);
  assert.equal(invoiceMotorLabel({}), null);
});

test('sheet pulled from this quote', () => {
  const v1 = Q('v1', 1);
  const info = invoiceMotorLabels(v1, [sheet(pulledRows('v1'))], [v1]);
  assert.equal(info.count, 6);
  assert.deepEqual(cells(v1, info), EXPECT);
  // no sheet at all -> unchanged invoice
  assert.equal(invoiceMotorLabels(v1, [], [v1]), null);
  assert.deepEqual(cells(v1, null), ['Smart motor', 'Smart motor', 'Smart motor', 'Manual', 'Smart motor+Solar', 'Smart motor+Solar']);
  // money never changes
  assert.equal(buildInvoiceModel(v1, { motorLabels: info.labels }).grandTotal, buildInvoiceModel(v1, {}).grandTotal);
});

test('older/newer versions of the same job', () => {
  const v1 = Q('v1', 1), v2 = Q('v2', 2);
  // sheet pulled from v1, invoice for v2 (made from that sheet)
  assert.deepEqual(cells(v2, invoiceMotorLabels(v2, [sheet(pulledRows('v1'))], [v1, v2])), EXPECT);
  // sheet pulled from v2, invoice for the older v1
  assert.deepEqual(cells(v1, invoiceMotorLabels(v1, [sheet(pulledRows('v2'))], [v1, v2])), EXPECT);
  // v2 has a different layout (extra group first): rows re-matched by size
  const v3 = Q('v3', 3, { rooms: [{ ...rooms()[0], windowGroups: [{ quantity: '1', width: '20', height: '20', controlType: 'Manual' }, ...rooms()[0].windowGroups] }, rooms()[1]] });
  const c = cells(v3, invoiceMotorLabels(v3, [sheet(pulledRows('v1'))], [v1, v3]));
  assert.deepEqual(c, ['Manual', ...EXPECT]);
});

test('blank sheet matched by client name and address', () => {
  const v1 = Q('v1', 1);
  const blank = pulledRows(null).map(r => ({ ...r, sourceQuoteId: null, sourceRoomId: null, sourceGroupIdx: null, clientName: 'ann smith' }));
  const info = invoiceMotorLabels(v1, [sheet(blank, { clientNames: ['ann  smith'], address: 'ARGYLE' })], [v1]);
  assert.deepEqual(cells(v1, info), EXPECT);
});

test('never another client, never a combined multi-job sheet, never contradicting Motor/Manual', () => {
  const v1 = Q('v1', 1);
  const other = Q('o1', 1, { lineageId: 'O', clientName: 'Bob', location: 'Frisco' });
  assert.equal(invoiceMotorLabels(v1, [sheet(pulledRows('o1'), { clientNames: ['Bob'], address: 'Frisco' })], [v1, other]), null);
  const combined = sheet([...pulledRows('v1'), ...pulledRows('o1')]);
  assert.equal(invoiceMotorLabels(v1, [combined], [v1, other]), null);
  // sheet switched window 1 to a chain wand, but the quote still prices it as Motor
  const rows = pulledRows('v1'); rows[0] = { ...rows[0], motor: 'Manual - Chain wand - Grey' };
  const c = cells(v1, invoiceMotorLabels(v1, [sheet(rows)], [v1]));
  assert.deepEqual(c, ['Smart - Rechargeable', 'Smart - Somfy hardwired', 'Smart motor', 'Manual - Chain wand - White', 'Smart motor+Solar', 'Smart - Wired+Solar']);
});

test('fewer sheet rows than windows, rows with no motor, two sheets (newest wins), odd data', () => {
  const v1 = Q('v1', 1);
  const few = pulledRows('v1').filter((_, i) => i !== 1 && i !== 5).map((r, i) => (i === 3 ? { ...r, motor: undefined } : r));
  assert.deepEqual(cells(v1, invoiceMotorLabels(v1, [sheet(few)], [v1])), ['Smart - Wired', 'Smart - Somfy hardwired', 'Smart motor', 'Manual - Chain wand - White', 'Smart motor+Solar', 'Smart motor+Solar']);
  const older = sheet(pulledRows('v1').map(r => ({ ...r, motor: r.motor.startsWith('Manual') ? 'Manual' : 'motor-recharge' })), { id: 's0', updatedDate: '2026-11-01' });
  assert.deepEqual(cells(v1, invoiceMotorLabels(v1, [older, sheet(pulledRows('v1'))], [v1])), EXPECT);
  assert.equal(invoiceMotorLabels(v1, [null, { id: 'x' }, { id: 'y', rows: [] }], [v1]), null);
  // the quote list not containing the quote itself (still works)
  assert.deepEqual(cells(v1, invoiceMotorLabels(v1, [sheet(pulledRows('v1'))], [])), EXPECT);
  // the PDF builds with labels
  buildInvoicePdf(v1, { motorLabels: invoiceMotorLabels(v1, [sheet(pulledRows('v1'))], [v1]).labels }, null);
});
