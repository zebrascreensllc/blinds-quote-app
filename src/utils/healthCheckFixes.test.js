/**
 * @jest-environment node
 */
// Run with: CI=true npx react-scripts test --watchAll=false src/utils/healthCheckFixes.test.js
// Fixes from the 2026-11-25 full health check. Each block names the bug.
import assert from 'assert';
import { jsPDF } from 'jspdf';
import { makeUndoSnapshot, applyUndo } from './undo';
import { hasPendingTableEdits } from './pendingEdits';
import { parseGroupQty, savedGroupQty, hasBadQty, quoteRoomProblems, normalizeQuoteRooms, pruneRooms, isBlankGroup } from './quoteGroups';
import { parseUnits, normalizeSizeText, sizeTextProblem } from './formatters';
import { expandQuoteIntoRows, toSixteenths, validateMeasurementFormat } from './measurementUtils';
import { headerLabelFor } from './invoicePdf';
import { computeQuoteFinancials } from './pricing';
import { getPricingSnapshot } from './constants';

const q = (id, extra = {}) => ({ id, quoteName: id, clientName: id, location: 'x', rooms: [], ...extra });

describe('1. Undo Last Delete only restores what the action touched', () => {
  test('delete A, create C, undo: A is back and C is kept (old code erased C)', () => {
    const before = [q('A'), q('B')];
    const snap = makeUndoSnapshot(before, ['A'], 'Deleted A');
    const afterDelete = [{ ...q('A'), trashedAt: '2026-11-25' }, q('B')];
    const later = [...afterDelete, q('C')]; // created after the delete
    const undone = applyUndo(later, snap);
    assert.deepStrictEqual(undone.map(x => x.id).sort(), ['A', 'B', 'C']);
    assert.strictEqual(undone.find(x => x.id === 'A').trashedAt, undefined);
  });
  test('changes made after the delete to other quotes are kept', () => {
    const snap = makeUndoSnapshot([q('A'), q('B')], ['A'], 'Deleted A');
    const later = [{ ...q('A'), trashedAt: 't' }, { ...q('B'), orderedAt: 'now' }];
    const undone = applyUndo(later, snap);
    assert.strictEqual(undone.find(x => x.id === 'B').orderedAt, 'now');
  });
  test('a deleted quote removed for good from Trash since then comes back', () => {
    const snap = makeUndoSnapshot([q('A'), q('B')], ['A'], 'Deleted A');
    const undone = applyUndo([q('B')], snap);
    assert.deepStrictEqual(undone.map(x => x.id).sort(), ['A', 'B']);
  });
  test('undo an imported backup removes only the imported quotes', () => {
    const snap = makeUndoSnapshot([q('A')], ['X', 'Y'], 'Imported backup');
    const later = [q('A'), q('X'), q('Y'), q('NEW')];
    assert.deepStrictEqual(applyUndo(later, snap).map(x => x.id).sort(), ['A', 'NEW']);
  });
  test('the snapshot is a copy (later edits to the live object do not leak in)', () => {
    const a = q('A', { clientName: 'Ann' });
    const snap = makeUndoSnapshot([a], ['A'], 'x');
    a.clientName = 'changed';
    assert.strictEqual(snap.before[0].quote.clientName, 'Ann');
  });
  test('no snapshot = nothing changes', () => {
    const list = [q('A')];
    assert.strictEqual(applyUndo(list, null), list);
  });
});

describe('2. Unsaved changes on the quote screen are detected', () => {
  const empty = { perWindowPrices: {}, motorCost: null, solarCost: null, taxRate: null, otherExpenses: null, otherExpensesLabel: null, groupEdits: {}, deletedRoomIds: new Set(), deletedGroupKeys: new Set(), addedGroups: {}, hubEdits: null, fabricEdits: {}, clearedPriceKeys: new Set() };
  test('nothing pending', () => assert.strictEqual(hasPendingTableEdits(empty), false));
  test.each([
    ['a price', { perWindowPrices: { '1_0': 180 } }],
    ['motor cost', { motorCost: 90 }],
    ['tax 0', { taxRate: 0 }],
    ['other expenses label', { otherExpensesLabel: 'Removal' }],
    ['cassette/size/qty edit', { groupEdits: { '1_0': { cassette: 'x' } } }],
    ['room removed', { deletedRoomIds: new Set([1]) }],
    ['group removed', { deletedGroupKeys: new Set(['1_0']) }],
    ['motor stepper split', { addedGroups: { 1: [{}] } }],
    ['hub', { hubEdits: { included: true } }],
    ['fabric', { fabricEdits: { 1: { fabricInput: '' } } }]
  ])('%s', (_, patch) => assert.strictEqual(hasPendingTableEdits({ ...empty, ...patch }), true));
});

describe('3. Quantity and size checks before saving a quote', () => {
  test('quantity rules', () => {
    assert.deepStrictEqual(parseGroupQty(''), { ok: true, qty: 1 });
    assert.deepStrictEqual(parseGroupQty(' 3 '), { ok: true, qty: 3 });
    ['0', '-2', '2.5', 'abc', '1e2'].forEach(v => assert.strictEqual(parseGroupQty(v).ok, false, v));
  });
  test('problems listed for the reported quote (blank qty ok, -2, 0, missing height)', () => {
    const rooms = [{ id: 1, name: 'Hall', windowGroups: [
      { quantity: '', width: '35', height: '70' },
      { quantity: '-2', width: '30', height: '40' },
      { quantity: '0', width: '30', height: '50' },
      { quantity: '1', width: '40', height: '' }
    ] }];
    const problems = quoteRoomProblems(rooms, sizeTextProblem);
    assert.strictEqual(problems.length, 3, problems.join('\n'));
    assert.ok(problems[0].includes('size 2') && problems[0].includes('-2'));
    assert.ok(problems[1].includes('size 3'));
    assert.ok(problems[2].includes('height is missing'));
  });
  test('saved rooms: blank qty becomes "1", sizes tidied', () => {
    const out = normalizeQuoteRooms([{ id: 1, windowGroups: [{ quantity: '', width: '35-1/2', height: '70½' }] }], normalizeSizeText);
    assert.deepStrictEqual(out[0].windowGroups[0], { quantity: '1', width: '35 1/2', height: '70 1/2' });
  });
  test('Edit: an untouched saved size keeps its exact text (no price change on an old quote)', () => {
    const rooms = [{ id: 1, windowGroups: [{ quantity: '2', width: '35-1/2', height: '70', _origIdx: 0 }] }];
    const keep = (room, g, field) => ({ width: '35-1/2', height: '70' }[field]);
    assert.strictEqual(normalizeQuoteRooms(rooms, normalizeSizeText, keep)[0].windowGroups[0].width, '35-1/2');
    const edited = [{ id: 1, windowGroups: [{ quantity: '2', width: '36-1/2', height: '70', _origIdx: 0 }] }];
    assert.strictEqual(normalizeQuoteRooms(edited, normalizeSizeText, keep)[0].windowGroups[0].width, '36 1/2');
  });
  test('blank groups are still dropped after normalizing', () => {
    const rooms = normalizeQuoteRooms([{ id: 1, windowGroups: [{ quantity: '', width: '', height: '' }, { quantity: '1', width: '30', height: '40' }] }], normalizeSizeText);
    const pruned = pruneRooms(rooms, (r, g) => isBlankGroup(g));
    assert.strictEqual(pruned.rooms[0].windowGroups.length, 1);
  });
  test('old saved quotes: sheet makes the same number of windows the price charged', () => {
    const quote = { id: 'q', rooms: [{ id: 1, name: 'Hall', blindTypes: ['Roller'], windowGroups: [
      { quantity: '', width: '35', height: '70' },
      { quantity: '0', width: '30', height: '50' },
      { quantity: '2', width: '30', height: '40' },
      { quantity: '', width: '', height: '' } // leftover empty group: not a window
    ] }] };
    assert.strictEqual(expandQuoteIntoRows(quote).length, 4);
    assert.strictEqual(savedGroupQty({ quantity: '0' }), 1);
    assert.strictEqual(hasBadQty({ quantity: '' }), true);
    assert.strictEqual(hasBadQty({ quantity: '2' }), false);
  });
  test('old saved quotes keep their price (pricing code unchanged)', () => {
    const snap = getPricingSnapshot();
    const mk = (qty) => ({ pricing: snap, rooms: [{ id: 1, fabricInput: '83003L', blindTypes: ['Zebra'], windowGroups: [{ quantity: qty, width: '35', height: '70', controlType: 'Manual' }] }] });
    assert.strictEqual(Math.round(computeQuoteFinancials(mk('')).revenueSubtotal), Math.round(computeQuoteFinancials(mk('1')).revenueSubtotal));
  });
});

describe('5. Sizes typed on the quote form', () => {
  test.each([
    ['35-1/2', '35 1/2', 35.5], ['35 - 1/2', '35 1/2', 35.5], ['35½', '35 1/2', 35.5], ['35 ¼', '35 1/4', 35.25],
    ['70¾"', '70 3/4"', 70.75], ['½', '1/2', 0.5], ['35 1 / 2', '35 1/2', 35.5], ['35', '35', 35], ['35.5', '35.5', 35.5],
    ["2'11\"", "2'11\"", 35], ['35"', '35"', 35], ['35 1/2"', '35 1/2"', 35.5], ['35in', '35in', 35]
  ])('%s -> %s (%d in)', (input, normalized, inches) => {
    assert.strictEqual(normalizeSizeText(input), normalized);
    assert.strictEqual(sizeTextProblem(input), null);
    assert.strictEqual(parseUnits(normalizeSizeText(input)), inches);
  });
  test.each(['', '   ', '-5', '35,5', '35 cm', 'abc', '0', '35 3/2', '35 1/0', '35 x 70'])('"%s" is flagged', (input) => {
    assert.notStrictEqual(sizeTextProblem(input), null, input);
  });
});

describe('6. Measurement sheet: halves, quarters, ½ and dashes become sixteenths', () => {
  test.each([
    ['35 1/2', '35 8/16'], ['35-1/2', '35 8/16'], ['35½', '35 8/16'], ['35 ¾', '35 12/16'], ['35-5/16', '35 5/16'],
    ['35 7/8"', '35 14/16'], ['35', '35'], ['35 5/16', '35 5/16']
  ])('%s -> %s', (input, out) => {
    assert.strictEqual(toSixteenths(input), out);
    assert.strictEqual(validateMeasurementFormat(out).valid, true);
  });
  test('decimals only convert when the box is left (not mid-typing)', () => {
    assert.strictEqual(toSixteenths('35.5'), '35.5');
    assert.strictEqual(toSixteenths('35.5', { final: true }), '35 8/16');
    assert.strictEqual(toSixteenths('35.25', { final: true }), '35 4/16');
    assert.strictEqual(toSixteenths('35.0', { final: true }), '35');
    assert.strictEqual(toSixteenths('35.3', { final: true }), '35.3'); // not a sixteenth: left for the error message
  });
  test('typing 1/16 is never cut short', () => {
    assert.strictEqual(toSixteenths('35 1/1'), '35 1/1');
    assert.strictEqual(toSixteenths('35-1/1'), '35 1/1');
    assert.strictEqual(toSixteenths('35 1/16'), '35 1/16');
  });
  test('real typos still flagged', () => {
    assert.strictEqual(validateMeasurementFormat(toSixteenths('35 1/3')).valid, false);
  });
});

describe('8. PDF header breaks after "/" instead of mid-word', () => {
  test('narrow column', () => {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    assert.strictEqual(headerLabelFor(doc, 'Manual/Smart', 40), 'Manual/\nSmart');
    assert.strictEqual(headerLabelFor(doc, 'Manual/Smart', 200), 'Manual/Smart');
    assert.strictEqual(headerLabelFor(doc, 'LOCATION', 20), 'LOCATION');
  });
});
