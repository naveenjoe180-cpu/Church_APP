import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { Platform } from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { firebaseAuth } from '../config/firebase';
import { googleAuthConfig } from '../config/firebase';

export type AuthSession = {
  uid: string;
  email: string;
  displayName: string;
  photoUrl: string;
  providerId: string;
};

function mapUser(user: User): AuthSession {
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

function mapCurrentUser() {
  if (!firebaseAuth?.currentUser) {
    throw new Error('Authentication did not return a valid session.');
  }

  return mapUser(firebaseAuth.currentUser);
}

export function onMemberAuthChanged(callback: (session: AuthSession | null) => void) {
  if (!firebaseAuth) {
    callback(null);
    return () => undefined;
  }

  return onAuthStateChanged(firebaseAuth, (user) => {
    callback(user?.email ? mapUser(user) : null);
  });
}

export async function signInWithGoogle() {
  if (!firebaseAuth) {
    throw new Error('Firebase is not configured for the member app.');
  }

  if (Platform.OS !== 'web') {
    GoogleSignin.configure({
      webClientId: googleAuthConfig.webClientId || undefined,
    });

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const nativeResponse = await GoogleSignin.signIn();

    if (nativeResponse.type !== 'success') {
      throw new Error('Google sign-in was cancelled before it completed.');
    }

    const idToken = nativeResponse.data.idToken ?? (await GoogleSignin.getTokens()).idToken;
    if (!idToken) {
      throw new Error('Google sign-in did not return a valid ID token.');
    }

    const credential = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(firebaseAuth, credential);
    return mapCurrentUser();
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (typeof signInWithPopup !== 'function') {
    throw new Error('Native Google sign-in is not configured in this build yet.');
  }

  await signInWithPopup(firebaseAuth, provider);
  return mapCurrentUser();
}

export async function signInWithGoogleCredential(idToken: string, accessToken?: string) {
  if (!firebaseAuth) {
    throw new Error('Firebase is not configured for the member app.');
  }

  if (!idToken) {
    throw new Error('Google sign-in did not return a valid ID token.');
  }

  const credential = GoogleAuthProvider.credential(idToken, accessToken);
  await signInWithCredential(firebaseAuth, credential);
  return mapCurrentUser();
}

export async function updateMemberDisplayName(displayName: string) {
  if (!firebaseAuth?.currentUser) {
    return;
  }

  const trimmedName = displayName.trim();
  if (!trimmedName || firebaseAuth.currentUser.displayName === trimmedName) {
    return;
  }

  await updateProfile(firebaseAuth.currentUser, {
    displayName: trimmedName,
  });
}

export async function signOutMember() {
  if (!firebaseAuth) {
    return;
  }

  if (Platform.OS !== 'web') {
    try {
      await GoogleSignin.signOut();
    } catch {
      // Keep Firebase sign-out resilient even if native Google session has already expired.
    }
  }

  await signOut(firebaseAuth);
}
