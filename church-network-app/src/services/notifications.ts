import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

import { firebaseApp, firestoreDb, notificationConfig } from '../config/firebase';

export type NotificationRegistrationResult = {
  status: 'enabled' | 'blocked' | 'unsupported' | 'needs-config' | 'error';
  message: string;
};

type RegistrationContext = {
  uid: string;
  email: string;
  displayName: string;
  churchId: string;
  approvalStatus: 'pending' | 'approved' | 'rejected' | 'profile';
};

function buildDeviceId(channel: 'expo', token: string) {
  const normalized = `${channel}:${token}`;
  let hash = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(index)) | 0;
  }

  return `${channel}-${Math.abs(hash).toString(36)}`;
}

async function upsertNotificationDevice(
  context: RegistrationContext,
  payload: {
    channel: 'expo';
    token: string;
    permissionState: string;
    deviceLabel: string;
  },
) {
  if (!firestoreDb) {
    return;
  }

  await setDoc(
    doc(firestoreDb, 'notificationDevices', buildDeviceId(payload.channel, payload.token)),
    {
      userId: context.uid,
      email: context.email,
      displayName: context.displayName,
      churchIds: context.churchId ? [context.churchId] : [],
      approvalStatus: context.approvalStatus,
      channel: payload.channel,
      token: payload.token,
      permissionState: payload.permissionState,
      deviceLabel: payload.deviceLabel,
      enabled: true,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    },
    { merge: true },
  );
}

async function registerExpoNotifications(context: RegistrationContext): Promise<NotificationRegistrationResult> {
  if (!notificationConfig.expoProjectId) {
    return { status: 'needs-config', message: 'Add EXPO_PUBLIC_EXPO_PROJECT_ID before enabling mobile push notifications.' };
  }

  const Device = await import('expo-device');
  const Notifications = await import('expo-notifications');

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (!Device.isDevice) {
    return { status: 'unsupported', message: 'Push notifications need a physical device when testing the Expo mobile app.' };
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  const permissionStatus = existingStatus === 'granted'
    ? existingStatus
    : (await Notifications.requestPermissionsAsync()).status;

  if (permissionStatus !== 'granted') {
    return { status: 'blocked', message: 'Mobile notification permission is blocked. Enable it on the device to receive assignment and approval alerts.' };
  }

  const expoToken = await Notifications.getExpoPushTokenAsync({
    projectId: notificationConfig.expoProjectId,
  });

  await upsertNotificationDevice(context, {
    channel: 'expo',
    token: expoToken.data,
    permissionState: permissionStatus,
    deviceLabel: `${Platform.OS} device`,
  });

  return { status: 'enabled', message: 'Mobile push notifications are enabled for this device.' };
}

export async function registerMemberNotifications(context: RegistrationContext) {
  if (!firebaseApp || !firestoreDb) {
    return { status: 'needs-config', message: 'Firebase is not configured for notifications in this app.' } satisfies NotificationRegistrationResult;
  }

  if (Platform.OS === 'web') {
    return {
      status: 'unsupported',
      message: '',
    } satisfies NotificationRegistrationResult;
  }

  const normalizedContext = {
    ...context,
    churchId: context.churchId.trim(),
  };
  return registerExpoNotifications(normalizedContext);
}
