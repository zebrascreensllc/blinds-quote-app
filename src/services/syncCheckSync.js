import { subscribeToCollection, saveDocument } from './firestoreCollectionSync';

// One small document per device (see utils/syncCheck.js). Its own
// collection, so it can never touch quotes or sheets.
const COLLECTION = 'syncChecks';

export function subscribeToSyncChecks(uid, onUpdate, onError) {
  return subscribeToCollection(uid, COLLECTION, onUpdate, onError);
}

/** Resolves { queued } - queued: false means the cloud confirmed it. */
export function saveSyncCheck(uid, record) {
  return saveDocument(uid, COLLECTION, record);
}
