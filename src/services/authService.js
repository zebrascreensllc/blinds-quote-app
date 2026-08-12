import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { auth } from '../firebase';

export function signUp(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function logIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function logOut() {
  return signOut(auth);
}

/**
 * Fires immediately with the current signed-in user (or null), then again
 * any time auth state changes. Firebase persists the session locally, so
 * once signed in, staying signed in works offline indefinitely - only the
 * very first sign-in on a new device needs connectivity.
 * Returns an unsubscribe function.
 */
export function subscribeToAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}
