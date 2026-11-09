// Pure helpers for removing window groups / rooms from a quote without
// mis-attaching saved prices.
//
// WHY THIS EXISTS: a window group's manual price is saved under
// `${room.id}_${groupIndex}` - its POSITION in the room. Removing a group
// shifts every later group's position, so without remapping, the price that
// belonged to "36x60" would silently land on whatever window slid into its
// slot. Every removal path (blank-group cleanup when generating, deleting one
// group on the quote screen) goes through pruneRooms() so the remap can't be
// forgotten.
//
// Groups carry an optional `_origIdx` while they are being edited: the
// position they had in the SAVED quote. It is only ever a temporary tag -
// pruneRooms() strips it from what it returns.

export const groupKey = (roomId, idx) => `${roomId}_${idx}`;

// Position this group had in the saved quote (falls back to its current
// position when it was never tagged, e.g. a brand-new quote).
export const origIdxOf = (group, fallbackIdx) =>
  (group && typeof group._origIdx === 'number') ? group._origIdx : fallbackIdx;

// A window group with no width AND no height typed in. Quantity doesn't count:
// it can't be priced without a size, and used to be priced anyway as a
// phantom ~1.5 sq ft window.
export const isBlankGroup = (group) =>
  !String(group?.width ?? '').trim() && !String(group?.height ?? '').trim();

/**
 * Removes groups for which shouldDropGroup(room, group, origIdx) is true and
 * any room left with no groups.
 * Returns { rooms, keyMap, removedGroups, removedRooms } where keyMap maps the
 * OLD price key (room.id + original position) of every KEPT group to its NEW
 * key. Removed groups/rooms are absent from keyMap.
 */
export function pruneRooms(rooms, shouldDropGroup) {
  const keyMap = {};
  let removedGroups = 0;
  let removedRooms = 0;
  const out = [];
  (rooms || []).forEach(room => {
    const kept = [];
    const groups = room.windowGroups || [];
    // In a room where some groups carry a saved position, an UNtagged group is
    // one added during this edit: it has no saved price, and must never claim
    // a saved key by its current position (that slot may belong to another).
    const roomHasTags = groups.some(x => x && typeof x._origIdx === 'number');
    groups.forEach((group, i) => {
      const orig = origIdxOf(group, i);
      if (shouldDropGroup(room, group, orig)) { removedGroups++; return; }
      const { _origIdx, ...clean } = group; // eslint-disable-line no-unused-vars
      if (!roomHasTags || typeof _origIdx === 'number') keyMap[groupKey(room.id, orig)] = groupKey(room.id, kept.length);
      kept.push(clean);
    });
    if (kept.length === 0) { removedRooms++; return; }
    out.push({ ...room, windowGroups: kept });
  });
  return { rooms: out, keyMap, removedGroups, removedRooms };
}

// Re-keys a { priceKey: value } object through keyMap, dropping keys whose
// group no longer exists.
export function remapPriceKeys(obj, keyMap) {
  const result = {};
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (Object.prototype.hasOwnProperty.call(keyMap, k)) result[keyMap[k]] = v;
  });
  return result;
}

// Same idea for a Set of keys.
export function remapKeySet(set, keyMap) {
  const result = new Set();
  (set || new Set()).forEach(k => {
    if (Object.prototype.hasOwnProperty.call(keyMap, k)) result.add(keyMap[k]);
  });
  return result;
}
