import { subscribeToCollection, saveDocument, deleteDocument } from './firestoreCollectionSync';

const COLLECTION = 'quotes';

export function subscribeToQuotes(uid, onUpdate, onError) {
  return subscribeToCollection(uid, COLLECTION, onUpdate, onError);
}

export function saveQuoteRemote(uid, quote, options) {
  return saveDocument(uid, COLLECTION, quote, options);
}

export function deleteQuoteRemote(uid, quoteId) {
  return deleteDocument(uid, COLLECTION, quoteId);
}
