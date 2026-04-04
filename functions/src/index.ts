import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';

initializeApp();

const firestore = getFirestore();

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

async function getDevicesForUser(userId: string) {
  const snapshot = await firestore
    .collection('notificationDevices')
    .where('userId', '==', userId)
    .where('enabled', '==', true)
    .get();

  return snapshot.docs.map(mapDeviceTarget).filter((target) => Boolean(target.token));
}

async function getApprovedDevicesForChurch(churchId: string) {
  const snapshot = await firestore
    .collection('notificationDevices')
    .where('churchIds', 'array-contains', churchId)
    .where('approvalStatus', '==', 'approved')
    .where('enabled', '==', true)
    .get();

  return snapshot.docs.map(mapDeviceTarget).filter((target) => Boolean(target.token));
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
      deepLink: 'https://bethelconnect-user.web.app',
      approvalStatus: afterStatus,
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
        deepLink: 'https://bethelconnect-user.web.app',
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
  const title = wasAssignedToSameUser ? 'Sunday assignment updated' : 'New Sunday assignment';
  const body = `${roleName} for ${serviceDate} (${teamName || 'church team'}) is now ${responseStatus}.`;

  const targets = await getDevicesForUser(assignedUserId);
  await deliverNotification(targets, {
    type: 'schedule-assignment',
    title,
    body,
    audienceUserId: assignedUserId,
    audienceChurchId: churchId || null,
    data: {
      deepLink: 'https://bethelconnect-user.web.app',
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

  const churchId = extractString(data.scopeChurchId);
  if (!churchId) {
    return;
  }

  const title = extractString(data.title) || 'Church announcement';
  const body = extractString(data.body) || 'A new church announcement is available.';
  const targets = await getApprovedDevicesForChurch(churchId);

  await deliverNotification(targets, {
    type: 'announcement',
    title: before ? 'Church announcement updated' : title,
    body,
    audienceChurchId: churchId,
    data: {
      deepLink: 'https://bethelconnect-user.web.app',
      announcementId: event.params.announcementId,
    },
  });
});

export const notifyOnEventPublished = onDocumentWritten('events/{eventId}', async (event) => {
  const before = event.data?.before.data();
  const data = event.data?.after.data();
  if (!data) {
    return;
  }

  const churchId = extractString(data.churchId);
  if (!churchId) {
    return;
  }

  const title = extractString(data.title) || 'Church event';
  const body = extractString(data.description) || 'A new event is available in your church calendar.';
  const targets = await getApprovedDevicesForChurch(churchId);

  await deliverNotification(targets, {
    type: 'event',
    title: before ? 'Church event updated' : title,
    body,
    audienceChurchId: churchId,
    data: {
      deepLink: 'https://bethelconnect-user.web.app',
      eventId: event.params.eventId,
    },
  });
});
