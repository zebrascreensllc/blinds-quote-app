import { subscribeToCollectionWhere, listDocumentIdsWhere, saveDocument, deleteDocument } from './firestoreCollectionSync';

// Photos per window on a measurement sheet (owner's request, 2026-11-25).
// One small document per photo ({ id, sheetId, rowId, dataUrl, createdAt }),
// in its own collection: a sheet document holds every window, and Firestore's
// 1MB limit per document would fill up after a few photos. Same offline
// path as everything else (a photo taken with no signal uploads later).
const COLLECTION = 'sheetPhotos';

export function subscribeToSheetPhotos(uid, sheetId, onUpdate, onError) {
  return subscribeToCollectionWhere(uid, COLLECTION, 'sheetId', sheetId, onUpdate, onError);
}

export function saveSheetPhoto(uid, photo) {
  return saveDocument(uid, COLLECTION, photo);
}

export function deleteSheetPhoto(uid, photoId) {
  return deleteDocument(uid, COLLECTION, photoId);
}

/** Deletes every photo of a sheet (used when the sheet itself is deleted). */
export async function deleteAllSheetPhotos(uid, sheetId) {
  const ids = await listDocumentIdsWhere(uid, COLLECTION, 'sheetId', sheetId);
  await Promise.all(ids.map(id => deleteDocument(uid, COLLECTION, id)));
  return ids.length;
}
