import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyCoE2Ara5zGb41QsmtDQxJ8z6bwQAtWhdg',
  authDomain: 'zebra-screens-app-4efa3.firebaseapp.com',
  projectId: 'zebra-screens-app-4efa3',
  storageBucket: 'zebra-screens-app-4efa3.firebasestorage.app',
  messagingSenderId: '814073488450',
  appId: '1:814073488450:web:09e7d01a61b865f528b9db'
};

const app = initializeApp(firebaseConfig);

// ✅ Offline persistence: caches every quote/sheet locally, so the app can
// read AND write with zero signal. Writes are queued in this local cache and
// automatically pushed the moment connectivity returns - no manual "sync"
// step anywhere in the app.
// ✅ FIX: this used to use persistentMultipleTabManager. This app's actual
// usage pattern is one person on one iPhone (occasionally a laptop, never
// both at once) - multi-tab support was speculative, never a confirmed real
// need. It has a real cost on mobile Safari/PWA: multi-tab persistence
// requires acquiring a cross-tab lock via IndexedDB, and iOS aggressively
// suspends/evicts backgrounded tabs without running their cleanup code, so a
// previous session can leave a stale lock that a new tab has to wait out
// before its own listeners fire anything at all - a real report of
// Supplier Measurements' "Loading your measurement sheets..." intermittently
// taking 1-2 minutes matches this exact known failure mode, on the very
// device/usage pattern (iPhone, reopened often, weak signal) most likely to
// hit it. persistentSingleTabManager removes the cross-tab lock entirely; if
// this device ever DOES end up with two tabs open at once, the second one
// simply falls back to memory-only cache for that tab (no offline
// persistence there) instead of hanging - a far better failure mode than a
// multi-minute stall on the common case.
// ✅ Two independent layers of defense against Firestore's hard rejection of
// literal `undefined` values (the root cause of the migration failure this
// business hit): every write already gets explicitly sanitized in
// firestoreCollectionSync.js, and ignoreUndefinedProperties here is a second,
// independent safety net in case any future write path is ever added that
// bypasses that sanitization.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({ forceOwnership: false }) }),
  ignoreUndefinedProperties: true
});

export const auth = getAuth(app);

export default app;
