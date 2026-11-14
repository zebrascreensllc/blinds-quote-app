// Supplier Measurements sheet -> Quote Create form ("Generate Quote from this
// Sheet"). Pure functions, no React/Firestore, so they can be run in Node.
//
// Two cases:
//  1. The sheet was pulled from ONE quote (every quote-built row carries
//     sourceQuoteId/sourceRoomId/sourceGroupIdx, see expandQuoteIntoRows).
//     The form is built as a NEW VERSION of that quote: client name, phone,
//     location, hub, other expenses and every saved price carry over, and the
//     sheet's real measurements replace the rough sizes.
//  2. No single source quote (a "Start blank" sheet, a combined sheet of
//     several quotes, or the source quote no longer exists): rooms are rebuilt
//     from the rows alone.
//
// In both cases a location with several windows becomes one room PER WINDOW,
// named the way the sheet shows it ("Bf nook 1" ... "Bf nook 6") - the owner's
// choice (2026-11-14). Note this is a pricing difference from the source quote
// for motorized windows: the remote cost is shared per room, so each split
// room carries its own remote share.
//
// Saved per-window prices are filed by `${room.id}_${groupIndex}`. Each group
// built from the source quote is tagged `_key` = that saved key, so
// pruneRooms() (generateQuote) moves the price to wherever the window ends up,
// even when one saved group (qty 6) becomes six rooms (keyTargets).

import { getLocationLabel, isManualMotor } from './measurementUtils';

const BLANK_GROUP = { id: 1, quantity: '', width: '', height: '', controlType: 'Manual', solar: false, mount: 'Inside', surchargeOverride: null };

const str = v => String(v ?? '').trim();
const isMotorRow = row => !!(row.motor && !isManualMotor(row.motor));

/**
 * Which quote was this sheet pulled from?
 * Returns { status, quote, quoteIds }:
 *   'single'   - every quote-built row points at one quote, and it exists
 *   'missing'  - one source quote, but it's no longer in the list
 *   'multiple' - rows from 2+ quotes (a combined sheet)
 *   'none'     - no row came from a quote ("Start blank")
 */
export function findSheetSourceQuote(sheet, quotes) {
  const ids = [...new Set((sheet?.rows || []).map(r => r.sourceQuoteId).filter(Boolean))];
  if (ids.length === 0) return { status: 'none', quote: null, quoteIds: ids };
  if (ids.length > 1) return { status: 'multiple', quote: null, quoteIds: ids };
  const quote = (quotes || []).find(q => q.id === ids[0]) || null;
  return { status: quote ? 'single' : 'missing', quote, quoteIds: ids };
}

// Room names for a location's windows: one name per row, as the sheet shows
// them. Falls back to "<base> <n>" if the sheet's own numbering is stale and
// would give two windows the same name.
function windowNames(base, rows) {
  if (rows.length === 1) return [base];
  const names = rows.map(r => str(getLocationLabel(r)));
  const unique = new Set(names.map(n => n.toLowerCase()));
  return (unique.size === names.length && names.every(Boolean)) ? names : rows.map((_, i) => `${base} ${i + 1}`);
}

// The window group for one sheet row (qty 1).
function groupFromRow(row, src, sizeFallback) {
  const motor = isMotorRow(row);
  return {
    ...BLANK_GROUP,
    ...(src ? { mount: src.mount || 'Inside', surchargeOverride: src.surchargeOverride ?? null } : {}),
    quantity: '1',
    width: str(row.width) || (sizeFallback ? str(sizeFallback.width) : ''),
    height: str(row.height) || (sizeFallback ? str(sizeFallback.height) : ''),
    controlType: motor ? 'Motor' : 'Manual',
    solar: motor ? (row.solar || false) : false
  };
}

// Untagged groups with identical size/motor/solar collapse into one group
// with a quantity (used when sheet-only windows join an existing room).
function mergeGroups(groups) {
  const out = [];
  groups.forEach(g => {
    const same = out.find(o => !o._key && !g._key && o.width === g.width && o.height === g.height && o.controlType === g.controlType && o.solar === g.solar);
    if (same) same.quantity = String((parseInt(same.quantity) || 0) + 1);
    else out.push({ ...g });
  });
  return out.map((g, i) => ({ ...g, id: i + 1 }));
}

function fabricFor(rows, fallbackFabric, fallbackTypes, detectBlindTypes) {
  const fabrics = [...new Set(rows.map(r => str(r.fabricNumber)).filter(Boolean))];
  const norm = s => str(s).split(',').map(f => f.trim()).filter(Boolean).join(', ').toLowerCase();
  if (fabrics.length === 0 || fabrics.join(', ').toLowerCase() === norm(fallbackFabric)) {
    return { fabricInput: fallbackFabric || '', blindTypes: fallbackTypes };
  }
  const fabricInput = fabrics.join(', ');
  const detected = detectBlindTypes(fabricInput);
  return { fabricInput, blindTypes: Array.isArray(detected) && detected.length > 0 ? detected : fallbackTypes };
}

// Rooms built from rows alone (no source quote to lean on).
function roomsFromRowsOnly(rows, detectBlindTypes, nextId) {
  const byName = new Map();
  rows.forEach(row => {
    const key = str(row.locationBase) || `Window ${row.locationIndex || 1}`;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(row);
  });
  const rooms = [];
  byName.forEach((roomRows, base) => {
    const names = windowNames(base, roomRows);
    roomRows.forEach((row, i) => {
      const fallbackType = row.blindType || 'Roller';
      rooms.push({
        id: nextId(),
        name: names[i],
        ...fabricFor([row], '', [fallbackType], detectBlindTypes),
        windowGroups: [{ ...groupFromRow(row, null, null), id: 1 }]
      });
    });
  });
  return rooms;
}

/**
 * Builds the Quote Create rooms for a sheet.
 * sourceQuote: the quote from findSheetSourceQuote (status 'single'), or null.
 * detectBlindTypes(fabricInput) -> string[]
 * Returns { rooms, unmeasured, extraRows } where unmeasured = windows that
 * still have no measured width or height in the sheet (those keep the quote's
 * size) and extraRows = rows added in the sheet that aren't from the quote.
 */
export function buildRoomsFromSheet(sheet, sourceQuote, detectBlindTypes) {
  const rows = sheet?.rows || [];
  if (!sourceQuote) {
    let n = 0;
    return { rooms: roomsFromRowsOnly(rows, detectBlindTypes, () => ++n), unmeasured: 0, extraRows: 0 };
  }

  const srcRooms = sourceQuote.rooms || [];
  const srcRoomIds = new Set(srcRooms.map(r => r.id));
  let maxId = Math.max(0, ...srcRooms.map(r => Number(r.id) || 0));
  const newId = () => ++maxId;
  const extra = rows.filter(r => !(r.sourceQuoteId === sourceQuote.id && srcRoomIds.has(r.sourceRoomId)));
  let unmeasured = 0;
  const rooms = [];

  srcRooms.forEach(room => {
    const roomRows = rows.filter(r => r.sourceQuoteId === sourceQuote.id && r.sourceRoomId === room.id);
    if (roomRows.length === 0) return; // every window of this room was removed from the sheet
    const srcGroups = room.windowGroups || [];
    const srcTypes = Array.isArray(room.blindTypes) && room.blindTypes.length > 0 ? room.blindTypes : ['Roller'];
    const base = str(room.name) || str(roomRows[0].locationBase) || 'Room';
    const names = windowNames(base, roomRows);

    const pieces = roomRows.map(row => {
      const idx = row.sourceGroupIdx;
      const src = (typeof idx === 'number' && srcGroups[idx]) ? srcGroups[idx] : null;
      if (!str(row.width) || !str(row.height)) unmeasured += 1;
      // A window not measured yet keeps the quote's size rather than being
      // dropped as a blank group (which would silently remove it).
      const group = groupFromRow(row, src, src);
      // Untagged when the source group is gone: it then never claims a saved price.
      if (src) group._key = `${room.id}_${idx}`;
      return { row, group };
    });

    if (roomRows.length === 1) {
      rooms.push({ ...room, ...fabricFor(roomRows, room.fabricInput, srcTypes, detectBlindTypes), windowGroups: [{ ...pieces[0].group, id: 1 }] });
      return;
    }
    // One room per window. The first keeps the quote room's id.
    pieces.forEach(({ row, group }, i) => {
      rooms.push({
        ...room,
        id: i === 0 ? room.id : newId(),
        name: names[i],
        ...fabricFor([row], room.fabricInput, srcTypes, detectBlindTypes),
        windowGroups: [{ ...group, id: 1 }]
      });
    });
  });

  // Windows added in the sheet itself (no quote behind them): a lone extra
  // window whose name matches a single-window room joins it; the rest become
  // their own rooms after the quote's.
  const leftovers = [];
  extra.forEach(row => {
    const name = str(row.locationBase).toLowerCase();
    const room = name && rooms.find(r => str(r.name).toLowerCase() === name);
    if (room) room.windowGroups = mergeGroups([...room.windowGroups, groupFromRow(row, null, null)]);
    else leftovers.push(row);
  });
  rooms.push(...roomsFromRowsOnly(leftovers, detectBlindTypes, newId));

  return { rooms, unmeasured, extraRows: extra.length };
}
