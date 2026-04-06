import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

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
    const userRef = doc(firestoreDb, 'users', authSession.uid);
    const existingUserSnapshot = await getDoc(userRef);
    const existingApprovalStatus = existingUserSnapshot.exists()
      ? (existingUserSnapshot.data() as Record<string, unknown>).approvalStatus
      : null;

    if (existingApprovalStatus === 'pending') {
      throw new Error('Your request is already pending. You can submit again only after a church admin rejects the current request.');
    }

    if (existingApprovalStatus === 'approved') {
      throw new Error('Your member access is already approved. You do not need to submit another request.');
    }

    const normalizedEmail = authSession.email.trim().toLowerCase();
    const normalizedDisplayName = payload.displayName.trim();
    const normalizedPhoneNumber = payload.phoneNumber.trim() || null;
    const normalizedPhotoUrl = authSession.photoUrl || null;

    if (!existingUserSnapshot.exists()) {
      await setDoc(
        userRef,
        {
          uid: authSession.uid,
          email: normalizedEmail,
          displayName: normalizedDisplayName,
          photoUrl: normalizedPhotoUrl,
          phoneNumber: normalizedPhoneNumber,
          phoneVerificationStatus: normalizedPhoneNumber ? 'pending' : 'missing',
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
    } else {
      await setDoc(
        userRef,
        {
          uid: authSession.uid,
          email: normalizedEmail,
          displayName: normalizedDisplayName,
          photoUrl: normalizedPhotoUrl,
          phoneNumber: normalizedPhoneNumber,
          primaryChurchId: payload.requestedChurchId,
          pendingChurchId: payload.requestedChurchId,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }

    const accessRequestRef = await addDoc(collection(firestoreDb, 'accessRequests'), {
      uid: authSession.uid,
      fullName: normalizedDisplayName,
      email: normalizedEmail,
      phoneNumber: normalizedPhoneNumber,
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
