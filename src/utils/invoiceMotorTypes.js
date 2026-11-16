// Motor / chain types for the invoice, read from the client's measurement
// sheet (owner's request, 2026-11-16: "if a motor is a wired motor or
// something, show that instead of Smart; same for Manual").
//
// The quote itself only knows Motor vs Manual; the specific type (wired,
// rechargeable, chain wand colour, custom chain length...) is set per window
// in Bulk Measurements. This file is the bridge: it finds the sheet that
// belongs to the quote's job, lines its rows up with the quote's windows,
// and hands invoiceExport plain text labels. invoiceExport itself never
// imports measurement code (see the isolation note in measurementUtils.js).
//
// Safety rules:
// - Which sheet belongs to which quote is decided by resolveSheetQuote, the
//   same function "Generate Quote from this Sheet" uses, so the two can't
//   disagree (pulled / older version / blank sheet matched by name+address).
// - A sheet row's type is only used when it agrees with the quote on Motor
//   vs Manual. If the sheet says Motor but the quote still says Manual (the
//   quote wasn't regenerated), the invoice keeps the quote's own word, so the
//   label never contradicts the price on that line.
import { isManualMotor, MANUAL_CUSTOM_MOTOR, motorDisplay } from './measurementUtils';
import { resolveSheetQuote, moveRowsToVersion } from './sheetToQuote';
import { parseUnits } from './formatters';

const lineageOf = q => (q && (q.lineageId || q.id)) || null;

// Client-friendly names for the Smart options in Bulk Measurements.
const SMART_NAMES = {
  'motor-recharge': 'Rechargeable',
  'motor-Zigbee': 'Zigbee',
  'motor-wire-zigbee': 'Wired'
};

/** The invoice text for one sheet row's motor choice, or null if unset. */
export function invoiceMotorLabel(row) {
  const motor = row && row.motor;
  if (!motor) return null;
  if (isManualMotor(motor)) {
    if (motor === 'Manual') return 'Manual';
    // A 'Manual - Custom' with nothing typed is just Manual.
    if (motor === MANUAL_CUSTOM_MOTOR && !String(row.motorCustomText || '').trim()) return 'Manual';
    return motorDisplay(row); // "Manual - Chain wand - White", "Manual - chain 6ft"
  }
  const name = motor === 'Custom' ? String(row.motorCustomText || '').trim() : (SMART_NAMES[motor] || motor);
  return name ? `Smart - ${name}` : 'Smart';
}

/**
 * The newest measurement sheet for this quote's job, with its rows linked to
 * THIS quote's windows (sourceRoomId/sourceGroupIdx), or null.
 */
export function findInvoiceSheet(quote, sheets, quotes) {
  const lineage = lineageOf(quote);
  if (!lineage) return null;
  const all = Array.isArray(quotes) && quotes.some(q => q && q.id === quote.id) ? quotes : [...(quotes || []), quote];
  const found = [];
  (sheets || []).forEach(sheet => {
    if (!sheet || !Array.isArray(sheet.rows) || sheet.rows.length === 0) return;
    let resolved;
    try {
      resolved = resolveSheetQuote(sheet, all, parseUnits);
    } catch (e) {
      return; // one odd sheet never blocks the invoice
    }
    if (!resolved.quote || lineageOf(resolved.quote) !== lineage) return;
    let rows = resolved.sheet.rows;
    if (resolved.quote.id !== quote.id) rows = moveRowsToVersion(rows, resolved.quote, quote, parseUnits).rows;
    found.push({ sheet, rows });
  });
  if (found.length === 0) return null;
  found.sort((a, b) => String(b.sheet.updatedDate || '').localeCompare(String(a.sheet.updatedDate || '')));
  return found[0];
}

/**
 * { labels, count } where labels maps a window group's price key
 * (`${room.id}_${groupIdx}`, same as invoiceExport) to one label per window
 * in sheet order, and count is how many invoice lines get a label.
 * Returns null when there is no sheet for this quote.
 */
export function invoiceMotorLabels(quote, sheets, quotes) {
  const found = findInvoiceSheet(quote, sheets, quotes);
  if (!found) return null;
  const byKey = {};
  found.rows.forEach(row => {
    if (row.sourceQuoteId !== quote.id || row.sourceRoomId == null || row.sourceGroupIdx == null) return;
    const key = `${row.sourceRoomId}_${row.sourceGroupIdx}`;
    (byKey[key] = byKey[key] || []).push(row);
  });
  const labels = {};
  let count = 0;
  (quote.rooms || []).forEach(room => (room.windowGroups || []).forEach((group, idx) => {
    const key = `${room.id}_${idx}`;
    const isMotor = group.controlType === 'Motor';
    const list = (byKey[key] || [])
      .filter(r => r.motor && isManualMotor(r.motor) !== isMotor)
      .map(invoiceMotorLabel)
      .filter(Boolean);
    if (list.length === 0) return;
    labels[key] = list;
    count += Math.min(list.length, parseInt(group.quantity) || 1);
  }));
  return { labels, count, sheetId: found.sheet.id };
}
