/**
 * @jest-environment node
 */
// Run with: CI=true npx react-scripts test --watchAll=false src/utils/smallMotor.test.js
// Small motor (owner's request, 2026-11-26): a motor choice priced at $65 per
// window instead of $80, on the quote AND on the supplier measurement sheet.
// Every path that reads a window's motor is checked here: quote totals,
// profit, quote document (PDF/Word), invoice, Copy-text inputs, supplier sheet
// rows/export, sheet -> quote (pulled and Start blank), the invoice's motor
// labels, the quote screen's Type/stepper edits, and old saved data.
import assert from 'assert';
import {
  SMALL_MOTOR, SMALL_MOTOR_LABEL, SMALL_MOTOR_SHEET_TYPE, isSmallMotor, controlChoice, controlPatch,
  CONTROL_CHOICES, smallMotorClientCost
} from './smallMotor';
import { calculateGroupQuote, computeQuoteFinancials, estimateOptionTotals, optionGrandTotals } from './pricing';
import { buildInvoiceModel, buildInvoiceLineItems, computeInvoiceTotals } from './invoiceExport';
import { MOTOR_OPTIONS, isManualMotor, expandQuoteIntoRows, buildRowExportFields, getIncompleteFields, sheetToCSV } from './measurementUtils';
import { sheetToExcelBuffer } from './xlsxExport';
import { buildRoomsFromSheet, linkRowsToQuote } from './sheetToQuote';
import { buildEffectiveRooms, stepMotor, pruneRooms } from './quoteGroups';
import { invoiceMotorLabels, invoiceMotorLabel } from './invoiceMotorTypes';
import { hasPendingTableEdits } from './pendingEdits';
import { getPricingSnapshot } from './constants';
import { parseUnits } from './formatters';

const snap = getPricingSnapshot();
const ALL_COLS = ['itemNo', 'location', 'motorSmart', 'unitPrice'];
const g = (over) => ({ id: 1, quantity: '1', width: '35', height: '70', controlType: 'Manual', solar: false, mount: 'Inside', surchargeOverride: null, cassette: '', cassetteCustomText: '', ...over });

// 2 small motors + 1 regular motor + 1 manual, exact fabric.
const mixedQuote = (over = {}) => ({
  id: 'q1', clientName: 'Ann', location: '1 Main', quoteName: 'Ann-1 Main-Zebra-quote-v1', version: 'v1', pricing: snap, editedPrices: {},
  rooms: [
    { id: 1, name: 'Living', fabricInput: '83003L', blindTypes: ['Zebra'], windowGroups: [
      g({ quantity: '2', controlType: 'Motor', motorSize: SMALL_MOTOR }),
      g({ id: 2, width: '48', controlType: 'Motor' })
    ] },
    { id: 2, name: 'Bed', fabricInput: '83003L', blindTypes: ['Zebra'], windowGroups: [g({ width: '30', height: '60' })] }
  ],
  ...over
});

const windowsOnly = (quote) => buildInvoiceLineItems(quote).items.reduce((s, it) => s + it.unitPrice, 0);

describe('small motor helpers', () => {
  test('choice <-> fields, and only a Motor window can be small', () => {
    expect(CONTROL_CHOICES).toEqual(['Manual', 'Cordless', 'Motor', 'Small motor']);
    expect(controlPatch('Small motor')).toEqual({ controlType: 'Motor', motorSize: 'Small' });
    expect(controlPatch('Motor')).toEqual({ controlType: 'Motor', motorSize: '' });
    expect(controlPatch('Manual')).toEqual({ controlType: 'Manual', motorSize: '', solar: false });
    expect(controlChoice(g({ controlType: 'Motor', motorSize: 'Small' }))).toBe('Small motor');
    expect(controlChoice(g({ controlType: 'Motor' }))).toBe('Motor');
    // Stale motorSize left on a Manual window never counts (old/odd data).
    expect(isSmallMotor(g({ controlType: 'Manual', motorSize: 'Small' }))).toBe(false);
    expect(controlChoice({})).toBe('Manual');
  });
  test('price: edited > snapshot > $65 (old snapshots have no small motor price)', () => {
    expect(smallMotorClientCost(snap, {})).toBe(65);
    expect(smallMotorClientCost({ MOTOR_COST_CLIENT: 80 }, null)).toBe(65);
    expect(smallMotorClientCost(null, undefined)).toBe(65);
    expect(smallMotorClientCost(snap, { smallMotorCost: 60 })).toBe(60);
    expect(smallMotorClientCost(snap, { smallMotorCost: 0 })).toBe(0);
  });
});

describe('quote pricing', () => {
  test('window price is the same as a regular motor; only the motor line differs', () => {
    const small = calculateGroupQuote(g({ controlType: 'Motor', motorSize: 'Small' }), ['83003L'], 'Zebra', 1, snap);
    const regular = calculateGroupQuote(g({ controlType: 'Motor' }), ['83003L'], 'Zebra', 1, snap);
    expect(small.baseMinQuote).toBe(regular.baseMinQuote);
    // Grand-total style quote includes the motor's client price: $65 vs $80.
    expect(regular.minQuote - small.minQuote).toBeCloseTo(15, 6);
    // Profit: (65 - 50) vs (80 - 50).
    expect(regular.profit - small.profit).toBeCloseTo(15, 6);
  });
  test('computeQuoteFinancials: 1 x $80 + 2 x $65', () => {
    const q = mixedQuote();
    const f = computeQuoteFinancials(q);
    expect(f.motorCount).toBe(1);
    expect(f.smallMotorCount).toBe(2);
    expect(f.revenueSubtotal).toBeCloseTo(windowsOnly(q) + 80 + 130, 6);
    // Supplier cost: every motor (small too) costs $50 + its remote share.
    expect(f.appGeneratedCosts.motor).toBeCloseTo(150, 6);
  });
  test('an edited small motor price is used, the regular motor price is not touched', () => {
    const q = mixedQuote({ editedPrices: { smallMotorCost: 55, motorCost: 90 } });
    expect(computeQuoteFinancials(q).revenueSubtotal).toBeCloseTo(windowsOnly(q) + 90 + 110, 6);
  });
});

describe('invoice and quote document (PDF/Word share this model)', () => {
  test('invoice shows a separate Small motor line and the totals add up', () => {
    const q = mixedQuote();
    const { items } = buildInvoiceLineItems(q);
    const t = computeInvoiceTotals(q, items);
    expect([t.motorCount, t.smallMotorCount]).toEqual([1, 2]);
    expect(t.motorGrandTotal).toBe(80);
    expect(t.smallMotorGrandTotal).toBe(130);
    expect(t.total).toBeCloseTo(t.itemsSubtotal + 80 + 130, 6);
    expect(t.total).toBeCloseTo(computeQuoteFinancials(q).revenueSubtotal, 6);
    const model = buildInvoiceModel(q, { columns: ALL_COLS });
    const labels = model.summary.map(s => s.label);
    expect(labels).toContain('Motor windows 1*$80');
    expect(labels).toContain('Motor with remote windows 2*$65');
    // Manual/Smart column: the client sees "Motor with remote" (no measurement sheet yet).
    const motorCol = model.columns.findIndex(c => c.key === 'motorSmart');
    expect(model.rows.map(r => r[motorCol])).toEqual(['Motor with remote', 'Motor with remote', 'Smart motor', 'Manual']);
  });
  test('quote document shows the same lines', () => {
    const q = mixedQuote({ editedPrices: { smallMotorCost: 60 } });
    const model = buildInvoiceModel(q, { docType: 'quote', columns: ALL_COLS });
    const labels = model.summary.map(s => s.label);
    expect(labels).toContain('Motor with remote windows 2*$60');
    const t = computeInvoiceTotals(q, buildInvoiceLineItems(q).items);
    expect(t.total).toBeCloseTo(t.itemsSubtotal + 80 + 120, 6);
  });
  test('Roller vs Zebra options include the small motor line (option total = chosen quote total)', () => {
    const q = mixedQuote();
    q.rooms[0].fabricInput = '';
    q.rooms[0].blindTypes = ['Roller', 'Zebra'];
    const items = buildInvoiceLineItems(q).items;
    const t = computeInvoiceTotals(q, items);
    const opts = estimateOptionTotals(q.rooms, () => null, snap);
    const grand = optionGrandTotals(opts, { motorGrandTotal: t.motorGrandTotal, smallMotorGrandTotal: t.smallMotorGrandTotal, solarGrandTotal: t.solarGrandTotal, hubTotal: t.hubTotal, taxRate: t.taxRate, otherExpenses: 0 });
    const chosen = { ...q, rooms: q.rooms.map(r => (r.id === 1 ? { ...r, blindTypes: ['Roller'] } : r)) };
    const ct = computeInvoiceTotals(chosen, buildInvoiceLineItems(chosen).items);
    expect(grand.Roller.grandMin).toBeCloseTo(ct.grandTotal, 6);
  });
});

describe('supplier measurement sheet', () => {
  test('Small motor is a Smart option, placed with the other motor types', () => {
    expect(MOTOR_OPTIONS).toContain(SMALL_MOTOR_SHEET_TYPE);
    expect(MOTOR_OPTIONS.indexOf('Small motor')).toBe(MOTOR_OPTIONS.indexOf('motor-wire-zigbee') + 1);
    expect(isManualMotor('Small motor')).toBe(false);
  });
  test('quote -> sheet (Pull Existing Quote / quick export): small motor windows get the Small motor type', () => {
    const rows = expandQuoteIntoRows(mixedQuote(), { prefillMeasurements: true });
    expect(rows.map(r => r.motor)).toEqual(['Small motor', 'Small motor', 'motor-Zigbee', 'Manual']);
    const f = buildRowExportFields(rows[0], 0, {});
    expect(f.manualSmart).toBe('Motor');
    expect(f.motorType).toBe('Small motor');
    // Needs a remote (or "No remote") like any motor.
    expect(getIncompleteFields({ ...rows[0], fabricNumber: 'x' })).toContain('remote group');
    expect(getIncompleteFields({ ...rows[0], fabricNumber: 'x', noRemote: true })).toEqual([]);
    expect(buildRowExportFields({ ...rows[0], noRemote: true }, 0, {}).remote).toBe('No remote');
  });
  test('old quotes (no motorSize) still give motor-Zigbee', () => {
    const q = mixedQuote();
    q.rooms[0].windowGroups[0] = g({ quantity: '2', controlType: 'Motor' });
    expect(expandQuoteIntoRows(q).map(r => r.motor)).toEqual(['motor-Zigbee', 'motor-Zigbee', 'motor-Zigbee', 'Manual']);
  });
});

describe('sheet -> quote', () => {
  const measured = (rows) => rows.map(r => ({ ...r, width: r.width || '35', height: r.height || '70' }));
  test('pulled sheet: Small motor comes back as Small motor; a row changed in the sheet follows the sheet', () => {
    const q = mixedQuote();
    const rows = measured(expandQuoteIntoRows(q, { prefillMeasurements: true }));
    rows[1] = { ...rows[1], motor: 'motor-Zigbee' };        // owner changed one in the sheet
    rows[2] = { ...rows[2], motor: 'Small motor' };          // and made the regular one small
    const { rooms } = buildRoomsFromSheet({ rows }, q, () => ['Zebra']);
    const groups = rooms.flatMap(r => r.windowGroups);
    expect(groups.map(controlChoice)).toEqual(['Small motor', 'Motor', 'Small motor', 'Manual']);
  });
  test('Start blank sheet with Small motor rows', () => {
    const rows = [
      { id: 'a', clientName: 'Zed', locationBase: 'Den', locationIndex: 1, motor: 'Small motor', width: '30', height: '40', fabricNumber: '83003L', blindType: 'Zebra', solar: 'AOK' },
      { id: 'b', clientName: 'Zed', locationBase: 'Hall', locationIndex: 1, motor: 'motor-recharge', width: '30', height: '40', fabricNumber: '83003L', blindType: 'Zebra' },
      { id: 'c', clientName: 'Zed', locationBase: 'Bath', locationIndex: 1, motor: 'Manual - Chain wand - White', width: '30', height: '40', fabricNumber: '83003L', blindType: 'Zebra' }
    ];
    const { rooms } = buildRoomsFromSheet({ rows }, null, () => ['Zebra']);
    const groups = rooms.flatMap(r => r.windowGroups);
    expect(groups.map(controlChoice)).toEqual(['Small motor', 'Motor', 'Manual']);
    expect(groups[0].solar).toBe('AOK'); // solar still allowed on a small motor
    expect(groups[2].motorSize).toBe('');
  });
  test('Start blank sheet matched to the client\'s quote (linkRowsToQuote) keeps Small motor', () => {
    const q = mixedQuote();
    const rows = measured(expandQuoteIntoRows(q)).map(r => ({ ...r, sourceQuoteId: null, sourceRoomId: null, sourceGroupIdx: null }));
    const linked = linkRowsToQuote(rows, q, parseUnits);
    expect(linked.matched).toBe(4);
    const { rooms } = buildRoomsFromSheet({ rows: linked.rows }, q, () => ['Zebra']);
    expect(rooms.flatMap(r => r.windowGroups).map(controlChoice)).toEqual(['Small motor', 'Small motor', 'Motor', 'Manual']);
  });
  test('extra sheet windows joining a room never merge a Small motor with a regular motor', () => {
    const q = { ...mixedQuote(), rooms: [{ id: 1, name: 'Den', fabricInput: '83003L', blindTypes: ['Zebra'], windowGroups: [g({ controlType: 'Motor' })] }] };
    const base = measured(expandQuoteIntoRows(q));
    const extra = [
      { id: 'x1', clientName: 'Ann', locationBase: 'Den', locationIndex: 2, motor: 'Small motor', width: '35', height: '70', fabricNumber: '83003L', blindType: 'Zebra' },
      { id: 'x2', clientName: 'Ann', locationBase: 'Den', locationIndex: 3, motor: 'motor-Zigbee', width: '35', height: '70', fabricNumber: '83003L', blindType: 'Zebra' }
    ];
    const { rooms } = buildRoomsFromSheet({ rows: [...base, ...extra] }, q, () => ['Zebra']);
    const den = rooms.find(r => r.name === 'Den');
    expect(den.windowGroups.map(x => [controlChoice(x), x.quantity])).toEqual([['Motor', '1'], ['Small motor', '1'], ['Motor', '1']]);
  });
});

describe('invoice motor labels from the measurement sheet', () => {
  test('label text', () => {
    expect(invoiceMotorLabel({ motor: 'Small motor' })).toBe('Motor with remote');
    expect(invoiceMotorLabel({ motor: 'motor-Zigbee' })).toBe('Smart motor');
    expect(invoiceMotorLabel({ motor: 'motor-wire-zigbee' })).toBe('Smart - Wired');
    // The supplier sheet/Excel still says Small motor.
    expect(buildRowExportFields({ motor: 'Small motor', clientName: '', locationBase: 'Den', locationIndex: 1, totalInLocation: 1 }, 0, {}).motorType).toBe('Small motor');
  });
  test('a sheet label is only used when it agrees with Small vs regular on the quote', () => {
    const q = mixedQuote();
    const rows = expandQuoteIntoRows(q);
    // Sheet: first small window kept Small motor, second changed to Zigbee,
    // the regular motor changed to Small motor (quote not regenerated).
    rows[1].motor = 'motor-Zigbee';
    rows[2].motor = 'Small motor';
    const res = invoiceMotorLabels(q, [{ id: 's1', rows, updatedDate: '2026-11-26' }], [q]);
    expect(res.labels['1_0']).toEqual(['Motor with remote']);
    expect(res.labels['1_1']).toBeUndefined();
    const model = buildInvoiceModel(q, { columns: ALL_COLS, motorLabels: res.labels });
    const motorCol = model.columns.findIndex(c => c.key === 'motorSmart');
    // Each label matches what that line is charged for.
    expect(model.rows.map(r => r[motorCol])).toEqual(['Motor with remote', 'Motor with remote', 'Smart motor', 'Manual']);
  });
});

describe('quote screen edits', () => {
  const room = () => ({ id: 1, name: 'Living', fabricInput: '83003L', blindTypes: ['Zebra'], windowGroups: [
    g({ quantity: '3', controlType: 'Manual' }),
    g({ id: 2, quantity: '1', controlType: 'Motor', motorSize: SMALL_MOTOR })
  ] });
  test('TYPE pencil: Small motor -> Manual clears motorSize and solar; back to Motor is a regular motor', () => {
    const rooms = [room()];
    let eff = buildEffectiveRooms(rooms, { groupEdits: { '1_1': { controlType: 'Manual', solar: 'AOK' } } });
    expect(eff[0].windowGroups[1].motorSize).toBe('');
    expect(eff[0].windowGroups[1].solar).toBe(false);
    eff = buildEffectiveRooms(rooms, { groupEdits: { '1_1': { ...controlPatch('Manual') } } });
    eff = buildEffectiveRooms(pruneRooms(eff, () => false).rooms, { groupEdits: { '1_1': { ...controlPatch('Motor') } } });
    expect(controlChoice(eff[0].windowGroups[1])).toBe('Motor');
  });
  test('motor stepper: + on a Small motor card adds a Small motor, + on a Manual card adds a regular one', () => {
    const eff = buildEffectiveRooms([room()], {});
    const r = eff[0];
    const onSmall = stepMotor(r, r.windowGroups[1], 'add', {}, () => null, 1);
    const after1 = buildEffectiveRooms([room()], onSmall)[0];
    expect(after1.windowGroups.map(x => [controlChoice(x), x.quantity])).toEqual([['Manual', '2'], ['Small motor', '2']]);
    const onManual = stepMotor(r, r.windowGroups[0], 'add', {}, () => null, 2);
    const after2 = buildEffectiveRooms([room()], onManual)[0];
    expect(after2.windowGroups.map(x => [controlChoice(x), x.quantity])).toEqual([['Manual', '2'], ['Motor', '1'], ['Small motor', '1']]);
  });
  test('motor stepper: removing the only Small motor makes it Manual (merged), with no stale Small left', () => {
    const solo = { id: 1, name: 'Den', fabricInput: '', blindTypes: ['Zebra'], windowGroups: [g({ controlType: 'Motor', motorSize: SMALL_MOTOR })] };
    const r = buildEffectiveRooms([solo], {})[0];
    const res = stepMotor(r, r.windowGroups[0], 'remove', {}, () => null, 1);
    const after = buildEffectiveRooms([solo], res)[0].windowGroups[0];
    expect(after.controlType).toBe('Manual');
    expect(after.motorSize).toBe('');
  });
  test('an edited small motor price counts as an unsaved change', () => {
    expect(hasPendingTableEdits({ perWindowPrices: {}, smallMotorCost: 60 })).toBe(true);
    expect(hasPendingTableEdits({ perWindowPrices: {}, smallMotorCost: null })).toBe(false);
  });
});

test('pricing snapshot for new quotes stores the $65 small motor price', () => {
  assert.strictEqual(snap.SMALL_MOTOR_COST_CLIENT, 65);
  assert.strictEqual(typeof snap.SMALL_MOTOR_COST_SUPPLIER, 'number');
  assert.strictEqual(SMALL_MOTOR_LABEL, 'Small motor');
});

describe('supplier file says Motor, not Smart (owner, 2026-11-26)', () => {
  const row = { id: 'r1', clientName: 'Ann', locationBase: 'Den', locationIndex: 1, totalInLocation: 1, motor: 'motor-Zigbee', motorSide: 'Left', solar: 'AOK', remoteGroup: 1, remoteChannel: 1, cassette: 'S1', mount: 'Inside', fabricNumber: '83003L', width: '35', height: '70', blindType: 'Zebra', comment: '' };
  test('CSV: header Manual/Motor and Motor values with variants', () => {
    const csv = sheetToCSV({}, [row, { ...row, id: 'r2', locationIndex: 2, motor: 'Manual', motorSide: '', solar: false, remoteGroup: null }]).split('\n');
    expect(csv[0]).toContain('Manual/Motor');
    expect(csv[0]).not.toContain('Smart');
    expect(csv[1]).toContain('Motor - Left side - Solar - AOK');
    expect(csv[2]).toContain(',Manual,');
  });
  test('Excel: header Manual/Motor, value Motor, still highlighted', async () => {
    const ExcelJS = require('exceljs');
    const buf = await sheetToExcelBuffer({}, [row, { ...row, id: 'r2', motor: 'Small motor', motorSide: '', solar: false }]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    const cells = [];
    ws.eachRow(r => cells.push(Array.from(r.values, v => (v === undefined || v === null ? '' : String(v)))));
    const headerAt = cells.findIndex(r => r.includes('Manual/Motor'));
    expect(headerAt).toBeGreaterThanOrEqual(0);
    expect(cells.flat()).not.toContain('Manual/Smart');
    const col = cells[headerAt].indexOf('Manual/Motor');
    expect(cells[headerAt + 1][col]).toBe('Motor - Left side - Solar - AOK');
    expect(cells[headerAt + 2][col]).toBe('Motor');
    let fillOk = false;
    ws.eachRow((r, n) => { if (String(r.getCell(col).value) === 'Motor - Left side - Solar - AOK') fillOk = !!(r.getCell(col).fill && r.getCell(col).fill.fgColor); });
    expect(fillOk).toBe(true);
  });
});
