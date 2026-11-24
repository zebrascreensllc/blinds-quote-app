// Cassette: the supplier's cassette names (Supplier Measurements) and the
// cassette chosen on a quote (2026-11-24). Imports only parseUnits, so the
// quote screens, pricing, the invoice and the supplier sheet can all use it
// without crossing the quote / measurement isolation line.
import { parseUnits } from './formatters';

export const CASSETTE_S1 = 'Fabric inserted top (S1) and Type C Fabric wrapped';
export const CASSETTE_S3 = 'Fabric inserted top (S3 PLUS) and Type C Fabric wrapped';
export const CASSETTE_OPTIONS = [
  'Fabric Wrapped (V3) and Type C Fabric wrapped',
  'Fabric Wrapped (V3) - White and Type C Fabric wrapped',
  'Fabric Wrapped (V3) - Grey and Type C Fabric wrapped',
  'Fabric Wrapped (V3) - Black and Type C Fabric wrapped',
  '(V3) - White and Type C Fabric wrapped',
  '(V3) - Grey and Type C Fabric wrapped',
  '(V3) - Black and Type C Fabric wrapped',
  CASSETTE_S1,
  CASSETTE_S3,
  'Custom'
];
export const DEFAULT_CASSETTE = CASSETTE_S1;
// Height threshold (inches) above which a window needs the bigger S3 PLUS
// cassette by default instead of the standard S1.
export const CASSETTE_S3_HEIGHT_THRESHOLD = 90;

// ---- Cassette chosen on the QUOTE (2026-11-24) ----------------------------
// A quote window group can carry group.cassette (one of CASSETTE_OPTIONS) and
// group.cassetteCustomText. '' (or missing, on quotes saved before this
// existed) means "Standard": S1, or S3 PLUS over the height threshold - the
// same default a sheet row has always got. Both the quote screens and the
// sheet builders use these helpers so the rule lives in one place.

/** The standard cassette for a window of this height (typed text or inches). */
export function autoCassetteForHeight(height) {
  const h = typeof height === 'number' ? height : parseUnits(String(height ?? ''));
  return (Number.isFinite(h) ? h : 0) > CASSETTE_S3_HEIGHT_THRESHOLD ? CASSETTE_S3 : CASSETTE_S1;
}

/** true when a quote group has a real cassette chosen (not Standard). */
export function hasChosenCassette(group) {
  const c = group && group.cassette;
  if (!c || !CASSETTE_OPTIONS.includes(c)) return false;
  return c !== 'Custom' || !!String(group.cassetteCustomText || '').trim();
}

/** { cassette, cassetteCustomText } a sheet row gets from a quote group. */
export function cassetteFromQuoteGroup(group) {
  if (hasChosenCassette(group)) {
    return { cassette: group.cassette, cassetteCustomText: group.cassette === 'Custom' ? String(group.cassetteCustomText || '').trim() : '' };
  }
  return { cassette: autoCassetteForHeight(group && group.height), cassetteCustomText: '' };
}

/**
 * { cassette, cassetteCustomText } for a quote group built from a sheet row.
 * A row that still has the standard cassette for the quoted height stays
 * Standard ('') so regenerating a quote never turns an old quote's default
 * into an explicit choice (which could change its price).
 */
export function quoteCassetteFromRow(row, quotedHeight, srcGroup = null) {
  const c = row && row.cassette;
  if (!c || !CASSETTE_OPTIONS.includes(c)) return { cassette: '', cassetteCustomText: '' };
  if (c === 'Custom') {
    const text = String(row.cassetteCustomText || '').trim();
    return text ? { cassette: 'Custom', cassetteCustomText: text } : { cassette: '', cassetteCustomText: '' };
  }
  // The quote already chose this exact cassette: keep its choice.
  if (hasChosenCassette(srcGroup) && srcGroup.cassette === c) return { cassette: c, cassetteCustomText: '' };
  const h = String(quotedHeight ?? '').trim() || String(row.quotedHeight ?? '').trim() || String(row.height ?? '').trim();
  if (c === autoCassetteForHeight(h)) return { cassette: '', cassetteCustomText: '' };
  return { cassette: c, cassetteCustomText: '' };
}

/** Short on-screen name: drops the shared " and Type C Fabric wrapped" tail. */
export function cassetteShortName(value, customText) {
  if (!value) return '';
  if (value === 'Custom') return String(customText || '').trim() || 'Custom';
  return value.replace(/ and Type C Fabric wrapped$/, '');
}

/** What a quote group shows: its chosen cassette, or "Standard (S1)" / "Standard (S3 PLUS)". */
export function quoteCassetteLabel(group) {
  if (hasChosenCassette(group)) return cassetteShortName(group.cassette, group.cassetteCustomText);
  return autoCassetteForHeight(group && group.height) === CASSETTE_S3 ? 'Standard (S3 PLUS)' : 'Standard (S1)';
}

// ---- Cassette price (owner, 2026-11-24) ------------------------------------
// S1 is the default and costs nothing extra. V3 (every V3 option) and S3 PLUS
// cost the supplier $6 per square meter, added to the window's COST exactly
// like the fabric (same area, same 1.5 sq m minimum), so the client price
// goes up by the same amount and the profit per window doesn't change.
// Custom: $0 extra (unknown) - set the window's price by hand if it costs more.
//
// Old quotes never change price: they have no chosen cassette, and the
// Standard S3 PLUS that tall windows get is only charged when the quote's own
// pricing snapshot says CHARGE_AUTO_S3_CASSETTE: true (new quotes only).
export const CASSETTE_UPGRADE_PER_SQM = 6;
const UPGRADE_CASSETTES = new Set(CASSETTE_OPTIONS.filter(c => c.includes('(V3)') || c === CASSETTE_S3));

/** true when this cassette option costs extra (V3 family, S3 PLUS). */
export const isUpgradeCassette = (value) => UPGRADE_CASSETTES.has(value);

/** Extra supplier cost per square meter for this window's cassette (0 = none). */
export function cassetteUpgradePerSqm(group, pricing) {
  const p = pricing || {};
  const rate = typeof p.CASSETTE_UPGRADE_PER_SQM === 'number' ? p.CASSETTE_UPGRADE_PER_SQM : CASSETTE_UPGRADE_PER_SQM;
  if (hasChosenCassette(group)) return isUpgradeCassette(group.cassette) ? rate : 0;
  if (p.CHARGE_AUTO_S3_CASSETTE !== true) return 0;
  return autoCassetteForHeight(group && group.height) === CASSETTE_S3 ? rate : 0;
}
