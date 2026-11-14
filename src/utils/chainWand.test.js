import { MOTOR_OPTIONS, CHAIN_WAND_OPTIONS, isManualMotor, buildRowExportFields, getIncompleteFields } from './measurementUtils';
const base = { id: 'r1', locationBase: 'Living', width: '35', height: '70', fabricNumber: 'Z1', motor: 'Manual', chainSide: '', motorSide: 'Left', solar: false, remoteGroup: null };
test('chain wand options at bottom', () => {
  expect(MOTOR_OPTIONS.slice(-4)).toEqual(CHAIN_WAND_OPTIONS);
});
test('chain wand is manual, exports its colour', () => {
  for (const m of CHAIN_WAND_OPTIONS) {
    expect(isManualMotor(m)).toBe(true);
    const row = { ...base, motor: m, chainSide: 'Left' };
    const f = buildRowExportFields(row, 1, {}, 'C');
    
    expect(f.manualSmart).toBe('Manual - Left side');
    expect(f.motorType).toBe(m);
    expect(getIncompleteFields(row)).toEqual([]);
  }
  const plain = buildRowExportFields({ ...base }, 1, {}, 'C');
  expect(plain.motorType).toBe('');
  expect(isManualMotor('motor-Zigbee')).toBe(false);
});
