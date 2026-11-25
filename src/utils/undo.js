// "Undo Last Delete" (and "Undo" after Restore from Backup File).
//
// ✅ FIX (2026-11-25): Undo used to write back the WHOLE quote list exactly as
// it was at the moment of the delete. updateQuotes() diffs old vs new, so any
// quote created or changed after the delete was hard-deleted or reverted -
// proven live: delete A, create C, Undo -> A back, C gone for good (not even in
// Trash), while the app said "Restored". Now the snapshot only holds the
// quotes the action touched, and Undo only puts THOSE back. Everything else is
// left exactly as it is now.

/**
 * @param {Array} quotesBefore the full list right before the action
 * @param {Iterable} affectedIds ids the action changes or adds
 * @param {string} label shown on the Undo banner
 * Returns { label, at, before: [{ id, quote }] } - quote is null when the id
 * did not exist before (e.g. a quote added by a backup import).
 */
export function makeUndoSnapshot(quotesBefore, affectedIds, label) {
  const byId = new Map((quotesBefore || []).map(q => [q.id, q]));
  const before = [...new Set(affectedIds || [])].map(id => ({
    id,
    quote: byId.has(id) ? JSON.parse(JSON.stringify(byId.get(id))) : null
  }));
  return { label, at: new Date().toISOString(), before };
}

/**
 * The quote list after undoing `snapshot` on top of `currentQuotes`: each
 * affected quote goes back to how it was (or is removed if it didn't exist);
 * every other quote is returned untouched, in its current state.
 */
export function applyUndo(currentQuotes, snapshot) {
  const list = currentQuotes || [];
  if (!snapshot || !Array.isArray(snapshot.before)) return list;
  const restore = new Map(snapshot.before.map(b => [b.id, b.quote]));
  const seen = new Set();
  const out = [];
  list.forEach(q => {
    if (!restore.has(q.id)) { out.push(q); return; }
    seen.add(q.id);
    const old = restore.get(q.id);
    if (old) out.push(old); // back to how it was; null = it was added, so drop it
  });
  // Affected quotes that are gone now (e.g. "Delete Forever" from Trash since): put them back.
  restore.forEach((old, id) => { if (old && !seen.has(id)) out.push(old); });
  return out;
}
