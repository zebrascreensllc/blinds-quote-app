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

// The price key of a group while it is being edited. `_key` is set by
// buildEffectiveRooms (the quote screen) and is stable even for groups created
// during the edit; `_origIdx` is set by the Edit form; an untagged group (a
// saved quote, a brand-new form) is keyed by its current position.
export const keyOfGroup = (room, group, i) =>
  (group && group._key) ? group._key : groupKey(room.id, origIdxOf(group, i));

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
  const keyTargets = {}; // OLD key -> every NEW key that came from it (see remapPriceKeysMulti)
  let removedGroups = 0;
  let removedRooms = 0;
  const out = [];
  (rooms || []).forEach(room => {
    const kept = [];
    const groups = room.windowGroups || [];
    const isTagged = x => x && (x._key || typeof x._origIdx === 'number');
    // In a room where some groups carry a saved position/key, an UNtagged group
    // is one added during this edit: it has no saved price, and must never
    // claim a saved key by its current position (that slot may belong to another).
    const roomHasTags = groups.some(isTagged);
    groups.forEach((group, i) => {
      const key = keyOfGroup(room, group, i);
      if (shouldDropGroup(room, group, key)) { removedGroups++; return; }
      const { _origIdx, _key, _afterKey, _labels, ...clean } = group; // eslint-disable-line no-unused-vars
      if (!roomHasTags || isTagged(group)) {
        keyMap[key] = groupKey(room.id, kept.length);
        keyTargets[key] = [...(keyTargets[key] || []), groupKey(room.id, kept.length)];
      }
      kept.push(clean);
    });
    if (kept.length === 0) { removedRooms++; return; }
    out.push({ ...room, windowGroups: kept });
  });
  return { rooms: out, keyMap, keyTargets, removedGroups, removedRooms };
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

// Like remapPriceKeys, but one old key may feed several new keys: two groups
// can share the same `_origIdx` when one saved group was split in the form
// (e.g. "Generate Quote from this Sheet" turning one rough 35x70 group into
// two precise sizes). Each piece keeps the window's saved per-window price.
// With one target per key it gives exactly what remapPriceKeys gives.
export function remapPriceKeysMulti(obj, keyTargets) {
  const result = {};
  Object.entries(obj || {}).forEach(([k, v]) => {
    (keyTargets[k] || []).forEach(newKey => { result[newKey] = v; });
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

// ---------------------------------------------------------------------------
// Quote screen: pending edits -> the rooms the screen shows and Save writes.
// ONE function builds both, so the totals on screen and the saved version can
// never disagree about which windows exist.
// ---------------------------------------------------------------------------
export function buildEffectiveRooms(rooms, pending) {
  const groupEdits = pending.groupEdits || {};
  const deletedRoomIds = pending.deletedRoomIds || new Set();
  const deletedGroupKeys = pending.deletedGroupKeys || new Set();
  const fabricEdits = pending.fabricEdits || {};
  const addedGroups = pending.addedGroups || {};
  return (rooms || [])
    .filter(room => !deletedRoomIds.has(room.id))
    .map(room => {
      // Every group is tagged with a stable _key BEFORE anything is removed or
      // inserted, so a saved price (filed by position) stays attached to its window.
      const list = (room.windowGroups || []).map((g, i) => ({ ...g, _key: groupKey(room.id, i) }));
      Object.entries(addedGroups).forEach(([key, a]) => {
        if (a.roomId !== room.id) return;
        const piece = { ...a.group, _key: key, _afterKey: a.afterKey };
        let at = list.findIndex(g => g._key === a.afterKey);
        if (at < 0) { list.push(piece); return; }
        while (at + 1 < list.length && list[at + 1]._afterKey === a.afterKey) at++;
        list.splice(at + 1, 0, piece);
      });
      const windowGroups = list
        .map(g => {
          const edit = groupEdits[g._key];
          if (!edit) return g;
          const merged = { ...g, ...edit };
          // Solar only makes sense for a motorized window.
          if (merged.controlType !== 'Motor') merged.solar = false;
          return merged;
        })
        .filter(g => !deletedGroupKeys.has(g._key));
      const fe = fabricEdits[room.id];
      return { ...room, ...(fe ? { fabricInput: fe.fabricInput, blindTypes: fe.blindTypes } : {}), windowGroups };
    })
    .filter(room => room.windowGroups.length > 0);
}

// ---------------------------------------------------------------------------
// Motor stepper: "of these N windows, M are motorized". Real windows change
// type (a group is split into a Motor part and a Manual part), so prices, the
// supplier sheet and remotes all stay correct.
// ---------------------------------------------------------------------------
const qtyOf = g => parseInt(g.quantity) || 1;
const norm = v => String(v ?? '').trim().toLowerCase();
const isMotor = g => g.controlType === 'Motor';
const sameSizeFamily = (a, b) =>
  norm(a.width) === norm(b.width) && norm(a.height) === norm(b.height)
  && norm(a.mount || 'Inside') === norm(b.mount || 'Inside')
  && (a.surchargeOverride ?? null) === (b.surchargeOverride ?? null);

// Groups of the same room with the same size/mount (they differ only in Motor/Manual/Solar).
export const sizeFamily = (room, group) => room.windowGroups.filter(g => sameSizeFamily(g, group));

export const motorStepperInfo = (room, group) => {
  const fam = sizeFamily(room, group);
  return { total: fam.reduce((n, g) => n + qtyOf(g), 0), motor: fam.filter(isMotor).reduce((n, g) => n + qtyOf(g), 0) };
};

/**
 * Moves ONE window of this size between Manual and Motor.
 * direction 'add' = one more motorized, 'remove' = one fewer.
 * Returns the changed pending fields ({groupEdits, addedGroups, deletedGroupKeys,
 * perWindowPrices}) to merge into tableEditValues, or null when nothing can move.
 */
export function stepMotor(room, group, direction, pending, getOverride, newKeySuffix) {
  const fam = sizeFamily(room, group);
  const toMotor = direction === 'add';
  const pool = fam.filter(g => isMotor(g) !== toMotor);          // where the unit comes from
  if (pool.length === 0) return null;
  const src = pool.find(g => g._key === group._key)
    || (toMotor ? pool[0] : (pool.find(g => !g.solar) || pool[0])); // keep solar units motorized if possible
  const dstPool = fam.filter(g => isMotor(g) === toMotor && g._key !== src._key);
  const dst = toMotor ? dstPool[0] : dstPool[0];
  const toType = toMotor ? 'Motor' : 'Manual';

  const groupEdits = { ...(pending.groupEdits || {}) };
  const addedGroups = { ...(pending.addedGroups || {}) };
  const deletedGroupKeys = new Set(pending.deletedGroupKeys || []);
  const perWindowPrices = { ...(pending.perWindowPrices || {}) };
  const setQty = (k, q) => { groupEdits[k] = { ...(groupEdits[k] || {}), quantity: String(q) }; };
  const removePiece = k => {
    if (addedGroups[k]) { delete addedGroups[k]; delete groupEdits[k]; delete perWindowPrices[k]; }
    else deletedGroupKeys.add(k);
  };

  const n = qtyOf(src);
  if (dst) {
    setQty(dst._key, qtyOf(dst) + 1);
    if (n - 1 > 0) setQty(src._key, n - 1); else removePiece(src._key);
  } else if (n === 1) {
    groupEdits[src._key] = { ...(groupEdits[src._key] || {}), controlType: toType, ...(toMotor ? {} : { solar: false }) };
  } else {
    const newKey = `${room.id}_n${newKeySuffix}`;
    const { _key, _afterKey, _origIdx, ...base } = src; // eslint-disable-line no-unused-vars
    const maxId = Math.max(0, ...room.windowGroups.map(g => Number(g.id) || 0));
    addedGroups[newKey] = { roomId: room.id, afterKey: src._key, group: { ...base, id: maxId + 1, quantity: '1', controlType: toType, solar: false } };
    setQty(src._key, n - 1);
    const ov = getOverride ? getOverride(src._key) : null;   // the new part keeps the same manual price
    if (ov !== null && ov !== undefined) perWindowPrices[newKey] = ov;
  }
  return { groupEdits, addedGroups, deletedGroupKeys, perWindowPrices };
}
