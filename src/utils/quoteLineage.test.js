// Run with: CI=true npx react-scripts test --watchAll=false src/utils/quoteLineage.test.js
import { getNextVersionNumber, nextVersionInLineage, historyGroupKeys, findRestartedVersionChains } from './quoteLineage';

const day = (n) => new Date(Date.UTC(2026, 10, n)).toISOString();
const q = (id, name, v, n, extra = {}) => ({
  id, lineageId: 'L1', clientName: name, location: 'Frisco', version: `v${v}`,
  quoteName: `${name}-Frisco-Zebra-quote-v${v}`, updatedDate: day(n), createdDate: day(1),
  editedPrices: { motorCost: 90 }, ...extra
});
const harshita = [1, 2, 3, 4, 5, 6, 7].map(v => q(`h${v}`, 'Harshita', v, v));

test('editing a renamed client continues the chain (v8, not v1)', () => {
  expect(getNextVersionNumber('Harshitha', 'Frisco', harshita, 'L1')).toBe(8);
  // no lineage (brand-new quote) keeps the old name+address rule
  expect(getNextVersionNumber('Harshitha', 'Frisco', harshita, null)).toBe(1);
  expect(getNextVersionNumber('Harshita', 'Frisco', harshita, null)).toBe(8);
  // trashed versions still count, so a restored one never shares a number
  const withTrashed = [...harshita, q('h9', 'Harshita', 9, 9, { trashedAt: day(10) })];
  expect(getNextVersionNumber('Harshitha', 'Frisco', withTrashed, 'L1')).toBe(10);
});

test('quote screen save from an older version gets the next free number', () => {
  expect(nextVersionInLineage(harshita, 'L1')).toBe(8);
  expect(nextVersionInLineage(harshita, 'other')).toBe(1);
  expect(nextVersionInLineage([], 'L1')).toBe(1);
});

test('history groups every version under the latest name', () => {
  const list = [...harshita, q('n1', 'Harshitha', 8, 8), { id: 'x', lineageId: 'X', clientName: 'Harshita', location: 'Frisco', version: 'v1', updatedDate: day(2) }];
  const keys = historyGroupKeys(list);
  harshita.forEach(h => expect(keys.get(h.id)).toBe('Harshitha - Frisco'));
  expect(keys.get('n1')).toBe('Harshitha - Frisco');
  // an unrelated quote that still uses the old name stays under the old name
  expect(keys.get('x')).toBe('Harshita - Frisco');
});

test('repair: the bug-made Harshitha v1 (and later v2) become v8, v9', () => {
  const data = [...harshita, q('n1', 'Harshitha', 1, 8), q('n2', 'Harshitha', 2, 9)];
  const out = findRestartedVersionChains(data);
  const byId = Object.fromEntries(out.map(x => [x.id, x]));
  expect(Object.keys(byId).sort()).toEqual(['n1', 'n2']);
  expect(byId.n1.version).toBe('v8');
  expect(byId.n1.quoteName).toBe('Harshitha-Frisco-Zebra-quote-v8');
  expect(byId.n2.version).toBe('v9');
  // nothing else changes
  expect(byId.n1.editedPrices).toEqual({ motorCost: 90 });
  expect(byId.n1.updatedDate).toBe(day(8));
  // idempotent: running again on the fixed data does nothing
  const fixed = data.map(x => byId[x.id] || x);
  expect(findRestartedVersionChains(fixed)).toEqual([]);
});

test('repair leaves normal histories alone', () => {
  expect(findRestartedVersionChains(harshita)).toEqual([]);
  // name corrected with the fixed code: continues at v8 -> nothing to repair
  expect(findRestartedVersionChains([...harshita, q('n1', 'Harshitha', 8, 8)])).toEqual([]);
  // saving from an old version under the SAME name (pre-existing duplicate v4) is not touched
  expect(findRestartedVersionChains([...harshita, q('d4', 'Harshita', 4, 9)])).toEqual([]);
  // two separate quotes (different lineages) for the same name are not touched
  const other = { ...q('o1', 'Harshitha', 1, 9), lineageId: 'L2' };
  expect(findRestartedVersionChains([...harshita, other])).toEqual([]);
  // missing/odd data never throws
  expect(findRestartedVersionChains([null, {}, { id: 'a' }, { id: 'b', lineageId: 'a', version: 'x' }])).toEqual([]);
  expect(findRestartedVersionChains(undefined)).toEqual([]);
});

test('repair skips a lineage when the new number is already taken', () => {
  // Harshita v8 was trashed but still exists; the restarted v1 would need v9 then
  const data = [...harshita, q('h8', 'Harshita', 8, 8, { trashedAt: day(9) }), q('n1', 'Harshitha', 1, 10)];
  const out = findRestartedVersionChains(data);
  expect(out.map(x => [x.id, x.version])).toEqual([['n1', 'v9']]);
});
