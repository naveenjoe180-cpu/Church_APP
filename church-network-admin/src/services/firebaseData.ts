import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  where,
  type FirestoreError,
} from 'firebase/firestore';

import { firestoreDb } from '../config/firebase';
import type { AccessRequest, AuditEntry, Church, ChurchAnnouncement, ChurchEventItem, MemberRecord, PrayerRequest, RoleKey, VolunteerAssignment } from '../types';

function normalizeTimestamp(value: Timestamp | string | null | undefined, fallback = 'Pending timestamp') {
  if (!value) {
    return fallback;
  }

  if (typeof value === 'string') {
    return value;
  }

  return value.toDate().toISOString();
}

function normalizeAccessRequestTimestamp(
  createdAt: Timestamp | string | null | undefined,
  requestedAt: Timestamp | string | null | undefined,
) {
  if (createdAt instanceof Timestamp) {
    return createdAt.toDate().toISOString();
  }

  if (requestedAt) {
    return normalizeTimestamp(requestedAt);
  }

  if (typeof createdAt === 'string' && createdAt.trim()) {
    return createdAt;
  }

  return 'Pending timestamp';
}

function normalizeOptionalTimestamp(value: Timestamp | string | null | undefined) {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  return value.toDate().toISOString();
}

function normalizeDateValue(value: Timestamp | string | null | undefined, fallback = new Date().toISOString().slice(0, 10)) {
  if (!value) {
    return fallback;
  }

  if (typeof value === 'string') {
    return value;
  }

  return value.toDate().toISOString().slice(0, 10);
}

function normalizeRoles(value: unknown): RoleKey[] {
  if (!Array.isArray(value)) {
    return ['member'];
  }

  const validRoles: RoleKey[] = ['networkSuperAdmin', 'churchAdmin', 'pastor', 'teamLeader', 'volunteer', 'member'];
  return value.filter((item): item is RoleKey => typeof item === 'string' && validRoles.includes(item as RoleKey));
}

function normalizeError(error: FirestoreError | Error | unknown, fallback: string) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(fallback);
}

function ensureBethelPrefix(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return trimmedValue;
  }

  return /^bethel\s+/i.test(trimmedValue) ? trimmedValue : `Bethel ${trimmedValue}`;
}

function mapAccessRequest(id: string, rawValue: Record<string, unknown>): AccessRequest {
  return {
    id,
    uid: typeof rawValue.uid === 'string' ? rawValue.uid : undefined,
    fullName: typeof rawValue.fullName === 'string' ? rawValue.fullName : 'Pending member',
    email: typeof rawValue.email === 'string' ? rawValue.email : 'unknown@example.com',
    phoneNumber: typeof rawValue.phoneNumber === 'string' ? rawValue.phoneNumber : undefined,
    churchId:
      typeof rawValue.churchId === 'string'
        ? rawValue.churchId
        : typeof rawValue.requestedChurchId === 'string'
          ? rawValue.requestedChurchId
          : '',
    requestedRoles: ['member'],
    note: typeof rawValue.note === 'string' ? rawValue.note : typeof rawValue.notes === 'string' ? rawValue.notes : '',
    requestedAt: normalizeAccessRequestTimestamp(
      rawValue.createdAt as Timestamp | string | null | undefined,
      rawValue.requestedAt as Timestamp | string | null | undefined,
    ),
    status:
      rawValue.status === 'approved' || rawValue.status === 'rejected' || rawValue.status === 'pending'
        ? rawValue.status
        : 'pending',
  };
}

function mapPrayerRequest(id: string, rawValue: Record<string, unknown>): PrayerRequest {
  return {
    id,
    churchId: typeof rawValue.churchId === 'string' ? rawValue.churchId : '',
    preview:
      typeof rawValue.preview === 'string'
        ? rawValue.preview
        : typeof rawValue.content === 'string'
          ? rawValue.content
          : 'Prayer request pending review.',
    createdAt: normalizeTimestamp((rawValue.createdAt as Timestamp | null | undefined) ?? null),
    status:
      rawValue.status === 'approved' || rawValue.status === 'hidden' || rawValue.status === 'pending'
        ? rawValue.status
        : 'pending',
  };
}

function mapAnnouncement(id: string, rawValue: Record<string, unknown>): ChurchAnnouncement {
  return {
    id,
    churchId:
      typeof rawValue.scopeChurchId === 'string'
        ? rawValue.scopeChurchId
        : typeof rawValue.churchId === 'string'
          ? rawValue.churchId
          : '',
    title: typeof rawValue.title === 'string' ? rawValue.title : 'Church announcement',
    body: typeof rawValue.body === 'string' ? rawValue.body : 'No announcement details were provided.',
    publishedAt: normalizeTimestamp((rawValue.publishedAt as Timestamp | null | undefined) ?? (rawValue.createdAt as Timestamp | null | undefined)),
    visibleUntilAt: normalizeOptionalTimestamp((rawValue.visibleUntilAt as Timestamp | string | null | undefined) ?? null),
    publishedBy: typeof rawValue.publishedBy === 'string' ? rawValue.publishedBy : 'Church office',
    isPublic: rawValue.isPublic === true,
  };
}

function mapChurchEvent(id: string, rawValue: Record<string, unknown>): ChurchEventItem {
  const fallbackStart = normalizeTimestamp((rawValue.createdAt as Timestamp | null | undefined) ?? null);
  const isLegacyCommonEvent = rawValue.isPublic === true || rawValue.scopeType === 'network' || rawValue.churchId === 'network';

  return {
    id,
    churchId:
      isLegacyCommonEvent
        ? 'network'
        : typeof rawValue.churchId === 'string'
          ? rawValue.churchId
          : '',
    scopeType: isLegacyCommonEvent ? 'network' : 'church',
    scopeLabel: typeof rawValue.scopeLabel === 'string' ? rawValue.scopeLabel : undefined,
    title: typeof rawValue.title === 'string' ? rawValue.title : 'Church event',
    description: typeof rawValue.description === 'string' ? rawValue.description : 'Event details will be shared soon.',
    location: typeof rawValue.location === 'string' ? rawValue.location : 'Church location',
    startAt: normalizeTimestamp((rawValue.startAt as Timestamp | string | null | undefined) ?? null, fallbackStart),
    endAt: normalizeTimestamp((rawValue.endAt as Timestamp | string | null | undefined) ?? null, fallbackStart),
    createdBy: typeof rawValue.createdBy === 'string' ? rawValue.createdBy : 'Church admin',
    teamName: typeof rawValue.teamName === 'string' ? rawValue.teamName : undefined,
    posterUrl: typeof rawValue.posterUrl === 'string' ? rawValue.posterUrl : undefined,
    isPublic: rawValue.isPublic === true,
  };
}

function mapVolunteerAssignment(id: string, rawValue: Record<string, unknown>): VolunteerAssignment {
  return {
    id,
    churchId: typeof rawValue.churchId === 'string' ? rawValue.churchId : '',
    teamName:
      typeof rawValue.teamName === 'string'
        ? rawValue.teamName
        : typeof rawValue.teamId === 'string'
          ? rawValue.teamId
          : 'Unassigned team',
    roleName: typeof rawValue.roleName === 'string' ? rawValue.roleName : 'Volunteer slot',
    serviceDate: normalizeDateValue(
      (rawValue.serviceDate as Timestamp | string | null | undefined)
      ?? (rawValue.scheduledFor as Timestamp | string | null | undefined)
      ?? (rawValue.createdAt as Timestamp | null | undefined),
    ),
    assignedTo:
      typeof rawValue.assignedTo === 'string'
        ? rawValue.assignedTo
        : typeof rawValue.assigneeName === 'string'
          ? rawValue.assigneeName
          : 'Unassigned',
    assignedUserId: typeof rawValue.assignedUserId === 'string' ? rawValue.assignedUserId : undefined,
    responseStatus:
      rawValue.responseStatus === 'accepted' || rawValue.responseStatus === 'declined' || rawValue.responseStatus === 'pending'
        ? rawValue.responseStatus
        : 'pending',
  };
}

function mapAuditEntry(id: string, rawValue: Record<string, unknown>): AuditEntry {
  return {
    id,
    churchId: typeof rawValue.churchId === 'string' ? rawValue.churchId : '',
    entityType:
      rawValue.entityType === 'approval'
      || rawValue.entityType === 'member'
      || rawValue.entityType === 'team'
      || rawValue.entityType === 'role'
      || rawValue.entityType === 'planning'
      || rawValue.entityType === 'church'
      || rawValue.entityType === 'archive'
        ? rawValue.entityType
        : 'church',
    actionLabel: typeof rawValue.actionLabel === 'string' ? rawValue.actionLabel : 'Updated',
    targetLabel: typeof rawValue.targetLabel === 'string' ? rawValue.targetLabel : 'Church record',
    summary: typeof rawValue.summary === 'string' ? rawValue.summary : 'No summary captured.',
    actor: typeof rawValue.actor === 'string' ? rawValue.actor : 'Church admin',
    createdAt: normalizeTimestamp((rawValue.createdAt as Timestamp | null | undefined) ?? null),
  };
}

function getStoredRole(roleFlags: Record<string, unknown> | undefined): RoleKey {
  const orderedRoles: RoleKey[] = ['networkSuperAdmin', 'churchAdmin', 'pastor', 'teamLeader', 'volunteer', 'member'];
  return orderedRoles.find((role) => roleFlags?.[role] === true) ?? 'member';
}

function getPrimaryTeam(teamAccess: Record<string, unknown> | undefined) {
  const teamId = Object.entries(teamAccess ?? {}).find(([, enabled]) => enabled === true)?.[0];
  return teamId ?? '';
}

function getEnabledTeams(teamAccess: Record<string, unknown> | undefined) {
  return Object.entries(teamAccess ?? {})
    .filter(([, enabled]) => enabled === true)
    .map(([teamId]) => teamId);
}

function getEffectiveRole(roleFlags: Record<string, unknown> | undefined, teamNames: string[]): RoleKey {
  const storedRole = getStoredRole(roleFlags);
  if (storedRole === 'networkSuperAdmin' || storedRole === 'churchAdmin' || storedRole === 'pastor' || storedRole === 'teamLeader') {
    return storedRole;
  }

  return teamNames.length > 0 ? 'volunteer' : 'member';
}

function mapMember(id: string, rawValue: Record<string, unknown>): MemberRecord {
  const roleFlags = rawValue.roleFlags as Record<string, unknown> | undefined;
  const teamAccess = rawValue.teamAccess as Record<string, unknown> | undefined;
  const displayName =
    typeof rawValue.fullName === 'string'
      ? rawValue.fullName
      : typeof rawValue.displayName === 'string'
        ? rawValue.displayName
        : typeof rawValue.email === 'string'
          ? rawValue.email.split('@')[0]
          : 'Church member';

  const primaryTeamName =
    typeof rawValue.primaryTeamName === 'string'
      ? rawValue.primaryTeamName
      : getPrimaryTeam(teamAccess);
  const enabledTeams = getEnabledTeams(teamAccess);
  const teamNames = enabledTeams.length > 0 ? enabledTeams : (primaryTeamName ? [primaryTeamName] : []);

  return {
    id,
    fullName: displayName,
    email: typeof rawValue.email === 'string' ? rawValue.email : 'unknown@example.com',
    churchId: typeof rawValue.primaryChurchId === 'string' ? rawValue.primaryChurchId : '',
    roleKey: getEffectiveRole(roleFlags, teamNames),
    teamName: primaryTeamName,
    teamNames,
    approvalStatus:
      rawValue.approvalStatus === 'approved' || rawValue.approvalStatus === 'rejected' || rawValue.approvalStatus === 'pending'
        ? rawValue.approvalStatus
        : 'pending',
    phoneNumber: typeof rawValue.phoneNumber === 'string' ? rawValue.phoneNumber : undefined,
    phoneVerificationStatus:
      rawValue.phoneVerificationStatus === 'verified'
      || rawValue.phoneVerificationStatus === 'pending'
      || rawValue.phoneVerificationStatus === 'missing'
        ? rawValue.phoneVerificationStatus
        : 'missing',
  };
}

function buildNestedBooleanFields(prefix: string, values: string[]) {
  return values.reduce<Record<string, boolean>>((fields, value) => {
    fields[`${prefix}.${value}`] = true;
    return fields;
  }, {});
}

function normalizeDateInput(value: string) {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error('Enter a valid date and time before publishing the event.');
  }

  return Timestamp.fromDate(parsedDate);
}

export function subscribeToAccessRequests(
  churchId: string | null,
  onData: (requests: AccessRequest[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firestoreDb) {
    return () => undefined;
  }

  const accessRequestsQuery = churchId
    ? query(collection(firestoreDb, 'accessRequests'), where('requestedChurchId', '==', churchId))
    : query(collection(firestoreDb, 'accessRequests'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    accessRequestsQuery,
    (snapshot) => {
      const requests = snapshot.docs
        .map((item) => mapAccessRequest(item.id, item.data() as Record<string, unknown>))
        .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
      onData(requests);
    },
    (error) => {
      onError?.(normalizeError(error, 'Unable to load access requests from Firestore.'));
    },
  );
}

export function subscribeToPrayerRequests(
  churchId: string | null,
  onData: (requests: PrayerRequest[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firestoreDb) {
    return () => undefined;
  }

  const prayerRequestsQuery = churchId
    ? query(collection(firestoreDb, 'prayerRequests'), where('churchId', '==', churchId))
    : query(collection(firestoreDb, 'prayerRequests'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    prayerRequestsQuery,
    (snapshot) => {
      const requests = snapshot.docs
        .map((item) => mapPrayerRequest(item.id, item.data() as Record<string, unknown>))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      onData(requests);
    },
    (error) => {
      onError?.(normalizeError(error, 'Unable to load prayer requests from Firestore.'));
    },
  );
}

export function subscribeToMembers(
  churchId: string | null,
  onData: (members: MemberRecord[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firestoreDb) {
    return () => undefined;
  }

  const membersQuery = churchId
    ? query(collection(firestoreDb, 'users'), where('primaryChurchId', '==', churchId))
    : collection(firestoreDb, 'users');

  return onSnapshot(
    membersQuery,
    (snapshot) => {
      const members = snapshot.docs
        .map((item) => mapMember(item.id, item.data() as Record<string, unknown>))
        .filter((item) => item.approvalStatus === 'approved' && item.churchId)
        .sort((left, right) => left.fullName.localeCompare(right.fullName));
      onData(members);
    },
    (error) => {
      onError?.(normalizeError(error, 'Unable to load members from Firestore.'));
    },
  );
}

export function subscribeToVolunteerAssignments(
  churchId: string | null,
  teamId: string | null,
  onData: (assignments: VolunteerAssignment[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firestoreDb) {
    return () => undefined;
  }

  const assignmentsQuery = churchId && teamId
    ? query(collection(firestoreDb, 'scheduleAssignments'), where('churchId', '==', churchId), where('teamId', '==', teamId))
    : churchId
      ? query(collection(firestoreDb, 'scheduleAssignments'), where('churchId', '==', churchId))
      : collection(firestoreDb, 'scheduleAssignments');

  return onSnapshot(
    assignmentsQuery,
    (snapshot) => {
      const assignments = snapshot.docs
        .map((item) => mapVolunteerAssignment(item.id, item.data() as Record<string, unknown>))
        .sort((left, right) => left.serviceDate.localeCompare(right.serviceDate) || left.assignedTo.localeCompare(right.assignedTo));
      onData(assignments);
    },
    (error) => {
      onError?.(normalizeError(error, 'Unable to load volunteer planning assignments from Firestore.'));
    },
  );
}

export function subscribeToAnnouncements(
  churchId: string,
  onData: (announcements: ChurchAnnouncement[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firestoreDb) {
    return () => undefined;
  }

  const announcementsQuery = query(
    collection(firestoreDb, 'announcements'),
    where('scopeChurchId', '==', churchId),
  );
  return onSnapshot(
    announcementsQuery,
    (snapshot) => {
      onData(
        snapshot.docs
          .map((item) => mapAnnouncement(item.id, item.data() as Record<string, unknown>))
          .sort((left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime()),
      );
    },
    (error) => {
      onError?.(normalizeError(error, 'Unable to load church announcements from Firestore.'));
    },
  );
}

export function subscribeToEvents(
  churchId: string,
  onData: (events: ChurchEventItem[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firestoreDb) {
    return () => undefined;
  }

  let localEvents: ChurchEventItem[] = [];
  let sharedEvents: ChurchEventItem[] = [];

  const emitCombinedEvents = () => {
    const combinedEvents = [...localEvents, ...sharedEvents]
      .reduce<ChurchEventItem[]>((accumulator, event) => {
        if (accumulator.some((existing) => existing.id === event.id)) {
          return accumulator;
        }

        accumulator.push(event);
        return accumulator;
      }, [])
      .sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime());
    onData(combinedEvents);
  };

  const localEventsQuery = query(collection(firestoreDb, 'events'), where('churchId', '==', churchId));
  const sharedEventsQuery = query(collection(firestoreDb, 'events'), where('scopeType', '==', 'network'));

  const unsubscribeLocal = onSnapshot(
    localEventsQuery,
    (snapshot) => {
      localEvents = snapshot.docs.map((item) => mapChurchEvent(item.id, item.data() as Record<string, unknown>));
      emitCombinedEvents();
    },
    (error) => {
      onError?.(normalizeError(error, 'Unable to load church events from Firestore.'));
    },
  );

  const unsubscribeShared = onSnapshot(
    sharedEventsQuery,
    (snapshot) => {
      sharedEvents = snapshot.docs.map((item) => mapChurchEvent(item.id, item.data() as Record<string, unknown>));
      emitCombinedEvents();
    },
    (error) => {
      sharedEvents = [];
      emitCombinedEvents();
      onError?.(normalizeError(error, 'Unable to load shared network events from Firestore.'));
    },
  );

  return () => {
    unsubscribeLocal();
    unsubscribeShared();
  };
}

export function subscribeToCommonMeetingCancellations(
  churchId: string,
  onData: (keys: string[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firestoreDb) {
    onData([]);
    return () => undefined;
  }

  const cancellationsQuery = query(
    collection(firestoreDb, 'commonMeetingCancellations'),
    where('churchId', '==', churchId),
  );

  return onSnapshot(
    cancellationsQuery,
    (snapshot) => {
      onData(
        snapshot.docs
          .map((item) => {
            const rawValue = item.data() as Record<string, unknown>;
            const meetingKey = typeof rawValue.meetingKey === 'string' ? rawValue.meetingKey : '';
            const occurrenceDate = typeof rawValue.occurrenceDate === 'string' ? rawValue.occurrenceDate : '';
            return meetingKey && occurrenceDate ? `${meetingKey}:${occurrenceDate}` : '';
          })
          .filter(Boolean),
      );
    },
    (error) => {
      onError?.(normalizeError(error, 'Unable to load common meeting changes from Firestore.'));
    },
  );
}

export function subscribeToChurchSpecificMeetingCancellations(
  churchId: string,
  onData: (keys: string[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firestoreDb) {
    onData([]);
    return () => undefined;
  }

  const cancellationsQuery = query(
    collection(firestoreDb, 'churchSpecificMeetingCancellations'),
    where('churchId', '==', churchId),
  );

  return onSnapshot(
    cancellationsQuery,
    (snapshot) => {
      onData(
        snapshot.docs
          .map((item) => {
            const rawValue = item.data() as Record<string, unknown>;
            const meetingKey = typeof rawValue.meetingKey === 'string' ? rawValue.meetingKey : '';
            const occurrenceDate = typeof rawValue.occurrenceDate === 'string' ? rawValue.occurrenceDate : '';
            return meetingKey && occurrenceDate ? `${meetingKey}:${occurrenceDate}` : '';
          })
          .filter(Boolean),
      );
    },
    (error) => {
      onError?.(normalizeError(error, 'Unable to load church-specific meeting changes from Firestore.'));
    },
  );
}

export async function cancelCommonMeetingOccurrence(payload: {
  churchId: string;
  meetingKey: string;
  occurrenceDate: string;
  title: string;
}) {
  if (!firestoreDb) {
    return;
  }

  await setDoc(doc(firestoreDb, 'commonMeetingCancellations', `${payload.churchId}_${payload.meetingKey}_${payload.occurrenceDate}`), {
    churchId: payload.churchId,
    meetingKey: payload.meetingKey,
    occurrenceDate: payload.occurrenceDate,
    title: payload.title,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function restoreCommonMeetingOccurrence(churchId: string, meetingKey: string, occurrenceDate: string) {
  if (!firestoreDb) {
    return;
  }

  await deleteDoc(doc(firestoreDb, 'commonMeetingCancellations', `${churchId}_${meetingKey}_${occurrenceDate}`));
}

export async function cancelChurchSpecificMeetingOccurrence(payload: {
  churchId: string;
  meetingKey: string;
  occurrenceDate: string;
  title: string;
}) {
  if (!firestoreDb) {
    return;
  }

  await setDoc(doc(firestoreDb, 'churchSpecificMeetingCancellations', `${payload.churchId}_${payload.meetingKey}_${payload.occurrenceDate}`), {
    churchId: payload.churchId,
    meetingKey: payload.meetingKey,
    occurrenceDate: payload.occurrenceDate,
    title: payload.title,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function restoreChurchSpecificMeetingOccurrence(churchId: string, meetingKey: string, occurrenceDate: string) {
  if (!firestoreDb) {
    return;
  }

  await deleteDoc(doc(firestoreDb, 'churchSpecificMeetingCancellations', `${churchId}_${meetingKey}_${occurrenceDate}`));
}

export function subscribeToAuditEntries(
  churchId: string | null,
  onData: (entries: AuditEntry[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firestoreDb) {
    return () => undefined;
  }

  const auditQuery = churchId
    ? query(collection(firestoreDb, 'auditLogs'), where('churchId', '==', churchId), orderBy('createdAt', 'desc'))
    : query(collection(firestoreDb, 'auditLogs'), orderBy('createdAt', 'desc'));

  return onSnapshot(
    auditQuery,
    (snapshot) => {
      const entries = snapshot.docs
        .map((item) => mapAuditEntry(item.id, item.data() as Record<string, unknown>))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      onData(entries);
    },
    (error) => {
      onError?.(normalizeError(error, 'Unable to load audit history from Firestore.'));
    },
  );
}

export async function writeAuditEntry(payload: {
  churchId: string;
  entityType: AuditEntry['entityType'];
  actionLabel: string;
  targetLabel: string;
  summary: string;
  actor: string;
}) {
  if (!firestoreDb) {
    return;
  }

  await addDoc(collection(firestoreDb, 'auditLogs'), {
    churchId: payload.churchId,
    entityType: payload.entityType,
    actionLabel: payload.actionLabel,
    targetLabel: payload.targetLabel,
    summary: payload.summary,
    actor: payload.actor,
    createdAt: serverTimestamp(),
  });
}

export async function updateAccessRequestStatus(
  request: AccessRequest,
  nextStatus: 'approved' | 'rejected',
) {
  if (!firestoreDb) {
    throw new Error('Firebase is not configured for the admin dashboard.');
  }

  const nextRoles: RoleKey[] = ['member'];
  const accessRequestRef = doc(firestoreDb, 'accessRequests', request.id);

  if (!request.uid) {
    await updateDoc(accessRequestRef, {
      status: nextStatus,
      requestedRoles: nextRoles,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const batch = writeBatch(firestoreDb);
  batch.update(accessRequestRef, {
    status: nextStatus,
    requestedRoles: nextRoles,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const userRef = doc(firestoreDb, 'users', request.uid);
  batch.set(
    userRef,
    nextStatus === 'approved'
      ? {
          approvalStatus: 'approved',
          primaryChurchId: request.churchId,
          pendingChurchId: null,
          phoneNumber: request.phoneNumber ?? null,
          phoneVerificationStatus: request.phoneNumber ? 'pending' : 'missing',
          phoneVerifiedAt: null,
          ...buildNestedBooleanFields('churchAccess', [request.churchId]),
          ...buildNestedBooleanFields('roleFlags', nextRoles),
          updatedAt: serverTimestamp(),
        }
      : {
          approvalStatus: 'rejected',
          pendingChurchId: null,
          updatedAt: serverTimestamp(),
        },
    { merge: true },
  );

  await batch.commit();
}

export async function updatePrayerRequestStatus(requestId: string, nextStatus: 'approved' | 'hidden') {
  if (!firestoreDb) {
    throw new Error('Firebase is not configured for the admin dashboard.');
  }

  await updateDoc(doc(firestoreDb, 'prayerRequests', requestId), {
    status: nextStatus,
    moderatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function deletePrayerRequest(requestId: string) {
  if (!firestoreDb) {
    throw new Error('Firebase is not configured for the admin dashboard.');
  }

  await deleteDoc(doc(firestoreDb, 'prayerRequests', requestId));
}

export async function updateMemberAssignments(payload: {
  memberId: string;
  churchId: string;
  email: string;
  phoneNumber: string;
  roleKey: RoleKey;
  teamNames: string[];
}) {
  if (!firestoreDb) {
    throw new Error('Firebase is not configured for the admin dashboard.');
  }

  const userRef = doc(firestoreDb, 'users', payload.memberId);
  const existingSnapshot = await getDoc(userRef);
  const existingData = existingSnapshot.exists() ? (existingSnapshot.data() as Record<string, unknown>) : {};
  const existingRoleFlags = (existingData.roleFlags as Record<string, unknown> | undefined) ?? {};
  const existingTeamAccess = (existingData.teamAccess as Record<string, unknown> | undefined) ?? {};

  const nextRoleFlags = Object.keys(existingRoleFlags).reduce<Record<string, boolean>>((flags, key) => {
    flags[`roleFlags.${key}`] = false;
    return flags;
  }, {});

  const nextTeamAccess = Object.keys(existingTeamAccess).reduce<Record<string, boolean>>((flags, key) => {
    flags[`teamAccess.${key}`] = false;
    return flags;
  }, {});
  const effectiveRole = getEffectiveRole({ [payload.roleKey]: true }, payload.teamNames);
  const normalizedEmail = payload.email.trim().toLowerCase();
  const normalizedPhoneNumber = payload.phoneNumber.trim();

  if (!normalizedEmail) {
    throw new Error('Add a valid email address before saving the member.');
  }

  await updateDoc(userRef, {
    email: normalizedEmail,
    approvalStatus: 'approved',
    primaryChurchId: payload.churchId,
    primaryTeamName: payload.teamNames[0] || null,
    phoneNumber: normalizedPhoneNumber || null,
    phoneVerificationStatus: normalizedPhoneNumber ? 'pending' : 'missing',
    phoneVerifiedAt: null,
    ...buildNestedBooleanFields('churchAccess', [payload.churchId]),
    ...nextRoleFlags,
    'roleFlags.networkSuperAdmin': existingRoleFlags.networkSuperAdmin === true,
    [`roleFlags.${effectiveRole}`]: true,
    ...nextTeamAccess,
    ...(payload.teamNames.length > 0 ? buildNestedBooleanFields('teamAccess', payload.teamNames) : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteManagedMember(memberId: string) {
  if (!firestoreDb) {
    throw new Error('Firebase is not configured for the admin dashboard.');
  }

  const privateProfileRef = doc(firestoreDb, 'userPrivateProfiles', memberId);
  const privateProfileSnapshot = await getDoc(privateProfileRef);
  const batch = writeBatch(firestoreDb);
  batch.delete(doc(firestoreDb, 'users', memberId));
  if (privateProfileSnapshot.exists()) {
    batch.delete(privateProfileRef);
  }
  await batch.commit();
}

export async function createManagedMember(payload: {
  fullName: string;
  email: string;
  churchId: string;
  roleKey: RoleKey;
  teamNames: string[];
}) {
  if (!firestoreDb) {
    throw new Error('Firebase is not configured for the admin dashboard.');
  }

  const newMemberRef = doc(collection(firestoreDb, 'users'));
  const effectiveRole = getEffectiveRole({ [payload.roleKey]: true }, payload.teamNames);
  await setDoc(newMemberRef, {
    uid: newMemberRef.id,
    fullName: payload.fullName.trim(),
    displayName: payload.fullName.trim(),
    email: payload.email.trim().toLowerCase(),
    approvalStatus: 'approved',
    primaryChurchId: payload.churchId,
    primaryTeamName: payload.teamNames[0] || null,
    ...buildNestedBooleanFields('churchAccess', [payload.churchId]),
    [`roleFlags.${effectiveRole}`]: true,
    ...(payload.teamNames.length > 0 ? buildNestedBooleanFields('teamAccess', payload.teamNames) : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return newMemberRef.id;
}

export async function createVolunteerAssignment(payload: {
  churchId: string;
  teamName: string;
  roleName: string;
  serviceDate: string;
  assignedTo: string;
  assignedUserId?: string;
  createdBy: string;
}) {
  if (!firestoreDb) {
    throw new Error('Firebase is not configured for the admin dashboard.');
  }

  const assignmentId = buildVolunteerAssignmentId(payload);
  await setDoc(doc(firestoreDb, 'scheduleAssignments', assignmentId), {
    churchId: payload.churchId,
    teamId: payload.teamName,
    teamName: payload.teamName,
    roleName: payload.roleName.trim(),
    serviceDate: payload.serviceDate,
    assignedTo: payload.assignedTo,
    assignedUserId: payload.assignedUserId ?? null,
    responseStatus: 'pending',
    createdBy: payload.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return assignmentId;
}

export async function deleteVolunteerAssignment(assignmentId: string) {
  if (!firestoreDb) {
    throw new Error('Firebase is not configured for the admin dashboard.');
  }

  await deleteDoc(doc(firestoreDb, 'scheduleAssignments', assignmentId));
}

function slugifyChurchId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildVolunteerAssignmentId(payload: {
  churchId: string;
  teamName: string;
  roleName: string;
  serviceDate: string;
  assignedTo: string;
  assignedUserId?: string;
}) {
  const assigneeKey = payload.assignedUserId?.trim().toLowerCase() || payload.assignedTo.trim().toLowerCase();
  return [
    payload.churchId,
    payload.serviceDate,
    payload.teamName,
    payload.roleName,
    assigneeKey,
  ].map(slugifyChurchId).join('__');
}

export async function createChurchLocation(payload: {
  name: string;
  city: string;
  displayCity: string;
  address: string;
  serviceTimes: string;
  sharedDrivePath: string;
  googleMapsLabel: string;
  teams: string[];
  contactEmail?: string;
  contactPhone?: string;
  instagramUrl?: string;
  facebookUrl?: string;
}) {
  if (!firestoreDb) {
    throw new Error('Firebase is not configured for the admin dashboard.');
  }

  const churchId = slugifyChurchId(payload.displayCity || payload.name);
  if (!churchId) {
    throw new Error('Add a church name or display city before creating a location.');
  }

  await setDoc(doc(firestoreDb, 'churches', churchId), {
    name: ensureBethelPrefix(payload.name.trim()),
    city: payload.city.trim(),
    displayCity: ensureBethelPrefix(payload.displayCity.trim()),
    address: payload.address.trim(),
    serviceTimes: payload.serviceTimes.trim(),
    sharedDrivePath: payload.sharedDrivePath.trim(),
    googleMapsLabel: payload.googleMapsLabel.trim(),
    contactEmail: payload.contactEmail?.trim() || null,
    contactPhone: payload.contactPhone?.trim() || null,
    teams: payload.teams,
    instagramUrl: payload.instagramUrl?.trim() || null,
    facebookUrl: payload.facebookUrl?.trim() || null,
    admins: 1,
    members: 0,
    isPublic: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  const churchRecord: Church = {
    id: churchId,
    name: ensureBethelPrefix(payload.name.trim()),
    city: payload.city.trim(),
    displayCity: ensureBethelPrefix(payload.displayCity.trim()),
    address: payload.address.trim(),
    admins: 1,
    members: 0,
    serviceTimes: payload.serviceTimes.trim(),
    sharedDrivePath: payload.sharedDrivePath.trim(),
    googleMapsLabel: payload.googleMapsLabel.trim(),
    contactEmail: payload.contactEmail?.trim() || undefined,
    contactPhone: payload.contactPhone?.trim() || undefined,
    instagramUrl: payload.instagramUrl?.trim() || undefined,
    facebookUrl: payload.facebookUrl?.trim() || undefined,
    teams: payload.teams,
  };

  return churchRecord;
}

export async function updateChurchLocation(payload: {
  churchId: string;
  name: string;
  city: string;
  displayCity: string;
  address: string;
  serviceTimes: string;
  sharedDrivePath: string;
  googleMapsLabel: string;
  contactEmail?: string;
  contactPhone?: string;
  instagramUrl?: string;
  facebookUrl?: string;
}) {
  if (!firestoreDb) {
    throw new Error('Firebase is not configured for the admin dashboard.');
  }

  await setDoc(doc(firestoreDb, 'churches', payload.churchId), {
    name: ensureBethelPrefix(payload.name.trim()),
    city: payload.city.trim(),
    displayCity: ensureBethelPrefix(payload.displayCity.trim()),
    address: payload.address.trim(),
    serviceTimes: payload.serviceTimes.trim(),
    sharedDrivePath: payload.sharedDrivePath.trim(),
    googleMapsLabel: payload.googleMapsLabel.trim(),
    contactEmail: payload.contactEmail?.trim() || null,
    contactPhone: payload.contactPhone?.trim() || null,
    instagramUrl: payload.instagramUrl?.trim() || null,
    facebookUrl: payload.facebookUrl?.trim() || null,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function addChurchTeam(churchId: string, teamName: string) {
  if (!firestoreDb) {
    throw new Error('Firebase is not configured for the admin dashboard.');
  }

  const normalizedTeamName = teamName.trim();
  if (!normalizedTeamName) {
    throw new Error('Add a team name before saving it.');
  }

  await setDoc(doc(firestoreDb, 'churches', churchId), {
    teams: arrayUnion(normalizedTeamName),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function removeChurchTeam(churchId: string, teamName: string) {
  if (!firestoreDb) {
    throw new Error('Firebase is not configured for the admin dashboard.');
  }

  const normalizedTeamName = teamName.trim();
  if (!normalizedTeamName) {
    throw new Error('Choose a valid team before removing it.');
  }

  await setDoc(doc(firestoreDb, 'churches', churchId), {
    teams: arrayRemove(normalizedTeamName),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function publishAnnouncement(payload: {
  churchId: string;
  title: string;
  body: string;
  publishedBy: string;
  isPublic: boolean;
  visibleUntilAt?: string;
}) {
  if (!firestoreDb) {
    throw new Error('Firebase is not configured for the admin dashboard.');
  }

  await addDoc(collection(firestoreDb, 'announcements'), {
    scopeType: 'church',
    scopeChurchId: payload.churchId,
    churchId: payload.churchId,
    scopeTeamId: null,
    title: payload.title.trim(),
    body: payload.body.trim(),
    audienceRoles: ['member', 'volunteer', 'teamLeader', 'pastor', 'churchAdmin'],
    audienceLabel: payload.isPublic ? 'Guests and approved members' : 'Approved members',
    isPublic: payload.isPublic,
    publishedBy: payload.publishedBy,
    publishedAt: serverTimestamp(),
    visibleUntilAt: payload.visibleUntilAt ? Timestamp.fromDate(new Date(payload.visibleUntilAt)) : null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteAnnouncement(announcementId: string) {
  if (!firestoreDb) {
    throw new Error('Firebase is not configured for the admin dashboard.');
  }

  await deleteDoc(doc(firestoreDb, 'announcements', announcementId));
}

export async function publishEvent(payload: {
  churchId: string;
  scopeType: 'church' | 'network';
  scopeLabel: string;
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  createdBy: string;
  posterUrl?: string;
  isPublic: boolean;
}) {
  if (!firestoreDb) {
    throw new Error('Firebase is not configured for the admin dashboard.');
  }

  const resolvedChurchId = payload.scopeType === 'network' ? 'network' : payload.churchId;

  await addDoc(collection(firestoreDb, 'events'), {
    churchId: resolvedChurchId,
    scopeType: payload.scopeType,
    scopeLabel: payload.scopeLabel,
    teamId: null,
    title: payload.title.trim(),
    description: payload.description.trim(),
    location: payload.location.trim(),
    startAt: normalizeDateInput(payload.startAt),
    endAt: normalizeDateInput(payload.endAt),
    posterUrl: payload.posterUrl?.trim() || null,
    isPublic: payload.isPublic,
    createdBy: payload.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteEvent(eventId: string) {
  if (!firestoreDb) {
    throw new Error('Firebase is not configured for the admin dashboard.');
  }

  await deleteDoc(doc(firestoreDb, 'events', eventId));
}
