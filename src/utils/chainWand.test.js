import { MOTOR_OPTIONS, CHAIN_WAND_OPTIONS, isManualMotor, buildRowExportFields, getIncompleteFields } from './measurementUtils';
const base = { id: 'r1', locationBase: 'Living', width: '35', height: '70', fabricNumber: 'Z1', motor: 'Manual', chainSide: '', motorSide: 'Left', solar: false, remoteGroup: null };
test('chain wand options at bottom', () => {
  expect(MOTOR_OPTIONS.slice(-5, -1)).toEqual(CHAIN_WAND_OPTIONS);
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

test('Manual - Custom (e.g. custom chain length) is Manual and shows its text', () => {
  const { MANUAL_CUSTOM_MOTOR, motorDisplay } = require('./measurementUtils');
  expect(MOTOR_OPTIONS[MOTOR_OPTIONS.length - 1]).toBe(MANUAL_CUSTOM_MOTOR);
  expect(isManualMotor(MANUAL_CUSTOM_MOTOR)).toBe(true);
  const row = { ...base, motor: MANUAL_CUSTOM_MOTOR, motorCustomText: 'chain 6ft', motorSide: 'Left' };
  const f = buildRowExportFields(row, 1, {});
  expect(f.manualSmart).toBe('Manual');
  expect(f.motorType).toBe('Manual - chain 6ft');
  expect(f.remote).toBe('');
  expect(getIncompleteFields(row)).toEqual([]);
  expect(motorDisplay(row)).toBe('Manual - chain 6ft');
  // no double "Manual"
  expect(buildRowExportFields({ ...row, motorCustomText: 'manual chain 6ft' }, 1, {}).motorType).toBe('manual chain 6ft');
  // chain side still applies
  expect(buildRowExportFields({ ...row, chainSide: 'Left' }, 1, {}).manualSmart).toBe('Manual - Left side');
  // Smart Custom unchanged
  const smart = buildRowExportFields({ ...base, motor: 'Custom', motorCustomText: 'motor-xyz', motorSide: '', noRemote: true }, 1, {});
  expect(smart.manualSmart).toBe('Smart');
  expect(smart.motorType).toBe('motor-xyz');
});
