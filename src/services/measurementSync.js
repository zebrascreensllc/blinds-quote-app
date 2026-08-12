import { subscribeToCollection, saveDocument, deleteDocument } from './firestoreCollectionSync';

const COLLECTION = 'measurementSheets';

export function subscribeToSheets(uid, onUpdate, onError) {
  return subscribeToCollection(uid, COLLECTION, onUpdate, onError);
}

export function saveSheetRemote(uid, sheet) {
  return saveDocument(uid, COLLECTION, sheet);
}

export function deleteSheetRemote(uid, sheetId) {
  return deleteDocument(uid, COLLECTION, sheetId);
}
