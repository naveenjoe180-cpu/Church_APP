import { collection, onSnapshot } from 'firebase/firestore';

import { firestoreDb } from '../config/firebase';
import { churches as fallbackChurches } from '../data/mockData';
import type { Church } from '../types';

const defaultChurchTeams = ['Sunday School Team', 'Worship Team', 'Speakers Team', 'Food Team', 'Tech Team'];

function normalizeString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function ensureBethelPrefix(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return trimmedValue;
  }

  return /^bethel\s+/i.test(trimmedValue) ? trimmedValue : `Bethel ${trimmedValue}`;
}

function normalizeNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeTeams(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function mergeTeams(primary: string[], secondary: string[]) {
  const seen = new Set<string>();
  const merged: string[] = [];

  [...primary, ...secondary].forEach((team) => {
    const normalizedKey = team.trim().toLowerCase();
    if (!normalizedKey || seen.has(normalizedKey)) {
      return;
    }

    seen.add(normalizedKey);
    merged.push(team.trim());
  });

  return merged;
}

function mapChurch(id: string, rawValue: Record<string, unknown>): Church {
  const fallbackChurch = fallbackChurches.find((church) => church.id === id) ?? fallbackChurches[0];

  return {
    id,
    name: ensureBethelPrefix(normalizeString(rawValue.name, fallbackChurch?.name ?? id)),
    city: normalizeString(rawValue.city, fallbackChurch?.city ?? ''),
    displayCity: ensureBethelPrefix(normalizeString(rawValue.displayCity, fallbackChurch?.displayCity ?? id)),
    address: normalizeString(rawValue.address, fallbackChurch?.address ?? ''),
    admins: normalizeNumber(rawValue.admins, fallbackChurch?.admins ?? 0),
    members: normalizeNumber(rawValue.members, fallbackChurch?.members ?? 0),
    serviceTimes: normalizeString(rawValue.serviceTimes, fallbackChurch?.serviceTimes ?? ''),
    sharedDrivePath: normalizeString(rawValue.sharedDrivePath, fallbackChurch?.sharedDrivePath ?? ''),
    googleMapsLabel: normalizeString(rawValue.googleMapsLabel, fallbackChurch?.googleMapsLabel ?? ''),
    contactEmail: normalizeString(rawValue.contactEmail) || fallbackChurch?.contactEmail,
    contactPhone: normalizeString(rawValue.contactPhone) || fallbackChurch?.contactPhone,
    instagramUrl: normalizeString(rawValue.instagramUrl) || fallbackChurch?.instagramUrl,
    facebookUrl: normalizeString(rawValue.facebookUrl) || fallbackChurch?.facebookUrl,
    teams: mergeTeams(
      defaultChurchTeams,
      mergeTeams(fallbackChurch?.teams ?? [], normalizeTeams(rawValue.teams, fallbackChurch?.teams ?? [])),
    ),
  };
}

export function subscribeToChurches(
  onData: (churches: Church[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firestoreDb) {
    onData(fallbackChurches);
    return () => undefined;
  }

  return onSnapshot(
    collection(firestoreDb, 'churches'),
    (snapshot) => {
      if (snapshot.empty) {
        onData(fallbackChurches);
        return;
      }

      const mappedChurches = snapshot.docs.map((item) => mapChurch(item.id, item.data() as Record<string, unknown>));
      const churchMap = new Map<string, Church>();

      fallbackChurches.forEach((church) => {
        churchMap.set(church.id, church);
      });
      mappedChurches.forEach((church) => {
        const previousChurch = churchMap.get(church.id);
        churchMap.set(church.id, {
          ...(previousChurch ?? church),
          ...church,
          teams: mergeTeams(defaultChurchTeams, mergeTeams(previousChurch?.teams ?? [], church.teams)),
        });
      });

      const churches = Array.from(churchMap.values())
        .sort((left, right) => left.displayCity.localeCompare(right.displayCity));

      onData(churches);
    },
    (error) => {
      onData(fallbackChurches);
      onError?.(error instanceof Error ? error : new Error('Unable to load churches from Firestore.'));
    },
  );
}
