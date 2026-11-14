// Run with: CI=true npx react-scripts test --watchAll=false src/utils/measurementUtils.test.js
import {
  expandQuoteIntoRows,
  createBlankMeasurementRow,
  findRoomSizeOutliers,
  getQuotedSize
} from './measurementUtils';

// The owner's exact report: one Living Room, windows A,B,C quoted 35w x 70h
// and windows X,Y,Z quoted 35w x 35h.
const quote = {
  id: 'q1',
  clientName: 'Test Client',
  quoteName: 'Test',
  rooms: [{
    id: 'room1',
    name: 'Living Room',
    fabricInput: '',
    blindTypes: ['Zebra'],
    windowGroups: [
      { id: 1, quantity: '3', width: '35', height: '70', controlType: 'Manual', solar: false },
      { id: 2, quantity: '3', width: '35', height: '35', controlType: 'Manual', solar: false }
    ]
  }]
};

// Rows 0-2 are A,B,C (35x70), rows 3-5 are X,Y,Z (35x35).
function sheetWith(measurements, { legacy = false } = {}) {
  return expandQuoteIntoRows(quote).map((row, i) => {
    const r = { ...row, id: `r${i}`, width: measurements[i][0], height: measurements[i][1] };
    if (legacy) { delete r.quotedWidth; delete r.quotedHeight; }
    return r;
  });
}

const correct = [
  ['34 12/16', '69 14/16'], ['34 13/16', '69 15/16'], ['34 12/16', '69 14/16'],
  ['34 13/16', '34 15/16'], ['34 12/16', '34 14/16'], ['34 13/16', '34 15/16']
];

const ids = (set) => [...set].sort();

describe('measurements are checked against windows quoted at the same size', () => {
  test('rows remember the size they were quoted at', () => {
    const rows = expandQuoteIntoRows(quote);
    expect(rows.map(r => [r.quotedWidth, r.quotedHeight])).toEqual([
      ['35', '70'], ['35', '70'], ['35', '70'], ['35', '35'], ['35', '35'], ['35', '35']
    ]);
    expect(getQuotedSize(rows[0], 'height')).toBe(70);
    expect(getQuotedSize(rows[3], 'height')).toBe(35);
  });

  test('correct measurements for both sizes raise no warning', () => {
    const rows = sheetWith(correct);
    expect(ids(findRoomSizeOutliers(rows, 'width'))).toEqual([]);
    expect(ids(findRoomSizeOutliers(rows, 'height'))).toEqual([]);
  });

  test('a 1" typo on window X (35x35) is flagged, and only X', () => {
    const m = correct.map(x => [...x]);
    m[3][1] = '35 15/16'; // X height typed an inch too tall
    const rows = sheetWith(m);
    expect(ids(findRoomSizeOutliers(rows, 'height'))).toEqual(['r3']);
  });

  test('a 1" typo on window A (35x70) is flagged, and only A', () => {
    const m = correct.map(x => [...x]);
    m[0][1] = '68 14/16';
    const rows = sheetWith(m);
    expect(ids(findRoomSizeOutliers(rows, 'height'))).toEqual(['r0']);
  });

  test('X typed with the 70" height of the other size is flagged', () => {
    const m = correct.map(x => [...x]);
    m[4][1] = '69 14/16';
    const rows = sheetWith(m);
    expect(ids(findRoomSizeOutliers(rows, 'height'))).toEqual(['r4']);
  });

  test('widths quoted the same (all 35) are still compared across both sizes', () => {
    const m = correct.map(x => [...x]);
    m[5][0] = '33 12/16'; // Z width an inch short
    const rows = sheetWith(m);
    expect(ids(findRoomSizeOutliers(rows, 'width'))).toEqual(['r5']);
  });

  test('older sheets (rows without a stored quoted size) look it up from the quote', () => {
    const m = correct.map(x => [...x]);
    m[3][1] = '35 15/16';
    const rows = sheetWith(m, { legacy: true });
    expect(getQuotedSize(rows[3], 'height', [quote])).toBe(35);
    expect(ids(findRoomSizeOutliers(rows, 'height', [quote]))).toEqual(['r3']);
    // Even with the quote gone, two different window groups are never mixed.
    expect(ids(findRoomSizeOutliers(sheetWith(correct, { legacy: true }), 'height', []))).toEqual([]);
  });

  test('quoted values typed with inch marks or fractions bucket correctly', () => {
    const row = { quotedWidth: '35"', quotedHeight: '70 8/16' };
    expect(getQuotedSize(row, 'width')).toBe(35);
    expect(getQuotedSize(row, 'height')).toBe(70.5);
    expect(getQuotedSize({ quotedWidth: '', quotedHeight: null }, 'width')).toBeNull();
    expect(getQuotedSize({ quotedWidth: 'abc' }, 'width')).toBeNull();
  });

  test('"Start blank" rows (no quote) keep comparing the whole room', () => {
    const rows = ['30', '30 1/16', '31 4/16'].map((w, i) => ({
      ...createBlankMeasurementRow({ clientName: 'C', locationBase: 'bf' + (i + 1) }),
      id: `b${i}`, width: w
    }));
    expect(ids(findRoomSizeOutliers(rows, 'width'))).toEqual(['b2']);
  });

  test('two clients with a room of the same name are still kept apart', () => {
    const other = { ...quote, id: 'q2', clientName: 'Other' };
    const a = sheetWith(correct);
    const b = expandQuoteIntoRows(other).map((r, i) => ({ ...r, id: `o${i}`, width: '30', height: i < 3 ? '60' : '30' }));
    expect(ids(findRoomSizeOutliers([...a, ...b], 'height'))).toEqual([]);
    expect(ids(findRoomSizeOutliers([...a, ...b], 'width'))).toEqual([]);
  });
});

describe('toSixteenths (halves/quarters/eighths typed on site)', () => {
  const { toSixteenths, validateMeasurementFormat } = require('./measurementUtils');
  test.each([
    ['70 1/2', '70 8/16'], ['70 1/4', '70 4/16'], ['34 7/8', '34 14/16'], ['3/4', '12/16'],
    ['34 7/8"', '34 14/16'], ['34"', '34'], ['34 5/16"', '34 5/16'], ['72 3/8 in', '72 6/16'],
    ['70  1 / 2 ', '70 8/16'], ['70 2/4', '70 8/16']
  ])('%s -> %s', (input, expected) => {
    expect(toSixteenths(input)).toBe(expected);
    expect(validateMeasurementFormat(toSixteenths(input)).valid).toBe(true);
  });
  test.each(['70 1/3', '70 5/15', '70 8/8', '70 0/8', '70 1/', '70 1/1', '70 1/16', '', 'abc', '70.5', '1/2/3'])(
    'leaves %s unchanged', (input) => { expect(toSixteenths(input)).toBe(input); });
  test('typing 1/16 one key at a time is never rewritten early', () => {
    ['7', '70', '70 ', '70 1', '70 1/', '70 1/1', '70 1/16'].forEach(t => expect(toSixteenths(t)).toBe(t));
  });
});
