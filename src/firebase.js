import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
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
// step anywhere in the app. persistentMultipleTabManager means it also
// behaves correctly if this business ever has the app open in more than one
// browser tab on the same device at once.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export const auth = getAuth(app);

export default app;
