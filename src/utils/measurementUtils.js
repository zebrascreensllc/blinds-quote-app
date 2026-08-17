// ============================================================================
// Supplier Measurement Sheet - isolated utility functions
// ============================================================================
// Deliberately has ZERO imports from utils/pricing.js, utils/constants.js, or
// data/pricingData.js. The only thing this feature reads from the main app is
// a plain quote object (rooms/windowGroups/fabric/client name) passed in from
// App.js - it never reads or writes quote pricing state, and nothing in the
// quoting/calculation engine ever imports from this file. A bug here cannot
// break quote generation, pricing, or saving, and vice versa.
// ============================================================================

// ---- Dropdown option constants -------------------------------------------

export const MOTOR_OPTIONS = ['Manual', 'motor-recharge', 'motor-Zigbee', 'motor-wire-zigbee', 'Custom'];
export const DEFAULT_MOTOR_TYPE = 'motor-Zigbee';

const CASSETTE_S1 = 'Fabric inserted top (S1) and Type C Fabric wrapped';
const CASSETTE_S3 = 'Fabric inserted top (S3 PLUS) and Type C Fabric wrapped';
export const CASSETTE_OPTIONS = [
  'Fabric Wrapped (V3) and Type C Fabric wrapped',
  CASSETTE_S1,
  CASSETTE_S3,
  'Custom'
];
export const DEFAULT_CASSETTE = CASSETTE_S1;
// Height threshold (inches) above which a window needs the bigger S3 PLUS
// cassette by default instead of the standard S1.
export const CASSETTE_S3_HEIGHT_THRESHOLD = 90;

export const MOUNT_OPTIONS = [
  'Inside',
  'Inside-side',
  'Inside - No deduction',
  'Outside - No deduction',
  'Outside - stand deduction'
];
export const DEFAULT_MOUNT = 'Inside';

// Same-room size difference beyond this (in inches) gets flagged as a likely typo.
// Tuned against a real example: siblings within ~1/16"-1/8" of each other are normal,
// a window off by 13/16" from the rest of its room is almost always a mistake.
export const SIZE_OUTLIER_THRESHOLD_INCHES = 0.75;

// ---- Measurement parsing & validation -------------------------------------

/**
 * Parses a measurement string in the format this business actually uses:
 *   "34"       -> whole inches only
 *   "34 5/16"  -> whole + sixteenths (the normal case)
 *   "5/16"     -> fraction only, no whole part
 * The denominator must be EXACTLY 16 - this business always measures to the
 * nearest sixteenth, so anything else (5/15, 5/17, or even 1/2, 1/8) is
 * treated as a typo and flagged, not silently accepted.
 *
 * Returns { valid, decimal, message }. Empty string is treated as "not yet
 * entered" - valid, but decimal is null.
 */
export function validateMeasurementFormat(text) {
  const trimmed = (text || '').trim();
  if (trimmed === '') {
    return { valid: true, decimal: null, message: null };
  }

  // Whole number only, e.g. "34"
  if (/^\d+$/.test(trimmed)) {
    return { valid: true, decimal: parseInt(trimmed, 10), message: null };
  }

  // Whole + fraction ("34 5/16") or fraction alone ("5/16")
  const match = trimmed.match(/^(\d+\s+)?(\d+)\s*\/\s*(\d+)$/);
  if (match) {
    const whole = match[1] ? parseInt(match[1].trim(), 10) : 0;
    const numerator = parseInt(match[2], 10);
    const denominator = parseInt(match[3], 10);

    if (denominator !== 16) {
      return {
        valid: false,
        decimal: null,
        message: `"${trimmed}" - the denominator must be 16 (e.g. 5/16), not ${denominator}. Check for a typo.`
      };
    }
    if (numerator <= 0 || numerator >= 16) {
      return {
        valid: false,
        decimal: null,
        message: `"${trimmed}" - ${numerator}/16 isn't valid, numerator must be 1-15.`
      };
    }
    return { valid: true, decimal: whole + numerator / 16, message: null };
  }

  return {
    valid: false,
    decimal: null,
    message: `"${trimmed}" doesn't look like a measurement. Use a format like 34 5/16.`
  };
}

/**
 * Derives a "room family" from a location name by stripping a trailing
 * " <number>" - e.g. "Living 1" / "Living 2" / "Living 3" all normalize to
 * "Living". Rooms named the exact same thing already group correctly
 * without this (that's the common case, e.g. a quote-derived "Living Room"
 * on every window in it); this exists for Bulk Measurements' manual entry,
 * where each window's Location is typed individually and someone numbering
 * them by hand ("Master 1", "Master 2"...) still expects them compared as
 * one room, not treated as 4 unrelated single-window "rooms".
 */
function normalizeRoomKey(locationBase) {
  const trimmed = (locationBase || '').trim();
  const stripped = trimmed.replace(/\s+\d+$/, '');
  return stripped || trimmed;
}

/**
 * Given all rows on a sheet, finds rows whose width/height is an outlier
 * compared to the median of other windows in the SAME room (locationBase,
 * normalized - see normalizeRoomKey). Only compares rooms with 2+ parseable
 * measurements. Returns a Set of row ids.
 */
export function findRoomSizeOutliers(rows, field) {
  const byRoom = {};
  rows.forEach(row => {
    const key = normalizeRoomKey(row.locationBase);
    const parsed = validateMeasurementFormat(row[field]);
    if (parsed.valid && parsed.decimal !== null) {
      if (!byRoom[key]) byRoom[key] = [];
      byRoom[key].push({ id: row.id, value: parsed.decimal });
    }
  });

  const outlierIds = new Set();
  Object.values(byRoom).forEach(list => {
    if (list.length < 2) return;
    const values = list.map(x => x.value).sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    const median = values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
    list.forEach(x => {
      if (Math.abs(x.value - median) > SIZE_OUTLIER_THRESHOLD_INCHES) outlierIds.add(x.id);
    });
  });
  return outlierIds;
}

// ---- Location label ("Living 1", "Living 2", or just "Entrance" if only 1) --

export function getLocationLabel(row) {
  // A quote-derived row's locationBase is never blank (expandQuoteIntoRows
  // always falls back to 'Room'), so this branch only fires for a Bulk
  // Measurements window that hasn't been named yet - a clean sequential
  // "Window N" (never written back into locationBase itself) instead of a
  // blank or confusing label. recomputeLocationIndices already numbers
  // every not-yet-named row sequentially among each other for this.
  if (!row.locationBase || !row.locationBase.trim()) {
    return `Window ${row.locationIndex || 1}`;
  }
  return row.totalInLocation > 1 ? `${row.locationBase} ${row.locationIndex}` : row.locationBase;
}

// ---- Remote channel computation (derived, never stored) -------------------

/**
 * Given rows IN TABLE ORDER, computes "Remote {group}#{channel}" for every
 * row that has a remoteGroup assigned. Channel numbers are the row's position
 * within its group, so reordering or adding/removing rows can never leave a
 * stale/wrong channel number sitting in stored state - there's nothing to
 * store, it's recalculated fresh every time.
 * Returns a Map from row.id -> label string ('' if no group assigned).
 */
/**
 * ✅ BUGFIX: previously derived "Remote {group}#{channel}" purely from each
 * row's POSITION in the table, recalculated fresh every render. That seemed
 * elegant (nothing to store, nothing to go stale) - but it meant channel
 * order always followed table order (which comes from quote-generation room
 * order) and completely ignored the order you actually selected windows in
 * inside the Bulk Assign Remote Group tool. Selecting Living 1→2→3 then
 * Bf nook 1→2 could assign Bf nook the FIRST channels instead of the last,
 * because Bf nook simply appeared earlier in the underlying row list.
 *
 * Channel numbers are now explicitly STORED per row (row.remoteChannel),
 * assigned once at the moment a group is set - see getNextRemoteChannel.
 * This function just reads them back and formats the label.
 */
export function computeRemoteLabels(rows) {
  const labels = {};
  rows.forEach(row => {
    if (row.remoteGroup && typeof row.remoteChannel === 'number') {
      labels[row.id] = `Remote ${row.remoteGroup}#${row.remoteChannel}`;
    } else {
      labels[row.id] = '';
    }
  });
  return labels;
}

// Max channels a single physical remote supports.
export const MAX_REMOTE_CHANNELS = 16;

/** Returns the next available channel number for a group - i.e. one past
 * whatever the highest currently-assigned channel in that group is (0 if the
 * group is empty so far). Shared by both the bulk tool and the single-row
 * dropdown, so channel assignment can never drift between the two paths. */
export function getNextRemoteChannel(rows, groupNumber) {
  const existing = rows
    .filter(r => r.remoteGroup === groupNumber && typeof r.remoteChannel === 'number')
    .map(r => r.remoteChannel);
  return (existing.length > 0 ? Math.max(...existing) : 0) + 1;
}

/** How many channels a group currently has in use. */
export function countInRemoteGroup(rows, groupNumber) {
  return rows.filter(r => r.remoteGroup === groupNumber && typeof r.remoteChannel === 'number').length;
}


// ---- Building rows from a quote --------------------------------------------

/**
 * Expands a quote into one row per PHYSICAL window (not one row per window
 * GROUP) - a room with a group of qty 2 and a group of qty 1 becomes 3 rows,
 * numbered 1-3 within that room. A room with exactly one window keeps its
 * plain name with no number suffix, matching this business's own convention.
 *
 * Width/height are left BLANK by default: this tool exists to capture NEW
 * precise measurements, and pre-filling the quote's rough estimate risks an
 * old estimate silently going out to the supplier as if it were precise.
 *
 * Pass { prefillMeasurements: true } to instead carry over the quote's own
 * rough width/height as-is (decimal, un-validated) - used by the quick
 * "send to supplier for quote confirmation" export, where the point IS to
 * share the quote's current rough numbers, not a precise measurement.
 */
export function expandQuoteIntoRows(quote, options = {}) {
  const prefillMeasurements = !!options.prefillMeasurements;
  const rows = [];
  (quote.rooms || []).forEach(room => {
    const totalWindows = (room.windowGroups || []).reduce((sum, g) => sum + (parseInt(g.quantity) || 0), 0);
    const fabricParts = (room.fabricInput || '').split(',').map(f => f.trim()).filter(f => f);
    const singleFabric = fabricParts.length === 1 ? fabricParts[0] : '';
    const blindType = (room.blindTypes && room.blindTypes[0]) || 'Roller';

    let windowCounter = 0;
    (room.windowGroups || []).forEach((group, groupIdx) => {
      const qty = parseInt(group.quantity) || 0;
      const isMotor = group.controlType === 'Motor';
      // ✅ NEW: windows over the S3 threshold default to the bigger S3 PLUS
      // cassette instead of S1 - based on the quote's own rough height, since
      // this row's own height field starts blank (see note above) and won't
      // have a precise measurement yet at creation time.
      const heightNum = parseFloat(group.height) || 0;
      const cassetteDefault = heightNum > CASSETTE_S3_HEIGHT_THRESHOLD ? CASSETTE_S3 : CASSETTE_S1;
      for (let i = 0; i < qty; i++) {
        windowCounter += 1;
        rows.push({
          id: `row-${Date.now()}-${rows.length}-${Math.random().toString(36).slice(2, 8)}`,
          clientName: quote.clientName || '',
          locationBase: room.name || 'Room',
          locationIndex: windowCounter,
          totalInLocation: totalWindows,
          motor: isMotor ? DEFAULT_MOTOR_TYPE : 'Manual',
          motorCustomText: '',
          motorSide: '', // '' = Right (default, not written to export), 'Left' = the exception
          solar: !!group.solar,
          remoteGroup: null,
          remoteChannel: null, // explicit channel number, assigned at the moment a group is set (see getNextRemoteChannel) - NOT derived from table position
          cassette: cassetteDefault,
          cassetteCustomText: '',
          mount: DEFAULT_MOUNT,
          fabricNumber: singleFabric,
          comment: '', // free-text note per window (e.g. "Side-by-side") - exported to its own CSV/Excel column
          width: prefillMeasurements ? String(group.width ?? '') : '',
          height: prefillMeasurements ? String(group.height ?? '') : '',
          blindType,
          sourceQuoteId: quote.id,
          sourceQuoteName: quote.quoteName || '',
          sourceRoomId: room.id,
          sourceGroupIdx: groupIdx
        });
      }
    });
  });
  return rows;
}

// ---- Blank/manual row (Bulk Measurements only - no source quote) ----------

/**
 * Same row shape as expandQuoteIntoRows produces, but for a window with no
 * quote behind it at all - the "client wants measurements taken before a
 * quote exists" case. locationIndex/totalInLocation start at 1/1 and get
 * corrected immediately by recomputeLocationIndices once this row joins a
 * sheet (a lone new row is always "1 of 1" until siblings say otherwise).
 * sourceQuoteId/sourceRoomId/sourceGroupIdx are explicitly null, never
 * undefined, per this app's Firestore rule (undefined fields crash writes).
 */
export function createBlankMeasurementRow({ clientName = '', locationBase = '' } = {}) {
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    clientName,
    locationBase,
    locationIndex: 1,
    totalInLocation: 1,
    motor: 'Manual',
    motorCustomText: '',
    motorSide: '',
    solar: false,
    remoteGroup: null,
    remoteChannel: null,
    cassette: DEFAULT_CASSETTE,
    cassetteCustomText: '',
    mount: DEFAULT_MOUNT,
    fabricNumber: '',
    comment: '',
    width: '',
    height: '',
    blindType: 'Roller',
    sourceQuoteId: null,
    sourceQuoteName: '',
    sourceRoomId: null,
    sourceGroupIdx: null
  };
}

// ---- Live location numbering (Bulk Measurements only) ---------------------

/**
 * Recomputes locationIndex/totalInLocation for every row, grouped by
 * locationBase (trimmed) in row order - so getLocationLabel stays correct
 * after a Location name is edited or a window is added/removed, without
 * ever having to touch getLocationLabel or the export pipeline that reads
 * it. Only called from the Bulk Measurements container; the original
 * feature never edits locationBase after creation, so its rows never need
 * this recomputed.
 */
export function recomputeLocationIndices(rows) {
  const keyOf = (r) => (r.locationBase || '').trim();
  const counts = {};
  rows.forEach(r => {
    const k = keyOf(r);
    if (k) counts[k] = (counts[k] || 0) + 1;
  });
  const seen = {};
  return rows.map((r, idx) => {
    const k = keyOf(r);
    // Not yet named - number by overall row position (1st row, 2nd row...)
    // rather than grouping all unnamed rows together. Grouping them would
    // make an unnamed row's number depend on how many OTHER unnamed rows
    // came before it, which can coincidentally match a real typed name
    // like "Window 1" for an entirely different row. Position-based
    // numbering can't collide that way.
    if (!k) return { ...r, locationIndex: idx + 1, totalInLocation: 1 };
    seen[k] = (seen[k] || 0) + 1;
    return { ...r, locationIndex: seen[k], totalInLocation: counts[k] };
  });
}

// ---- Fabric conflict check within a room -----------------------------------

/** Returns the list of room names that currently have 2+ DIFFERENT fabric
 * numbers among their rows (all non-empty). Used to warn before accepting -
 * 99.9% of the time a room should use exactly one fabric. */
/** Returns normalized room keys (see normalizeRoomKey) that have mixed
 * fabric - callers must normalize a row's own locationBase the same way
 * before checking membership (e.g. findRoomsWithMixedFabric(rows).has(...)
 * needs normalizeRoomKey(row.locationBase), not the raw value). */
export function findRoomsWithMixedFabric(rows) {
  const byRoom = {};
  rows.forEach(row => {
    const fabric = (row.fabricNumber || '').trim();
    if (!fabric) return;
    const key = normalizeRoomKey(row.locationBase);
    if (!byRoom[key]) byRoom[key] = new Set();
    byRoom[key].add(fabric);
  });
  return Object.entries(byRoom).filter(([, set]) => set.size > 1).map(([room]) => room);
}

export { normalizeRoomKey };

// ---- Completeness check (required before Copy/Download) -------------------

/** Returns a list of missing required fields for a single window row, e.g.
 * ['width', 'height', 'fabric']. Remote group is only required for motorized
 * windows. Used to hard-block Copy/Download until every window is filled in,
 * and to highlight exactly which windows and fields still need attention. */
export function getIncompleteFields(row) {
  const missing = [];
  // Always non-blank for a quote-derived row (the room name), so this only
  // ever fires for a manually-added Bulk Measurements window that hasn't
  // had its Location filled in yet.
  if (!(row.locationBase || '').trim()) missing.push('location');
  if (!row.width.trim()) missing.push('width');
  if (!row.height.trim()) missing.push('height');
  if (!row.fabricNumber.trim()) missing.push('fabric');
  if (row.motor !== 'Manual' && !row.remoteGroup) missing.push('remote group');
  return missing;
}

// ---- CSV export (opens directly in Excel; no new build dependency needed) -

function escapeCsv(val) {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Computes the export-ready field values for one row, shared by BOTH
 * sheetToCSV and the Excel export - a single source of truth so the two
 * export formats can never drift out of sync with each other (which is
 * exactly how the Solar column went missing from CSV in the first place:
 * the underlying data existed, but only one code path read it).
 */
export function buildRowExportFields(row, idx, remoteLabels) {
  const isMotor = row.motor !== 'Manual';
  const variants = [];
  if (row.motorSide === 'Left') variants.push('Left side');
  if (row.solar) variants.push('Solar');
  const manualSmart = (isMotor ? 'Smart' : 'Manual') + (variants.length ? ' - ' + variants.join(' - ') : '');
  const motorType = isMotor ? (row.motor === 'Custom' ? row.motorCustomText : row.motor) : '';
  const cassette = row.cassette === 'Custom' ? row.cassetteCustomText : row.cassette;
  return {
    sNo: idx + 1,
    clientName: row.clientName,
    location: getLocationLabel(row),
    comment: row.comment || '',
    manualSmart,
    motorType,
    remote: remoteLabels[row.id] || '',
    cassette,
    mount: row.mount,
    fabricNumber: row.fabricNumber,
    width: row.width,
    height: row.height,
    blindType: row.blindType || '',
    // Flags for anything the export should visually highlight - kept here,
    // next to the values themselves, so the two stay consistent by
    // construction rather than by two people remembering the same rule.
    hasComment: !!(row.comment && row.comment.trim()),
    hasMotorVariant: variants.length > 0,
    hasNonDefaultMount: row.mount !== DEFAULT_MOUNT
  };
}

export function sheetToCSV(sheet, rows) {
  const remoteLabels = computeRemoteLabels(rows);
  // ✅ BUGFIX: header renamed 'Motor/Smart' -> 'Manual/Smart' and a Comment
  // column added, both to match the supplier's actual reference format exactly.
  const headers = ['S No', 'Client name', 'LOCATION', 'Comment', 'Manual/Smart', 'Motor-type', 'Remote', 'CASSETTE', 'MOUNT', 'FABRIC MODEL', 'Width (Inches)', 'Height (Inches)', 'Blind Type'];
  const lines = [headers.map(escapeCsv).join(',')];

  rows.forEach((row, idx) => {
    const f = buildRowExportFields(row, idx, remoteLabels);
    lines.push([
      f.sNo, f.clientName, f.location, f.comment, f.manualSmart, f.motorType,
      f.remote, f.cassette, f.mount, f.fabricNumber, f.width, f.height, f.blindType
    ].map(escapeCsv).join(','));
  });

  return lines.join('\n');
}
