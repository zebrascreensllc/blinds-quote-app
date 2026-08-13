import { subscribeToCollection, saveDocument, deleteDocument } from './firestoreCollectionSync';

const COLLECTION = 'orderAnalysis';

export function subscribeToAnalysisEntries(uid, onUpdate, onError) {
  return subscribeToCollection(uid, COLLECTION, onUpdate, onError);
}

export function saveAnalysisEntryRemote(uid, entry) {
  return saveDocument(uid, COLLECTION, entry);
}

export function deleteAnalysisEntryRemote(uid, entryId) {
  return deleteDocument(uid, COLLECTION, entryId);
}
