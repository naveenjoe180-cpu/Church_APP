import { doc, onSnapshot, type FirestoreError } from 'firebase/firestore';

import { firestoreDb } from '../config/firebase';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type MemberProfile = {
  uid: string;
  email: string;
  displayName: string;
  approvalStatus: ApprovalStatus;
  primaryChurchId: string;
  pendingChurchId: string;
  roleFlags: Record<string, boolean>;
};

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function normalizeRoleFlags(value: unknown) {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, boolean>>((flags, [key, flagValue]) => {
    if (flagValue === true) {
      flags[key] = true;
    }
    return flags;
  }, {});
}

function normalizeError(error: FirestoreError | Error | unknown, fallback: string) {
  if (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'permission-denied'
  ) {
    return new Error(
      'Firestore blocked the member profile lookup right after sign-in. Publish the latest rules from firebase/firestore.rules, then sign out and try again.',
    );
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(fallback);
}

export function subscribeToMemberProfile(
  uid: string,
  onData: (profile: MemberProfile | null) => void,
  onError?: (error: Error) => void,
) {
  if (!firestoreDb) {
    onData(null);
    return () => undefined;
  }

  return onSnapshot(
    doc(firestoreDb, 'users', uid),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }

      const rawValue = snapshot.data() as Record<string, unknown>;
      onData({
        uid,
        email: normalizeString(rawValue.email),
        displayName: normalizeString(rawValue.displayName),
        approvalStatus:
          rawValue.approvalStatus === 'approved' || rawValue.approvalStatus === 'rejected' || rawValue.approvalStatus === 'pending'
            ? rawValue.approvalStatus
            : 'pending',
        primaryChurchId: normalizeString(rawValue.primaryChurchId),
        pendingChurchId: normalizeString(rawValue.pendingChurchId),
        roleFlags: normalizeRoleFlags(rawValue.roleFlags),
      });
    },
    (error) => {
      onError?.(normalizeError(error, 'Unable to load the member approval status.'));
    },
  );
}
