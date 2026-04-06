import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { firebaseAuth, firestoreDb } from '../config/firebase';

export type AdminSession = {
  uid: string;
  email: string;
  displayName: string;
  photoUrl: string;
  providerId: string;
};

function mapUser(user: User): AdminSession {
  if (!user.email) {
    throw new Error('Authentication did not return a valid email address.');
  }

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName ?? '',
    photoUrl: user.photoURL ?? '',
    providerId: user.providerData[0]?.providerId ?? 'password',
  };
}

export async function ensureAdminUserProfile(session: AdminSession) {
  if (!firestoreDb) {
    return;
  }

  const userRef = doc(firestoreDb, 'users', session.uid);
  const existingProfile = await getDoc(userRef);

  if (existingProfile.exists()) {
    return;
  }

  await setDoc(
    userRef,
    {
      uid: session.uid,
      email: session.email.trim().toLowerCase(),
      displayName: session.displayName || null,
      photoUrl: session.photoUrl || null,
      approvalStatus: 'pending',
      roleFlags: {},
      churchAccess: {},
      teamAccess: {},
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function onAdminAuthChanged(callback: (session: AdminSession | null) => void) {
  if (!firebaseAuth) {
    callback(null);
    return () => undefined;
  }

  return onAuthStateChanged(firebaseAuth, (user) => {
    callback(user ? mapUser(user) : null);
  });
}

export async function signInAdminWithGoogle() {
  if (!firebaseAuth) {
    throw new Error('Firebase is not configured for the admin dashboard.');
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(firebaseAuth, provider);
  const session = mapUser(result.user);
  await ensureAdminUserProfile(session);
  return session;
}

export async function signInAdminWithEmail(email: string, password: string) {
  if (!firebaseAuth) {
    throw new Error('Firebase is not configured for the admin dashboard.');
  }

  try {
    await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
  } catch (error) {
    if (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && error.code === 'auth/invalid-credential'
    ) {
      await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
    } else {
      throw error;
    }
  }

  if (!firebaseAuth.currentUser) {
    throw new Error('Authentication did not return a user.');
  }

  const session = mapUser(firebaseAuth.currentUser);
  await ensureAdminUserProfile(session);
  return session;
}

export async function signOutAdmin() {
  if (!firebaseAuth) {
    return;
  }

  await signOut(firebaseAuth);
}
