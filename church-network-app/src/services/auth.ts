import {
  GoogleAuthProvider,
  PhoneAuthProvider,
  RecaptchaVerifier,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePhoneNumber,
  updateProfile,
  type User,
} from 'firebase/auth';
import { Platform } from 'react-native';

import { firebaseAuth } from '../config/firebase';

export type AuthSession = {
  uid: string;
  email: string;
  displayName: string;
  photoUrl: string;
  providerId: string;
};

let phoneRecaptchaVerifier: RecaptchaVerifier | null = null;

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
    throw new Error('Google sign-in is currently enabled for the web prototype first.');
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(firebaseAuth, provider);
  return mapCurrentUser();
}

export async function createEmailAccount(email: string, password: string) {
  if (!firebaseAuth) {
    throw new Error('Firebase is not configured for the member app.');
  }

  try {
    await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
  } catch (error) {
    if (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && error.code === 'auth/email-already-in-use'
    ) {
      await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
    } else {
      throw error;
    }
  }

  return mapCurrentUser();
}

export async function signInEmailAccount(email: string, password: string) {
  if (!firebaseAuth) {
    throw new Error('Firebase is not configured for the member app.');
  }

  await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
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

  await signOut(firebaseAuth);
}

function requirePhoneVerificationSupport() {
  if (!firebaseAuth) {
    throw new Error('Firebase is not configured for the member app.');
  }

  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    throw new Error('Phone verification is currently enabled in the web member app first.');
  }
}

function createPhoneRecaptcha(containerId: string) {
  requirePhoneVerificationSupport();

  if (!containerId.trim()) {
    throw new Error('Phone verification could not start because the reCAPTCHA container is missing.');
  }

  if (phoneRecaptchaVerifier) {
    try {
      phoneRecaptchaVerifier.clear();
    } catch {
      // Ignore stale reCAPTCHA instances before creating a fresh one.
    }
  }

  phoneRecaptchaVerifier = new RecaptchaVerifier(firebaseAuth!, containerId, {
    size: 'invisible',
  });

  return phoneRecaptchaVerifier;
}

export async function sendMemberPhoneVerificationCode(phoneNumber: string, containerId: string) {
  requirePhoneVerificationSupport();

  if (!phoneNumber.trim()) {
    throw new Error('Add your phone number before requesting the verification code.');
  }

  const provider = new PhoneAuthProvider(firebaseAuth!);
  const recaptchaVerifier = createPhoneRecaptcha(containerId);
  return provider.verifyPhoneNumber(phoneNumber.trim(), recaptchaVerifier);
}

export async function confirmMemberPhoneVerificationCode(verificationId: string, verificationCode: string) {
  requirePhoneVerificationSupport();

  if (!firebaseAuth?.currentUser) {
    throw new Error('Sign in again before confirming the verification code.');
  }

  if (!verificationId.trim() || !verificationCode.trim()) {
    throw new Error('Enter the code that was sent to your phone.');
  }

  const credential = PhoneAuthProvider.credential(verificationId.trim(), verificationCode.trim());
  await updatePhoneNumber(firebaseAuth.currentUser, credential);
}

export function clearMemberPhoneVerificationChallenge() {
  if (!phoneRecaptchaVerifier) {
    return;
  }

  try {
    phoneRecaptchaVerifier.clear();
  } catch {
    // Ignore cleanup failures for already-destroyed reCAPTCHA widgets.
  }

  phoneRecaptchaVerifier = null;
}
