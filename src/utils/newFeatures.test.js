/**
 * @jest-environment node
 */
// Run with: CI=true npx react-scripts test --watchAll=false src/utils/newFeatures.test.js
// The 5 features added after the 2026-11-25 health check.
import assert from 'assert';
import { Packer } from 'docx';
import { quoteMatchesSearch } from './historySearch';
import { lineageJob, jobStageLabel, setJobStage, addPayment, removePayment, parsePaymentAmount } from './jobProgress';
import { deviceLabel, summarizeQuotes, describeOtherDevices, getDeviceId } from './syncCheck';
import { groupPhotosByRow } from './sheetPhotos';
import { buildInvoiceModel, buildInvoiceDocument, quoteValidUntilText } from './invoiceExport';
import { buildInvoicePdf } from './invoicePdf';
import { getPricingSnapshot } from './constants';

const quote = () => ({
  id: 'q1', clientName: 'Ann Lee', clientPhone: '(214) 555-0101', location: '2 Oak St, Flower Mound', pricing: getPricingSnapshot(),
  rooms: [{ id: 1, name: 'Living', fabricInput: '83003L', blindTypes: ['Zebra'], windowGroups: [{ quantity: '2', width: '35', height: '70', controlType: 'Manual' }] }]
});

describe('Valid until date on the quote file', () => {
  const today = new Date(2026, 10, 25);
  test('30 days from today', () => assert.strictEqual(quoteValidUntilText(30, today), 'December 25, 2026'));
  test('blank, 0, junk or over a year = no line', () => ['', 0, '0', 'abc', 400, null].forEach(v => assert.strictEqual(quoteValidUntilText(v, today), '')));
  test('quote model carries it and a note; invoice never does', () => {
    const m = buildInvoiceModel(quote(), { docType: 'quote', validDays: '14', today });
    assert.strictEqual(m.validUntilText, 'December 9, 2026');
    assert.ok(m.notes.some(n => n.includes('valid until December 9, 2026')));
    const none = buildInvoiceModel(quote(), { docType: 'quote', validDays: '', today });
    assert.ok(!none.validUntilText && !none.notes.some(n => n.includes('valid until')));
    const inv = buildInvoiceModel(quote(), { validDays: '30', today });
    assert.ok(!inv.validUntilText);
  });
  test('totals unchanged by the date', () => {
    const a = buildInvoiceModel(quote(), { docType: 'quote' });
    const b = buildInvoiceModel(quote(), { docType: 'quote', validDays: 30 });
    assert.deepStrictEqual(a.summary, b.summary);
  });
  test('PDF and Word build with it', async () => {
    const opts = { docType: 'quote', validDays: 30 };
    assert.ok(buildInvoicePdf(quote(), opts, null));
    const buf = await Packer.toBuffer(buildInvoiceDocument(quote(), opts, null));
    assert.ok(buf.length > 1000);
  });
});

describe('History search by name, address or phone', () => {
  const q = quote();
  test.each([
    ['ann', true], ['ANN LEE', true], ['lee ann', true], ['oak', true], ['flower mound', true], ['flowermound', false],
    ['5550101', true], ['555-0101', true], ['(214) 555', true], ['214 555 0101', true], ['0101', true], ['01', true],
    ['bob', false], ['', true], ['  ', true], ['999', false]
  ])('"%s" -> %s', (text, expected) => assert.strictEqual(quoteMatchesSearch(q, text), expected));
  test('quote with no phone or address does not crash', () => {
    assert.strictEqual(quoteMatchesSearch({ clientName: 'Bo' }, '555'), false);
    assert.strictEqual(quoteMatchesSearch({ clientName: 'Bo' }, 'bo'), true);
  });
});

describe('Job progress and payments', () => {
  const v1 = { id: 'v1', lineageId: 'L', orderedAt: '2026-11-01T00:00:00Z' };
  const v2 = { id: 'v2', lineageId: 'L' };
  const other = { id: 'o', lineageId: 'O', paidAt: 'x' };
  test('stage on one version shows for the whole job; undo clears every version', () => {
    let qs = [v1, v2, other];
    qs = setJobStage(qs, v2, 'installedAt', true, '2026-11-20T00:00:00Z');
    assert.strictEqual(lineageJob(qs, 'L').installedAt, '2026-11-20T00:00:00Z');
    assert.strictEqual(jobStageLabel(lineageJob(qs, 'L')), '🔧 Installed');
    qs = setJobStage(qs, { ...v1, installedAt: 'y' }, 'installedAt', true, '2026-11-21T00:00:00Z');
    qs = setJobStage(qs, v1, 'installedAt', false);
    assert.strictEqual(lineageJob(qs, 'L').installedAt, null);
    assert.strictEqual(qs.find(q => q.id === 'o').paidAt, 'x'); // other job untouched
  });
  test('payments: added on any version, counted once, removed wherever they are', () => {
    let qs = [v1, v2];
    qs = addPayment(qs, v1, { id: 'p1', amount: 900, date: '2026-11-02', note: 'Advance' });
    // "Save All Changes" copies v1 (with p1) into a new version v3
    qs = [...qs, { ...qs[0], id: 'v3' }];
    qs = addPayment(qs, v2, { id: 'p2', amount: 850.5, date: '2026-11-22' });
    let job = lineageJob(qs, 'L');
    assert.strictEqual(job.received, 1750.5);
    assert.deepStrictEqual(job.payments.map(p => p.id), ['p1', 'p2']);
    qs = removePayment(qs, v2, 'p1');
    job = lineageJob(qs, 'L');
    assert.deepStrictEqual(job.payments.map(p => p.id), ['p2']);
  });
  test('trashed versions and bad payment records are ignored', () => {
    const qs = [{ ...v1, payments: [{ id: 'a', amount: 100 }, { id: 'b', amount: -5 }, { id: 'c' }, null] }, { ...v2, trashedAt: 't', payments: [{ id: 'd', amount: 50 }] }];
    assert.strictEqual(lineageJob(qs, 'L').received, 100);
  });
  test('History label', () => {
    assert.strictEqual(jobStageLabel({}), '');
    assert.strictEqual(jobStageLabel({ orderedAt: 'x' }), '✅ Ordered');
    assert.strictEqual(jobStageLabel({ orderedAt: 'x', supplierOrderedAt: 'y', paidAt: 'z' }), '💰 Paid');
  });
  test('amount typed by hand', () => {
    assert.strictEqual(parsePaymentAmount('$1,250.50'), 1250.5);
    assert.strictEqual(parsePaymentAmount(' 900 '), 900);
    ['', '0', '-5', 'abc', '1.2.3', '9999999'].forEach(t => assert.strictEqual(parsePaymentAmount(t), null, t));
  });
});

describe('Sync check between devices', () => {
  test('device names', () => {
    assert.strictEqual(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'iPhone');
    assert.strictEqual(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'Mac');
    assert.strictEqual(deviceLabel('Mozilla/5.0 (Windows NT 10.0)'), 'Windows PC');
  });
  test('summary ignores trashed quotes', () => {
    const s = summarizeQuotes([{ updatedDate: '2026-11-20T00:00:00Z' }, { createdDate: '2026-11-24T00:00:00Z' }, { trashedAt: 'x', updatedDate: '2026-12-01T00:00:00Z' }]);
    assert.deepStrictEqual(s, { quoteCount: 2, newestQuoteAt: '2026-11-24T00:00:00.000Z' });
  });
  test('other devices: same / other newer / different; this device left out', () => {
    const mine = { quoteCount: 5, newestQuoteAt: '2026-11-24T00:00:00.000Z' };
    const out = describeOtherDevices([
      { id: 'me', checkedAt: 'z' },
      { id: 'mac', label: 'Mac', checkedAt: '2026-11-25T01:00:00Z', quoteCount: 5, newestQuoteAt: '2026-11-24T00:00:00.000Z' },
      { id: 'pad', label: 'iPad', checkedAt: '2026-11-25T02:00:00Z', quoteCount: 6, newestQuoteAt: '2026-11-25T00:00:00.000Z' },
      { id: 'old', label: 'PC', checkedAt: '2026-11-01T00:00:00Z', quoteCount: 3, newestQuoteAt: '2026-10-01T00:00:00.000Z' }
    ], 'me', mine);
    assert.deepStrictEqual(out.map(o => [o.id, o.status]), [['pad', 'other-newer'], ['mac', 'same'], ['old', 'different']]);
  });
  test('device id is kept, and works with storage blocked', () => {
    const store = {}; const storage = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } };
    const a = getDeviceId(storage);
    assert.strictEqual(getDeviceId(storage), a);
    assert.ok(getDeviceId({ getItem: () => { throw new Error('blocked'); } }).startsWith('dev-temp-'));
  });
});

describe('Window photos', () => {
  test('grouped by window, oldest first, junk ignored', () => {
    const out = groupPhotosByRow([
      { id: 'b', rowId: 'r1', dataUrl: 'data:image/jpeg;base64,x', createdAt: '2' },
      { id: 'a', rowId: 'r1', dataUrl: 'data:image/jpeg;base64,x', createdAt: '1' },
      { id: 'c', rowId: 'r2', dataUrl: 'data:image/jpeg;base64,x', createdAt: '1' },
      { id: 'd', rowId: 'r2', dataUrl: 'javascript:alert(1)' },
      { id: 'e', dataUrl: 'data:image/jpeg;base64,x' },
      null
    ]);
    assert.deepStrictEqual(Object.keys(out).sort(), ['r1', 'r2']);
    assert.deepStrictEqual(out.r1.map(p => p.id), ['a', 'b']);
    assert.strictEqual(out.r2.length, 1);
  });
});
