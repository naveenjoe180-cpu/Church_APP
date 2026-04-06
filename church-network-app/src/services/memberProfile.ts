import { doc, onSnapshot, type FirestoreError } from 'firebase/firestore';

import { firestoreDb } from '../config/firebase';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type PhoneVerificationStatus = 'missing' | 'pending' | 'verified';

export type MemberProfile = {
  uid: string;
  email: string;
  displayName: string;
  approvalStatus: ApprovalStatus;
  rejectionReason: string;
  primaryChurchId: string;
  pendingChurchId: string;
  phoneNumber: string;
  phoneVerificationStatus: PhoneVerificationStatus;
  phoneVerifiedAt: string;
  roleKey: 'networkSuperAdmin' | 'churchAdmin' | 'pastor' | 'teamLeader' | 'volunteer' | 'member';
  teamNames: string[];
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

function normalizePhoneVerificationStatus(value: unknown): PhoneVerificationStatus {
  if (value === 'verified' || value === 'pending' || value === 'missing') {
    return value;
  }

  return 'missing';
}

function normalizeTeamNames(value: unknown) {
  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value as Record<string, unknown>)
    .filter(([, enabled]) => enabled === true)
    .map(([teamName]) => teamName)
    .sort((left, right) => left.localeCompare(right));
}

function getRoleKey(roleFlags: Record<string, boolean>, teamNames: string[]) {
  if (roleFlags.networkSuperAdmin) return 'networkSuperAdmin' as const;
  if (roleFlags.churchAdmin) return 'churchAdmin' as const;
  if (roleFlags.pastor) return 'pastor' as const;
  if (roleFlags.teamLeader) return 'teamLeader' as const;
  if (teamNames.length > 0 || roleFlags.volunteer) return 'volunteer' as const;
  return 'member' as const;
}

function normalizeTimestamp(value: unknown) {
  if (!value || typeof value !== 'object' || !('toDate' in value) || typeof value.toDate !== 'function') {
    return '';
  }

  const date = value.toDate();
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : '';
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

  return new Error('Your member profile could not be loaded right now. Check your internet connection and try signing in again.');
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
      const roleFlags = normalizeRoleFlags(rawValue.roleFlags);
      const teamNames = normalizeTeamNames(rawValue.teamAccess);
      onData({
        uid,
        email: normalizeString(rawValue.email),
        displayName: normalizeString(rawValue.displayName),
        approvalStatus:
          rawValue.approvalStatus === 'approved' || rawValue.approvalStatus === 'rejected' || rawValue.approvalStatus === 'pending'
            ? rawValue.approvalStatus
            : 'pending',
        rejectionReason: normalizeString(rawValue.rejectionReason),
        primaryChurchId: normalizeString(rawValue.primaryChurchId),
        pendingChurchId: normalizeString(rawValue.pendingChurchId),
        phoneNumber: normalizeString(rawValue.phoneNumber),
        phoneVerificationStatus: normalizePhoneVerificationStatus(rawValue.phoneVerificationStatus),
        phoneVerifiedAt: normalizeTimestamp(rawValue.phoneVerifiedAt),
        roleKey: getRoleKey(roleFlags, teamNames),
        teamNames,
        roleFlags,
      });
    },
    (error) => {
      onError?.(normalizeError(error, 'Unable to load the member approval status.'));
    },
  );
}
