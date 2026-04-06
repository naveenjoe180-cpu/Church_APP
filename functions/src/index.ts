import { initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

initializeApp();

const firestore = getFirestore();
const APP_DEEP_LINK = 'https://bethelconnect-user.web.app';
const ROLE_LABELS = {
  networkSuperAdmin: 'Super Admin',
  churchAdmin: 'Church Admin',
  pastor: 'Pastor',
  teamLeader: 'Team Leader',
  volunteer: 'Volunteer',
  member: 'Member',
} as const;

type RoleKey = keyof typeof ROLE_LABELS;

type DeviceTarget = {
  id: string;
  userId: string;
  channel: 'expo';
  token: string;
  churchIds: string[];
  approvalStatus: string;
};

type NotificationPayload = {
  type: string;
  title: string;
  body: string;
  audienceUserId?: string | null;
  audienceChurchId?: string | null;
  data?: Record<string, string>;
};

type ReminderCandidate = {
  reminderKey: string;
  audienceChurchId: string;
  title: string;
  body: string;
  data: Record<string, string>;
};

type ChurchRecord = {
  id: string;
  displayCity: string;
  address: string;
  serviceTimes: string;
};

type RecurringMeetingTemplate = {
  key: string;
  title: string;
  description: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  matchesDay: (dayOfWeek: number) => boolean;
};

async function writeNotificationLog(payload: NotificationPayload) {
  await firestore.collection('notifications').add({
    ...payload,
    channel: payload.audienceUserId ? 'direct' : 'broadcast',
    createdAt: FieldValue.serverTimestamp(),
    sentAt: FieldValue.serverTimestamp(),
  });
}

function mapDeviceTarget(snapshot: FirebaseFirestore.QueryDocumentSnapshot): DeviceTarget {
  const rawValue = snapshot.data();
  return {
    id: snapshot.id,
    userId: typeof rawValue.userId === 'string' ? rawValue.userId : '',
    channel: 'expo',
    token: typeof rawValue.token === 'string' ? rawValue.token : '',
    churchIds: Array.isArray(rawValue.churchIds) ? rawValue.churchIds.filter((item): item is string => typeof item === 'string') : [],
    approvalStatus: typeof rawValue.approvalStatus === 'string' ? rawValue.approvalStatus : 'pending',
  };
}

function dedupeTargets(targets: DeviceTarget[]) {
  const uniqueTargets = new Map<string, DeviceTarget>();
  targets.forEach((target) => {
    if (!target.token || uniqueTargets.has(target.token)) {
      return;
    }

    uniqueTargets.set(target.token, target);
  });

  return Array.from(uniqueTargets.values());
}

async function getDevicesForUser(userId: string) {
  const snapshot = await firestore
    .collection('notificationDevices')
    .where('userId', '==', userId)
    .where('enabled', '==', true)
    .get();

  return dedupeTargets(snapshot.docs.map(mapDeviceTarget).filter((target) => Boolean(target.token)));
}

async function getAllApprovedDevices() {
  const snapshot = await firestore
    .collection('notificationDevices')
    .where('approvalStatus', '==', 'approved')
    .where('enabled', '==', true)
    .get();

  return dedupeTargets(snapshot.docs.map(mapDeviceTarget).filter((target) => Boolean(target.token)));
}

async function getApprovedDevicesForChurch(churchId: string) {
  const snapshot = await firestore
    .collection('notificationDevices')
    .where('churchIds', 'array-contains', churchId)
    .where('approvalStatus', '==', 'approved')
    .where('enabled', '==', true)
    .get();

  return dedupeTargets(snapshot.docs.map(mapDeviceTarget).filter((target) => Boolean(target.token)));
}

async function getApprovedDevicesForAudience(churchId: string) {
  if (!churchId || churchId === 'network') {
    return getAllApprovedDevices();
  }

  return getApprovedDevicesForChurch(churchId);
}

async function sendExpoNotifications(targets: DeviceTarget[], payload: NotificationPayload) {
  const expoTokens = targets.map((target) => target.token);
  if (expoTokens.length === 0) {
    return;
  }

  const body = expoTokens.map((token) => ({
    to: token,
    title: payload.title,
    body: payload.body,
    sound: 'default',
    data: payload.data ?? {},
  }));

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    logger.error('Expo push delivery failed', { status: response.status, body: responseBody, type: payload.type });
  }
}

async function deliverNotification(targets: DeviceTarget[], payload: NotificationPayload) {
  if (targets.length === 0) {
    logger.info('No notification targets matched', { type: payload.type, audienceUserId: payload.audienceUserId, audienceChurchId: payload.audienceChurchId });
    return;
  }

  await sendExpoNotifications(targets, payload);
  await writeNotificationLog(payload);
}

function extractString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function extractStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function normalizeDate(value: unknown) {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (value && typeof value === 'object' && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    const parsed = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function getIsoString(value: unknown) {
  return normalizeDate(value)?.toISOString() ?? '';
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatReminderTime(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatEventDateTime(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatEventDate(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(date);
}

function extractRoleFlags(value: unknown) {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, boolean>>((flags, [key, enabled]) => {
    if (enabled === true) {
      flags[key] = true;
    }
    return flags;
  }, {});
}

function extractTeamNames(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, enabled]) => enabled === true)
      .map(([teamName]) => teamName.trim())
      .filter(Boolean);
  }

  return [];
}

function getEffectiveRole(userData: FirebaseFirestore.DocumentData): RoleKey {
  const roleFlags = extractRoleFlags(userData.roleFlags);
  const teamNames = extractTeamNames(userData.teamNames ?? userData.teamAccess);

  if (roleFlags.networkSuperAdmin) return 'networkSuperAdmin';
  if (roleFlags.churchAdmin) return 'churchAdmin';
  if (roleFlags.pastor) return 'pastor';
  if (roleFlags.teamLeader) return 'teamLeader';
  if (roleFlags.volunteer || teamNames.length > 0) return 'volunteer';
  return 'member';
}

function getRecurringChurchMeetingTemplates(churchId: string): RecurringMeetingTemplate[] {
  if (churchId === 'nuremberg') {
    return [
      {
        key: 'bible-reading',
        title: 'Bible Reading',
        description: 'A church-specific Bible reading meeting for members.',
        startHour: 20,
        startMinute: 0,
        endHour: 21,
        endMinute: 0,
        matchesDay: (dayOfWeek: number) => dayOfWeek === 1,
      },
      {
        key: 'church-intercessory-prayer',
        title: 'Church Intercessory Prayer',
        description: 'Church intercessory prayer for local church needs and ministry covering.',
        startHour: 21,
        startMinute: 0,
        endHour: 21,
        endMinute: 30,
        matchesDay: (dayOfWeek: number) => dayOfWeek === 2,
      },
    ];
  }

  return [];
}

function parseServiceTime(serviceTimes: string) {
  const timeMatch = serviceTimes.match(/(\d{1,2}):(\d{2})/);
  if (!timeMatch) {
    return { hour: 10, minute: 0 };
  }

  return {
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
  };
}

function buildMeetingReminderBody(title: string, date: Date, location: string) {
  const timeLabel = formatReminderTime(date);
  return `${title} starts at ${timeLabel}${location ? ` (${location})` : ''}.`;
}

async function acquireReminderLock(reminderKey: string) {
  const reminderRef = firestore.collection('notificationReminders').doc(reminderKey);

  try {
    await reminderRef.create({
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    logger.info('Reminder lock already exists', { reminderKey, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

async function deleteSnapshotDocs(snapshot: FirebaseFirestore.QuerySnapshot) {
  if (snapshot.empty) {
    return 0;
  }

  let deletedCount = 0;
  let batch = firestore.batch();
  let batchItemCount = 0;

  for (const item of snapshot.docs) {
    batch.delete(item.ref);
    batchItemCount += 1;
    deletedCount += 1;

    if (batchItemCount === 400) {
      await batch.commit();
      batch = firestore.batch();
      batchItemCount = 0;
    }
  }

  if (batchItemCount > 0) {
    await batch.commit();
  }

  return deletedCount;
}

async function getChurchRecords() {
  const snapshot = await firestore.collection('churches').get();
  return snapshot.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      displayCity: extractString(data.displayCity) || extractString(data.name) || item.id,
      address: extractString(data.address),
      serviceTimes: extractString(data.serviceTimes) || 'Sunday 10:00',
    } satisfies ChurchRecord;
  });
}

async function getCancellationMaps(dateKeys: string[]) {
  if (dateKeys.length === 0) {
    return {
      common: new Map<string, Set<string>>(),
      churchSpecific: new Map<string, Set<string>>(),
    };
  }

  const [commonSnapshot, churchSpecificSnapshot] = await Promise.all([
    firestore.collection('commonMeetingCancellations').where('occurrenceDate', 'in', dateKeys).get(),
    firestore.collection('churchSpecificMeetingCancellations').where('occurrenceDate', 'in', dateKeys).get(),
  ]);

  const common = new Map<string, Set<string>>();
  commonSnapshot.docs.forEach((item) => {
    const data = item.data();
    const churchId = extractString(data.churchId);
    const meetingKey = extractString(data.meetingKey);
    const occurrenceDate = extractString(data.occurrenceDate);
    if (!churchId || !meetingKey || !occurrenceDate) {
      return;
    }

    const setKey = `${meetingKey}:${occurrenceDate}`;
    const entry = common.get(churchId) ?? new Set<string>();
    entry.add(setKey);
    common.set(churchId, entry);
  });

  const churchSpecific = new Map<string, Set<string>>();
  churchSpecificSnapshot.docs.forEach((item) => {
    const data = item.data();
    const churchId = extractString(data.churchId);
    const meetingKey = extractString(data.meetingKey);
    const occurrenceDate = extractString(data.occurrenceDate);
    if (!churchId || !meetingKey || !occurrenceDate) {
      return;
    }

    const setKey = `${meetingKey}:${occurrenceDate}`;
    const entry = churchSpecific.get(churchId) ?? new Set<string>();
    entry.add(setKey);
    churchSpecific.set(churchId, entry);
  });

  return { common, churchSpecific };
}

async function getUpcomingPublishedEventReminders(windowStart: Date, windowEnd: Date): Promise<ReminderCandidate[]> {
  const snapshot = await firestore
    .collection('events')
    .where('startAt', '>=', Timestamp.fromDate(windowStart))
    .where('startAt', '<=', Timestamp.fromDate(windowEnd))
    .get();

  return snapshot.docs.reduce<ReminderCandidate[]>((reminders, item) => {
      const data = item.data();
      const startAt = normalizeDate(data.startAt);
      const churchId = extractString(data.scopeType) === 'network' ? 'network' : (extractString(data.churchId) || 'network');
      if (!startAt) {
        return reminders;
      }

      const title = extractString(data.title) || 'Upcoming church event';
      const location = extractString(data.location) || 'Church location';
      reminders.push({
        reminderKey: `event-${item.id}-${startAt.toISOString()}`,
        audienceChurchId: churchId,
        title: `${title} starts in 10 minutes`,
        body: buildMeetingReminderBody(title, startAt, location),
        data: {
          deepLink: APP_DEEP_LINK,
          eventId: item.id,
          type: 'event-reminder',
          startAt: startAt.toISOString(),
        },
      });
      return reminders;
    }, []);
}

function buildRecurringMeetingReminders(
  churches: ChurchRecord[],
  windowStart: Date,
  windowEnd: Date,
  commonCancellations: Map<string, Set<string>>,
  churchSpecificCancellations: Map<string, Set<string>>,
) {
  const reminders: ReminderCandidate[] = [];

  churches.forEach((church) => {
    const serviceTime = parseServiceTime(church.serviceTimes);
    const serviceDate = new Date(windowEnd);
    serviceDate.setHours(serviceTime.hour, serviceTime.minute, 0, 0);

    if (serviceDate >= windowStart && serviceDate <= windowEnd && serviceDate.getDay() === 0) {
      reminders.push({
        reminderKey: `service-${church.id}-${formatDateKey(serviceDate)}`,
        audienceChurchId: church.id,
        title: 'Sunday Service starts in 10 minutes',
        body: buildMeetingReminderBody(`Sunday Service for ${church.displayCity}`, serviceDate, church.address),
        data: {
          deepLink: APP_DEEP_LINK,
          churchId: church.id,
          type: 'meeting-reminder',
          meetingKey: 'sunday-service',
          startAt: serviceDate.toISOString(),
        },
      });
    }

    const commonMeetingChecks: Array<RecurringMeetingTemplate & { audienceChurchId: string; location: string }> = [
      {
        key: 'daily-intercessory-prayer',
        title: 'Daily Intercessory Prayer',
        description: 'Shared prayer gathering across Bethel churches in Germany.',
        startHour: 6,
        startMinute: 0,
        endHour: 7,
        endMinute: 0,
        matchesDay: (dayOfWeek: number) => dayOfWeek !== 0,
        audienceChurchId: church.id,
        location: 'Online',
      },
      {
        key: 'mid-week-meeting',
        title: 'Mid Week Meeting',
        description: 'Weekly Bethel mid-week meeting for worship, Bible teaching, and prayer.',
        startHour: 19,
        startMinute: 0,
        endHour: 20,
        endMinute: 30,
        matchesDay: (dayOfWeek: number) => dayOfWeek === 3,
        audienceChurchId: church.id,
        location: 'Online',
      },
      {
        key: 'youth-meeting',
        title: 'Youth Meeting',
        description: 'Weekly youth gathering for fellowship, worship, and discipleship.',
        startHour: 20,
        startMinute: 0,
        endHour: 21,
        endMinute: 30,
        matchesDay: (dayOfWeek: number) => dayOfWeek === 5,
        audienceChurchId: church.id,
        location: 'Online',
      },
    ];

    commonMeetingChecks.forEach((meeting) => {
      const occurrence = new Date(windowEnd);
      occurrence.setHours(meeting.startHour, meeting.startMinute, 0, 0);
      const cancellationKey = `${meeting.key}:${formatDateKey(occurrence)}`;
      if (!meeting.matchesDay(occurrence.getDay()) || occurrence < windowStart || occurrence > windowEnd) {
        return;
      }

      if (commonCancellations.get(church.id)?.has(cancellationKey)) {
        return;
      }

      reminders.push({
        reminderKey: `common-${church.id}-${meeting.key}-${formatDateKey(occurrence)}`,
        audienceChurchId: church.id,
        title: `${meeting.title} starts in 10 minutes`,
        body: buildMeetingReminderBody(meeting.title, occurrence, meeting.location),
        data: {
          deepLink: APP_DEEP_LINK,
          churchId: church.id,
          type: 'meeting-reminder',
          meetingKey: meeting.key,
          startAt: occurrence.toISOString(),
        },
      });
    });

    getRecurringChurchMeetingTemplates(church.id).forEach((meeting) => {
      const occurrence = new Date(windowEnd);
      occurrence.setHours(meeting.startHour, meeting.startMinute, 0, 0);
      const cancellationKey = `${meeting.key}:${formatDateKey(occurrence)}`;
      if (!meeting.matchesDay(occurrence.getDay()) || occurrence < windowStart || occurrence > windowEnd) {
        return;
      }

      if (churchSpecificCancellations.get(church.id)?.has(cancellationKey)) {
        return;
      }

      reminders.push({
        reminderKey: `church-specific-${church.id}-${meeting.key}-${formatDateKey(occurrence)}`,
        audienceChurchId: church.id,
        title: `${meeting.title} starts in 10 minutes`,
        body: buildMeetingReminderBody(`${meeting.title} for ${church.displayCity}`, occurrence, 'Online'),
        data: {
          deepLink: APP_DEEP_LINK,
          churchId: church.id,
          type: 'meeting-reminder',
          meetingKey: meeting.key,
          startAt: occurrence.toISOString(),
        },
      });
    });
  });

  return reminders;
}

export const notifyOnApprovalChange = onDocumentUpdated('users/{userId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) {
    return;
  }

  const beforeStatus = extractString(before.approvalStatus);
  const afterStatus = extractString(after.approvalStatus);

  if (beforeStatus === afterStatus || (afterStatus !== 'approved' && afterStatus !== 'rejected')) {
    return;
  }

  const userId = event.params.userId;
  const churchId = extractString(after.primaryChurchId) || extractString(after.pendingChurchId);
  const targets = await getDevicesForUser(userId);

  await deliverNotification(targets, {
    type: 'approval-status',
    title: afterStatus === 'approved' ? 'Church access approved' : 'Access request updated',
    body: afterStatus === 'approved'
      ? 'Your church request has been approved. Sign in to open your member space.'
      : 'Your access request was updated by the church admin. Sign in to review the next steps.',
    audienceUserId: userId,
    audienceChurchId: churchId || null,
    data: {
      deepLink: APP_DEEP_LINK,
      approvalStatus: afterStatus,
    },
  });
});

export const notifyOnRoleChange = onDocumentUpdated('users/{userId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) {
    return;
  }

  const beforeRole = getEffectiveRole(before);
  const afterRole = getEffectiveRole(after);
  if (beforeRole === afterRole) {
    return;
  }

  const userId = event.params.userId;
  const churchId = extractString(after.primaryChurchId) || extractString(after.pendingChurchId);
  const targets = await getDevicesForUser(userId);

  await deliverNotification(targets, {
    type: 'role-change',
    title: 'Role updated',
    body: `Your church role is now ${ROLE_LABELS[afterRole]}. Sign in to review your updated access and planning responsibilities.`,
    audienceUserId: userId,
    audienceChurchId: churchId || null,
    data: {
      deepLink: APP_DEEP_LINK,
      roleKey: afterRole,
    },
  });
});

export const notifyOnAssignmentChange = onDocumentWritten('scheduleAssignments/{assignmentId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!after) {
    if (!before) {
      return;
    }

    const assignedUserId = extractString(before.assignedUserId);
    if (!assignedUserId) {
      return;
    }

    const roleName = extractString(before.roleName) || 'Sunday role';
    const serviceDate = extractString(before.serviceDate);
    const churchId = extractString(before.churchId);
    const teamName = extractString(before.teamName) || extractString(before.teamId);
    const targets = await getDevicesForUser(assignedUserId);

    await deliverNotification(targets, {
      type: 'schedule-assignment-removed',
      title: 'Sunday assignment reassigned',
      body: `${roleName} for ${serviceDate} (${teamName || 'church team'}) no longer needs your response.`,
      audienceUserId: assignedUserId,
      audienceChurchId: churchId || null,
      data: {
        deepLink: APP_DEEP_LINK,
        roleName,
        serviceDate,
        responseStatus: 'removed',
      },
    });
    return;
  }

  const assignedUserId = extractString(after.assignedUserId);
  if (!assignedUserId) {
    return;
  }

  const wasAssignedToSameUser = before && extractString(before.assignedUserId) === assignedUserId;
  const roleName = extractString(after.roleName) || 'Sunday role';
  const serviceDate = extractString(after.serviceDate);
  const churchId = extractString(after.churchId);
  const teamName = extractString(after.teamName) || extractString(after.teamId);
  const responseStatus = extractString(after.responseStatus) || 'pending';
  const title = wasAssignedToSameUser ? 'Role assignment updated' : 'Sunday planning request';
  const body = wasAssignedToSameUser
    ? `${roleName} for ${serviceDate} (${teamName || 'church team'}) is now ${responseStatus}.`
    : `${roleName} for ${serviceDate} (${teamName || 'church team'}) is ready for your response in Bethel Connect.`;

  const targets = await getDevicesForUser(assignedUserId);
  await deliverNotification(targets, {
    type: 'schedule-assignment',
    title,
    body,
    audienceUserId: assignedUserId,
    audienceChurchId: churchId || null,
    data: {
      deepLink: APP_DEEP_LINK,
      roleName,
      serviceDate,
      responseStatus,
    },
  });
});

export const notifyOnAnnouncementPublished = onDocumentWritten('announcements/{announcementId}', async (event) => {
  const before = event.data?.before.data();
  const data = event.data?.after.data();
  if (!data) {
    return;
  }

  const churchId = extractString(data.scopeChurchId) || extractString(data.churchId);
  if (!churchId) {
    return;
  }

  const title = extractString(data.title) || 'Church announcement';
  const body = extractString(data.body) || 'A new church announcement is available.';
  const targets = await getApprovedDevicesForAudience(churchId);

  await deliverNotification(targets, {
    type: 'announcement',
    title: before ? 'Church announcement updated' : title,
    body,
    audienceChurchId: churchId,
    data: {
      deepLink: APP_DEEP_LINK,
      announcementId: event.params.announcementId,
    },
  });
});

export const notifyOnEventPublished = onDocumentWritten('events/{eventId}', async (event) => {
  const before = event.data?.before.data();
  const data = event.data?.after.data();
  if (!data) {
    if (!before) {
      return;
    }

    const churchId = extractString(before.scopeType) === 'network' ? 'network' : extractString(before.churchId);
    if (!churchId) {
      return;
    }

    const title = extractString(before.title) || 'Church event';
    const startAt = normalizeDate(before.startAt);
    const dateLabel = startAt ? formatEventDateTime(startAt) : 'the scheduled time';
    const targets = await getApprovedDevicesForAudience(churchId);

    await deliverNotification(targets, {
      type: 'event-cancelled',
      title: 'Event cancelled',
      body: `${title} scheduled for ${dateLabel} has been cancelled and removed from the church calendar.`,
      audienceChurchId: churchId,
      data: {
        deepLink: APP_DEEP_LINK,
        eventId: event.params.eventId,
        type: 'event-cancelled',
      },
    });
    return;
  }

  const churchId = extractString(data.scopeType) === 'network' ? 'network' : extractString(data.churchId);
  if (!churchId) {
    return;
  }

  const title = extractString(data.title) || 'Church event';
  const body = extractString(data.description) || 'A new event is available in your church calendar.';
  const targets = await getApprovedDevicesForAudience(churchId);

  await deliverNotification(targets, {
    type: 'event',
    title: before ? 'Church event updated' : title,
    body,
    audienceChurchId: churchId,
    data: {
      deepLink: APP_DEEP_LINK,
      eventId: event.params.eventId,
    },
  });
});

export const notifyOnCommonMeetingCancelled = onDocumentWritten('commonMeetingCancellations/{cancellationId}', async (event) => {
  const before = event.data?.before.data();
  const data = event.data?.after.data();
  if (!data || before) {
    return;
  }

  const churchId = extractString(data.churchId);
  if (!churchId) {
    return;
  }

  const title = extractString(data.title) || 'Common meeting';
  const occurrenceDate = extractString(data.occurrenceDate);
  const parsedDate = occurrenceDate ? new Date(`${occurrenceDate}T12:00:00`) : null;
  const dateLabel = parsedDate && !Number.isNaN(parsedDate.getTime()) ? formatEventDate(parsedDate) : occurrenceDate || 'the selected date';
  const targets = await getApprovedDevicesForAudience(churchId);

  await deliverNotification(targets, {
    type: 'meeting-cancelled',
    title: 'Meeting cancelled',
    body: `${title} on ${dateLabel} has been cancelled and removed from the church calendar.`,
    audienceChurchId: churchId,
    data: {
      deepLink: APP_DEEP_LINK,
      meetingKey: extractString(data.meetingKey),
      occurrenceDate,
      type: 'meeting-cancelled',
    },
  });
});

export const notifyOnChurchSpecificMeetingCancelled = onDocumentWritten('churchSpecificMeetingCancellations/{cancellationId}', async (event) => {
  const before = event.data?.before.data();
  const data = event.data?.after.data();
  if (!data || before) {
    return;
  }

  const churchId = extractString(data.churchId);
  if (!churchId) {
    return;
  }

  const title = extractString(data.title) || 'Church meeting';
  const occurrenceDate = extractString(data.occurrenceDate);
  const parsedDate = occurrenceDate ? new Date(`${occurrenceDate}T12:00:00`) : null;
  const dateLabel = parsedDate && !Number.isNaN(parsedDate.getTime()) ? formatEventDate(parsedDate) : occurrenceDate || 'the selected date';
  const targets = await getApprovedDevicesForAudience(churchId);

  await deliverNotification(targets, {
    type: 'meeting-cancelled',
    title: 'Meeting cancelled',
    body: `${title} on ${dateLabel} has been cancelled and removed from the church calendar.`,
    audienceChurchId: churchId,
    data: {
      deepLink: APP_DEEP_LINK,
      meetingKey: extractString(data.meetingKey),
      occurrenceDate,
      type: 'meeting-cancelled',
    },
  });
});

export const notifyUpcomingMeetings = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'Europe/Berlin',
    region: 'europe-west3',
  },
  async () => {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 9 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 10 * 60 * 1000 + 59 * 1000);
    const dateKeys = Array.from(new Set([formatDateKey(windowStart), formatDateKey(windowEnd)]));

    const [churches, cancellationMaps, eventReminders] = await Promise.all([
      getChurchRecords(),
      getCancellationMaps(dateKeys),
      getUpcomingPublishedEventReminders(windowStart, windowEnd),
    ]);

    const recurringReminders = buildRecurringMeetingReminders(
      churches,
      windowStart,
      windowEnd,
      cancellationMaps.common,
      cancellationMaps.churchSpecific,
    );

    const reminders = [...eventReminders, ...recurringReminders];

    for (const reminder of reminders) {
      const lockAcquired = await acquireReminderLock(reminder.reminderKey);
      if (!lockAcquired) {
        continue;
      }

      const targets = await getApprovedDevicesForAudience(reminder.audienceChurchId);
      await deliverNotification(targets, {
        type: 'meeting-reminder',
        title: reminder.title,
        body: reminder.body,
        audienceChurchId: reminder.audienceChurchId,
        data: reminder.data,
      });
    }
  },
);

export const cleanupExpiredContent = onSchedule(
  {
    schedule: 'every day 03:15',
    timeZone: 'Europe/Berlin',
    region: 'europe-west3',
  },
  async () => {
    const now = new Date();
    const oldReminderCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const oldNotificationCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oldEventCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oldOccurrenceDateCutoff = formatDateKey(oldEventCutoff);

    const [
      expiredAnnouncementsSnapshot,
      oldEventsSnapshot,
      oldReminderSnapshot,
      oldNotificationSnapshot,
      oldCommonCancellationSnapshot,
      oldChurchSpecificCancellationSnapshot,
    ] = await Promise.all([
      firestore.collection('announcements').where('visibleUntilAt', '<=', Timestamp.fromDate(now)).get(),
      firestore.collection('events').where('endAt', '<', Timestamp.fromDate(oldEventCutoff)).get(),
      firestore.collection('notificationReminders').where('createdAt', '<', Timestamp.fromDate(oldReminderCutoff)).get(),
      firestore.collection('notifications').where('createdAt', '<', Timestamp.fromDate(oldNotificationCutoff)).get(),
      firestore.collection('commonMeetingCancellations').where('occurrenceDate', '<', oldOccurrenceDateCutoff).get(),
      firestore.collection('churchSpecificMeetingCancellations').where('occurrenceDate', '<', oldOccurrenceDateCutoff).get(),
    ]);

    const [
      expiredAnnouncementsDeleted,
      oldEventsDeleted,
      oldRemindersDeleted,
      oldNotificationsDeleted,
      oldCommonCancellationsDeleted,
      oldChurchSpecificCancellationsDeleted,
    ] = await Promise.all([
      deleteSnapshotDocs(expiredAnnouncementsSnapshot),
      deleteSnapshotDocs(oldEventsSnapshot),
      deleteSnapshotDocs(oldReminderSnapshot),
      deleteSnapshotDocs(oldNotificationSnapshot),
      deleteSnapshotDocs(oldCommonCancellationSnapshot),
      deleteSnapshotDocs(oldChurchSpecificCancellationSnapshot),
    ]);

    logger.info('Expired content cleanup completed', {
      expiredAnnouncementsDeleted,
      oldEventsDeleted,
      oldRemindersDeleted,
      oldNotificationsDeleted,
      oldCommonCancellationsDeleted,
      oldChurchSpecificCancellationsDeleted,
    });
  },
);
