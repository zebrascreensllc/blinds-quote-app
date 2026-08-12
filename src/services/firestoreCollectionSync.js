import { collection, doc, setDoc, deleteDoc, onSnapshot, query } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Subscribes to real-time updates for every document in
 * users/{uid}/{collectionName}. onUpdate fires immediately with whatever's
 * already cached (works offline), then again every time anything changes -
 * on THIS device or any other device signed into the same account. This one
 * listener is the entire mechanism behind "auto sync across devices."
 *
 * Returns an unsubscribe function - call it when the component using this
 * unmounts, so the listener doesn't keep running after it's no longer needed.
 */
export function subscribeToCollection(uid, collectionName, onUpdate, onError) {
  const colRef = collection(db, 'users', uid, collectionName);
  const q = query(colRef);
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map(d => d.data());
      onUpdate(items);
    },
    (error) => {
      console.error(`Sync error on ${collectionName}:`, error);
      if (onError) onError(error);
    }
  );
}

/**
 * Firestore rejects `undefined` field values outright (throws on write) -
 * unlike the old localStorage+JSON.stringify approach, which silently
 * dropped them. This app builds objects in several places using patterns
 * like `a ?? someOptionalChain?.field`, which can genuinely evaluate to
 * `undefined` (e.g. a quote that's never had any price override yet).
 * Rather than audit every call site (and every future one), every write
 * goes through this first: undefined becomes null recursively, everywhere.
 */
function sanitizeForFirestore(value) {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(sanitizeForFirestore);
  if (value !== null && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(key => {
      out[key] = sanitizeForFirestore(value[key]);
    });
    return out;
  }
  return value;
}

/**
 * Saves (creates or overwrites) one document, using item.id as the document
 * ID. Safe to call while offline - it writes to the local cache immediately
 * and queues the actual network write for when connectivity returns.
 */
export async function saveDocument(uid, collectionName, item) {
  if (!item || !item.id) throw new Error('saveDocument requires an item with an id');
  const docRef = doc(db, 'users', uid, collectionName, item.id);
  await setDoc(docRef, sanitizeForFirestore(item));
}

/**
 * Deletes one document by id. Also safe to call offline (queues like above).
 */
export async function deleteDocument(uid, collectionName, itemId) {
  const docRef = doc(db, 'users', uid, collectionName, itemId);
  await deleteDoc(docRef);
}
