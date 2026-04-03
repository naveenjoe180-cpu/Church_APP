import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, where, type FirestoreError, type Timestamp } from 'firebase/firestore';

import { firestoreDb } from '../config/firebase';
import { mockPrayerRequests, type ChurchPrayerRequest } from '../data/churchUpdates';
import type { AuthSession } from './auth';

export type { ChurchPrayerRequest } from '../data/churchUpdates';

function buildPrayerResponseId(prayerRequestId: string, uid: string) {
  return `${prayerRequestId}_${uid}`;
}

function normalizeString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function normalizeBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeTimestamp(value: Timestamp | string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  if (typeof value === 'string') {
    return value;
  }

  return value.toDate().toISOString();
}

function normalizeError(error: FirestoreError | Error | unknown, fallback: string) {
  if (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'permission-denied'
  ) {
    return new Error(
      'Firestore blocked the prayer request action. Publish the latest Firestore rules from firebase/firestore.rules, then sign in again and retry.',
    );
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(fallback);
}

function mapPrayerRequest(id: string, rawValue: Record<string, unknown>): ChurchPrayerRequest {
  return {
    id,
    churchId: normalizeString(rawValue.churchId),
    content: normalizeString(rawValue.content, normalizeString(rawValue.preview, 'Prayer request pending review.')),
    submittedAt: normalizeTimestamp((rawValue.createdAt as Timestamp | string | null | undefined) ?? (rawValue.submittedAt as Timestamp | string | null | undefined), new Date().toISOString()),
    submittedByLabel: normalizeString(rawValue.submittedByLabel, 'Church member'),
    isAnonymous: normalizeBoolean(rawValue.isAnonymous),
    status:
      rawValue.status === 'approved' || rawValue.status === 'hidden' || rawValue.status === 'pending'
        ? rawValue.status
        : 'pending',
  };
}

export function subscribeToChurchPrayerWall(
  churchId: string,
  onData: (requests: ChurchPrayerRequest[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firestoreDb) {
    onData(
      mockPrayerRequests
        .filter((item) => item.churchId === churchId && item.status === 'approved')
        .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt)),
    );
    return () => undefined;
  }

  const prayerQuery = query(
    collection(firestoreDb, 'prayerRequests'),
    where('churchId', '==', churchId),
    where('status', '==', 'approved'),
    orderBy('createdAt', 'desc'),
  );

  return onSnapshot(
    prayerQuery,
    (snapshot) => {
      onData(snapshot.docs.map((item) => mapPrayerRequest(item.id, item.data() as Record<string, unknown>)));
    },
    (error) => {
      onError?.(normalizeError(error, 'Unable to load the prayer wall.'));
    },
  );
}

export function subscribeToMemberPrayerRequests(
  uid: string,
  churchId: string,
  onData: (requests: ChurchPrayerRequest[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firestoreDb) {
    onData(
      mockPrayerRequests
        .filter((item) => item.churchId === churchId)
        .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt)),
    );
    return () => undefined;
  }

  const prayerQuery = query(
    collection(firestoreDb, 'prayerRequests'),
    where('submittedByUid', '==', uid),
  );

  return onSnapshot(
    prayerQuery,
    (snapshot) => {
      const requests = snapshot.docs
        .map((item) => mapPrayerRequest(item.id, item.data() as Record<string, unknown>))
        .filter((item) => item.churchId === churchId)
        .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
      onData(requests);
    },
    (error) => {
      onError?.(normalizeError(error, 'Unable to load your prayer requests.'));
    },
  );
}

export function subscribeToMemberPrayedPrayerRequests(
  uid: string,
  churchId: string,
  onData: (requestIds: string[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firestoreDb) {
    onData([]);
    return () => undefined;
  }

  const responseQuery = query(
    collection(firestoreDb, 'prayerResponses'),
    where('userId', '==', uid),
    where('churchId', '==', churchId),
    where('status', '==', 'prayed'),
  );

  return onSnapshot(
    responseQuery,
    (snapshot) => {
      onData(
        snapshot.docs
          .map((item) => normalizeString((item.data() as Record<string, unknown>).prayerRequestId))
          .filter(Boolean),
      );
    },
    (error) => {
      onError?.(normalizeError(error, 'Unable to load your prayer activity right now.'));
    },
  );
}

export async function submitPrayerRequest(
  authSession: AuthSession,
  payload: {
    churchId: string;
    content: string;
    isAnonymous: boolean;
    submittedByLabel?: string;
  },
) {
  if (!firestoreDb) {
    throw new Error('Firebase is not configured for the member app.');
  }

  const normalizedContent = payload.content.trim();
  if (!normalizedContent) {
    throw new Error('Write the prayer request before sending it.');
  }

  try {
    await addDoc(collection(firestoreDb, 'prayerRequests'), {
      churchId: payload.churchId,
      content: normalizedContent,
      preview: normalizedContent.slice(0, 180),
      isAnonymous: payload.isAnonymous,
      submittedByUid: authSession.uid,
      submittedByEmail: authSession.email.trim().toLowerCase(),
      submittedByLabel: payload.isAnonymous ? 'Anonymous' : (payload.submittedByLabel?.trim() || authSession.displayName || authSession.email.split('@')[0]),
      status: 'pending',
      source: 'memberApp',
      submittedAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw normalizeError(error, 'Unable to send the prayer request.');
  }
}

export async function deletePrayerRequest(requestId: string) {
  if (!firestoreDb) {
    throw new Error('Firebase is not configured for the member app.');
  }

  try {
    await deleteDoc(doc(firestoreDb, 'prayerRequests', requestId));
  } catch (error) {
    throw normalizeError(error, 'Unable to remove the prayer request.');
  }
}

export async function markPrayerRequestPrayed(
  authSession: AuthSession,
  payload: {
    prayerRequestId: string;
    churchId: string;
  },
) {
  if (!firestoreDb) {
    throw new Error('Firebase is not configured for the member app.');
  }

  try {
    await setDoc(
      doc(firestoreDb, 'prayerResponses', buildPrayerResponseId(payload.prayerRequestId, authSession.uid)),
      {
        prayerRequestId: payload.prayerRequestId,
        churchId: payload.churchId,
        userId: authSession.uid,
        status: 'prayed',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    throw normalizeError(error, 'Unable to save your prayer response.');
  }
}
