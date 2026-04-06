import { collection, onSnapshot, orderBy, query, where, type FirestoreError, type Timestamp } from 'firebase/firestore';

import { firestoreDb } from '../config/firebase';
import type { ChurchAnnouncement, ChurchEventItem } from '../data/churchUpdates';

export type { ChurchAnnouncement, ChurchEventItem } from '../data/churchUpdates';

function buildCommonMeetingCancellationKey(meetingKey: string, occurrenceDate: string) {
  return `${meetingKey}:${occurrenceDate}`;
}

function buildChurchSpecificMeetingCancellationKey(meetingKey: string, occurrenceDate: string) {
  return `${meetingKey}:${occurrenceDate}`;
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

function normalizeOptionalTimestamp(value: Timestamp | string | null | undefined) {
  if (!value) {
    return undefined;
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
      'Live church updates are blocked right now. Ask a church admin to publish the latest Firestore rules, then refresh the app.',
    );
  }

  if (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'unavailable'
  ) {
    return new Error(
      'Live church updates could not be loaded right now. Check your internet connection and try again.',
    );
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(fallback);
}

function getEventTime(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function mapAnnouncement(id: string, rawValue: Record<string, unknown>): ChurchAnnouncement {
  return {
    id,
    churchId: normalizeString(rawValue.scopeChurchId) || normalizeString(rawValue.churchId),
    title: normalizeString(rawValue.title, 'Church announcement'),
    body: normalizeString(rawValue.body, 'No announcement details were provided.'),
    publishedAt: normalizeTimestamp(rawValue.publishedAt as Timestamp | string | null | undefined, new Date().toISOString()),
    visibleUntilAt: normalizeOptionalTimestamp(rawValue.visibleUntilAt as Timestamp | string | null | undefined),
    publishedBy: normalizeString(rawValue.publishedBy, 'Church office'),
    audienceLabel: normalizeString(rawValue.audienceLabel, 'Approved members'),
    isPublic: normalizeBoolean(rawValue.isPublic),
  };
}

function isAnnouncementVisible(announcement: ChurchAnnouncement) {
  if (!announcement.visibleUntilAt) {
    return true;
  }

  const visibleUntil = new Date(announcement.visibleUntilAt).getTime();
  if (Number.isNaN(visibleUntil)) {
    return true;
  }

  return visibleUntil >= Date.now();
}

function mapEvent(id: string, rawValue: Record<string, unknown>): ChurchEventItem {
  const fallbackStart = new Date().toISOString();

  return {
    id,
    churchId: normalizeString(rawValue.churchId),
    scopeType: rawValue.scopeType === 'network' ? 'network' : 'church',
    scopeLabel: normalizeString(rawValue.scopeLabel) || undefined,
    title: normalizeString(rawValue.title, 'Church event'),
    description: normalizeString(rawValue.description, 'Event details will be shared soon.'),
    location: normalizeString(rawValue.location, 'Church location'),
    startAt: normalizeTimestamp(rawValue.startAt as Timestamp | string | null | undefined, fallbackStart),
    endAt: normalizeTimestamp(rawValue.endAt as Timestamp | string | null | undefined, fallbackStart),
    teamName: normalizeString(rawValue.teamName) || undefined,
    posterUrl: normalizeString(rawValue.posterUrl) || undefined,
    isPublic: normalizeBoolean(rawValue.isPublic),
  };
}

function isUpcomingEvent(event: ChurchEventItem) {
  const endAt = new Date(event.endAt).getTime();
  if (Number.isNaN(endAt)) {
    return true;
  }

  return endAt >= Date.now();
}

export function subscribeToChurchAnnouncements(
  churchId: string,
  onData: (announcements: ChurchAnnouncement[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firestoreDb) {
    onData([]);
    onError?.(new Error('Live church announcements are unavailable because Firebase is not configured for this app build.'));
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
          .sort((left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime())
          .filter(isAnnouncementVisible),
      );
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
    onData([]);
    onError?.(new Error('Live church events are unavailable because Firebase is not configured for this app build.'));
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
      .filter(isUpcomingEvent)
      .sort((left, right) => getEventTime(left.startAt) - getEventTime(right.startAt));
    onData(combinedEvents);
  };

  const localEventsQuery = query(collection(firestoreDb, 'events'), where('churchId', '==', churchId), orderBy('startAt', 'asc'));
  const sharedEventsQuery = query(collection(firestoreDb, 'events'), where('scopeType', '==', 'network'), orderBy('startAt', 'asc'));

  const unsubscribeLocal = onSnapshot(
    localEventsQuery,
    (snapshot) => {
      localEvents = snapshot.docs.map((item) => mapEvent(item.id, item.data() as Record<string, unknown>));
      emitCombinedEvents();
    },
    (error) => {
      onError?.(normalizeError(error, 'Unable to load local church events.'));
    },
  );

  const unsubscribeShared = onSnapshot(
    sharedEventsQuery,
    (snapshot) => {
      sharedEvents = snapshot.docs.map((item) => mapEvent(item.id, item.data() as Record<string, unknown>));
      emitCombinedEvents();
    },
    (error) => {
      sharedEvents = [];
      emitCombinedEvents();
      onError?.(normalizeError(error, 'Unable to load shared network events.'));
    },
  );

  return () => {
    unsubscribeLocal();
    unsubscribeShared();
  };
}

export function subscribeToPublicCommonEvents(
  onData: (events: ChurchEventItem[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firestoreDb) {
    onData([]);
    onError?.(new Error('Live common Bethel events are unavailable because Firebase is not configured for this app build.'));
    return () => undefined;
  }

  const publicEventsQuery = query(collection(firestoreDb, 'events'), where('isPublic', '==', true));

  return onSnapshot(
    publicEventsQuery,
    (snapshot) => {
      const events = snapshot.docs
        .map((item) => mapEvent(item.id, item.data() as Record<string, unknown>))
        .filter((event) => event.scopeType === 'network')
        .filter(isUpcomingEvent)
        .sort((left, right) => getEventTime(left.startAt) - getEventTime(right.startAt));
      onData(events);
    },
    (error) => {
      onError?.(normalizeError(error, 'Unable to load common Bethel events.'));
    },
  );
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
            const meetingKey = normalizeString(rawValue.meetingKey);
            const occurrenceDate = normalizeString(rawValue.occurrenceDate);
            return meetingKey && occurrenceDate ? buildCommonMeetingCancellationKey(meetingKey, occurrenceDate) : '';
          })
          .filter(Boolean),
      );
    },
    (error) => {
      onError?.(normalizeError(error, 'Unable to load common meeting changes.'));
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
            const meetingKey = normalizeString(rawValue.meetingKey);
            const occurrenceDate = normalizeString(rawValue.occurrenceDate);
            return meetingKey && occurrenceDate ? buildChurchSpecificMeetingCancellationKey(meetingKey, occurrenceDate) : '';
          })
          .filter(Boolean),
      );
    },
    (error) => {
      onError?.(normalizeError(error, 'Unable to load church-specific meeting changes.'));
    },
  );
}
