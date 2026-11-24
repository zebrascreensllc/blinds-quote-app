/**
 * @jest-environment node
 */
// Run with: CI=true npx react-scripts test --watchAll=false src/utils/cassette.test.js
// Cassette chosen on the quote (owner's request, 2026-11-24): picked per window
// group like on the supplier sheet, V3 / S3 PLUS cost $6 per sq m extra, S1 is
// the free default, and old quotes never change price.
import assert from 'assert';
import {
  CASSETTE_OPTIONS, CASSETTE_S1, CASSETTE_S3, autoCassetteForHeight, hasChosenCassette,
  cassetteFromQuoteGroup, quoteCassetteFromRow, quoteCassetteLabel, cassetteUpgradePerSqm, isUpgradeCassette
} from './cassette';
import { calculateGroupQuote, computeQuoteFinancials } from './pricing';
import { getPricingSnapshot } from './constants';
import { expandQuoteIntoRows, createBlankMeasurementRow } from './measurementUtils';
import { buildRoomsFromSheet, resolveSheetQuote } from './sheetToQuote';
import { motorStepperInfo, stepMotor, buildEffectiveRooms } from './quoteGroups';
import { buildInvoiceLineItems, buildInvoiceModel } from './invoiceExport';
import { parseUnits } from './formatters';
import { generatePriceBreakdownExcel } from './priceBreakdownExport';
import ExcelJS from 'exceljs';

const V3_WHITE = 'Fabric Wrapped (V3) - White and Type C Fabric wrapped';
const NEW = getPricingSnapshot();
const { CASSETTE_UPGRADE_PER_SQM: _r, CHARGE_AUTO_S3_CASSETTE: _c, ...OLD } = NEW; // a quote saved before cassette pricing
const G = (o = {}) => ({ id: 1, quantity: '1', width: '40', height: '60', controlType: 'Manual', solar: false, mount: 'Inside', surchargeOverride: null, ...o });
const price = (g, pricing, fabric = ['82086K']) => calculateGroupQuote(g, fabric, 'Zebra', 0, pricing).minQuote;
const sqm = (w, h) => Math.max(1.5, (w * h) / 1550);

test('which options cost extra, Standard by height, labels', () => {
  assert.deepStrictEqual(CASSETTE_OPTIONS.filter(isUpgradeCassette).length, 8); // 7 V3 + S3 PLUS
  assert.ok(!isUpgradeCassette(CASSETTE_S1) && !isUpgradeCassette('Custom') && isUpgradeCassette(CASSETTE_S3));
  assert.equal(autoCassetteForHeight('90'), CASSETTE_S1);
  assert.equal(autoCassetteForHeight('90 1/2'), CASSETTE_S3);
  assert.equal(autoCassetteForHeight('7\'11"'), CASSETTE_S3);
  assert.equal(autoCassetteForHeight(''), CASSETTE_S1);
  assert.equal(autoCassetteForHeight(undefined), CASSETTE_S1);
  assert.equal(quoteCassetteLabel(G()), 'Standard (S1)');
  assert.equal(quoteCassetteLabel(G({ height: '100' })), 'Standard (S3 PLUS)');
  assert.equal(quoteCassetteLabel(G({ cassette: V3_WHITE })), 'Fabric Wrapped (V3) - White');
  assert.equal(quoteCassetteLabel(G({ cassette: 'Custom', cassetteCustomText: ' Bronze ' })), 'Bronze');
  // Custom with nothing typed, or an unknown value, is just Standard.
  assert.ok(!hasChosenCassette(G({ cassette: 'Custom', cassetteCustomText: '  ' })));
  assert.ok(!hasChosenCassette(G({ cassette: 'Gold plated' })));
  assert.ok(!hasChosenCassette(null));
});

test('price: S1 free, V3/S3 $6 per sq m (1.5 sq m minimum), old quotes unchanged', () => {
  const base = price(G(), NEW);
  // 40x60 = 1.548 sq m
  assert.ok(Math.abs(price(G({ cassette: V3_WHITE }), NEW) - base - 6 * sqm(40, 60)) < 1e-9);
  assert.ok(Math.abs(price(G({ cassette: CASSETTE_S3 }), NEW) - base - 6 * sqm(40, 60)) < 1e-9);
  assert.equal(price(G({ cassette: CASSETTE_S1 }), NEW), base);
  assert.equal(price(G({ cassette: 'Custom', cassetteCustomText: 'x' }), NEW), base);
  // small window: the 1.5 sq m minimum, $9
  assert.ok(Math.abs(price(G({ width: '20', height: '20', cassette: V3_WHITE }), NEW) - price(G({ width: '20', height: '20' }), NEW) - 9) < 1e-9);
  // quantity 3 -> 3x the extra
  assert.ok(Math.abs(price(G({ quantity: '3', cassette: V3_WHITE }), NEW) - price(G({ quantity: '3' }), NEW) - 18 * sqm(40, 60)) < 1e-9);
  // range estimate (no fabric): both ends move by the same amount
  const r0 = calculateGroupQuote(G(), [], ['Roller', 'Zebra'], 0, NEW), r1 = calculateGroupQuote(G({ cassette: V3_WHITE }), [], ['Roller', 'Zebra'], 0, NEW);
  assert.ok(Math.abs((r1.minQuote - r0.minQuote) - (r1.maxQuote - r0.maxQuote)) < 1e-9 && r1.minQuote > r0.minQuote);
  // Tall window with Standard: S3 PLUS charged on new quotes only.
  const tall = G({ width: '40', height: '100' });
  assert.ok(Math.abs(price(tall, NEW) - price(tall, { ...NEW, CHARGE_AUTO_S3_CASSETTE: false }) - 6 * sqm(40, 100)) < 1e-9);
  assert.equal(price(tall, OLD), price(tall, { ...NEW, CHARGE_AUTO_S3_CASSETTE: false }));
  assert.equal(price(tall, null), price({ ...tall, cassette: CASSETTE_S1 }, null));
  // But a cassette the owner CHOSE on an old quote is charged (not silent).
  assert.ok(price(G({ cassette: V3_WHITE }), OLD) > price(G(), OLD));
  assert.ok(price(G({ cassette: V3_WHITE }), null) > price(G(), null));
  assert.equal(cassetteUpgradePerSqm(G({ cassette: V3_WHITE }), { ...NEW, CASSETTE_UPGRADE_PER_SQM: 8 }), 8);
  // Manual-price-free totals and the supplier cost both include it.
  const q = (cassette) => ({ rooms: [{ id: 1, name: 'L', fabricInput: '82086K', blindTypes: ['Zebra'], windowGroups: [G({ quantity: '2', cassette })] }], pricing: NEW, editedPrices: {} });
  const f0 = computeQuoteFinancials(q('')), f1 = computeQuoteFinancials(q(V3_WHITE));
  const extra = 2 * 6 * sqm(40, 60);
  assert.ok(Math.abs(f1.revenueSubtotal - f0.revenueSubtotal - extra) < 1e-9); // client pays the extra
  assert.ok(Math.abs(f1.appGeneratedCosts.total - f0.appGeneratedCosts.total - extra) < 1e-9); // supplier cost includes it
  assert.ok(Math.abs(f1.appEstimatedProfit - f0.appEstimatedProfit) < 1e-9); // profit unchanged
});

test('quote -> supplier sheet (Pull Existing Quote and the quick supplier export)', () => {
  const quote = { id: 'q1', clientName: 'Ann', rooms: [{ id: 1, name: 'Living', fabricInput: 'X', blindTypes: ['Zebra'], windowGroups: [
    G({ quantity: '2', cassette: V3_WHITE }), G({ height: '100' }), G({ cassette: 'Custom', cassetteCustomText: 'Bronze' }), G({ cassette: 'Custom', cassetteCustomText: '' }), G({ height: '100', cassette: CASSETTE_S1 })
  ] }] };
  const rows = expandQuoteIntoRows(quote);
  assert.deepStrictEqual(rows.map(r => [r.cassette, r.cassetteCustomText]), [
    [V3_WHITE, ''], [V3_WHITE, ''], [CASSETTE_S3, ''], ['Custom', 'Bronze'], [CASSETTE_S1, ''], [CASSETTE_S1, '']
  ]);
  assert.deepStrictEqual(expandQuoteIntoRows(quote, { prefillMeasurements: true }).map(r => r.cassette), rows.map(r => r.cassette));
  rows.forEach(r => Object.values(r).forEach(v => assert.notStrictEqual(v, undefined)));
  assert.equal(cassetteFromQuoteGroup(null).cassette, CASSETTE_S1);
});

test('sheet -> quote keeps the cassette, never turns a default into a charge', () => {
  // row on the standard cassette for its height -> Standard on the quote
  assert.deepStrictEqual(quoteCassetteFromRow({ cassette: CASSETTE_S1 }, '60'), { cassette: '', cassetteCustomText: '' });
  assert.deepStrictEqual(quoteCassetteFromRow({ cassette: CASSETTE_S3 }, '100'), { cassette: '', cassetteCustomText: '' });
  // changed on the sheet -> chosen on the quote
  assert.deepStrictEqual(quoteCassetteFromRow({ cassette: CASSETTE_S3 }, '60'), { cassette: CASSETTE_S3, cassetteCustomText: '' });
  assert.deepStrictEqual(quoteCassetteFromRow({ cassette: CASSETTE_S1 }, '100'), { cassette: CASSETTE_S1, cassetteCustomText: '' });
  assert.deepStrictEqual(quoteCassetteFromRow({ cassette: V3_WHITE }, ''), { cassette: V3_WHITE, cassetteCustomText: '' });
  assert.deepStrictEqual(quoteCassetteFromRow({ cassette: 'Custom', cassetteCustomText: ' Bronze' }, ''), { cassette: 'Custom', cassetteCustomText: 'Bronze' });
  assert.deepStrictEqual(quoteCassetteFromRow({ cassette: 'Custom', cassetteCustomText: '' }, ''), { cassette: '', cassetteCustomText: '' });
  assert.deepStrictEqual(quoteCassetteFromRow({}, '60'), { cassette: '', cassetteCustomText: '' });
  // quote explicitly chose S1 on a short window: kept as chosen
  assert.deepStrictEqual(quoteCassetteFromRow({ cassette: CASSETTE_S1 }, '60', G({ cassette: CASSETTE_S1 })), { cassette: CASSETTE_S1, cassetteCustomText: '' });

  const detect = () => ['Zebra'];
  // Pull Existing Quote: round trip quote -> sheet -> quote
  const quote = { id: 'q1', clientName: 'Ann', location: 'Plano', version: 'v1', updatedDate: '2026-11-01', rooms: [{ id: 1, name: 'Living', fabricInput: '82086K', blindTypes: ['Zebra'], windowGroups: [G({ quantity: '2', cassette: V3_WHITE }), G({ height: '100' })] }], editedPrices: {} };
  const sheetRows = expandQuoteIntoRows(quote).map(r => ({ ...r, width: '40', height: r.quotedHeight }));
  let built = buildRoomsFromSheet({ rows: sheetRows }, quote, detect);
  const groups = built.rooms.flatMap(r => r.windowGroups);
  assert.deepStrictEqual(groups.map(g => g.cassette), [V3_WHITE, V3_WHITE, '']);
  // owner changes one window's cassette on the sheet
  sheetRows[2] = { ...sheetRows[2], cassette: '(V3) - Black and Type C Fabric wrapped' };
  built = buildRoomsFromSheet({ rows: sheetRows }, quote, detect);
  assert.equal(built.rooms.flatMap(r => r.windowGroups)[2].cassette, '(V3) - Black and Type C Fabric wrapped');

  // Start blank sheet, no quote at all
  const blank = [
    { ...createBlankMeasurementRow({ clientName: 'Bo', locationBase: 'Bed' }), width: '30', height: '50' },
    { ...createBlankMeasurementRow({ clientName: 'Bo', locationBase: 'Den' }), width: '30', height: '50', cassette: V3_WHITE }
  ];
  built = buildRoomsFromSheet({ rows: blank }, null, detect);
  assert.deepStrictEqual(built.rooms.map(r => r.windowGroups[0].cassette), ['', V3_WHITE]);
  // Start blank sheet whose client already has a quote (matched by name + address)
  const blank2 = { clientNames: ['Ann'], address: 'Plano', rows: [
    { ...createBlankMeasurementRow({ clientName: 'Ann', locationBase: 'Living' }), width: '40', height: '60', cassette: CASSETTE_S3 }
  ] };
  const res = resolveSheetQuote(blank2, [quote], parseUnits);
  assert.equal(res.quote && res.quote.id, 'q1');
  built = buildRoomsFromSheet(res.sheet, res.quote, detect);
  assert.equal(built.rooms.flatMap(r => r.windowGroups)[0].cassette, CASSETTE_S3);
  built.rooms.forEach(r => r.windowGroups.forEach(g => { assert.notStrictEqual(g.cassette, undefined); assert.notStrictEqual(g.cassetteCustomText, undefined); }));
});

test('quote screen: motor stepper never merges different cassettes; edits apply', () => {
  const room = { id: 1, name: 'L', windowGroups: [G({ quantity: '2', cassette: V3_WHITE }), G({ quantity: '1', controlType: 'Motor' })] };
  const eff = buildEffectiveRooms([room], {})[0];
  assert.deepStrictEqual(motorStepperInfo(eff, eff.windowGroups[0]), { total: 2, motor: 0 });
  const step = stepMotor(eff, eff.windowGroups[0], 'add', {}, () => null, 1);
  const added = Object.values(step.addedGroups)[0].group;
  assert.equal(added.cassette, V3_WHITE); // the split-off part keeps its cassette
  assert.ok(!step.groupEdits['1_1']); // did not merge into the Standard motor group
  const edited = buildEffectiveRooms([room], { groupEdits: { '1_1': { cassette: CASSETTE_S3, cassetteCustomText: '' } } })[0];
  assert.equal(edited.windowGroups[1].cassette, CASSETTE_S3);
});

test('invoice and price breakdown show the cassette', async () => {
  const quote = { id: 'q', clientName: 'A', pricing: NEW, editedPrices: {}, hub: { included: false }, rooms: [{ id: 1, name: 'L', fabricInput: '82086K', blindTypes: ['Zebra'], windowGroups: [G({ cassette: V3_WHITE }), G()] }] };
  const { items } = buildInvoiceLineItems(quote);
  assert.deepStrictEqual(items.map(i => i.cassette), ['Fabric Wrapped (V3) - White', 'Standard (S1)']);
  const m = buildInvoiceModel(quote, { columns: ['itemNo', 'location', 'cassette', 'unitPrice'] });
  assert.ok(JSON.stringify(m).includes('Fabric Wrapped (V3) - White'));
  // the client Quote document (PDF/Word) shares the same columns
  const qd = buildInvoiceModel(quote, { columns: ['itemNo', 'location', 'cassette', 'unitPrice'], docType: 'quote' });
  assert.ok(JSON.stringify(qd.rows).includes('Fabric Wrapped (V3) - White'));
  // default columns unchanged (no cassette column unless ticked)
  const d = buildInvoiceModel(quote, {});
  assert.ok(!JSON.stringify(d).includes('Fabric Wrapped (V3)'));
  // Price Breakdown Excel: Cassette column before Price, summary rows span every column.
  const buf = await generatePriceBreakdownExcel(quote);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  assert.deepStrictEqual(ws.getRow(1).values.slice(1), ['Item No', 'Location', 'Width (Inches)', 'Height (Inches)', 'Type', 'Cassette', 'Price']);
  assert.equal(ws.getRow(2).getCell(6).value, 'Fabric Wrapped (V3) - White');
  assert.equal(ws.getRow(3).getCell(6).value, 'Standard (S1)');
  const totalRow = ws.getRows(4, ws.rowCount - 3).find(r => String(r.getCell(1).value || '').startsWith('Grand Total'));
  assert.ok(totalRow && totalRow.getCell(7).isMerged);
});
