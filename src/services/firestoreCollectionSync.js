import { collection, doc, setDoc, deleteDoc, onSnapshot, query } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Subscribes to real-time updates for every document in
 * users/{uid}/{collectionName}. onUpdate fires immediately with whatever's
 * already cached (works offline), then again every time anything changes -
 * on THIS device or any other device signed into the same account. This one
 * listener is the entire mechanism behind "auto sync across devices."
 *
 * onUpdate receives (items, pendingWriteIds) - pendingWriteIds is a Set of
 * item.id values whose write hasn't been acknowledged by Firestore's
 * servers yet (still sitting in the local offline cache, e.g. no signal).
 * Existing callers that only use the first argument are unaffected.
 * `includeMetadataChanges: true` is what makes the callback fire AGAIN
 * purely when a write flips from pending to acknowledged (the data itself
 * doesn't change) - without it, a "pending" status could get stuck showing
 * forever even after the write actually reached the server.
 *
 * Returns an unsubscribe function - call it when the component using this
 * unmounts, so the listener doesn't keep running after it's no longer needed.
 */
export function subscribeToCollection(uid, collectionName, onUpdate, onError) {
  const colRef = collection(db, 'users', uid, collectionName);
  const q = query(colRef);
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      const items = snapshot.docs.map(d => d.data());
      const pendingWriteIds = new Set(
        snapshot.docs.filter(d => d.metadata.hasPendingWrites).map(d => d.id)
      );
      onUpdate(items, pendingWriteIds);
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

// How long a save/delete waits for the server to confirm before it counts as
// "saved on this phone, uploading when there's signal". Firestore applies the
// write to the offline cache straight away (the real-time listener shows it
// within milliseconds), but the promise from setDoc/deleteDoc only settles once
// the SERVER acknowledges it - with no signal that's never, so every
// "Creating..." / "Saving..." button used to spin until signal came back.
// That was the exact on-site, no-signal case this app exists for.
const SERVER_ACK_WAIT_MS = 4000;
const OFFLINE_ACK_WAIT_MS = 800;

// Resolves when the server confirms, OR after a short wait (the write is then
// queued in the offline cache and Firestore uploads it on its own when signal
// returns). Rejects only if Firestore rejects before that wait ends (bad data,
// permission). A rejection that arrives later is logged; the real-time
// listener then drops the item and the sync banner reflects it.
function settleWrite(writePromise, label) {
  return new Promise((resolve, reject) => {
    let done = false;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve({ queued: true });
    }, offline ? OFFLINE_ACK_WAIT_MS : SERVER_ACK_WAIT_MS);
    writePromise.then(
      () => { if (done) return; done = true; clearTimeout(timer); resolve({ queued: false }); },
      (err) => {
        if (done) { console.error(`${label} was rejected after it was queued:`, err); return; }
        done = true; clearTimeout(timer); reject(err);
      }
    );
  });
}

/**
 * Saves (creates or overwrites) one document, using item.id as the document
 * ID. Safe to call while offline - it writes to the local cache immediately
 * and queues the actual network write for when connectivity returns.
 *
 * Resolves to { queued } - queued: true means the server hadn't confirmed yet
 * (no/weak signal) and the write is waiting in the offline cache. Pass
 * { waitForServer: true } only where the caller must know the server has it
 * (the one-time localStorage migration, which then marks local data migrated).
 */
export async function saveDocument(uid, collectionName, item, { waitForServer = false } = {}) {
  if (!item || !item.id) throw new Error('saveDocument requires an item with an id');
  const docRef = doc(db, 'users', uid, collectionName, item.id);
  const write = setDoc(docRef, sanitizeForFirestore(item));
  if (waitForServer) { await write; return { queued: false }; }
  return settleWrite(write, `Save of ${collectionName}/${item.id}`);
}

/**
 * Deletes one document by id. Also safe to call offline (queues like above).
 */
export async function deleteDocument(uid, collectionName, itemId) {
  const docRef = doc(db, 'users', uid, collectionName, itemId);
  return settleWrite(deleteDoc(docRef), `Delete of ${collectionName}/${itemId}`);
}
