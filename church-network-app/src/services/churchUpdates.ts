import { collection, onSnapshot, orderBy, query, where, type FirestoreError, type Timestamp } from 'firebase/firestore';

import { firestoreDb } from '../config/firebase';
import { mockAnnouncements, mockEvents, type ChurchAnnouncement, type ChurchEventItem } from '../data/churchUpdates';

export type { ChurchAnnouncement, ChurchEventItem } from '../data/churchUpdates';

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
  if (error instanceof Error) {
    return error;
  }

  return new Error(fallback);
}

function mapAnnouncement(id: string, rawValue: Record<string, unknown>): ChurchAnnouncement {
  return {
    id,
    churchId: normalizeString(rawValue.scopeChurchId),
    title: normalizeString(rawValue.title, 'Church announcement'),
    body: normalizeString(rawValue.body, 'No announcement details were provided.'),
    publishedAt: normalizeTimestamp(rawValue.publishedAt as Timestamp | string | null | undefined, new Date().toISOString()),
    publishedBy: normalizeString(rawValue.publishedBy, 'Church office'),
    audienceLabel: normalizeString(rawValue.audienceLabel, 'Approved members'),
    isPublic: normalizeBoolean(rawValue.isPublic),
  };
}

function mapEvent(id: string, rawValue: Record<string, unknown>): ChurchEventItem {
  const fallbackStart = new Date().toISOString();

  return {
    id,
    churchId: normalizeString(rawValue.churchId),
    title: normalizeString(rawValue.title, 'Church event'),
    description: normalizeString(rawValue.description, 'Event details will be shared soon.'),
    location: normalizeString(rawValue.location, 'Church location'),
    startAt: normalizeTimestamp(rawValue.startAt as Timestamp | string | null | undefined, fallbackStart),
    endAt: normalizeTimestamp(rawValue.endAt as Timestamp | string | null | undefined, fallbackStart),
    teamName: normalizeString(rawValue.teamName) || undefined,
    isPublic: normalizeBoolean(rawValue.isPublic),
  };
}

export function subscribeToChurchAnnouncements(
  churchId: string,
  onData: (announcements: ChurchAnnouncement[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firestoreDb) {
    onData(mockAnnouncements.filter((item) => item.churchId === churchId));
    return () => undefined;
  }

  const announcementsQuery = query(
    collection(firestoreDb, 'announcements'),
    where('scopeChurchId', '==', churchId),
    orderBy('publishedAt', 'desc'),
  );

  return onSnapshot(
    announcementsQuery,
    (snapshot) => {
      onData(snapshot.docs.map((item) => mapAnnouncement(item.id, item.data() as Record<string, unknown>)));
    },
    (error) => {
      onError?.(normalizeError(error, 'Unable to load church announcements.'));
    },
  );
}

export function subscribeToChurchEvents(
  churchId: string,
  onData: (events: ChurchEventItem[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firestoreDb) {
    onData(mockEvents.filter((item) => item.churchId === churchId));
    return () => undefined;
  }

  const eventsQuery = query(collection(firestoreDb, 'events'), where('churchId', '==', churchId), orderBy('startAt', 'asc'));
  return onSnapshot(
    eventsQuery,
    (snapshot) => {
      onData(snapshot.docs.map((item) => mapEvent(item.id, item.data() as Record<string, unknown>)));
    },
    (error) => {
      onError?.(normalizeError(error, 'Unable to load church events.'));
    },
  );
}
