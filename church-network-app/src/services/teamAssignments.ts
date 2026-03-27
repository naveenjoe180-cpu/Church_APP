import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where, type FirestoreError, type Timestamp } from 'firebase/firestore';

import { firestoreDb } from '../config/firebase';
import { mockAssignments, type MemberAssignment } from '../data/churchUpdates';

export type { MemberAssignment } from '../data/churchUpdates';

function normalizeString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function normalizeDate(value: Timestamp | string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  if (typeof value === 'string') {
    return value;
  }

  return value.toDate().toISOString().slice(0, 10);
}

function normalizeError(error: FirestoreError | Error | unknown, fallback: string) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(fallback);
}

function mapAssignment(id: string, rawValue: Record<string, unknown>): MemberAssignment {
  return {
    id,
    churchId: normalizeString(rawValue.churchId),
    teamName: normalizeString(rawValue.teamName, normalizeString(rawValue.teamId, 'Service Team')),
    roleName: normalizeString(rawValue.roleName, 'Service role'),
    serviceDate: normalizeDate(
      (rawValue.serviceDate as Timestamp | string | null | undefined)
      ?? (rawValue.scheduledFor as Timestamp | string | null | undefined),
      new Date().toISOString().slice(0, 10),
    ),
    assignedTo: normalizeString(rawValue.assignedTo, 'Assigned member'),
    assignedUserId: normalizeString(rawValue.assignedUserId) || undefined,
    responseStatus:
      rawValue.responseStatus === 'accepted' || rawValue.responseStatus === 'declined' || rawValue.responseStatus === 'pending'
        ? rawValue.responseStatus
        : 'pending',
  };
}

function buildAssignmentGroupKey(assignment: MemberAssignment) {
  return [
    assignment.churchId,
    assignment.serviceDate,
    assignment.teamName.trim().toLowerCase(),
    assignment.roleName.trim().toLowerCase(),
    assignment.assignedUserId ?? assignment.assignedTo.trim().toLowerCase(),
  ].join('::');
}

function getStatusPriority(status: MemberAssignment['responseStatus']) {
  switch (status) {
    case 'accepted':
      return 3;
    case 'declined':
      return 2;
    case 'pending':
    default:
      return 1;
  }
}

function dedupeAssignments(assignments: MemberAssignment[]) {
  const groupedAssignments = new Map<string, MemberAssignment[]>();

  assignments.forEach((assignment) => {
    const groupKey = buildAssignmentGroupKey(assignment);
    groupedAssignments.set(groupKey, [...(groupedAssignments.get(groupKey) ?? []), assignment]);
  });

  return Array.from(groupedAssignments.values())
    .map((group) => {
      const representative = [...group].sort((left, right) => {
        const statusDifference = getStatusPriority(right.responseStatus) - getStatusPriority(left.responseStatus);
        if (statusDifference !== 0) {
          return statusDifference;
        }

        return left.id.localeCompare(right.id);
      })[0];

      return {
        ...representative,
        duplicateAssignmentIds: group.map((assignment) => assignment.id),
      };
    })
    .sort((left, right) => left.serviceDate.localeCompare(right.serviceDate) || left.roleName.localeCompare(right.roleName));
}

export function subscribeToMemberAssignments(
  uid: string,
  churchId: string,
  onData: (assignments: MemberAssignment[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firestoreDb) {
    onData(dedupeAssignments(mockAssignments.filter((assignment) => assignment.churchId === churchId)));
    return () => undefined;
  }

  const assignmentsQuery = query(
    collection(firestoreDb, 'scheduleAssignments'),
    where('assignedUserId', '==', uid),
    where('churchId', '==', churchId),
  );

  return onSnapshot(
    assignmentsQuery,
    (snapshot) => {
      const assignments = dedupeAssignments(
        snapshot.docs.map((item) => mapAssignment(item.id, item.data() as Record<string, unknown>)),
      );
      onData(assignments);
    },
    (error) => {
      onError?.(normalizeError(error, 'Unable to load your team assignments.'));
    },
  );
}

export async function updateMemberAssignmentResponse(
  assignmentIds: string[],
  responseStatus: 'accepted' | 'declined',
) {
  if (!firestoreDb) {
    return;
  }

  const db = firestoreDb;

  await Promise.all(
    assignmentIds.map((assignmentId) =>
      updateDoc(doc(db, 'scheduleAssignments', assignmentId), {
        responseStatus,
        respondedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })),
  );
}
