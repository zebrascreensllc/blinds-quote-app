// "Check sync" (owner's request, 2026-11-25): a way to see, on each device,
// that the cloud really has this device's quotes and what the OTHER devices
// last saw. Each device writes one small record (syncChecks/{deviceId}) with
// how many quotes it holds and the newest one it has; the other device
// reads it. Pure helpers here; the screen is components/SyncCheckPanel.js.

const DEVICE_KEY = 'zebraDeviceId';

/** A stable id for this browser/phone (kept in localStorage; a fresh one if storage is blocked). */
export function getDeviceId(storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
  try {
    const saved = storage && storage.getItem(DEVICE_KEY);
    if (saved) return saved;
    const id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    if (storage) storage.setItem(DEVICE_KEY, id);
    return id;
  } catch (e) {
    return `dev-temp-${Math.random().toString(36).slice(2, 8)}`;
  }
}

/** "iPhone", "iPad", "Mac", "Windows PC", "Android" or "Computer". */
export function deviceLabel(userAgent = '') {
  const ua = String(userAgent);
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows PC';
  return 'Computer';
}

/** What this device holds: active quotes (not trashed) and the newest save time. */
export function summarizeQuotes(quotes) {
  const list = (quotes || []).filter(q => q && !q.trashedAt);
  const newest = list.reduce((max, q) => {
    const t = new Date(q.updatedDate || q.createdDate || 0).getTime();
    return Number.isFinite(t) && t > max ? t : max;
  }, 0);
  return { quoteCount: list.length, newestQuoteAt: newest ? new Date(newest).toISOString() : null };
}

/**
 * One line per OTHER device: when it last checked in and whether it held the
 * same quotes as this one does now. Newest first.
 */
export function describeOtherDevices(records, myDeviceId, mine) {
  return (records || [])
    .filter(r => r && r.id && r.id !== myDeviceId && r.checkedAt)
    .sort((a, b) => String(b.checkedAt).localeCompare(String(a.checkedAt)))
    .map(r => {
      const sameCount = r.quoteCount === mine.quoteCount;
      const sameNewest = (r.newestQuoteAt || null) === (mine.newestQuoteAt || null);
      let status;
      if (sameCount && sameNewest) status = 'same';
      else if (r.newestQuoteAt && mine.newestQuoteAt && r.newestQuoteAt > mine.newestQuoteAt) status = 'other-newer';
      else status = 'different';
      return { id: r.id, label: r.label || 'Another device', checkedAt: r.checkedAt, quoteCount: r.quoteCount, status };
    });
}
