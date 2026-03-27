import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfigKeys = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
] as const;

type FirebaseConfigKey = (typeof firebaseConfigKeys)[number];

export const firebaseConfig: Record<FirebaseConfigKey, string> = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
};

export const firebaseConfigStatus = firebaseConfigKeys.map((key) => ({
  key,
  configured: Boolean(firebaseConfig[key]),
}));

export const isFirebaseConfigured = firebaseConfigStatus.every((item) => item.configured);

let firebaseAppInstance: FirebaseApp | null = null;
let firebaseAuthInstance: Auth | null = null;
let firestoreInstance: Firestore | null = null;

if (isFirebaseConfigured) {
  firebaseAppInstance = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  firebaseAuthInstance = getAuth(firebaseAppInstance);
  firestoreInstance = getFirestore(firebaseAppInstance);
}

export const firebaseApp = firebaseAppInstance;
export const firebaseAuth = firebaseAuthInstance;
export const firestoreDb = firestoreInstance;
