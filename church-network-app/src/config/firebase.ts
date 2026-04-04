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
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

export const firebaseConfigStatus = firebaseConfigKeys.map((key) => ({
  key,
  configured: Boolean(firebaseConfig[key]),
}));

export const isFirebaseConfigured = firebaseConfigStatus.every((item) => item.configured);

export const notificationConfig = {
  webVapidKey: process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY ?? '',
  expoProjectId: process.env.EXPO_PUBLIC_EXPO_PROJECT_ID ?? '',
};

export const googleAuthConfig = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '',
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
};

export const firebaseNextSteps = [
  'Deploy the Cloud Functions notification worker and grant it access to Firebase Messaging.',
  'Add the Expo project ID so mobile devices can register for push notifications.',
  'Connect document and file flows to the planned Google Shared Drive experience.',
];

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
