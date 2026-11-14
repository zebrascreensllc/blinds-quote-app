// Versions of one quote are tied together by `lineageId` (every version has
// its own unique `id`). The client's name and address can change between
// versions - e.g. correcting a typo "Harshita" -> "Harshitha" - so nothing
// that means "the same quote" may be keyed by name + location alone.
//
// Bug this file exists for (2026-11-14): editing v7 of "Harshita" and fixing
// the spelling saved the edit as v1, because the next version number was
// looked up by client name + location, and the corrected name had no quotes
// yet. History then showed it as a separate client.

export const versionNumber = (q) => {
  const n = parseInt(String((q && q.version) || '').replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? 0 : n;
};

export const lineageOf = (q) => (q && (q.lineageId || q.id)) || '';

const nameKey = (q) => `${String(q.clientName || '').trim().toLowerCase()}|${String(q.location || '').trim().toLowerCase()}`;

const timeOf = (q) => {
  const t = new Date(q.updatedDate || q.createdDate || 0).getTime();
  return isNaN(t) ? 0 : t;
};

/**
 * Next version number for a save.
 * - Editing (lineageId given): one more than the highest version anywhere in
 *   that quote's history, whatever name/address each version had. Trashed and
 *   archived versions count too, so a restored one never shares a number.
 * - Also never lower than what the (new) name + address already uses, as before.
 */
export const getNextVersionNumber = (clientName, location, quotes = [], lineageId = null) => {
  const list = Array.isArray(quotes) ? quotes.filter(Boolean) : [];
  let max = 0;
  list.forEach(q => {
    const sameLineage = lineageId && lineageOf(q) === lineageId;
    // Exact match kept for the name+address rule (the old behaviour).
    const sameName = q.clientName === clientName && q.location === location;
    if (sameLineage || sameName) max = Math.max(max, versionNumber(q));
  });
  return max + 1;
};

/**
 * Next version number inside one quote's history only (the quote screen's
 * "Save All Changes" / "Update estimate"). Saving from an older version
 * (v3 while v6 exists) gives v7, never a second v4.
 */
export const nextVersionInLineage = (quotes = [], lineageId) => {
  let max = 0;
  (Array.isArray(quotes) ? quotes : []).forEach(q => {
    if (q && lineageId && lineageOf(q) === lineageId) max = Math.max(max, versionNumber(q));
  });
  return max + 1;
};

/**
 * Key that History groups a quote under: the name + address of the most
 * recently saved active version of its lineage, so every version of a renamed
 * client shows together under the corrected name. Different quotes that
 * share a name + address still share a group, as before.
 * Returns Map(quote.id -> "Client - Location").
 */
export const historyGroupKeys = (activeQuotes = []) => {
  const newestByLineage = new Map();
  activeQuotes.forEach(q => {
    const lin = lineageOf(q);
    const cur = newestByLineage.get(lin);
    if (!cur || timeOf(q) > timeOf(cur) || (timeOf(q) === timeOf(cur) && versionNumber(q) > versionNumber(cur))) {
      newestByLineage.set(lin, q);
    }
  });
  const keys = new Map();
  activeQuotes.forEach(q => {
    const newest = newestByLineage.get(lineageOf(q)) || q;
    keys.set(q.id, `${newest.clientName} - ${newest.location}`);
  });
  return keys;
};

const renameVersionInName = (quoteName, newVersion) => {
  const name = String(quoteName || '');
  return /-v\d+$/.test(name) ? name.replace(/-v\d+$/, `-${newVersion}`) : name;
};

/**
 * One-time repair for quotes already saved by the bug: within one lineage,
 * a name/address that first appears with a version number at or below a
 * number an EARLIER save of that lineage already used (under a different
 * name) restarted the count. Every version saved under that name is moved up
 * so the chain continues: Harshita v1..v7, then Harshitha v1 -> v8 (and a
 * later Harshitha v2 -> v9).
 *
 * Only `version` and the "-vN" end of `quoteName` change - never prices,
 * rooms or dates. A lineage is left alone if the result would give two
 * versions the same number. Pure: returns the changed quotes (new objects).
 */
export const findRestartedVersionChains = (quotes = []) => {
  const byLineage = new Map();
  (Array.isArray(quotes) ? quotes : []).filter(Boolean).forEach(q => {
    const lin = lineageOf(q);
    if (!byLineage.has(lin)) byLineage.set(lin, []);
    byLineage.get(lin).push(q);
  });

  const changed = [];
  byLineage.forEach(list => {
    if (list.length < 2) return;
    const ordered = [...list].sort((a, b) => (timeOf(a) - timeOf(b)) || (versionNumber(a) - versionNumber(b)));
    const shiftByKey = new Map(); // name key -> shift decided when it first appeared
    let maxSoFar = 0;
    const newNumber = new Map(); // quote id -> new version number
    ordered.forEach(q => {
      const key = nameKey(q);
      const n = versionNumber(q);
      if (!shiftByKey.has(key)) {
        // Only a name that never appeared earlier in this lineage can be a
        // restart, and only when the lineage already had versions.
        shiftByKey.set(key, (maxSoFar > 0 && n > 0 && n <= maxSoFar) ? (maxSoFar - n + 1) : 0);
      }
      const shift = n > 0 ? shiftByKey.get(key) : 0;
      const finalN = n + shift;
      if (shift > 0) newNumber.set(q.id, finalN);
      maxSoFar = Math.max(maxSoFar, finalN);
    });
    if (newNumber.size === 0) return;

    // Safety: a moved version must not land on a number another version of
    // this lineage has. (Older duplicates the repair didn't make - e.g. saving
    // from an old version twice - are left as they are.)
    const finalOf = (q) => (newNumber.has(q.id) ? newNumber.get(q.id) : versionNumber(q));
    const collides = list.some(q => newNumber.has(q.id) && list.some(o => o.id !== q.id && finalOf(o) === finalOf(q)));
    if (collides) return;

    list.forEach(q => {
      if (!newNumber.has(q.id)) return;
      const v = `v${newNumber.get(q.id)}`;
      changed.push({ ...q, version: v, quoteName: renameVersionInName(q.quoteName, v) });
    });
  });
  return changed;
};
