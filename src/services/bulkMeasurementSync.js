import { subscribeToCollection, saveDocument, deleteDocument } from './firestoreCollectionSync';

// Deliberately a SEPARATE collection from 'measurementSheets' (the existing
// Supplier Measurements feature) - same reasoning as measurementSheets being
// separate from quotes: this is a parallel workflow being trialed alongside
// the original, and a bug or a later "disable this feature" decision here
// can never touch or need to touch the other feature's data.
const COLLECTION = 'measurementSheetsBulk';

export function subscribeToBulkSheets(uid, onUpdate, onError) {
  return subscribeToCollection(uid, COLLECTION, onUpdate, onError);
}

export function saveBulkSheetRemote(uid, sheet) {
  return saveDocument(uid, COLLECTION, sheet);
}

export function deleteBulkSheetRemote(uid, sheetId) {
  return deleteDocument(uid, COLLECTION, sheetId);
}
