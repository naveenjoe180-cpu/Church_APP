import { collection, onSnapshot, query, where } from 'firebase/firestore';

import { firestoreDb } from '../config/firebase';
import { networkChurches, type NetworkChurch } from '../data/prototype';

function normalizeString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function mapChurch(id: string, rawValue: Record<string, unknown>): NetworkChurch {
  const fallbackChurch = networkChurches.find((church) => church.id === id) ?? networkChurches[0];

  return {
    id,
    name: normalizeString(rawValue.name, fallbackChurch?.name ?? id),
    city: normalizeString(rawValue.city, fallbackChurch?.city ?? ''),
    displayCity: normalizeString(rawValue.displayCity, fallbackChurch?.displayCity ?? id),
    address: normalizeString(rawValue.address, fallbackChurch?.address ?? ''),
    serviceTimes: normalizeString(rawValue.serviceTimes, fallbackChurch?.serviceTimes ?? ''),
    googleMapsLabel: normalizeString(rawValue.googleMapsLabel, fallbackChurch?.googleMapsLabel ?? ''),
    contactEmail: normalizeString(rawValue.contactEmail, fallbackChurch?.contactEmail ?? 'info@bethel-pentecostal.org'),
    instagramUrl: normalizeString(rawValue.instagramUrl) || undefined,
    facebookUrl: normalizeString(rawValue.facebookUrl) || undefined,
  };
}

function normalizeChurchReadError(error: unknown) {
  if (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'permission-denied'
  ) {
    return new Error(
      'Firestore blocked the churches list. In the bethelconnect-user project, make sure each churches document includes isPublic: true, or relax the read rule for churches.',
    );
  }

  return error instanceof Error ? error : new Error('Unable to load churches from Firestore.');
}

export function subscribeToChurches(
  onData: (churches: NetworkChurch[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firestoreDb) {
    onData(networkChurches);
    return () => undefined;
  }

  const publicChurchesQuery = query(collection(firestoreDb, 'churches'), where('isPublic', '==', true));

  return onSnapshot(
    publicChurchesQuery,
    (snapshot) => {
      if (snapshot.empty) {
        onData(networkChurches);
        return;
      }

      const churches = snapshot.docs
        .map((item) => mapChurch(item.id, item.data() as Record<string, unknown>))
        .sort((left, right) => left.displayCity.localeCompare(right.displayCity));

      onData(churches);
    },
    (error) => {
      onData(networkChurches);
      onError?.(normalizeChurchReadError(error));
    },
  );
}
