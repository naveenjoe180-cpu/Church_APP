import { networkChurches } from './prototype';

export type ChurchAnnouncement = {
  id: string;
  churchId: string;
  title: string;
  body: string;
  publishedAt: string;
  visibleUntilAt?: string;
  publishedBy: string;
  audienceLabel: string;
  isPublic: boolean;
};

export type ChurchEventItem = {
  id: string;
  churchId: string;
  scopeType?: 'church' | 'network';
  scopeLabel?: string;
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  teamName?: string;
  posterUrl?: string;
  isPublic: boolean;
};

export type ChurchPrayerRequest = {
  id: string;
  churchId: string;
  content: string;
  submittedAt: string;
  submittedByLabel: string;
  isAnonymous: boolean;
  status: 'pending' | 'approved' | 'hidden';
  prayedByCurrentUser?: boolean;
};

export type MemberAssignment = {
  id: string;
  churchId: string;
  teamName: string;
  roleName: string;
  serviceDate: string;
  assignedTo: string;
  assignedUserId?: string;
  duplicateAssignmentIds?: string[];
  responseStatus: 'pending' | 'accepted' | 'declined';
};

function buildIsoDate(offsetDays: number, hours: number, minutes: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

function buildSundayDateKey(offsetWeeks: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  date.setDate(date.getDate() + daysUntilSunday + offsetWeeks * 7);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const dayOfMonth = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
}

function buildAnnouncementVisibleUntil(publishedAt: string, durationDays: number) {
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  date.setDate(date.getDate() + durationDays);
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

export const mockAnnouncements: ChurchAnnouncement[] = networkChurches.flatMap((church, index) => [
  (() => {
    const publishedAt = buildIsoDate(-(index + 1), 19, 0);
    return {
    id: `${church.id}-announcement-1`,
    churchId: church.id,
    title: `${church.displayCity} weekly church update`,
    body: `This week's focus includes prayer after service, ministry follow-up, and a reminder that the main gathering starts ${church.serviceTimes}.`,
    publishedAt,
    visibleUntilAt: buildAnnouncementVisibleUntil(publishedAt, 7),
    publishedBy: 'Church office',
    audienceLabel: 'All approved members',
    isPublic: false,
  };
  })(),
  (() => {
    const publishedAt = buildIsoDate(-(index + 2), 18, 15);
    return {
    id: `${church.id}-announcement-2`,
    churchId: church.id,
    title: `${church.displayCity} testimony and family prayer evening`,
    body: `Members and volunteers are invited to a short evening of testimonies, prayer, and practical ministry updates for the coming week.`,
    publishedAt,
    visibleUntilAt: buildAnnouncementVisibleUntil(publishedAt, 14),
    publishedBy: 'Pastoral team',
    audienceLabel: 'Members and volunteers',
    isPublic: false,
  };
  })(),
]);

export const mockEvents: ChurchEventItem[] = [
  ...networkChurches.flatMap<ChurchEventItem>((church, index) => [
    {
      id: `${church.id}-event-1`,
      churchId: church.id,
      scopeType: 'church',
      scopeLabel: church.displayCity,
      title: `${church.displayCity} Sunday service`,
      description: `Main church gathering for ${church.displayCity} with worship, prayer, and the weekly message.`,
      location: church.address,
      startAt: buildIsoDate(index + 1, 10, 0),
      endAt: buildIsoDate(index + 1, 12, 0),
      isPublic: true,
    },
    {
      id: `${church.id}-event-2`,
      churchId: church.id,
      scopeType: 'church',
      scopeLabel: church.displayCity,
      title: `${church.displayCity} ministry coordination night`,
      description: 'Team leaders and volunteers review church updates, upcoming service roles, and ministry needs.',
      location: church.address,
      startAt: buildIsoDate(index + 3, 19, 0),
      endAt: buildIsoDate(index + 3, 20, 30),
      teamName: 'Team Leaders',
      isPublic: false,
    },
  ]),
  {
    id: 'network-prayer-night',
    churchId: 'network',
    scopeType: 'network',
    scopeLabel: 'All churches',
    title: 'Germany network prayer night',
    description: 'A shared online prayer gathering for members from every BIPC church location in Germany.',
    location: 'Online network gathering',
    startAt: buildIsoDate(5, 19, 30),
    endAt: buildIsoDate(5, 21, 0),
    isPublic: true,
  },
  {
    id: 'network-leadership-weekend',
    churchId: 'network',
    scopeType: 'network',
    scopeLabel: 'All churches',
    title: 'BIPC Germany leadership weekend',
    description: 'A network-wide weekend for pastors, church admins, team leaders, and ministry volunteers across all churches.',
    location: 'Rotating network host church',
    startAt: buildIsoDate(12, 10, 0),
    endAt: buildIsoDate(12, 16, 0),
    isPublic: false,
  },
];

export const mockAssignments: MemberAssignment[] = [
  {
    id: 'assignment-cologne-1',
    churchId: 'cologne',
    teamName: 'Worship Team',
    roleName: 'Lead Vocals',
    serviceDate: buildSundayDateKey(0),
    assignedTo: 'Approved member',
    responseStatus: 'pending',
  },
  {
    id: 'assignment-cologne-2',
    churchId: 'cologne',
    teamName: 'Speakers Team',
    roleName: 'Announcements',
    serviceDate: buildSundayDateKey(1),
    assignedTo: 'Approved member',
    responseStatus: 'accepted',
  },
  {
    id: 'assignment-berlin-1',
    churchId: 'berlin',
    teamName: 'Food Team',
    roleName: 'Food / Fellowship',
    serviceDate: buildSundayDateKey(0),
    assignedTo: 'Approved member',
    responseStatus: 'pending',
  },
];

export const mockPrayerRequests: ChurchPrayerRequest[] = [
  {
    id: 'prayer-cologne-1',
    churchId: 'cologne',
    content: 'Please pray for healing and wisdom for our family this week.',
    submittedAt: buildIsoDate(-2, 18, 10),
    submittedByLabel: 'Anonymous',
    isAnonymous: true,
    status: 'approved',
  },
  {
    id: 'prayer-cologne-2',
    churchId: 'cologne',
    content: 'Please pray for favour in a job interview and peace during the waiting season.',
    submittedAt: buildIsoDate(-1, 20, 5),
    submittedByLabel: 'Steffi Joseph',
    isAnonymous: false,
    status: 'approved',
  },
  {
    id: 'prayer-berlin-1',
    churchId: 'berlin',
    content: 'Please pray for our youth group and for families travelling this month.',
    submittedAt: buildIsoDate(-3, 17, 45),
    submittedByLabel: 'Anonymous',
    isAnonymous: true,
    status: 'approved',
  },
];
