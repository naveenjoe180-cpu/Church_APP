import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { firestoreDb } from '../config/firebase';
import type { AuthSession } from './auth';

export type SignInMethod = 'google';

export type AccessRequestPayload = {
  displayName: string;
  phoneNumber: string;
  requestedChurchId: string;
  note: string;
  signInMethod: SignInMethod;
};

function normalizeWriteError(error: unknown) {
  if (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'permission-denied'
  ) {
    return new Error(
      'Firestore blocked the signup request. In the Firebase Console for bethelconnect-user, publish the Firestore rules from firebase/firestore.rules, then sign out and try the request again.',
    );
  }

  return error instanceof Error ? error : new Error('Unable to create the access request.');
}

export async function createAccessRequest(authSession: AuthSession, payload: AccessRequestPayload) {
  if (!firestoreDb) {
    throw new Error('Firebase is not configured for the member app.');
  }

  try {
    await setDoc(
      doc(firestoreDb, 'users', authSession.uid),
      {
        uid: authSession.uid,
        email: authSession.email.trim().toLowerCase(),
        displayName: payload.displayName.trim(),
        photoUrl: authSession.photoUrl || null,
        phoneNumber: payload.phoneNumber.trim() || null,
        phoneVerificationStatus: payload.phoneNumber.trim() ? 'pending' : 'missing',
        phoneVerifiedAt: null,
        primaryChurchId: payload.requestedChurchId,
        approvalStatus: 'pending',
        pendingChurchId: payload.requestedChurchId,
        roleFlags: {
          member: true,
        },
        churchAccess: {},
        teamAccess: {},
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );

    const accessRequestRef = await addDoc(collection(firestoreDb, 'accessRequests'), {
      uid: authSession.uid,
      fullName: payload.displayName.trim(),
      email: authSession.email.trim().toLowerCase(),
      phoneNumber: payload.phoneNumber.trim() || null,
      churchId: payload.requestedChurchId,
      requestedChurchId: payload.requestedChurchId,
      requestedRoles: ['member'],
      note: payload.note.trim(),
      signInMethod: payload.signInMethod,
      source: 'memberApp',
      status: 'pending',
      requestedAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return accessRequestRef.id;
  } catch (error) {
    throw normalizeWriteError(error);
  }
}
