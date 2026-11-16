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

// ---------------------------------------------------------------------------
// "Start blank" sheets: the client may already have a quote.
//
// A sheet started blank (measurements taken first) has no link to any quote,
// so the owner used to get "add the client's phone number and review pricing"
// even when that client already had a quote (reported 2026-11-16: Venkat -
// Flower mound, v1/v2 under Pull Quote). We now look the client up by name +
// address and, when found, line the sheet's windows up with that quote's
// window groups so they go through exactly the same path as a pulled sheet.
// ---------------------------------------------------------------------------

// Case, spaces and punctuation don't matter: "Flower mound" = "Flowermound".
const squash = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Room family: "Bf nook 3" / "bf nook" / "BF-Nook" -> "bfnook".
const roomFamily = s => squash(String(s ?? '').replace(/\s*\d+\s*$/, '')) || squash(s);
const versionNum = q => parseInt(String(q?.version || '').replace(/\D/g, ''), 10) || 0;

/**
 * The client's existing quote for a sheet with no quote link, or null.
 * Matches the sheet's client name and address (ignoring case/spaces/
 * punctuation) against active quotes (not trashed or archived). If the sheet
 * has no address, the name alone must point at a single client+address.
 * Returns the newest version in the version chain of the most recently
 * updated matching quote.
 */
export function findClientQuoteForSheet(sheet, quotes) {
  const name = squash(sheet?.clientNames?.[0] || (sheet?.rows || []).find(r => str(r.clientName))?.clientName);
  if (!name) return null;
  const addr = squash(sheet?.address);
  const active = (quotes || []).filter(q => q && !q.trashedAt && !q.archived && squash(q.clientName) === name);
  const lineages = list => new Set(list.map(q => q.lineageId || q.id));
  let matches = addr ? active.filter(q => squash(q.location) === addr) : [];
  // Address typed differently on the sheet ("Flower Mound TX"), or left
  // blank: fall back to the name alone, but only when it points at ONE job.
  // The confirm names the quote, and Cancel still makes a separate one.
  if (matches.length === 0 && lineages(active).size === 1) matches = active;
  if (matches.length === 0) return null;
  // The job = the most recently updated match's version chain (lineageId -
  // the name can differ between versions); use that chain's newest version.
  const latest = [...matches].sort((a, b) => String(b.updatedDate || '').localeCompare(String(a.updatedDate || '')))[0];
  return newestActiveVersion(latest, quotes) || latest;
}

// Newest version (not trashed/archived) in this quote's version chain, or null.
export function newestActiveVersion(quote, quotes) {
  if (!quote) return null;
  const lineage = quote.lineageId || quote.id;
  const chain = (quotes || []).filter(q => q && !q.trashedAt && !q.archived && (q.lineageId || q.id) === lineage);
  return chain.sort((a, b) => versionNum(b) - versionNum(a))[0] || null;
}

// Same rooms (by id) with the same window groups (count, size, Motor/Manual)?
// Then a row's sourceRoomId/sourceGroupIdx means the same window in both.
export function sameWindowLayout(a, b) {
  const ra = a?.rooms || [], rb = b?.rooms || [];
  if (ra.length !== rb.length) return false;
  return ra.every(room => {
    const other = rb.find(r => r.id === room.id);
    const ga = room.windowGroups || [], gb = other?.windowGroups || [];
    return other && ga.length === gb.length && ga.every((g, i) =>
      squash(g.width) === squash(gb[i].width) && squash(g.height) === squash(gb[i].height) && g.controlType === gb[i].controlType);
  });
}

/**
 * A sheet pulled from an OLD version (v6 while v7 exists, or a version since
 * trashed) must build on the newest version - otherwise prices edited in v7
 * would silently go back to v6's. Rows are moved onto `to`: kept as-is when
 * the window layout is the same, otherwise re-matched by room name and size.
 */
export function moveRowsToVersion(rows, from, to, parse) {
  if (sameWindowLayout(from, to)) {
    return { rows: (rows || []).map(r => (r.sourceQuoteId === from.id ? { ...r, sourceQuoteId: to.id } : r)), relinked: false };
  }
  const unlinked = (rows || []).map(r => (r.sourceQuoteId === from.id ? { ...r, sourceQuoteId: null, sourceRoomId: null, sourceGroupIdx: null } : r));
  return { rows: linkRowsToQuote(unlinked, to, parse).rows, relinked: true };
}

/**
 * Gives each unlinked sheet row the sourceQuoteId/sourceRoomId/sourceGroupIdx
 * of the quote window it most likely is, so buildRoomsFromSheet can treat the
 * sheet as if it had been pulled from that quote.
 *   room:  same room family name ("Bf nook 3" -> quote room "Bf nook")
 *   group: within that room, the window group closest in size (each side
 *          within MATCH_TOLERANCE inches), preferring the same Motor/Manual and
 *          groups that still have windows left to claim. An unmeasured row
 *          matches only when the room has a single group.
 * Rows that match nothing are left unlinked (they become their own rooms).
 * parse: the app's parseUnits. Returns { rows, matched }.
 */
export const MATCH_TOLERANCE = 3;
export function linkRowsToQuote(rows, quote, parse) {
  const rooms = quote?.rooms || [];
  const left = new Map(); // `${roomId}_${idx}` -> windows not yet claimed
  rooms.forEach(room => (room.windowGroups || []).forEach((g, i) => left.set(`${room.id}_${i}`, parseInt(g.quantity) || 1)));
  let matched = 0;
  const out = (rows || []).map(row => {
    if (row.sourceQuoteId) return row;
    // Exact window name first ("Bf nook 3" when the quote already has one room
    // per window, e.g. a version made from an earlier sheet), else every room
    // of the same family ("Bf nook 3" -> "Bf nook").
    const exact = squash(getLocationLabel(row));
    const fam = roomFamily(row.locationBase);
    let candidates = rooms.filter(r => squash(r.name) === exact);
    const byExactName = candidates.length > 0;
    if (candidates.length === 0 && fam) candidates = rooms.filter(r => roomFamily(r.name) === fam);
    if (candidates.length === 0) return row;
    const w = parse(str(row.width)), h = parse(str(row.height));
    const options = [];
    candidates.forEach(room => (room.windowGroups || []).forEach((g, i) => options.push({ room, g, i })));
    let best = null;
    if (!w || !h) {
      if (options.length === 1) best = options[0];
    } else {
      const motor = isMotorRow(row);
      options.forEach(o => {
        const gw = parse(str(o.g.width)), gh = parse(str(o.g.height));
        if (!gw || !gh) return;
        const dw = Math.abs(gw - w), dh = Math.abs(gh - h);
        if (dw > MATCH_TOLERANCE || dh > MATCH_TOLERANCE) return;
        const score = dw + dh
          + ((o.g.controlType === 'Motor') === motor ? 0 : 100)
          + ((left.get(`${o.room.id}_${o.i}`) || 0) > 0 ? 0 : 1000);
        if (!best || score < best.score) best = { ...o, score };
      });
      // Same window name and only one window there: it IS that window, even
      // if it measured more than MATCH_TOLERANCE off the rough size.
      if (!best && byExactName && options.length === 1) best = options[0];
    }
    if (!best) return row;
    const k = `${best.room.id}_${best.i}`;
    left.set(k, (left.get(k) || 0) - 1);
    matched += 1;
    return { ...row, sourceQuoteId: quote.id, sourceRoomId: best.room.id, sourceGroupIdx: best.i };
  });
  return { rows: out, matched };
}

/**
 * ONE place that decides which existing quote a sheet becomes the next
 * version of - every way a sheet can be made goes through here:
 *   - pulled from one quote                 -> that quote's newest version
 *   - pulled from an older/trashed version  -> the newest active version
 *   - pulled from several versions of ONE job -> that job's newest version
 *   - started blank / source deleted        -> the client's quote by name+address
 *   - several different jobs (combined)     -> none (a fresh quote)
 * Returns { quote, sheet, how, fromName, matched, reason }:
 *   quote: the quote to build on (null = make a fresh quote)
 *   sheet: the sheet with rows pointed at `quote` (use this to build rooms)
 *   how: 'pulled' | 'newer' | 'client' | null
 *   fromName: the version the sheet was made from, when 'newer'
 *   matched: rows lined up by name+size ('client', or 'newer' with a changed layout)
 *   reason: why no quote ('multiple' | 'missing' | 'none')
 */
export function resolveSheetQuote(sheet, quotes, parse) {
  const rows = sheet?.rows || [];
  const ids = [...new Set(rows.map(r => r.sourceQuoteId).filter(Boolean))];
  const found = ids.map(id => (quotes || []).find(q => q.id === id)).filter(Boolean);
  const jobs = new Set(found.map(q => q.lineageId || q.id));

  if (found.length > 0 && found.length === ids.length && jobs.size === 1) {
    // Prefer the newest active version; if every version is trashed, the
    // newest of the ones the sheet came from.
    const fallback = [...found].sort((a, b) => versionNum(b) - versionNum(a))[0];
    const base = newestActiveVersion(fallback, quotes) || fallback;
    let moved = rows;
    let relinked = false;
    found.forEach(src => {
      if (src.id === base.id) return;
      const r = moveRowsToVersion(moved, src, base, parse);
      moved = r.rows; relinked = relinked || r.relinked;
    });
    const isNewer = found.some(q => q.id !== base.id);
    const matched = relinked ? moved.filter(r => r.sourceQuoteId === base.id).length : undefined;
    return {
      quote: base,
      sheet: { ...sheet, rows: moved },
      how: isNewer ? 'newer' : 'pulled',
      fromName: isNewer ? (fallback.quoteName || fallback.version || '') : '',
      matched,
      reason: null
    };
  }

  if (ids.length > 0 && jobs.size > 1) return { quote: null, sheet, how: null, reason: 'multiple' };

  // Blank sheet, or its quote was deleted: look the client up.
  const clientQuote = findClientQuoteForSheet(sheet, quotes);
  if (clientQuote) {
    const unlinked = rows.map(r => (r.sourceQuoteId && r.sourceQuoteId !== clientQuote.id)
      ? { ...r, sourceQuoteId: null, sourceRoomId: null, sourceGroupIdx: null } : r);
    const { rows: linkedRows, matched } = linkRowsToQuote(unlinked, clientQuote, parse);
    return { quote: clientQuote, sheet: { ...sheet, rows: linkedRows }, how: 'client', matched, reason: null };
  }
  return { quote: null, sheet, how: null, reason: ids.length > 0 ? 'missing' : 'none' };
}
