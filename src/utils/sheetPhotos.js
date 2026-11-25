// Window photos on a measurement sheet (see services/sheetPhotoSync.js).
export const MAX_PHOTOS_PER_WINDOW = 6;

/** { [rowId]: photos oldest first } - photos without a rowId or dataUrl are ignored. */
export function groupPhotosByRow(photos) {
  const out = {};
  (photos || []).forEach(p => {
    if (!p || !p.rowId || typeof p.dataUrl !== 'string' || !p.dataUrl.startsWith('data:image/')) return;
    (out[p.rowId] = out[p.rowId] || []).push(p);
  });
  Object.values(out).forEach(list => list.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))));
  return out;
}
