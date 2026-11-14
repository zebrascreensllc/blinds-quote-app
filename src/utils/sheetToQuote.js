// Supplier Measurements sheet -> Quote Create form ("Generate Quote from this
// Sheet"). Pure functions, no React/Firestore, so they can be run in Node.
//
// Two cases:
//  1. The sheet was pulled from ONE quote (every quote-built row carries
//     sourceQuoteId/sourceRoomId/sourceGroupIdx, see expandQuoteIntoRows).
//     The form is built as a NEW VERSION of that quote: client name, phone,
//     location, hub, other expenses and every saved price carry over, and the
//     sheet's real measurements replace the rough sizes. Each window group is
//     tagged with `_origIdx` (its position in the source quote) so a manual
//     per-window price follows its window - including when one rough-size group
//     splits into several precise sizes (pruneRooms' keyTargets).
//  Every group also carries `_labels`: the sheet's names for its windows
//  ("Bf nook 1", "Bf nook 4"), shown on the form so each window can be found.
//  Display only - pruneRooms strips it before saving.
//  2. No single source quote (a "Start blank" sheet, a combined sheet of
//     several quotes, or the source quote no longer exists): rooms are rebuilt
//     from the rows alone, exactly as before.

import { getLocationLabel } from './measurementUtils';

const BLANK_GROUP = { id: 1, quantity: '', width: '', height: '', controlType: 'Manual', solar: false, mount: 'Inside', surchargeOverride: null };

const str = v => String(v ?? '').trim();
const isMotorRow = row => !!(row.motor && row.motor !== 'Manual');

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

// Rows with identical size/motor/solar collapse into one window group with a
// quantity - the reverse of expandQuoteIntoRows.
function groupRows(rows, sizeOf) {
  const byKey = new Map();
  rows.forEach(row => {
    const { width, height } = sizeOf(row);
    const motor = isMotorRow(row);
    const solar = motor ? (row.solar || false) : false;
    const key = JSON.stringify([width, height, motor, solar]);
    if (!byKey.has(key)) byKey.set(key, { row, width, height, motor, solar, count: 0, labels: [] });
    byKey.get(key).count += 1;
    byKey.get(key).labels.push(getLocationLabel(row));
  });
  return Array.from(byKey.values());
}

const distinctFabrics = rows => [...new Set(rows.map(r => str(r.fabricNumber)).filter(Boolean))];

// Rooms built from rows alone (no source quote to lean on).
function roomsFromRowsOnly(rows, detectBlindTypes, firstRoomId) {
  const byName = new Map();
  rows.forEach(row => {
    const key = str(row.locationBase) || `Window ${row.locationIndex || 1}`;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(row);
  });
  return Array.from(byName.entries()).map(([name, roomRows], i) => {
    const windowGroups = groupRows(roomRows, r => ({ width: str(r.width), height: str(r.height) }))
      .map((e, gi) => ({ ...BLANK_GROUP, id: gi + 1, quantity: String(e.count), width: e.width, height: e.height, controlType: e.motor ? 'Motor' : 'Manual', solar: e.solar, _labels: e.labels }));
    // A quote room carries ONE fabricInput string - distinct fabrics are
    // comma-joined, the same way a mixed-fabric room is typed by hand.
    const fabricInput = distinctFabrics(roomRows).join(', ');
    const fallbackBlindType = roomRows.find(r => r.blindType)?.blindType || 'Roller';
    const detected = fabricInput ? detectBlindTypes(fabricInput) : null;
    return {
      id: firstRoomId + i,
      name,
      fabricInput,
      blindTypes: Array.isArray(detected) && detected.length > 0 ? detected : [fallbackBlindType],
      windowGroups: windowGroups.length > 0 ? windowGroups : [{ ...BLANK_GROUP }]
    };
  });
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
    return { rooms: roomsFromRowsOnly(rows, detectBlindTypes, 1), unmeasured: 0, extraRows: 0 };
  }

  const srcRooms = sourceQuote.rooms || [];
  const srcRoomIds = new Set(srcRooms.map(r => r.id));
  const isFromRoom = (row, room) => row.sourceQuoteId === sourceQuote.id && row.sourceRoomId === room.id;
  const extra = rows.filter(r => !(r.sourceQuoteId === sourceQuote.id && srcRoomIds.has(r.sourceRoomId)));
  let unmeasured = 0;

  const rooms = [];
  srcRooms.forEach(room => {
    const roomRows = rows.filter(r => isFromRoom(r, room));
    if (roomRows.length === 0) return; // every window of this room was removed from the sheet
    const srcGroups = room.windowGroups || [];
    const windowGroups = [];

    // Quote order first: one source group at a time, split by precise size.
    const idxs = [...new Set(roomRows.map(r => r.sourceGroupIdx))]
      .sort((a, b) => (typeof a === 'number' ? a : 1e9) - (typeof b === 'number' ? b : 1e9));
    idxs.forEach(idx => {
      const src = (typeof idx === 'number' && srcGroups[idx]) ? srcGroups[idx] : null;
      const gRows = roomRows.filter(r => r.sourceGroupIdx === idx);
      gRows.forEach(r => { if (!str(r.width) || !str(r.height)) unmeasured += 1; });
      // A window not measured yet keeps the quote's size rather than being
      // dropped as a blank group (which would silently remove it).
      const sizeOf = r => ({
        width: str(r.width) || (src ? str(src.width) : ''),
        height: str(r.height) || (src ? str(src.height) : '')
      });
      groupRows(gRows, sizeOf).forEach(e => {
        windowGroups.push({
          ...BLANK_GROUP,
          ...(src ? { mount: src.mount || 'Inside', surchargeOverride: src.surchargeOverride ?? null } : {}),
          id: windowGroups.length + 1,
          quantity: String(e.count),
          width: e.width,
          height: e.height,
          controlType: e.motor ? 'Motor' : 'Manual',
          solar: e.solar,
          _labels: e.labels,
          // Untagged when the source group is gone: it then never claims a saved price.
          ...(src ? { _origIdx: idx } : {})
        });
      });
    });

    // Fabric: what the sheet says (the confirmed order) wins; a room whose
    // windows have no fabric in the sheet keeps the quote's fabric/blind type.
    const sheetFabrics = distinctFabrics(roomRows);
    const sameAsQuote = sheetFabrics.length === 0 ||
      sheetFabrics.join(', ').toLowerCase() === str(room.fabricInput).split(',').map(f => f.trim()).filter(Boolean).join(', ').toLowerCase();
    let fabricInput = room.fabricInput || '';
    let blindTypes = Array.isArray(room.blindTypes) && room.blindTypes.length > 0 ? room.blindTypes : ['Roller'];
    if (!sameAsQuote) {
      fabricInput = sheetFabrics.join(', ');
      const detected = detectBlindTypes(fabricInput);
      if (Array.isArray(detected) && detected.length > 0) blindTypes = detected;
    }

    rooms.push({ ...room, fabricInput, blindTypes, windowGroups });
  });

  // Windows added in the sheet itself (no quote behind them): join the quote
  // room with the same name, else become new rooms after the quote's own.
  if (extra.length > 0) {
    const leftovers = [];
    extra.forEach(row => {
      const name = str(row.locationBase).toLowerCase();
      const room = name && rooms.find(r => str(r.name).toLowerCase() === name);
      if (room) room._extraRows = [...(room._extraRows || []), row];
      else leftovers.push(row);
    });
    rooms.forEach(room => {
      if (!room._extraRows) return;
      groupRows(room._extraRows, r => ({ width: str(r.width), height: str(r.height) })).forEach(e => {
        room.windowGroups.push({ ...BLANK_GROUP, id: room.windowGroups.length + 1, quantity: String(e.count), width: e.width, height: e.height, controlType: e.motor ? 'Motor' : 'Manual', solar: e.solar, _labels: e.labels });
      });
      delete room._extraRows;
    });
    const maxId = Math.max(0, ...srcRooms.map(r => Number(r.id) || 0));
    rooms.push(...roomsFromRowsOnly(leftovers, detectBlindTypes, maxId + 1));
  }

  return { rooms, unmeasured, extraRows: extra.length };
}
