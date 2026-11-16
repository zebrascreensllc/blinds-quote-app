// Run with: CI=true npx react-scripts test --watchAll=false src/utils/extendedBrackets.test.js
import {
  createBlankMeasurementRow,
  EXTENDED_BRACKETS_MOUNT,
  MOUNT_OPTIONS,
  parseBracketCount,
  getIncompleteFields,
  buildRowExportFields,
  sheetToCSV
} from './measurementUtils';

const complete = (extra) => ({
  ...createBlankMeasurementRow({ clientName: 'C', locationBase: 'Living' }),
  width: '35', height: '70', fabricNumber: 'Z1', ...extra
});

test('option is in the list, spelled Extended', () => {
  expect(MOUNT_OPTIONS).toContain('Outside - No Deduction - with Extended Brackets');
  expect(MOUNT_OPTIONS.join('|')).not.toMatch(/extened/i);
});

test('parseBracketCount accepts only whole numbers >= 1', () => {
  expect(parseBracketCount('2')).toBe(2);
  expect(parseBracketCount(' 3 ')).toBe(3);
  expect(parseBracketCount(4)).toBe(4);
  for (const bad of ['', '0', '-1', '1.5', 'two', '2a', null, undefined, ' ']) {
    expect(parseBracketCount(bad)).toBeNull();
  }
});

test('extended mount without a count blocks export', () => {
  expect(getIncompleteFields(complete({ mount: EXTENDED_BRACKETS_MOUNT }))).toEqual(['number of extended brackets']);
  expect(getIncompleteFields(complete({ mount: EXTENDED_BRACKETS_MOUNT, extendedBrackets: 0 }))).toEqual(['number of extended brackets']);
  expect(getIncompleteFields(complete({ mount: EXTENDED_BRACKETS_MOUNT, extendedBrackets: 2 }))).toEqual([]);
});

test('count shows in the MOUNT column and is highlighted', () => {
  const two = buildRowExportFields(complete({ mount: EXTENDED_BRACKETS_MOUNT, extendedBrackets: 2 }), 0, {});
  expect(two.mount).toBe('Outside - No Deduction - with Extended Brackets - 2 extended brackets');
  expect(two.hasNonDefaultMount).toBe(true);
  const one = buildRowExportFields(complete({ mount: EXTENDED_BRACKETS_MOUNT, extendedBrackets: 1 }), 0, {});
  expect(one.mount).toBe('Outside - No Deduction - with Extended Brackets - 1 extended bracket');
  const csv = sheetToCSV({}, [complete({ mount: EXTENDED_BRACKETS_MOUNT, extendedBrackets: 2 })]);
  expect(csv).toContain('with Extended Brackets - 2 extended brackets');
});

test('a leftover count on another mount is ignored', () => {
  const f = buildRowExportFields(complete({ mount: 'Inside', extendedBrackets: 5 }), 0, {});
  expect(f.mount).toBe('Inside');
  expect(f.hasNonDefaultMount).toBe(false);
  expect(getIncompleteFields(complete({ mount: 'Outside - No deduction', extendedBrackets: 5 }))).toEqual([]);
});
