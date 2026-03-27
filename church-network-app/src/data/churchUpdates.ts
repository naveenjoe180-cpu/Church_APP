import { networkChurches } from './prototype';

export type ChurchAnnouncement = {
  id: string;
  churchId: string;
  title: string;
  body: string;
  publishedAt: string;
  publishedBy: string;
  audienceLabel: string;
  isPublic: boolean;
};

export type ChurchEventItem = {
  id: string;
  churchId: string;
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  teamName?: string;
  isPublic: boolean;
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

export const mockAnnouncements: ChurchAnnouncement[] = networkChurches.flatMap((church, index) => [
  {
    id: `${church.id}-announcement-1`,
    churchId: church.id,
    title: `${church.displayCity} weekly church update`,
    body: `This week's focus includes prayer after service, ministry follow-up, and a reminder that the main gathering starts ${church.serviceTimes}.`,
    publishedAt: buildIsoDate(-(index + 1), 19, 0),
    publishedBy: 'Church office',
    audienceLabel: 'All approved members',
    isPublic: false,
  },
  {
    id: `${church.id}-announcement-2`,
    churchId: church.id,
    title: `${church.displayCity} testimony and family prayer evening`,
    body: `Members and volunteers are invited to a short evening of testimonies, prayer, and practical ministry updates for the coming week.`,
    publishedAt: buildIsoDate(-(index + 2), 18, 15),
    publishedBy: 'Pastoral team',
    audienceLabel: 'Members and volunteers',
    isPublic: false,
  },
]);

export const mockEvents: ChurchEventItem[] = networkChurches.flatMap((church, index) => [
  {
    id: `${church.id}-event-1`,
    churchId: church.id,
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
    title: `${church.displayCity} ministry coordination night`,
    description: 'Team leaders and volunteers review church updates, upcoming service roles, and ministry needs.',
    location: church.address,
    startAt: buildIsoDate(index + 3, 19, 0),
    endAt: buildIsoDate(index + 3, 20, 30),
    teamName: 'Team Leaders',
    isPublic: false,
  },
]);

export const mockAssignments: MemberAssignment[] = [
  {
    id: 'assignment-cologne-1',
    churchId: 'cologne',
    teamName: 'Worship Team',
    roleName: 'Lead Vocals',
    serviceDate: buildIsoDate(4, 10, 0).slice(0, 10),
    assignedTo: 'Approved member',
    responseStatus: 'pending',
  },
  {
    id: 'assignment-cologne-2',
    churchId: 'cologne',
    teamName: 'Speakers Team',
    roleName: 'Announcements',
    serviceDate: buildIsoDate(11, 10, 0).slice(0, 10),
    assignedTo: 'Approved member',
    responseStatus: 'accepted',
  },
  {
    id: 'assignment-berlin-1',
    churchId: 'berlin',
    teamName: 'Food Team',
    roleName: 'Food / Fellowship',
    serviceDate: buildIsoDate(4, 11, 0).slice(0, 10),
    assignedTo: 'Approved member',
    responseStatus: 'pending',
  },
];
