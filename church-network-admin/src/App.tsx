import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';

import { firebaseConfigStatus, firestoreDb, isFirebaseConfigured } from './config/firebase';
import {
  addChurchTeam,
  cancelCommonMeetingOccurrence,
  cancelChurchSpecificMeetingOccurrence,
  createChurchLocation,
  createManagedMember,
  createVolunteerAssignment,
  deleteAnnouncement,
  deleteManagedMember,
  deleteEvent,
  deletePrayerRequest,
  deleteVolunteerAssignment,
  publishAnnouncement,
  publishEvent,
  removeChurchTeam,
  subscribeToAuditEntries,
  subscribeToAccessRequests,
  subscribeToAnnouncements,
  subscribeToCommonMeetingCancellations,
  subscribeToChurchSpecificMeetingCancellations,
  subscribeToEvents,
  subscribeToMembers,
  subscribeToPrayerRequests,
  subscribeToVolunteerAssignments,
  restoreCommonMeetingOccurrence,
  restoreChurchSpecificMeetingOccurrence,
  updateChurchLocation,
  updateAccessRequestStatus,
  updateMemberAssignments,
  updatePrayerRequestStatus,
  writeAuditEntry,
} from './services/firebaseData';
import { subscribeToChurches } from './services/churches';
import {
  ensureAdminUserProfile,
  onAdminAuthChanged,
  signInAdminWithGoogle,
  signOutAdmin,
  type AdminSession,
} from './services/auth';
import {
  churches as mockChurches,
  roleLabels,
  roleMatrix,
} from './data/mockData';
import type {
  AccessRequest,
  AuditEntry,
  Church,
  ChurchAnnouncement,
  ChurchEventItem,
  MemberRecord,
  PrayerRequest,
  RoleKey,
  VolunteerAssignment,
} from './types';

type ViewKey = 'overview' | 'approvals' | 'memberSetup' | 'members' | 'planning' | 'updates' | 'churches' | 'roles' | 'help';

type CommonMeetingOccurrence = {
  key: string;
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  occurrenceDate: string;
  isCancelled: boolean;
};

type ChurchSpecificMeetingOccurrence = {
  key: string;
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  occurrenceDate: string;
  isCancelled: boolean;
};

type AdminProfile = {
  hasDashboardPermission: boolean;
  roleKey: RoleKey;
  churchIds: string[];
  teamNames: string[];
};

type RoleConfig = {
  id: string;
  teamName: string;
  roleName: string;
  isDefault: boolean;
};

type ServiceActivity = {
  id: string;
  activityName: string;
  teamName: string;
  description: string;
  roleMode: 'allTeamRoles' | 'singleRole';
  roleName?: string;
};

type ServiceRequirement = {
  id: string;
  activityId: string;
  activityName: string;
  teamName: string;
  roleName: string;
};

type PlanningActivityOption = {
  key: string;
  label: string;
  teamName: string;
  activityIds: string[];
};

type PlanningDraftItem = {
  assignedTo: string;
  assignedUserId?: string;
};

type ManagedMemberForm = {
  fullName: string;
  email: string;
  roleKey: RoleKey;
  teamNames: string[];
};

type EventWindowFilter = 'thisWeek' | 'nextWeek' | 'all';

type ChurchEditDraft = {
  name: string;
  city: string;
  displayCity: string;
  address: string;
  serviceTimes: string;
  sharedDrivePath: string;
  googleMapsLabel: string;
  contactEmail: string;
  contactPhone: string;
  instagramUrl: string;
  facebookUrl: string;
};

type AnnouncementVisibilityMode = '7days' | '14days' | '30days' | 'untilDate';

type ArchivedServicePlan = {
  serviceDate: string;
  activities: Array<{
    activityName: string;
    teamName: string;
    roles: Array<{
      roleName: string;
      assignments: Array<{
        assignedTo: string;
        assignedUserId?: string;
        responseStatus: VolunteerAssignment['responseStatus'];
      }>;
    }>;
  }>;
};

const navigation = [
  { key: 'overview', label: 'Overview' },
  { key: 'approvals', label: 'Approval Queue' },
  { key: 'memberSetup', label: 'Add Members and Teams' },
  { key: 'members', label: 'Manage Members' },
  { key: 'planning', label: 'Team Planning' },
  { key: 'updates', label: 'Announcements and Events' },
  { key: 'churches', label: 'Churches And Teams' },
  { key: 'roles', label: 'Role Matrix' },
  { key: 'help', label: 'Help' },
] as const;

const elevatedMemberRoleOptions: RoleKey[] = ['member', 'volunteer', 'teamLeader', 'pastor', 'churchAdmin'];
const pastorManagedRoleOptions: RoleKey[] = ['member', 'volunteer', 'teamLeader'];

const viewTitle: Record<ViewKey, string> = {
  overview: 'Overview',
  approvals: 'Approval Queue',
  memberSetup: 'Add Members and Teams',
  members: 'Manage Members',
  planning: 'Team Planning',
  updates: 'Announcements and Events',
  churches: 'Churches And Teams',
  roles: 'Role Matrix',
  help: 'Help',
};

const viewSummary: Record<ViewKey, string> = {
  overview: 'Track church readiness, member activity, ministry planning, and urgent actions from one shared control room.',
  approvals: 'Review new requests church by church and keep onboarding clear for local admins and leaders.',
  memberSetup: 'Create managed member profiles and shape the team structure for the selected church.',
  members: 'Manage approved members, their effective role, and the teams they serve in for each church.',
  planning: 'Shape Sunday service flow, assign one person per role, and archive completed Sundays for later review.',
  updates: 'Publish local announcements and manage church-specific and common events for the selected church.',
  churches: 'Add church locations, keep church details current, and review each church team structure.',
  roles: 'Review the permission model for super admins, church admins, pastors, team leaders, volunteers, and members.',
  help: 'Understand how the admin workspace works, what each section controls, and the safest workflows for daily church operations.',
};

const adminHelpSections = [
  {
    kicker: 'Getting started',
    title: 'What this admin dashboard is for',
    body: 'Bethel Admin Connect is the operating workspace for church onboarding, member management, Sunday planning, prayer moderation, announcements, events, and church setup. Everything follows the selected church scope unless you are working with a common network event.',
    bullets: [
      'Use Overview for a quick operational picture of the selected church.',
      'Use Approval Queue for new member requests and prayer moderation when your role includes approval rights.',
      'Use Add Members and Teams to create managed member profiles and shape team structure if you are a church admin or pastor.',
      'Use Manage Members to manage approved members, roles, teams, and contact details when your role includes member-management rights.',
      'Use Team Planning to plan Sunday service roles, assign one person per role, and review archived Sundays.',
      'Use Announcements and Events to publish communication and manage church-specific or common events.',
      'Use Churches And Teams only as a super admin to maintain church contact details, meeting times, and ministry structure.',
    ],
  },
  {
    kicker: 'Daily workflow',
    title: 'Recommended order for normal admin work',
    body: 'A clean daily workflow keeps the system accurate and avoids duplicate work.',
    bullets: [
      'Start in Overview to check the next upcoming event, approvals waiting, prayer requests, and member follow-up.',
      'Open Approval Queue next to review new access requests and prayer requests that need moderation if your role includes that section.',
      'Move to Add Members and Teams or Manage Members to confirm approved people have the correct role, team access, and contact information.',
      'Use Team Planning to confirm Sunday assignments and archive history.',
      'Finish in Announcements and Events to publish updates, meetings, and event changes for members.',
    ],
  },
  {
    kicker: 'Approvals',
    title: 'How approvals and prayer moderation work',
    body: 'Approval Queue combines onboarding and moderated prayer flow so admins can handle both in one place.',
    bullets: [
      'Access requests are routed by the church selected by the member in the user app.',
      'Approving a request creates approved member access. Role elevation can then be handled in Manage Members.',
      'Prayer requests appear in their own moderation tile below approvals.',
      'Super Admins and Church Admins can approve, hide, or remove prayer requests.',
      'Once a prayer request is approved, it appears on the Prayer Wall for members in that church.',
    ],
  },
  {
    kicker: 'Setup',
    title: 'How Add Members and Teams should be used',
    body: 'Add Members and Teams separates structural setup from ongoing member administration so planning stays cleaner.',
    bullets: [
      'Create a managed member profile here when leadership needs to add someone directly instead of waiting for a request flow.',
      'Use Team setup here to add or remove teams and roles used later in Sunday planning.',
      'This section is visible for church admins and pastors, but not for team leaders.',
    ],
  },
  {
    kicker: 'Manage Members',
    title: 'How member management works',
    body: 'Manage Members is the place to maintain approved people after access is granted.',
    bullets: [
      'Use search and filters to narrow members by name, role, team, and readiness.',
      'Use Edit on a member tile to update email, mobile number, role, and team assignments together.',
      'Deleting a member removes their member access, and the app now asks for confirmation before deletion.',
      'Roles control permission level. Teams control planning visibility and service participation.',
      'For security, approval only grants member access by default. Elevated roles should be assigned here intentionally.',
    ],
  },
  {
    kicker: 'Sunday planning',
    title: 'How Sunday planning should be used',
    body: 'Team Planning is designed to assign one person per role for each Sunday activity.',
    bullets: [
      'Set up teams and roles first in Add Members and Teams if your role includes setup rights.',
      'Super admins, church admins, and pastors can change the Sunday service order. Team leaders can plan activities but cannot change the service order.',
      'Open the activity planner for a Sunday and assign one person per role slot.',
      'On mobile, the planner uses a tap-to-assign flow instead of relying on drag and drop.',
      'Team leaders can see a My team members card inside Team Planning so they can plan using people from their own teams.',
      'Confirm activity plan once. The system now prevents duplicate requests for the same person in the same role and shows Activity planned when the current draft is already saved.',
      'Use Archived Sundays to load previous Sundays and review service history.',
    ],
  },
  {
    kicker: 'Updates',
    title: 'How announcements and events are structured',
    body: 'Announcements and Events handles both communication and meetings.',
    bullets: [
      'Announcements can be published for a set duration or until a chosen date.',
      'Expired announcements are automatically hidden from the user app.',
      'Super admins can publish both common Bethel events and church-specific events. Church admins and pastors can publish church-specific events only.',
      'Common events appear across all churches. Church-specific events appear only for the selected church.',
      'Default meetings and Sunday service also flow into the user calendar and can be cancelled per instance when needed.',
      'The lower Church specific events and Common events sections include filters for This week, Next week, and All events.',
      'Published items now use cancel actions, and common published events can only be cancelled by super admins.',
    ],
  },
  {
    kicker: 'Church setup',
    title: 'What belongs in Churches And Teams',
    body: 'Churches And Teams keeps the structural data accurate for both admin and user apps.',
    bullets: [
      'Maintain church name, display city, address, service time, map label, and contact details here.',
      'Social links and support contacts entered here flow into the user app experience.',
      'Team structure in this area supports planning, member assignment, and event scoping.',
      'If the church service time changes, related Sunday service calendar behavior updates from this source.',
      'This section is visible only for super admins.',
    ],
  },
  {
    kicker: 'Permissions',
    title: 'Who can do what',
    body: 'The dashboard behavior depends on the signed-in admin role.',
    bullets: [
      'Super Admin has cross-church visibility and full control.',
      'Church Admin manages approvals, members, planning, events, prayer moderation, and Add Members and Teams for their church.',
      'Pastor now follows the same practical admin privileges as church admin inside the dashboard, except that Churches And Teams remains super-admin only.',
      'Team Leader is limited to planning-related areas for their teams and does not see Approval Queue, Add Members and Teams, or Manage Members.',
      'The Role Matrix page is a reference guide only. Real enforcement is handled by the app logic and Firestore rules.',
    ],
  },
  {
    kicker: 'Good practice',
    title: 'Safe and effective admin habits',
    body: 'A few habits make the workspace much more reliable.',
    bullets: [
      'Use one selected church scope at a time to avoid cross-church confusion.',
      'Review member roles after approval instead of assuming request data is enough.',
      'Avoid repeated clicking on publish or confirm actions while a save is in progress.',
      'Use archive comparison when reusing older Sunday patterns.',
      'Delete outdated announcements and expired event instances to keep the member experience clean.',
      'If something looks stale, refresh the page after major changes so the latest subscription state is visible.',
    ],
  },
] as const;

const defaultTeams = ['Sunday School Team', 'Worship Team', 'Speakers Team', 'Food Team', 'Tech Team'] as const;

const defaultRoleConfigMap: Record<string, string[]> = {
  'Sunday School Team': ['Teacher 1', 'Teacher 2', 'Teacher 3'],
  'Worship Team': ['Worship Leader', 'Vocal 1', 'Vocal 2', 'Vocal 3', 'Keyboard', 'Rhythm Pad', 'Guitar'],
  'Speakers Team': ['Psalm Meditation', 'Announcements', 'Sermon'],
  'Food Team': ['Dish 1', 'Dish 2'],
  'Tech Team': ['Projection', 'Sound'],
};

const defaultServiceOrderBlueprint: Omit<ServiceActivity, 'id'>[] = [
  { activityName: 'Sunday School', teamName: 'Sunday School Team', description: 'Sunday school teachers and children coordination.', roleMode: 'allTeamRoles' },
  { activityName: 'Worship', teamName: 'Worship Team', description: 'Choir, musicians, and worship flow.', roleMode: 'allTeamRoles' },
  { activityName: 'Psalm Meditation', teamName: 'Speakers Team', description: 'Psalm meditation and scripture reflection.', roleMode: 'singleRole', roleName: 'Psalm Meditation' },
  { activityName: 'Announcements', teamName: 'Speakers Team', description: 'Announcements and church communication.', roleMode: 'singleRole', roleName: 'Announcements' },
  { activityName: 'Sermon', teamName: 'Speakers Team', description: 'Main sermon or guest message.', roleMode: 'singleRole', roleName: 'Sermon' },
  { activityName: 'Tech', teamName: 'Tech Team', description: 'Projection and sound support.', roleMode: 'allTeamRoles' },
  { activityName: 'Food & Fellowship', teamName: 'Food Team', description: 'Food service and fellowship support.', roleMode: 'allTeamRoles' },
  { activityName: 'Setup and Team Down', teamName: 'Service Flow', description: 'Setup and tear-down support open to church members.', roleMode: 'singleRole', roleName: 'Setup and Team Down' },
];

const commonMeetingTemplates = [
  {
    key: 'daily-intercessory-prayer',
    title: 'Daily Intercessory Prayer',
    description: 'Shared prayer gathering across Bethel churches in Germany.',
    matchesDay: (dayOfWeek: number) => dayOfWeek !== 0,
    startHour: 6,
    startMinute: 0,
    endHour: 7,
    endMinute: 0,
  },
  {
    key: 'mid-week-meeting',
    title: 'Mid Week Meeting',
    description: 'Weekly Bethel mid-week meeting for worship, Bible teaching, and prayer.',
    matchesDay: (dayOfWeek: number) => dayOfWeek === 3,
    startHour: 19,
    startMinute: 0,
    endHour: 20,
    endMinute: 30,
  },
  {
    key: 'youth-meeting',
    title: 'Youth Meeting',
    description: 'Weekly youth gathering for fellowship, worship, and discipleship.',
    matchesDay: (dayOfWeek: number) => dayOfWeek === 5,
    startHour: 20,
    startMinute: 0,
    endHour: 21,
    endMinute: 30,
  },
] as const;

const churchSpecificMeetingTemplatesByChurch: Record<string, Array<{
  key: string;
  title: string;
  description: string;
  matchesDay: (dayOfWeek: number) => boolean;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}>> = {
  nuremberg: [
    {
      key: 'bible-reading',
      title: 'Bible Reading',
      description: 'A church-specific Bible reading meeting for Nuremberg members.',
      matchesDay: (dayOfWeek: number) => dayOfWeek === 1,
      startHour: 20,
      startMinute: 0,
      endHour: 21,
      endMinute: 0,
    },
    {
      key: 'church-intercessory-prayer',
      title: 'Church Intercessory Prayer',
      description: 'A Nuremberg church intercessory prayer gathering for local church needs and ministry covering.',
      matchesDay: (dayOfWeek: number) => dayOfWeek === 2,
      startHour: 21,
      startMinute: 0,
      endHour: 21,
      endMinute: 30,
    },
  ],
};

const initialManagedMemberForm: ManagedMemberForm = { fullName: '', email: '', roleKey: 'member', teamNames: [] };

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function toLocalDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildAnnouncementVisibleUntilAt(mode: AnnouncementVisibilityMode, untilDate: string) {
  const now = new Date();

  if (mode === 'untilDate') {
    if (!untilDate) {
      return undefined;
    }

    const targetDate = new Date(`${untilDate}T23:59:59`);
    return Number.isNaN(targetDate.getTime()) ? undefined : targetDate.toISOString();
  }

  const durationDays = mode === '14days' ? 14 : mode === '30days' ? 30 : 7;
  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() + durationDays);
  targetDate.setHours(23, 59, 59, 999);
  return targetDate.toISOString();
}

function isAnnouncementActive(announcement: ChurchAnnouncement) {
  if (!announcement.visibleUntilAt) {
    return true;
  }

  const visibleUntil = new Date(announcement.visibleUntilAt).getTime();
  if (Number.isNaN(visibleUntil)) {
    return true;
  }

  return visibleUntil >= Date.now();
}

function formatAnnouncementVisibleUntil(value?: string) {
  if (!value) {
    return 'Active until removed';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Active until removed';
  }

  return `Visible until ${date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })}`;
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function mergeTeams(primary: string[], secondary: string[]) {
  const seen = new Set<string>();
  const merged: string[] = [];
  [...primary, ...secondary].forEach((teamName) => {
    const normalized = teamName.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    merged.push(teamName.trim());
  });
  return merged;
}

function orderTeamsByRoleCount(teamNames: string[], roleConfigs: RoleConfig[]) {
  const counts = roleConfigs.reduce<Record<string, number>>((accumulator, role) => {
    accumulator[role.teamName] = (accumulator[role.teamName] ?? 0) + 1;
    return accumulator;
  }, {});

  const defaultRank = new Map<string, number>((defaultTeams as readonly string[]).map((teamName, index) => [teamName, index]));

  return [...teamNames].sort((left, right) => {
    const countDifference = (counts[right] ?? 0) - (counts[left] ?? 0);
    if (countDifference !== 0) {
      return countDifference;
    }

    const leftRank = defaultRank.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = defaultRank.get(right) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.localeCompare(right);
  });
}

function getDefaultRoleConfigs(churchId: string) {
  return Object.entries(defaultRoleConfigMap).flatMap(([teamName, roleNames]) =>
    roleNames.map((roleName) => ({
      id: `${churchId}-${slugify(teamName)}-${slugify(roleName)}`,
      teamName,
      roleName,
      isDefault: true,
    })),
  );
}

function getDefaultServiceOrder(churchId: string) {
  return defaultServiceOrderBlueprint.map((activity) => ({
    ...activity,
    id: `${churchId}-${slugify(activity.activityName)}`,
  }));
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return new Date(value);
  }

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function normalizeLegacySundayDateKey(value: string) {
  const date = parseDateKey(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  // Older builds stored local Sundays via UTC serialization, which shifted them back to Saturday in Europe/Berlin.
  if (date.getDay() === 6) {
    const shiftedDate = new Date(date);
    shiftedDate.setDate(shiftedDate.getDate() + 1);
    return formatDateKey(shiftedDate);
  }

  return formatDateKey(date);
}

function countArchivedAssignments(plan: ArchivedServicePlan) {
  return plan.activities.reduce((activityTotal, activity) => activityTotal + activity.roles.reduce(
    (roleTotal, role) => roleTotal + role.assignments.length,
    0,
  ), 0);
}

function getArchiveAssignmentPriority(responseStatus: VolunteerAssignment['responseStatus']) {
  switch (responseStatus) {
    case 'accepted':
      return 3;
    case 'pending':
      return 2;
    case 'declined':
      return 1;
    default:
      return 0;
  }
}

function collapseArchiveAssignments(
  assignments: Array<{
    assignedTo: string;
    assignedUserId?: string;
    responseStatus: VolunteerAssignment['responseStatus'];
  }>,
) {
  if (assignments.length <= 1) {
    return assignments;
  }

  const preferredAssignment = assignments.reduce((best, current) => {
    if (!best) {
      return current;
    }

    const currentPriority = getArchiveAssignmentPriority(current.responseStatus);
    const bestPriority = getArchiveAssignmentPriority(best.responseStatus);
    return currentPriority >= bestPriority ? current : best;
  }, assignments[0]);

  return preferredAssignment ? [preferredAssignment] : [];
}

function normalizeArchivedPlan(plan: ArchivedServicePlan): ArchivedServicePlan {
  return {
    ...plan,
    serviceDate: normalizeLegacySundayDateKey(plan.serviceDate),
    activities: plan.activities.map((activity) => ({
      ...activity,
      roles: activity.roles.map((role) => ({
        ...role,
        assignments: collapseArchiveAssignments(role.assignments),
      })),
    })),
  };
}

function formatServiceDate(value: string) {
  const date = parseDateKey(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function getUpcomingSundayDates(count: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming: string[] = [];
  const cursor = new Date(today);

  while (upcoming.length < count) {
    if (cursor.getDay() === 0) {
      upcoming.push(formatDateKey(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return upcoming;
}

function getPastSundayDates(limit: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const past: string[] = [];
  const cursor = new Date(today);
  cursor.setDate(cursor.getDate() - 1);

  while (past.length < limit) {
    if (cursor.getDay() === 0) {
      past.push(formatDateKey(cursor));
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  return past;
}

function buildUpcomingCommonMeetingOccurrences(
  church: Church,
  cancellationKeys: string[],
  limit: number,
): CommonMeetingOccurrence[] {
  const cancelled = new Set(cancellationKeys);
  const occurrences: CommonMeetingOccurrence[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let dayOffset = 0; dayOffset < 30 && occurrences.length < limit; dayOffset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + dayOffset);
    const occurrenceDate = formatDateKey(date);
    const dayOfWeek = date.getDay();

    commonMeetingTemplates.forEach((template) => {
      if (!template.matchesDay(dayOfWeek) || occurrences.length >= limit) {
        return;
      }

      const startAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), template.startHour, template.startMinute, 0, 0);
      const endAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), template.endHour, template.endMinute, 0, 0);
      occurrences.push({
        key: template.key,
        title: template.title,
        description: template.description,
        location: 'Online',
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        occurrenceDate,
        isCancelled: cancelled.has(`${template.key}:${occurrenceDate}`),
      });
    });
  }

  return occurrences;
}

function buildUpcomingChurchSpecificMeetingOccurrences(
  church: Church,
  cancellationKeys: string[],
  limit: number,
): ChurchSpecificMeetingOccurrence[] {
  const templates = churchSpecificMeetingTemplatesByChurch[church.id] ?? [];
  if (templates.length === 0) {
    return [];
  }

  const cancelled = new Set(cancellationKeys);
  const occurrences: ChurchSpecificMeetingOccurrence[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let dayOffset = 0; dayOffset < 30 && occurrences.length < limit; dayOffset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + dayOffset);
    const occurrenceDate = formatDateKey(date);
    const dayOfWeek = date.getDay();

    templates.forEach((template) => {
      if (!template.matchesDay(dayOfWeek) || occurrences.length >= limit) {
        return;
      }

      const startAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), template.startHour, template.startMinute, 0, 0);
      const endAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), template.endHour, template.endMinute, 0, 0);
      occurrences.push({
        key: template.key,
        title: template.title,
        description: template.description,
        location: 'Online',
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        occurrenceDate,
        isCancelled: cancelled.has(`${template.key}:${occurrenceDate}`),
      });
    });
  }

  return occurrences;
}

function buildNextSundayServiceOccurrence(church: Church): ChurchEventItem {
  const now = new Date();
  const nextSunday = new Date(now);
  const dayOffset = (7 - now.getDay()) % 7;
  nextSunday.setDate(now.getDate() + dayOffset);
  nextSunday.setHours(0, 0, 0, 0);

  const timeMatch = church.serviceTimes.match(/(\d{1,2}):(\d{2})/);
  const startAt = new Date(nextSunday);
  if (timeMatch) {
    startAt.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
  } else {
    startAt.setHours(10, 0, 0, 0);
  }

  if (startAt.getTime() <= now.getTime()) {
    startAt.setDate(startAt.getDate() + 7);
  }

  const endAt = new Date(startAt.getTime() + 150 * 60 * 1000);

  return {
    id: `overview-sunday-service-${church.id}-${formatDateKey(startAt)}`,
    churchId: church.id,
    scopeType: 'church',
    scopeLabel: church.displayCity,
    title: 'Sunday Service',
    description: `Weekly Sunday service for ${church.displayCity}.`,
    location: church.address,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    createdBy: 'System',
    isPublic: true,
  };
}

function getRoleConfigStorageKey(churchId: string) {
  return `bethel-admin-role-configs:${churchId}`;
}

function getServiceOrderStorageKey(churchId: string) {
  return `bethel-admin-service-order:${churchId}`;
}

function getArchiveStorageKey(churchId: string) {
  return `bethel-admin-service-archive:${churchId}`;
}

function loadRoleConfigs(churchId: string, churchTeams: string[]) {
  const defaults = getDefaultRoleConfigs(churchId);
  if (typeof window === 'undefined') {
    return defaults;
  }

  try {
    const rawValue = window.localStorage.getItem(getRoleConfigStorageKey(churchId));
    if (!rawValue) {
      return defaults;
    }

    const parsedValue = JSON.parse(rawValue) as RoleConfig[];
    return [...defaults, ...parsedValue.filter((role) => !defaults.some((defaultRole) =>
      defaultRole.teamName.toLowerCase() === role.teamName.toLowerCase()
      && defaultRole.roleName.toLowerCase() === role.roleName.toLowerCase(),
    ))].filter((role) => churchTeams.includes(role.teamName));
  } catch {
    return defaults;
  }
}

function loadServiceOrder(churchId: string) {
  const defaults = getDefaultServiceOrder(churchId);
  if (typeof window === 'undefined') {
    return defaults;
  }

  try {
    const rawValue = window.localStorage.getItem(getServiceOrderStorageKey(churchId));
    if (!rawValue) {
      return defaults;
    }

    const parsedValue = JSON.parse(rawValue) as ServiceActivity[];
    return parsedValue.length > 0 ? parsedValue : defaults;
  } catch {
    return defaults;
  }
}

function loadArchivedPlans(churchId: string) {
  if (typeof window === 'undefined') {
    return [] as ArchivedServicePlan[];
  }

  try {
    const rawValue = window.localStorage.getItem(getArchiveStorageKey(churchId));
    if (!rawValue) {
      return [];
    }
    const parsedValue = JSON.parse(rawValue) as ArchivedServicePlan[];
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    const normalizedPlans = new Map<string, ArchivedServicePlan>();
    parsedValue.forEach((plan) => {
      const normalizedPlan = normalizeArchivedPlan(plan);
      const normalizedDate = normalizedPlan.serviceDate;
      const existingPlan = normalizedPlans.get(normalizedDate);
      if (!existingPlan || countArchivedAssignments(normalizedPlan) >= countArchivedAssignments(existingPlan)) {
        normalizedPlans.set(normalizedDate, normalizedPlan);
      }
    });

    return Array.from(normalizedPlans.values());
  } catch {
    return [];
  }
}

function saveArchivedPlans(churchId: string, plans: ArchivedServicePlan[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getArchiveStorageKey(churchId), JSON.stringify(plans));
}

function getAuditStorageKey(churchId: string) {
  return `bethel-admin-audit:${churchId}`;
}

function loadAuditEntries(churchId: string) {
  if (typeof window === 'undefined') {
    return [] as AuditEntry[];
  }

  try {
    const rawValue = window.localStorage.getItem(getAuditStorageKey(churchId));
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue) as AuditEntry[];
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

function saveAuditEntries(churchId: string, entries: AuditEntry[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getAuditStorageKey(churchId), JSON.stringify(entries));
}

function getHighestRole(roleFlags: Record<string, unknown> | undefined, teamNames: string[]): RoleKey {
  if (roleFlags?.networkSuperAdmin === true) return 'networkSuperAdmin';
  if (roleFlags?.churchAdmin === true) return 'churchAdmin';
  if (roleFlags?.pastor === true) return 'pastor';
  if (roleFlags?.teamLeader === true) return 'teamLeader';
  return teamNames.length > 0 ? 'volunteer' : 'member';
}

function hasDashboardPermissionForRole(roleKey: RoleKey): boolean {
  return roleKey === 'networkSuperAdmin' || roleKey === 'churchAdmin' || roleKey === 'pastor' || roleKey === 'teamLeader';
}

function normalizeMemberRole(selectedRole: RoleKey, teamNames: string[]) {
  if (selectedRole === 'networkSuperAdmin' || selectedRole === 'churchAdmin' || selectedRole === 'pastor' || selectedRole === 'teamLeader') {
    return selectedRole;
  }

  return teamNames.length > 0 ? 'volunteer' : 'member';
}

function teamIsDefault(teamName: string) {
  return defaultTeams.includes(teamName as (typeof defaultTeams)[number]);
}

function getActivityPlanningKey(activityName: string, activityId: string) {
  if (['Psalm Meditation', 'Announcements', 'Sermon'].includes(activityName)) {
    return 'speakers-team-block';
  }

  if (['Tech', 'Setup and Team Down'].includes(activityName)) {
    return 'tech-setup-block';
  }

  return activityId;
}

function buildPlanningActivityOptions(serviceOrder: ServiceActivity[]) {
  const options: PlanningActivityOption[] = [];
  const addedKeys = new Set<string>();

  serviceOrder.forEach((activity) => {
    const key = getActivityPlanningKey(activity.activityName, activity.id);
    if (addedKeys.has(key)) {
      return;
    }

    const groupedActivities = serviceOrder.filter((entry) => getActivityPlanningKey(entry.activityName, entry.id) === key);
    options.push({
      key,
      label:
        key === 'speakers-team-block'
          ? 'Psalm Meditation + Announcements + Sermon'
          : key === 'tech-setup-block'
            ? 'Tech + Setup and Team Down'
            : activity.activityName,
      teamName: groupedActivities.map((entry) => entry.teamName).join(', '),
      activityIds: groupedActivities.map((entry) => entry.id),
    });
    addedKeys.add(key);
  });

  return options;
}

function buildRequirementsForActivities(activities: ServiceActivity[], roleConfigs: RoleConfig[]) {
  return activities.flatMap((activity) => {
    if (activity.roleMode === 'singleRole') {
      return [{
        id: `${activity.id}:${slugify(activity.roleName ?? activity.activityName)}`,
        activityId: activity.id,
        activityName: activity.activityName,
        teamName: activity.teamName,
        roleName: activity.roleName ?? activity.activityName,
      }] satisfies ServiceRequirement[];
    }

    return roleConfigs
      .filter((role) => role.teamName === activity.teamName)
      .map((role) => ({
        id: `${activity.id}:${role.id}`,
        activityId: activity.id,
        activityName: activity.activityName,
        teamName: activity.teamName,
        roleName: role.roleName,
      }));
  });
}

function getAssignmentsForRequirement(assignments: VolunteerAssignment[], serviceDate: string, requirement: ServiceRequirement) {
  return assignments.filter((assignment) =>
    assignment.serviceDate === serviceDate
    && assignment.teamName === requirement.teamName
    && assignment.roleName === requirement.roleName,
  );
}

function buildPlanningConflictSignature(
  assignments: VolunteerAssignment[],
  serviceDate: string,
  requirements: ServiceRequirement[],
) {
  return requirements
    .flatMap((requirement) =>
      assignments
        .filter((assignment) =>
          assignment.serviceDate === serviceDate
          && assignment.teamName === requirement.teamName
          && assignment.roleName === requirement.roleName,
        )
        .map((assignment) => `${requirement.id}:${assignment.id}:${assignment.assignedUserId ?? assignment.assignedTo}:${assignment.responseStatus}`),
    )
    .sort()
    .join('|');
}

function buildPlanningDraftSignature(
  draftAssignments: Record<string, PlanningDraftItem[]>,
  requirements: ServiceRequirement[],
) {
  return requirements
    .flatMap((requirement) =>
      (draftAssignments[requirement.id] ?? []).slice(0, 1).map((item) =>
        `${requirement.id}:${item.assignedUserId ?? item.assignedTo.trim().toLowerCase()}`,
      ),
    )
    .sort()
    .join('|');
}

function getMemberStatusLabel(member: MemberRecord) {
  if (member.approvalStatus !== 'approved') {
    return member.approvalStatus;
  }

  return 'Active';
}

function buildArchivePlan(serviceDate: string, serviceOrder: ServiceActivity[], roleConfigs: RoleConfig[], assignments: VolunteerAssignment[]) {
  const activities = serviceOrder.map((activity) => {
    const roles = buildRequirementsForActivities([activity], roleConfigs).map((requirement) => ({
      roleName: requirement.roleName,
      assignments: collapseArchiveAssignments(
        getAssignmentsForRequirement(assignments, serviceDate, requirement).map((assignment) => ({
          assignedTo: assignment.assignedTo,
          assignedUserId: assignment.assignedUserId,
          responseStatus: assignment.responseStatus,
        })),
      ),
    }));

    return { activityName: activity.activityName, teamName: activity.teamName, roles };
  });

  return activities.some((activity) => activity.roles.some((role) => role.assignments.length > 0))
    ? { serviceDate, activities }
    : null;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildArchiveExportRows(churchLabel: string, plans: ArchivedServicePlan[]) {
  const rows: Array<[string, string, string, string, string, string]> = [];

  plans.forEach((plan) => {
    plan.activities.forEach((activity) => {
      activity.roles.forEach((role) => {
        role.assignments
          .filter((assignment) => assignment.responseStatus !== 'declined')
          .forEach((assignment) => {
            rows.push([
              churchLabel,
              formatServiceDate(plan.serviceDate),
              plan.serviceDate,
              role.roleName,
              assignment.assignedTo,
              assignment.responseStatus,
            ]);
          });
      });
    });
  });

  if (rows.length === 0) {
    rows.push([
      churchLabel,
      'No archived Sunday available',
      '',
      '',
      'No accepted or pending archived assignments were available to export.',
      '',
    ]);
  }

  return rows;
}

function formatArchiveExportWorkbookXml(churchLabel: string, plans: ArchivedServicePlan[]) {
  const headers = ['Church', 'Sunday', 'Date', 'Role', 'Person Assigned', 'Status'];
  const rows = buildArchiveExportRows(churchLabel, plans);

  const headerRowXml = headers
    .map((header) => `<Cell ss:StyleID="HeaderCell"><Data ss:Type="String">${escapeXml(header)}</Data></Cell>`)
    .join('');

  const bodyRowsXml = rows
    .map((row, rowIndex) => {
      const styleId = rowIndex % 2 === 0 ? 'BodyCell' : 'BodyCellAlt';
      return `<Row>${row
        .map((value) => `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`)
        .join('')}</Row>`;
    })
    .join('');

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="TitleCell">
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
   </Borders>
   <Font ss:Bold="1" ss:Size="14" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#173754" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="HeaderCell">
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#2B5B84" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="BodyCell">
   <Alignment ss:Vertical="Top" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
   <Interior ss:Color="#FFFDF8" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="BodyCellAlt">
   <Alignment ss:Vertical="Top" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
   <Interior ss:Color="#F4ECDE" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Archive Export">
  <Table>
   <Column ss:Width="140"/>
   <Column ss:Width="130"/>
   <Column ss:Width="95"/>
   <Column ss:Width="160"/>
   <Column ss:Width="170"/>
   <Column ss:Width="95"/>
   <Row ss:Height="24">
    <Cell ss:MergeAcross="5" ss:StyleID="TitleCell"><Data ss:Type="String">${escapeXml(`${churchLabel} Service Plan Archive`)}</Data></Cell>
   </Row>
   <Row>${headerRowXml}</Row>
   ${bodyRowsXml}
  </Table>
 </Worksheet>
</Workbook>`;
}

function formatDateTimeRange(startAt: string, endAt: string) {
  const startDate = new Date(startAt);
  const endDate = new Date(endAt);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return startAt;
  }

  const dayLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(startDate);
  const startTime = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(startDate);
  const endTime = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(endDate);

  return `${dayLabel} | ${startTime} - ${endTime}`;
}

function getWeekWindow(filter: EventWindowFilter, referenceDate = new Date()) {
  if (filter === 'all') {
    return null;
  }

  const weekStart = new Date(referenceDate);
  weekStart.setHours(0, 0, 0, 0);
  const day = weekStart.getDay();
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + offsetToMonday + (filter === 'nextWeek' ? 7 : 0));

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return { start: weekStart.getTime(), end: weekEnd.getTime() };
}

function matchesEventWindow(startAt: string, filter: EventWindowFilter) {
  const window = getWeekWindow(filter);
  if (!window) {
    return true;
  }

  const eventStart = new Date(startAt).getTime();
  return Number.isFinite(eventStart) && eventStart >= window.start && eventStart < window.end;
}

function getAccessRequestRecencyValue(request: AccessRequest) {
  const parsedRequestedAt = Date.parse(request.requestedAt);
  if (!Number.isNaN(parsedRequestedAt)) {
    return parsedRequestedAt;
  }

  if (request.status === 'pending') {
    return Number.MAX_SAFE_INTEGER;
  }

  if (request.status === 'approved') {
    return Number.MAX_SAFE_INTEGER - 1;
  }

  if (request.status === 'rejected') {
    return Number.MAX_SAFE_INTEGER - 2;
  }

  return 0;
}

function readPosterFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Unable to read the selected poster file.'));
    };
    reader.onerror = () => reject(new Error('Unable to read the selected poster file.'));
    reader.readAsDataURL(file);
  });
}

function App() {
  const configuredCount = firebaseConfigStatus.filter((item) => item.configured).length;
  const [activeView, setActiveView] = useState<ViewKey>('overview');
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile>({
    hasDashboardPermission: !isFirebaseConfigured,
    roleKey: !isFirebaseConfigured ? 'networkSuperAdmin' : 'member',
    churchIds: !isFirebaseConfigured ? mockChurches.map((church) => church.id) : [],
    teamNames: [],
  });
  const [authError, setAuthError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isResolvingAdminProfile, setIsResolvingAdminProfile] = useState(false);
  const [churches, setChurches] = useState<Church[]>(mockChurches);
  const [selectedChurchId, setSelectedChurchId] = useState('');
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>([]);
  const [announcements, setAnnouncements] = useState<ChurchAnnouncement[]>([]);
  const [events, setEvents] = useState<ChurchEventItem[]>([]);
  const [commonMeetingCancellationKeys, setCommonMeetingCancellationKeys] = useState<string[]>([]);
  const [churchSpecificMeetingCancellationKeys, setChurchSpecificMeetingCancellationKeys] = useState<string[]>([]);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [assignments, setAssignments] = useState<VolunteerAssignment[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [rejectionReasonDraft, setRejectionReasonDraft] = useState('');
  const [updateMessage, setUpdateMessage] = useState('');
  const [approvalSearch, setApprovalSearch] = useState('');
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<'all' | AccessRequest['status']>('pending');
  const [approvalRoleFilter, setApprovalRoleFilter] = useState<'all' | RoleKey>('all');
  const [roleConfigsByChurch, setRoleConfigsByChurch] = useState<Record<string, RoleConfig[]>>({});
  const [serviceOrderByChurch, setServiceOrderByChurch] = useState<Record<string, ServiceActivity[]>>({});
  const [managedMemberForm, setManagedMemberForm] = useState<ManagedMemberForm>(initialManagedMemberForm);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberRoleFilter, setMemberRoleFilter] = useState<'all' | RoleKey>('all');
  const [memberTeamFilter, setMemberTeamFilter] = useState<'all' | string>('all');
  const [memberStatusFilter, setMemberStatusFilter] = useState<'all' | 'active' | 'unassigned-team'>('all');
  const [memberSortKey, setMemberSortKey] = useState<'name' | 'role' | 'team' | 'status'>('name');
  const [memberEditId, setMemberEditId] = useState<string | null>(null);
  const [memberEditDrafts, setMemberEditDrafts] = useState<Record<string, { email: string; phoneNumber: string; roleKey: RoleKey; teamNames: string[] }>>({});
  const [newTeamName, setNewTeamName] = useState('');
  const [newRoleForm, setNewRoleForm] = useState<{ teamName: string; roleName: string }>({ teamName: defaultTeams[1], roleName: '' });
  const [expandedTeamName, setExpandedTeamName] = useState<string>('');
  const [selectedPlanningSunday, setSelectedPlanningSunday] = useState(getUpcomingSundayDates(2)[0] ?? '');
  const [planningForm, setPlanningForm] = useState({
    serviceDate: getUpcomingSundayDates(2)[0] ?? '',
    activityKey: '',
    allowOtherMembers: false,
  });
  const [openedPlanningKey, setOpenedPlanningKey] = useState<string | null>(null);
  const [planningDraftAssignments, setPlanningDraftAssignments] = useState<Record<string, PlanningDraftItem[]>>({});
  const [planningGuestInputs, setPlanningGuestInputs] = useState<Record<string, string>>({});
  const [draggedPlanningMemberId, setDraggedPlanningMemberId] = useState<string | null>(null);
  const [selectedPlanningMemberId, setSelectedPlanningMemberId] = useState<string | null>(null);
  const [isCompactAdminView, setIsCompactAdminView] = useState<boolean>(() => (typeof window !== 'undefined' ? window.innerWidth <= 720 : false));
  const [planningBaselineSignature, setPlanningBaselineSignature] = useState('');
  const [expandedActivityKeys, setExpandedActivityKeys] = useState<Record<string, boolean>>({});
  const [isEditingServiceOrder, setIsEditingServiceOrder] = useState(false);
  const [serviceOrderDraft, setServiceOrderDraft] = useState<ServiceActivity[] | null>(null);
  const [archivedPlans, setArchivedPlans] = useState<ArchivedServicePlan[]>([]);
  const [selectedArchiveSunday, setSelectedArchiveSunday] = useState('');
  const [loadedArchivePlan, setLoadedArchivePlan] = useState<ArchivedServicePlan | null>(null);
  const [expandedArchiveActivityKeys, setExpandedArchiveActivityKeys] = useState<Record<string, boolean>>({});
  const archiveDetailRef = useRef<HTMLDivElement | null>(null);
  const activityPlannerRef = useRef<HTMLDivElement | null>(null);
  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    body: '',
    isPublic: false,
    visibilityMode: '7days' as AnnouncementVisibilityMode,
    visibleUntilDate: toLocalDateInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
  });
  const [churchSpecificEventFilter, setChurchSpecificEventFilter] = useState<EventWindowFilter>('all');
  const [commonEventFilter, setCommonEventFilter] = useState<EventWindowFilter>('all');
  const [eventForm, setEventForm] = useState({
    scopeType: 'church' as 'church' | 'network',
    title: '',
    description: '',
    locationMode: 'church' as 'church' | 'online' | 'other',
    location: mockChurches[0]?.address ?? '',
    customLocation: '',
    startAt: '',
    endAt: '',
    posterUrl: '',
    posterFileName: '',
    isPublic: false,
  });
  const [churchForm, setChurchForm] = useState({
    name: '',
    city: '',
    displayCity: '',
    address: '',
    serviceTimes: '',
    sharedDrivePath: '',
    googleMapsLabel: '',
    contactEmail: '',
    contactPhone: '',
    instagramUrl: '',
    facebookUrl: '',
  });
  const [churchEditId, setChurchEditId] = useState<string | null>(null);
  const [churchEditDrafts, setChurchEditDrafts] = useState<Record<string, ChurchEditDraft>>({});
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [isCreatingAssignment, setIsCreatingAssignment] = useState(false);

  const selectedChurch = churches.find((church) => church.id === selectedChurchId) ?? churches[0] ?? null;
  const selectedChurchTeams = useMemo(
    () => selectedChurch ? mergeTeams(defaultTeams as unknown as string[], selectedChurch.teams) : [...defaultTeams],
    [selectedChurch],
  );
  const selectedChurchRoleConfigs = selectedChurch ? roleConfigsByChurch[selectedChurch.id] ?? getDefaultRoleConfigs(selectedChurch.id) : [];
  const orderedSelectedChurchTeams = useMemo(
    () => orderTeamsByRoleCount(selectedChurchTeams, selectedChurchRoleConfigs),
    [selectedChurchRoleConfigs, selectedChurchTeams],
  );
  const selectedChurchServiceOrder = selectedChurch ? serviceOrderByChurch[selectedChurch.id] ?? getDefaultServiceOrder(selectedChurch.id) : [];
  const visibleServiceOrder = isEditingServiceOrder && serviceOrderDraft ? serviceOrderDraft : selectedChurchServiceOrder;
  const scopedRequests = useMemo(
    () => accessRequests.filter((request) =>
      adminProfile.roleKey === 'networkSuperAdmin' || !selectedChurch || request.churchId === selectedChurch.id
    ),
    [accessRequests, adminProfile.roleKey, selectedChurch],
  );
  const scopedPrayerRequests = useMemo(() => prayerRequests.filter((request) => !selectedChurch || request.churchId === selectedChurch.id), [prayerRequests, selectedChurch]);
  const scopedAnnouncements = useMemo(() => announcements.filter((announcement) => !selectedChurch || announcement.churchId === selectedChurch.id), [announcements, selectedChurch]);
  const activeScopedAnnouncements = useMemo(() => scopedAnnouncements.filter(isAnnouncementActive), [scopedAnnouncements]);
  const scopedEvents = useMemo(
    () => events.filter((event) => !selectedChurch || event.churchId === selectedChurch.id || event.scopeType === 'network' || event.churchId === 'network'),
    [events, selectedChurch],
  );
  const isCommonPublishedEvent = (event: ChurchEventItem) =>
    event.scopeType === 'network' || event.churchId === 'network' || event.isPublic === true;
  const scopedCommonEvents = useMemo(
    () => scopedEvents.filter((event) => isCommonPublishedEvent(event)),
    [scopedEvents],
  );
  const scopedChurchSpecificEvents = useMemo(
    () => scopedEvents.filter((event) => !isCommonPublishedEvent(event)),
    [scopedEvents],
  );
  const scopedMembers = useMemo(() => members.filter((member) => !selectedChurch || member.churchId === selectedChurch.id), [members, selectedChurch]);
  const membersWithoutTeamCount = useMemo(
    () => scopedMembers.filter((member) => member.teamNames.length === 0).length,
    [scopedMembers],
  );
  const scopedAssignments = useMemo(() => assignments.filter((assignment) => !selectedChurch || assignment.churchId === selectedChurch.id), [assignments, selectedChurch]);
  const filteredRequests = useMemo(() => {
    const searchTerm = approvalSearch.trim().toLowerCase();
    const latestRequests = Array.from(
      scopedRequests.reduce<Map<string, AccessRequest>>((requestMap, request) => {
        const requestKey = request.uid?.trim() || request.email.trim().toLowerCase() || request.id;
        const existingRequest = requestMap.get(requestKey);
        if (!existingRequest || getAccessRequestRecencyValue(request) >= getAccessRequestRecencyValue(existingRequest)) {
          requestMap.set(requestKey, request);
        }
        return requestMap;
      }, new Map()),
    ).map(([, request]) => request);

    return latestRequests.filter((request) => {
      const matchesSearch = !searchTerm || [request.fullName, request.email, request.note].some((value) => value.toLowerCase().includes(searchTerm));
        const matchesStatus = approvalStatusFilter === 'all' || request.status === approvalStatusFilter;
        const matchesRole = approvalRoleFilter === 'all' || request.requestedRoles.includes(approvalRoleFilter);
        return matchesSearch && matchesStatus && matchesRole;
    }).sort((left, right) => getAccessRequestRecencyValue(right) - getAccessRequestRecencyValue(left));
  }, [approvalRoleFilter, approvalSearch, approvalStatusFilter, scopedRequests]);
  const visibleMemberRecords = useMemo(() => {
    const searchTerm = memberSearch.trim().toLowerCase();
    const nextMembers = scopedMembers.filter((member) => {
      const matchesSearch =
        !searchTerm
        || member.fullName.toLowerCase().includes(searchTerm)
        || member.email.toLowerCase().includes(searchTerm)
        || member.teamNames.some((teamName) => teamName.toLowerCase().includes(searchTerm));
      const matchesRole = memberRoleFilter === 'all' || member.roleKey === memberRoleFilter;
      const matchesTeam = memberTeamFilter === 'all' || member.teamNames.includes(memberTeamFilter);
      const matchesStatus =
        memberStatusFilter === 'all'
        || (memberStatusFilter === 'active' && member.approvalStatus === 'approved')
        || (memberStatusFilter === 'unassigned-team' && member.teamNames.length === 0);
      return matchesSearch && matchesRole && matchesTeam && matchesStatus;
    });

    return [...nextMembers].sort((left, right) => {
      if (memberSortKey === 'role') {
        return roleLabels[left.roleKey].localeCompare(roleLabels[right.roleKey]) || left.fullName.localeCompare(right.fullName);
      }
      if (memberSortKey === 'team') {
        return (left.teamNames[0] ?? '').localeCompare(right.teamNames[0] ?? '') || left.fullName.localeCompare(right.fullName);
      }
      if (memberSortKey === 'status') {
        return getMemberStatusLabel(left).localeCompare(getMemberStatusLabel(right)) || left.fullName.localeCompare(right.fullName);
      }
      return left.fullName.localeCompare(right.fullName);
    });
  }, [memberRoleFilter, memberSearch, memberSortKey, memberStatusFilter, memberTeamFilter, scopedMembers]);
  const selectedRequest =
    filteredRequests.find((request) => request.id === selectedRequestId)
    ?? filteredRequests[0]
    ?? accessRequests.find((request) => request.id === selectedRequestId)
    ?? null;
  useEffect(() => {
    setRejectionReasonDraft(selectedRequest?.rejectionReason ?? '');
  }, [selectedRequest?.id, selectedRequest?.rejectionReason]);
  const canManagePlanningStructure = adminProfile.roleKey === 'networkSuperAdmin' || adminProfile.roleKey === 'churchAdmin' || adminProfile.roleKey === 'pastor';
  const canEditServiceOrder = canManagePlanningStructure;
  const canPlanAllTeams = adminProfile.roleKey === 'networkSuperAdmin' || adminProfile.roleKey === 'churchAdmin' || adminProfile.roleKey === 'pastor';
  const canExportArchive = adminProfile.roleKey === 'networkSuperAdmin' || adminProfile.roleKey === 'churchAdmin' || adminProfile.roleKey === 'pastor';
  const canReviewApprovals = adminProfile.roleKey === 'networkSuperAdmin' || adminProfile.roleKey === 'churchAdmin' || adminProfile.roleKey === 'pastor';
  const canModeratePrayer = adminProfile.roleKey === 'networkSuperAdmin' || adminProfile.roleKey === 'churchAdmin' || adminProfile.roleKey === 'pastor';
  const canManageCommonMeetings = adminProfile.roleKey === 'networkSuperAdmin' || adminProfile.roleKey === 'churchAdmin' || adminProfile.roleKey === 'pastor';
  const canManageMembers = adminProfile.roleKey === 'networkSuperAdmin' || adminProfile.roleKey === 'churchAdmin' || adminProfile.roleKey === 'pastor';
  const canDeleteMembers = adminProfile.roleKey === 'networkSuperAdmin' || adminProfile.roleKey === 'churchAdmin' || adminProfile.roleKey === 'pastor';
  const canEditChurch = adminProfile.roleKey === 'networkSuperAdmin';
  const canPublishUpdates = adminProfile.roleKey === 'networkSuperAdmin' || adminProfile.roleKey === 'churchAdmin' || adminProfile.roleKey === 'pastor';
  const canPublishEvents = adminProfile.roleKey === 'networkSuperAdmin' || adminProfile.roleKey === 'churchAdmin' || adminProfile.roleKey === 'pastor';
  const canPublishCommonEvents = adminProfile.roleKey === 'networkSuperAdmin';
  const updatesPublishNote = canPublishUpdates ? '' : 'Only Church Admin, Pastor, and Super Admin can publish announcements and events.';
  const effectiveEventScopeType = canPublishCommonEvents ? eventForm.scopeType : 'church';
  const canAccessMemberSetup = adminProfile.roleKey === 'networkSuperAdmin' || adminProfile.roleKey === 'churchAdmin' || adminProfile.roleKey === 'pastor';
  const canCancelPublishedEvent = (event: ChurchEventItem) =>
    event.scopeType === 'network' || event.churchId === 'network'
      ? adminProfile.roleKey === 'networkSuperAdmin'
      : canPublishEvents;
  const memberRoleOptions = elevatedMemberRoleOptions;
  const visibleNavigation = useMemo(
    () => navigation.filter((item) => {
      if (adminProfile.roleKey === 'teamLeader' && (item.key === 'approvals' || item.key === 'members')) {
        return false;
      }
      if (item.key === 'churches') {
        return adminProfile.roleKey === 'networkSuperAdmin';
      }
      if (item.key === 'memberSetup') {
        return canAccessMemberSetup;
      }
      return true;
    }),
    [adminProfile.roleKey, canAccessMemberSetup],
  );
  const upcomingPlanningSundays = useMemo(() => getUpcomingSundayDates(2), []);
  const archivedPlanningSundays = useMemo(() => getPastSundayDates(260), []);
  const planningActivityOptions = useMemo(() => buildPlanningActivityOptions(selectedChurchServiceOrder), [selectedChurchServiceOrder]);
  const visiblePlanningActivityOptions = useMemo(() => {
    if (canPlanAllTeams) {
      return planningActivityOptions;
    }

    return planningActivityOptions.filter((option) =>
      option.teamName
        .split(', ')
        .some((teamName) => teamName === 'Service Flow' || adminProfile.teamNames.includes(teamName)),
    );
  }, [adminProfile.teamNames, canPlanAllTeams, planningActivityOptions]);
  const selectedPlanningActivity = useMemo(
    () => visiblePlanningActivityOptions.find((activity) => activity.key === planningForm.activityKey) ?? null,
    [planningForm.activityKey, visiblePlanningActivityOptions],
  );
  const selectedPlanningActivities = useMemo(
    () => selectedChurchServiceOrder.filter((activity) => selectedPlanningActivity?.activityIds.includes(activity.id)),
    [selectedChurchServiceOrder, selectedPlanningActivity],
  );
  const selectedPlanningRequirements = useMemo(
    () => buildRequirementsForActivities(selectedPlanningActivities, selectedChurchRoleConfigs),
    [selectedPlanningActivities, selectedChurchRoleConfigs],
  );
  const visibleMembers = useMemo(() => {
    if (selectedPlanningRequirements.length === 0) {
      return scopedMembers;
    }

    const relevantTeams = new Set(
      selectedPlanningRequirements.filter((requirement) => requirement.teamName !== 'Service Flow').map((requirement) => requirement.teamName),
    );
    if (planningForm.allowOtherMembers || relevantTeams.size === 0) {
      return scopedMembers;
    }

    return scopedMembers.filter((member) => member.teamNames.some((teamName) => relevantTeams.has(teamName)));
  }, [planningForm.allowOtherMembers, scopedMembers, selectedPlanningRequirements]);
  const selectedPlanningMember = useMemo(
    () => visibleMembers.find((member) => member.id === selectedPlanningMemberId) ?? null,
    [selectedPlanningMemberId, visibleMembers],
  );
  const managedTeamMembers = useMemo(
    () => scopedMembers
      .filter((member) => member.teamNames.some((teamName) => adminProfile.teamNames.includes(teamName)))
      .sort((left, right) => left.fullName.localeCompare(right.fullName)),
    [adminProfile.teamNames, scopedMembers],
  );
  const savedPlanningDraftSignature = useMemo(
    () =>
      buildPlanningDraftSignature(
        selectedPlanningRequirements.reduce<Record<string, PlanningDraftItem[]>>((drafts, requirement) => {
          const existingAssignments = getAssignmentsForRequirement(scopedAssignments, planningForm.serviceDate, requirement);
          drafts[requirement.id] = existingAssignments.slice(0, 1).map((assignment) => ({
            assignedTo: assignment.assignedTo,
            assignedUserId: assignment.assignedUserId,
          }));
          return drafts;
        }, {}),
        selectedPlanningRequirements,
      ),
    [planningForm.serviceDate, scopedAssignments, selectedPlanningRequirements],
  );
  const currentPlanningDraftSignature = useMemo(
    () => buildPlanningDraftSignature(planningDraftAssignments, selectedPlanningRequirements),
    [planningDraftAssignments, selectedPlanningRequirements],
  );
  const planningHasAssignments = currentPlanningDraftSignature.length > 0;
  const planningHasUnsavedChanges = currentPlanningDraftSignature !== savedPlanningDraftSignature;
  const suggestionMapByRequirement = useMemo(() => {
    const memberById = new Map(visibleMembers.map((member) => [member.id, member]));
    const archivedSuggestionEntries = archivedPlans
      .flatMap((plan) =>
        plan.activities.flatMap((activity) =>
          activity.roles.flatMap((role) =>
            role.assignments.map((assignment) => ({
              serviceDate: plan.serviceDate,
              teamName: activity.teamName,
              roleName: role.roleName,
              assignedUserId: assignment.assignedUserId,
              assignedTo: assignment.assignedTo,
            })),
          ),
        ),
      );
    const liveSuggestionEntries = scopedAssignments
      .filter((assignment) => assignment.serviceDate !== planningForm.serviceDate)
      .map((assignment) => ({
        serviceDate: assignment.serviceDate,
        teamName: assignment.teamName,
        roleName: assignment.roleName,
        assignedUserId: assignment.assignedUserId,
        assignedTo: assignment.assignedTo,
      }));
    const allSuggestionEntries = [...liveSuggestionEntries, ...archivedSuggestionEntries].sort((left, right) => right.serviceDate.localeCompare(left.serviceDate));

    return selectedPlanningRequirements.reduce<Record<string, MemberRecord[]>>((result, requirement) => {
      const seenMemberIds = new Set<string>();
      const suggestions: MemberRecord[] = [];
      allSuggestionEntries.forEach((entry) => {
        if (
          suggestions.length >= 3
          || entry.teamName !== requirement.teamName
          || entry.roleName !== requirement.roleName
          || !entry.assignedUserId
          || seenMemberIds.has(entry.assignedUserId)
        ) {
          return;
        }
        const member = memberById.get(entry.assignedUserId);
        if (!member) {
          return;
        }
        const canUseMember =
          requirement.teamName === 'Service Flow'
          || planningForm.allowOtherMembers
          || member.teamNames.includes(requirement.teamName);
        if (!canUseMember) {
          return;
        }
        seenMemberIds.add(entry.assignedUserId);
        suggestions.push(member);
      });
      result[requirement.id] = suggestions;
      return result;
    }, {});
  }, [archivedPlans, planningForm.allowOtherMembers, planningForm.serviceDate, scopedAssignments, selectedPlanningRequirements, visibleMembers]);
  const sundayAssignments = useMemo(
    () => scopedAssignments.filter((assignment) => assignment.serviceDate === selectedPlanningSunday),
    [scopedAssignments, selectedPlanningSunday],
  );
  const pendingSundayResponses = useMemo(
    () => sundayAssignments.filter((assignment) => assignment.responseStatus === 'pending').length,
    [sundayAssignments],
  );
  const uncoveredRequirementsCount = useMemo(() => {
    const requirements = buildRequirementsForActivities(selectedChurchServiceOrder, selectedChurchRoleConfigs);
    return requirements.filter((requirement) => getAssignmentsForRequirement(scopedAssignments, selectedPlanningSunday, requirement).length === 0).length;
  }, [scopedAssignments, selectedChurchRoleConfigs, selectedChurchServiceOrder, selectedPlanningSunday]);
  const totalSundayRequirements = useMemo(
    () => buildRequirementsForActivities(selectedChurchServiceOrder, selectedChurchRoleConfigs).length,
    [selectedChurchRoleConfigs, selectedChurchServiceOrder],
  );
  const sundayCoveragePercent = totalSundayRequirements === 0
    ? 100
    : Math.max(0, Math.round(((totalSundayRequirements - uncoveredRequirementsCount) / totalSundayRequirements) * 100));
  const upcomingCommonMeetings = useMemo(
    () => selectedChurch ? buildUpcomingCommonMeetingOccurrences(selectedChurch, commonMeetingCancellationKeys, 12) : [],
    [commonMeetingCancellationKeys, selectedChurch],
  );
  const upcomingChurchSpecificMeetings = useMemo(
    () => selectedChurch ? buildUpcomingChurchSpecificMeetingOccurrences(selectedChurch, churchSpecificMeetingCancellationKeys, 8) : [],
    [churchSpecificMeetingCancellationKeys, selectedChurch],
  );
  const filteredUpcomingChurchSpecificMeetings = useMemo(
    () => upcomingChurchSpecificMeetings.filter((meeting) => matchesEventWindow(meeting.startAt, churchSpecificEventFilter)),
    [churchSpecificEventFilter, upcomingChurchSpecificMeetings],
  );
  const filteredScopedChurchSpecificEvents = useMemo(
    () => scopedChurchSpecificEvents.filter((event) => matchesEventWindow(event.startAt, churchSpecificEventFilter)),
    [churchSpecificEventFilter, scopedChurchSpecificEvents],
  );
  const filteredUpcomingCommonMeetings = useMemo(
    () => upcomingCommonMeetings.filter((meeting) => matchesEventWindow(meeting.startAt, commonEventFilter)),
    [commonEventFilter, upcomingCommonMeetings],
  );
  const filteredScopedCommonEvents = useMemo(
    () => scopedCommonEvents.filter((event) => matchesEventWindow(event.startAt, commonEventFilter)),
    [commonEventFilter, scopedCommonEvents],
  );
  const nextEvent = useMemo(() => {
    if (!selectedChurch) {
      return null;
    }

    const now = Date.now();
    const recurringCandidates: ChurchEventItem[] = [
      buildNextSundayServiceOccurrence(selectedChurch),
      ...upcomingCommonMeetings.filter((meeting) => !meeting.isCancelled).map((meeting) => ({
        id: `common:${meeting.key}:${meeting.occurrenceDate}`,
        churchId: 'network',
        scopeType: 'network' as const,
        scopeLabel: 'Bethel Church',
        title: meeting.title,
        description: meeting.description,
        location: meeting.location,
        startAt: meeting.startAt,
        endAt: meeting.endAt,
        createdBy: 'System',
        isPublic: true,
      })),
      ...upcomingChurchSpecificMeetings.filter((meeting) => !meeting.isCancelled).map((meeting) => ({
        id: `church:${meeting.key}:${meeting.occurrenceDate}`,
        churchId: selectedChurch.id,
        scopeType: 'church' as const,
        scopeLabel: selectedChurch.displayCity,
        title: meeting.title,
        description: meeting.description,
        location: meeting.location,
        startAt: meeting.startAt,
        endAt: meeting.endAt,
        createdBy: 'System',
        isPublic: true,
      })),
    ];

    const seenIds = new Set<string>();
    return [...scopedEvents, ...recurringCandidates]
      .filter((event) => {
        const endAt = new Date(event.endAt).getTime();
        return Number.isNaN(endAt) || endAt >= now;
      })
      .filter((event) => {
        if (seenIds.has(event.id)) {
          return false;
        }
        seenIds.add(event.id);
        return true;
      })
      .sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime())[0] ?? null;
  }, [scopedEvents, selectedChurch, upcomingChurchSpecificMeetings, upcomingCommonMeetings]);
  useEffect(() => {
    if (!visibleNavigation.some((item) => item.key === activeView)) {
      setActiveView('overview');
    }
  }, [activeView, visibleNavigation]);
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateCompactAdminView = () => setIsCompactAdminView(window.innerWidth <= 720);
    updateCompactAdminView();
    window.addEventListener('resize', updateCompactAdminView);
    return () => window.removeEventListener('resize', updateCompactAdminView);
  }, []);
  useEffect(() => {
    return onAdminAuthChanged((session) => {
      setAdminSession(session);
      if (!session && isFirebaseConfigured) {
        setIsResolvingAdminProfile(false);
        setAdminProfile({
          hasDashboardPermission: false,
          roleKey: 'member',
          churchIds: [],
          teamNames: [],
        });
      }
    });
  }, []);

  useEffect(() => {
    if (!adminSession) {
      return;
    }

    let active = true;

    async function loadProfile() {
      if (active) {
        setIsResolvingAdminProfile(true);
      }
      if (!isFirebaseConfigured || !firestoreDb) {
        if (!active) {
          return;
        }
        setAdminProfile({
          hasDashboardPermission: true,
          roleKey: 'networkSuperAdmin',
          churchIds: mockChurches.map((church) => church.id),
          teamNames: defaultTeams as unknown as string[],
        });
        setIsResolvingAdminProfile(false);
        return;
      }

      const session = adminSession;
      if (!session) {
        return;
      }

      await ensureAdminUserProfile(session);
      const snapshot = await getDoc(doc(firestoreDb, 'users', session.uid));
      const data = snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : {};
      const churchAccess = Object.entries((data.churchAccess as Record<string, unknown> | undefined) ?? {})
        .filter(([, enabled]) => enabled === true)
        .map(([churchId]) => churchId);
      const teamAccess = Object.entries((data.teamAccess as Record<string, unknown> | undefined) ?? {})
        .filter(([, enabled]) => enabled === true)
        .map(([teamName]) => teamName);
      const roleKey = getHighestRole(data.roleFlags as Record<string, unknown> | undefined, teamAccess);
      const hasDashboardPermission = hasDashboardPermissionForRole(roleKey);
      if (!active) {
        return;
      }

      if (!hasDashboardPermission) {
        await signOutAdmin();
        if (!active) {
          return;
        }
        setAdminSession(null);
        setAdminProfile({
          hasDashboardPermission: false,
          roleKey: 'member',
          churchIds: [],
          teamNames: [],
        });
        setIsResolvingAdminProfile(false);
        setAuthError('This Google account does not have admin access. Only super admins, church admins, pastors, and team leaders can sign in to Bethel Connect Admin.');
        return;
      }

      setAdminProfile({
        hasDashboardPermission: hasDashboardPermission,
        roleKey,
        churchIds: roleKey === 'networkSuperAdmin' ? mockChurches.map((church) => church.id) : churchAccess,
        teamNames: teamAccess,
      });
      setIsResolvingAdminProfile(false);
    }

    void loadProfile();
    return () => {
      active = false;
    };
  }, [adminSession]);

  useEffect(() => {
    const unsubscribe = subscribeToChurches((nextChurches) => setChurches(nextChurches), () => setChurches(mockChurches));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!selectedChurch) {
      return;
    }

    setRoleConfigsByChurch((current) => ({
      ...current,
      [selectedChurch.id]: loadRoleConfigs(selectedChurch.id, selectedChurchTeams),
    }));
    setServiceOrderByChurch((current) => ({
      ...current,
      [selectedChurch.id]: loadServiceOrder(selectedChurch.id),
    }));
    const storedArchivedPlans = loadArchivedPlans(selectedChurch.id).sort((left, right) => right.serviceDate.localeCompare(left.serviceDate));
    setArchivedPlans(storedArchivedPlans);
    setSelectedArchiveSunday('');
    setLoadedArchivePlan(null);
    setExpandedArchiveActivityKeys({});
    setEventForm((current) => ({
      ...current,
      location: current.locationMode === 'other'
        ? current.location
        : current.locationMode === 'online'
          ? 'Online'
          : selectedChurch.address,
    }));
    setAuditEntries(loadAuditEntries(selectedChurch.id));
  }, [selectedChurch]);

  useEffect(() => {
    setIsEditingServiceOrder(false);
    setServiceOrderDraft(null);
  }, [selectedChurch?.id]);

  useEffect(() => {
    if (!selectedChurch) {
      return;
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(getRoleConfigStorageKey(selectedChurch.id), JSON.stringify(roleConfigsByChurch[selectedChurch.id] ?? getDefaultRoleConfigs(selectedChurch.id)));
      window.localStorage.setItem(getServiceOrderStorageKey(selectedChurch.id), JSON.stringify(serviceOrderByChurch[selectedChurch.id] ?? getDefaultServiceOrder(selectedChurch.id)));
    }
  }, [roleConfigsByChurch, selectedChurch, serviceOrderByChurch]);

  useEffect(() => {
    const activeChurchId = selectedChurch?.id ?? null;
    const accessRequestScopeChurchId = adminProfile.roleKey === 'networkSuperAdmin' ? null : activeChurchId;
    const unsubscribeRequests = subscribeToAccessRequests(accessRequestScopeChurchId, setAccessRequests, () => setAccessRequests([]));
    const unsubscribePrayers = subscribeToPrayerRequests(activeChurchId, setPrayerRequests, () => setPrayerRequests([]));
    const unsubscribeMembers = subscribeToMembers(activeChurchId, setMembers, () => setMembers([]));
    const unsubscribeAnnouncements = activeChurchId
      ? subscribeToAnnouncements(activeChurchId, setAnnouncements, () => setAnnouncements([]))
      : () => undefined;
    const unsubscribeEvents = activeChurchId
      ? subscribeToEvents(activeChurchId, setEvents)
      : () => undefined;
    const unsubscribeCommonMeetingCancellations = activeChurchId
      ? subscribeToCommonMeetingCancellations(activeChurchId, setCommonMeetingCancellationKeys, () => setCommonMeetingCancellationKeys([]))
      : () => undefined;
    const unsubscribeChurchSpecificMeetingCancellations = activeChurchId
      ? subscribeToChurchSpecificMeetingCancellations(activeChurchId, setChurchSpecificMeetingCancellationKeys, () => setChurchSpecificMeetingCancellationKeys([]))
      : () => undefined;
    const unsubscribeAssignments = subscribeToVolunteerAssignments(activeChurchId, null, setAssignments, () => setAssignments([]));

    return () => {
      unsubscribeRequests();
      unsubscribePrayers();
      unsubscribeMembers();
      unsubscribeAnnouncements();
      unsubscribeEvents();
      unsubscribeCommonMeetingCancellations();
      unsubscribeChurchSpecificMeetingCancellations();
      unsubscribeAssignments();
    };
  }, [adminProfile.roleKey, selectedChurch?.id]);

  useEffect(() => {
    if (!selectedChurch?.id) {
      return;
    }

    const unsubscribeAudit = subscribeToAuditEntries(
      selectedChurch.id,
      (entries) => {
        setAuditEntries(entries);
        saveAuditEntries(selectedChurch.id, entries);
      },
      () => setAuditEntries(loadAuditEntries(selectedChurch.id)),
    );

    return () => {
      unsubscribeAudit();
    };
  }, [selectedChurch?.id]);

  useEffect(() => {
    setSelectedRequestIds((current) => current.filter((requestId) => filteredRequests.some((request) => request.id === requestId)));
  }, [filteredRequests]);

  useEffect(() => {
    if (!selectedChurch) {
      return;
    }

    const nextArchivedPlans = archivedPlanningSundays.reduce<ArchivedServicePlan[]>((plans, serviceDate) => {
      const nextPlan = buildArchivePlan(
        serviceDate,
        serviceOrderByChurch[selectedChurch.id] ?? getDefaultServiceOrder(selectedChurch.id),
        roleConfigsByChurch[selectedChurch.id] ?? getDefaultRoleConfigs(selectedChurch.id),
        assignments.filter((assignment) => assignment.churchId === selectedChurch.id),
      );

      if (nextPlan) {
        plans.push(nextPlan);
      }

      return plans;
    }, []);

    const mergedPlans = [
      ...nextArchivedPlans,
      ...loadArchivedPlans(selectedChurch.id).filter((plan) => !nextArchivedPlans.some((nextPlan) => nextPlan.serviceDate === plan.serviceDate)),
    ].sort((left, right) => right.serviceDate.localeCompare(left.serviceDate));

    setArchivedPlans(mergedPlans);
    setSelectedArchiveSunday((current) => mergedPlans.some((plan) => plan.serviceDate === current) ? current : '');
    setLoadedArchivePlan((current) => current ? mergedPlans.find((plan) => plan.serviceDate === current.serviceDate) ?? null : null);
    saveArchivedPlans(selectedChurch.id, mergedPlans);
  }, [archivedPlanningSundays, assignments, roleConfigsByChurch, selectedChurch, serviceOrderByChurch]);

  const allowedChurchIds = adminProfile.roleKey === 'networkSuperAdmin' ? churches.map((church) => church.id) : adminProfile.churchIds;
  const scopeChurchChoices = useMemo(() => {
    if (
      isFirebaseConfigured
      && adminSession
      && adminProfile.roleKey !== 'networkSuperAdmin'
      && adminProfile.churchIds.length === 0
    ) {
      return [];
    }

    return churches.filter((church) => allowedChurchIds.length === 0 || allowedChurchIds.includes(church.id));
  }, [adminProfile.churchIds.length, adminProfile.roleKey, adminSession, allowedChurchIds, churches]);
  const mobileAdminTitle = adminProfile.roleKey === 'networkSuperAdmin'
    ? 'Bethel Connect Admin'
    : selectedChurch?.name ?? 'Bethel Connect Admin';

  useEffect(() => {
    if (!selectedChurchId && scopeChurchChoices[0]?.id) {
      setSelectedChurchId(scopeChurchChoices[0].id);
      return;
    }

    if (selectedChurchId && scopeChurchChoices.length > 0 && !scopeChurchChoices.some((church) => church.id === selectedChurchId)) {
      setSelectedChurchId(scopeChurchChoices[0].id);
    }
  }, [scopeChurchChoices, selectedChurchId]);

  const appendAuditEntry = async (entry: Omit<AuditEntry, 'id' | 'createdAt'>) => {
    if (!selectedChurch) {
      return;
    }

    const localEntry: AuditEntry = {
      ...entry,
      id: createId('audit'),
      createdAt: new Date().toISOString(),
    };

    setAuditEntries((current) => {
      const nextEntries = [localEntry, ...current].slice(0, 120);
      saveAuditEntries(selectedChurch.id, nextEntries);
      return nextEntries;
    });

    if (isFirebaseConfigured) {
      try {
        await writeAuditEntry({
          churchId: entry.churchId,
          entityType: entry.entityType,
          actionLabel: entry.actionLabel,
          targetLabel: entry.targetLabel,
          summary: entry.summary,
          actor: entry.actor,
        });
      } catch {
        // Keep local audit history even if the shared log write fails.
      }
    }
  };

  const toggleRequestSelection = (requestId: string) => {
    setSelectedRequestIds((current) => current.includes(requestId) ? current.filter((id) => id !== requestId) : [...current, requestId]);
  };

  const startChurchEdit = (church: Church) => {
    setChurchEditId(church.id);
    setChurchEditDrafts((current) => ({
      ...current,
      [church.id]: {
        name: church.name,
        city: church.city,
        displayCity: church.displayCity,
        address: church.address,
        serviceTimes: church.serviceTimes,
        sharedDrivePath: church.sharedDrivePath,
        googleMapsLabel: church.googleMapsLabel,
        contactEmail: church.contactEmail ?? '',
        contactPhone: church.contactPhone ?? '',
        instagramUrl: church.instagramUrl ?? '',
        facebookUrl: church.facebookUrl ?? '',
      },
    }));
  };

  const handleSignInWithGoogle = async () => {
    setIsAuthenticating(true);
    setAuthError('');
    try {
      if (!isFirebaseConfigured) {
        setAdminSession({
          uid: 'mock-super-admin',
          email: 'demo@bethelconnect.app',
          displayName: 'Demo Super Admin',
          photoUrl: '',
          providerId: 'demo',
        });
        setAdminProfile({
          hasDashboardPermission: true,
          roleKey: 'networkSuperAdmin',
          churchIds: mockChurches.map((church) => church.id),
          teamNames: defaultTeams as unknown as string[],
        });
        return;
      }

      const session = await signInAdminWithGoogle();
      setAdminSession(session);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to sign in with Google right now.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignOut = async () => {
    await signOutAdmin();
    setAdminSession(null);
    setAuthError('');
  };

  const handleApproveRequest = async (
    nextStatus: 'approved' | 'rejected',
    requestsOverride?: AccessRequest[],
    rejectionReasonOverride?: string,
  ) => {
    if (!canReviewApprovals) {
      setUpdateMessage('Only super admins, church admins, and pastors can review approvals.');
      return;
    }

    const requestsToUpdate = requestsOverride ?? (selectedRequest ? [selectedRequest] : []);
    if (requestsToUpdate.length === 0) {
      return;
    }

    let resolvedRejectionReason = '';
    if (nextStatus === 'rejected') {
      resolvedRejectionReason = (rejectionReasonOverride ?? rejectionReasonDraft).trim();
      if (!resolvedRejectionReason && typeof window !== 'undefined') {
        resolvedRejectionReason = window.prompt('Enter a rejection reason so the member understands what needs to be corrected:', '')?.trim() ?? '';
      }

      if (!resolvedRejectionReason) {
        setUpdateMessage('Add a rejection reason before rejecting the request.');
        return;
      }
    }

    try {
      if (isFirebaseConfigured) {
          await Promise.all(
            requestsToUpdate.map((request) => updateAccessRequestStatus(request, nextStatus, resolvedRejectionReason)),
          );
      }
      const requestIds = new Set(requestsToUpdate.map((request) => request.id));
      setAccessRequests((current) => current.map((request) => requestIds.has(request.id)
        ? {
            ...request,
            status: nextStatus,
            rejectionReason: nextStatus === 'rejected' ? resolvedRejectionReason : undefined,
          }
        : request));
      setSelectedRequestIds([]);
      if (nextStatus === 'approved') {
        setRejectionReasonDraft('');
      }
      const affectedNames = requestsToUpdate.map((request) => request.fullName).join(', ');
      setUpdateMessage(
        nextStatus === 'approved'
          ? `Approved ${requestsToUpdate.length} request${requestsToUpdate.length > 1 ? 's' : ''}: ${affectedNames}.`
          : `Rejected ${requestsToUpdate.length} request${requestsToUpdate.length > 1 ? 's' : ''}: ${affectedNames}.`,
      );
      await Promise.all(
        requestsToUpdate.map((request) => appendAuditEntry({
          churchId: request.churchId,
          entityType: 'approval',
          actionLabel: nextStatus === 'approved' ? 'Approved request' : 'Rejected request',
          targetLabel: request.fullName,
          summary: nextStatus === 'rejected'
            ? `${roleLabels[adminProfile.roleKey]} ${adminSession?.email ?? 'admin'} marked the access request as rejected with a reason for the member.`
            : `${roleLabels[adminProfile.roleKey]} ${adminSession?.email ?? 'admin'} marked the access request as approved.`,
          actor: adminSession?.email ?? 'Church admin',
        })),
      );
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to update the access request.');
    }
  };

  const handleModeratePrayer = async (requestId: string, nextStatus: 'approved' | 'hidden') => {
    if (!canModeratePrayer) {
      setUpdateMessage('Only super admins, church admins, and pastors can moderate prayer requests.');
      return;
    }

    try {
      if (isFirebaseConfigured) {
        await updatePrayerRequestStatus(requestId, nextStatus);
      }
      setPrayerRequests((current) => current.map((request) => request.id === requestId ? { ...request, status: nextStatus } : request));
      setUpdateMessage(`Prayer request ${nextStatus === 'approved' ? 'approved' : 'hidden'}.`);
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to moderate the prayer request.');
    }
  };

  const handleRemovePrayerRequest = async (requestId: string) => {
    if (!canModeratePrayer) {
      setUpdateMessage('Only super admins, church admins, and pastors can remove prayer requests.');
      return;
    }

    try {
      if (isFirebaseConfigured) {
        await deletePrayerRequest(requestId);
      }
      setPrayerRequests((current) => current.filter((request) => request.id !== requestId));
      setUpdateMessage('Prayer request removed.');
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to remove the prayer request.');
    }
  };

  const handleCreateManagedMember = async () => {
    if (!selectedChurch || !canManageMembers) {
      if (!canManageMembers) {
        setUpdateMessage('Only super admins, church admins, and pastors can add managed members.');
      }
      return;
    }

    if (!managedMemberForm.fullName.trim() || !managedMemberForm.email.trim()) {
      setUpdateMessage('Add the member name and email before saving the profile.');
      return;
    }

    try {
      const effectiveRole = normalizeMemberRole(managedMemberForm.roleKey, managedMemberForm.teamNames);
      let memberId = createId('member');
      if (isFirebaseConfigured) {
        memberId = await createManagedMember({
          fullName: managedMemberForm.fullName,
          email: managedMemberForm.email,
          churchId: selectedChurch.id,
          roleKey: effectiveRole,
          teamNames: managedMemberForm.teamNames,
        });
      }
      const nextMember: MemberRecord = {
        id: memberId,
        fullName: managedMemberForm.fullName.trim(),
        email: managedMemberForm.email.trim().toLowerCase(),
        churchId: selectedChurch.id,
        roleKey: effectiveRole,
        teamName: managedMemberForm.teamNames[0] ?? '',
        teamNames: managedMemberForm.teamNames,
        approvalStatus: 'approved',
        phoneVerificationStatus: 'missing',
      };
      setMembers((current) => [...current, nextMember].sort((left, right) => left.fullName.localeCompare(right.fullName)));
      setManagedMemberForm(initialManagedMemberForm);
      setUpdateMessage(`Created a managed member profile for ${selectedChurch.displayCity}.`);
      await appendAuditEntry({
        churchId: selectedChurch.id,
        entityType: 'member',
        actionLabel: 'Created member',
        targetLabel: nextMember.fullName,
        summary: `${adminSession?.email ?? 'Church admin'} created a managed member profile with the ${roleLabels[effectiveRole]} role.`,
        actor: adminSession?.email ?? 'Church admin',
      });
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to create the managed member profile.');
    }
  };

  const handleStartMemberEdit = (member: MemberRecord) => {
    setMemberEditId(member.id);
    setMemberEditDrafts((current) => ({
      ...current,
      [member.id]: {
        email: member.email,
        phoneNumber: member.phoneNumber ?? '',
        roleKey: member.roleKey,
        teamNames: member.teamNames,
      },
    }));
  };

  const handleSaveMemberEdit = async (member: MemberRecord) => {
    if (!canManageMembers) {
      setUpdateMessage('Only super admins, church admins, and pastors can update members.');
      return;
    }
    const draft = memberEditDrafts[member.id];
    if (!draft) {
      return;
    }

    try {
      const normalizedEmail = draft.email.trim().toLowerCase();
      if (!normalizedEmail) {
        setUpdateMessage('Add a valid email address before saving the member.');
        return;
      }
      const effectiveRole = normalizeMemberRole(draft.roleKey, draft.teamNames);
      if (isFirebaseConfigured) {
        await updateMemberAssignments({
          memberId: member.id,
          churchId: member.churchId,
          email: normalizedEmail,
          phoneNumber: draft.phoneNumber,
          roleKey: effectiveRole,
          teamNames: draft.teamNames,
        });
      }
      setMembers((current) =>
        current.map((currentMember) =>
          currentMember.id === member.id
            ? { ...currentMember, email: normalizedEmail, phoneNumber: draft.phoneNumber.trim() || undefined, roleKey: effectiveRole, teamName: draft.teamNames[0] ?? '', teamNames: draft.teamNames }
            : currentMember,
        ),
      );
      setMemberEditId(null);
      setUpdateMessage(`Updated ${member.fullName}.`);
      await appendAuditEntry({
        churchId: member.churchId,
        entityType: 'member',
        actionLabel: 'Updated member',
        targetLabel: member.fullName,
        summary: `${adminSession?.email ?? 'Church admin'} updated the member email, mobile number, role, and team assignments.`,
        actor: adminSession?.email ?? 'Church admin',
      });
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to save the member update.');
    }
  };

  const canDeleteMemberRecord = (member: MemberRecord) => {
    if (!canDeleteMembers || member.id === adminSession?.uid) {
      return false;
    }

    if (adminProfile.roleKey === 'networkSuperAdmin') {
      return true;
    }

    if (adminProfile.roleKey === 'churchAdmin' || adminProfile.roleKey === 'pastor') {
      return member.roleKey !== 'networkSuperAdmin' && member.roleKey !== 'churchAdmin';
    }

    return false;
  };

  const canEditMemberRecord = (member: MemberRecord) => {
    return canManageMembers;
  };

  const handleDeleteMember = async (member: MemberRecord) => {
    if (!canDeleteMembers) {
      setUpdateMessage('Only super admins, church admins, and pastors can delete members.');
      return;
    }

    if (member.id === adminSession?.uid) {
      setUpdateMessage('You cannot delete your own admin profile from the members list.');
      return;
    }

    if (!canDeleteMemberRecord(member)) {
      setUpdateMessage('Church admins and pastors can delete member records, but not church admin or super admin profiles.');
      return;
    }

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`Are you sure you want to delete the member "${member.fullName}"?`);
      if (!confirmed) {
        return;
      }
    }

    try {
      if (isFirebaseConfigured) {
        await deleteManagedMember(member.id);
      }

      setMembers((current) => current.filter((currentMember) => currentMember.id !== member.id));
      setMemberEditDrafts((current) => {
        const nextDrafts = { ...current };
        delete nextDrafts[member.id];
        return nextDrafts;
      });
      if (memberEditId === member.id) {
        setMemberEditId(null);
      }

      setUpdateMessage(`${member.fullName} has been removed and will no longer have member access.`);
      await appendAuditEntry({
        churchId: member.churchId,
        entityType: 'member',
        actionLabel: 'Deleted member',
        targetLabel: member.fullName,
        summary: `${adminSession?.email ?? 'Church admin'} deleted the member profile and removed access to the member area.`,
        actor: adminSession?.email ?? 'Church admin',
      });
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to delete the member.');
    }
  };

  const handleAddTeam = async () => {
    if (!selectedChurch || !canManagePlanningStructure) {
      return;
    }
    const normalizedTeamName = newTeamName.trim();
    if (!normalizedTeamName) {
      setUpdateMessage('Add a team name before saving it.');
      return;
    }

    try {
      if (isFirebaseConfigured) {
        await addChurchTeam(selectedChurch.id, normalizedTeamName);
      }
      setChurches((current) => current.map((church) => church.id === selectedChurch.id ? { ...church, teams: mergeTeams(church.teams, [normalizedTeamName]) } : church));
      setExpandedTeamName(normalizedTeamName);
      setNewTeamName('');
      setUpdateMessage(`Added ${normalizedTeamName}. Its team tile now appears in Team setup and the Sunday service order stays unchanged.`);
      await appendAuditEntry({
        churchId: selectedChurch.id,
        entityType: 'team',
        actionLabel: 'Added team',
        targetLabel: normalizedTeamName,
        summary: `${adminSession?.email ?? 'Church admin'} added a new ministry team.`,
        actor: adminSession?.email ?? 'Church admin',
      });
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to add the team.');
    }
  };

  const handleDeleteTeam = async (teamName: string) => {
    if (!selectedChurch || teamIsDefault(teamName) || !canManagePlanningStructure) {
      return;
    }

    try {
      if (isFirebaseConfigured) {
        await removeChurchTeam(selectedChurch.id, teamName);
      }
      setChurches((current) => current.map((church) => church.id === selectedChurch.id ? { ...church, teams: church.teams.filter((currentTeam) => currentTeam !== teamName) } : church));
      setRoleConfigsByChurch((current) => ({
        ...current,
        [selectedChurch.id]: (current[selectedChurch.id] ?? []).filter((role) => role.teamName !== teamName),
      }));
      setExpandedTeamName('');
      setUpdateMessage(`Removed ${teamName}. Existing assignments stay in history.`);
      await appendAuditEntry({
        churchId: selectedChurch.id,
        entityType: 'team',
        actionLabel: 'Removed team',
        targetLabel: teamName,
        summary: `${adminSession?.email ?? 'Church admin'} removed a custom ministry team from the church setup.`,
        actor: adminSession?.email ?? 'Church admin',
      });
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to remove the team.');
    }
  };

  const handleAddRole = () => {
    if (!selectedChurch || !canManagePlanningStructure) {
      return;
    }
    const normalizedRoleName = newRoleForm.roleName.trim();
    if (!normalizedRoleName || !newRoleForm.teamName) {
      setUpdateMessage('Choose a team and add a role name first.');
      return;
    }

    setRoleConfigsByChurch((current) => {
      const currentRoles = current[selectedChurch.id] ?? getDefaultRoleConfigs(selectedChurch.id);
      if (currentRoles.some((role) => role.teamName.toLowerCase() === newRoleForm.teamName.toLowerCase() && role.roleName.toLowerCase() === normalizedRoleName.toLowerCase())) {
        return current;
      }

      return {
        ...current,
        [selectedChurch.id]: [
          ...currentRoles,
          { id: createId('role'), teamName: newRoleForm.teamName, roleName: normalizedRoleName, isDefault: false },
        ],
      };
    });
    setExpandedTeamName(newRoleForm.teamName);
    setNewRoleForm((current) => ({ ...current, roleName: '' }));
    setUpdateMessage(`Added ${normalizedRoleName} to ${newRoleForm.teamName}.`);
    void appendAuditEntry({
      churchId: selectedChurch.id,
      entityType: 'role',
      actionLabel: 'Added role',
      targetLabel: normalizedRoleName,
      summary: `${adminSession?.email ?? 'Church admin'} added ${normalizedRoleName} to ${newRoleForm.teamName}.`,
      actor: adminSession?.email ?? 'Church admin',
    });
  };

  const handleDeleteRole = (roleId: string) => {
    if (!selectedChurch || !canManagePlanningStructure) {
      return;
    }
    const removedRole = (roleConfigsByChurch[selectedChurch.id] ?? []).find((role) => role.id === roleId);
    if (!removedRole) {
      return;
    }
    setRoleConfigsByChurch((current) => ({
      ...current,
      [selectedChurch.id]: (current[selectedChurch.id] ?? []).filter((role) => role.id !== roleId),
    }));
    setUpdateMessage(`Removed ${removedRole.roleName} from ${removedRole.teamName}.`);
    void appendAuditEntry({
      churchId: selectedChurch.id,
      entityType: 'role',
      actionLabel: 'Removed role',
      targetLabel: removedRole.roleName,
      summary: `${adminSession?.email ?? 'Church admin'} removed ${removedRole.roleName} from ${removedRole.teamName}.`,
      actor: adminSession?.email ?? 'Church admin',
    });
  };

  const handleToggleServiceOrderEditing = async () => {
    if (!selectedChurch || !canEditServiceOrder) {
      return;
    }

    if (!isEditingServiceOrder) {
      setServiceOrderDraft([...selectedChurchServiceOrder]);
      setIsEditingServiceOrder(true);
      setUpdateMessage(`You are editing the Sunday service order for ${selectedChurch.displayCity}. Use Up and Down, then click Done to save.`);
      return;
    }

    const draftOrder = serviceOrderDraft ?? selectedChurchServiceOrder;
    const hasChanged =
      draftOrder.length !== selectedChurchServiceOrder.length
      || draftOrder.some((activity, index) => activity.id !== selectedChurchServiceOrder[index]?.id);

    if (hasChanged) {
      setServiceOrderByChurch((current) => ({ ...current, [selectedChurch.id]: draftOrder }));
      await appendAuditEntry({
        churchId: selectedChurch.id,
        entityType: 'planning',
        actionLabel: 'Updated service order',
        targetLabel: selectedChurch.displayCity,
        summary: `${adminSession?.email ?? 'Church admin'} saved an updated Sunday service order for ${selectedChurch.displayCity}.`,
        actor: adminSession?.email ?? 'Church admin',
      });
      setUpdateMessage(`Sunday service order saved for ${selectedChurch.displayCity}.`);
    } else {
      setUpdateMessage('No service-order changes needed saving.');
    }

    setIsEditingServiceOrder(false);
    setServiceOrderDraft(null);
  };

  const handleMoveActivity = (activityId: string, direction: 'up' | 'down') => {
    if (!selectedChurch || !canEditServiceOrder || !isEditingServiceOrder) {
      return;
    }
    setServiceOrderDraft((current) => {
      const serviceOrder = [...(current ?? selectedChurchServiceOrder)];
      const currentIndex = serviceOrder.findIndex((activity) => activity.id === activityId);
      const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (currentIndex === -1 || nextIndex < 0 || nextIndex >= serviceOrder.length) {
        return current ?? serviceOrder;
      }
      const [movedActivity] = serviceOrder.splice(currentIndex, 1);
      serviceOrder.splice(nextIndex, 0, movedActivity);
      return serviceOrder;
    });
  };

  const openActivityPlanner = (serviceDate: string, activity: ServiceActivity, message?: string) => {
    const activityKey = getActivityPlanningKey(activity.activityName, activity.id);
    setSelectedPlanningSunday(serviceDate);
    setPlanningForm((current) => ({ ...current, serviceDate, activityKey }));
    setOpenedPlanningKey(`${serviceDate}:${activityKey}`);
    setSelectedPlanningMemberId(null);

    const activitiesToPlan = selectedChurchServiceOrder.filter((entry) => getActivityPlanningKey(entry.activityName, entry.id) === activityKey);
    const requirements = buildRequirementsForActivities(activitiesToPlan, selectedChurchRoleConfigs);
    const existingAssignmentCount = requirements.reduce((count, requirement) => (
      count + (getAssignmentsForRequirement(scopedAssignments, serviceDate, requirement).length > 0 ? 1 : 0)
    ), 0);
    setPlanningDraftAssignments(
      requirements.reduce<Record<string, PlanningDraftItem[]>>((drafts, requirement) => {
        const existingAssignment = getAssignmentsForRequirement(scopedAssignments, serviceDate, requirement)[0];
        drafts[requirement.id] = existingAssignment
          ? [{ assignedTo: existingAssignment.assignedTo, assignedUserId: existingAssignment.assignedUserId }]
          : [];
        return drafts;
      }, {}),
    );
    setPlanningBaselineSignature(buildPlanningConflictSignature(scopedAssignments, serviceDate, requirements));
    const defaultMessage = existingAssignmentCount === 0
      ? `Planning ${activity.activityName} for ${formatServiceDate(serviceDate)}. ${isCompactAdminView ? 'Tap a member, assign them to the right role, then confirm the plan.' : 'Drag the right people into the role slots, then confirm the plan.'}`
      : existingAssignmentCount < requirements.length
        ? `Continue planning ${activity.activityName} for ${formatServiceDate(serviceDate)}. ${existingAssignmentCount} of ${requirements.length} role${requirements.length === 1 ? '' : 's'} already ${existingAssignmentCount === 1 ? 'is' : 'are'} filled.`
        : `Review or update ${activity.activityName} for ${formatServiceDate(serviceDate)}. All roles are already planned.`;
    setUpdateMessage(message ?? defaultMessage);
  };

  const handleDropPlanningMember = (requirement: ServiceRequirement, memberId: string) => {
    const member = visibleMembers.find((item) => item.id === memberId);
    if (!member) {
      return false;
    }

    const canUseMember =
      requirement.teamName === 'Service Flow'
      || planningForm.allowOtherMembers
      || member.teamNames.includes(requirement.teamName);
    if (!canUseMember) {
      setUpdateMessage(`${member.fullName} is outside ${requirement.teamName}. Turn on "Other member" first if you want to assign them here.`);
      return false;
    }

    const existingItem = (planningDraftAssignments[requirement.id] ?? [])[0];
    if (existingItem?.assignedUserId === member.id) {
      setUpdateMessage(`${member.fullName} is already planned for ${requirement.roleName}.`);
      return false;
    }
    if (existingItem) {
      setUpdateMessage(`Remove ${existingItem.assignedTo} from ${requirement.roleName} before adding another person.`);
      return false;
    }

    setPlanningDraftAssignments((current) => ({
      ...current,
      [requirement.id]: [{ assignedTo: member.fullName, assignedUserId: member.id }],
    }));
    return true;
  };

  const handleSelectPlanningMember = (memberId: string) => {
    setSelectedPlanningMemberId((current) => (current === memberId ? null : memberId));
  };

  const handleAssignSelectedPlanningMember = (requirement: ServiceRequirement) => {
    if (!selectedPlanningMemberId) {
      setUpdateMessage('Select a member first, then assign them to the role.');
      return;
    }

    if (handleDropPlanningMember(requirement, selectedPlanningMemberId)) {
      setSelectedPlanningMemberId(null);
    }
  };

  const handleRemoveDraftAssignment = (requirementId: string) => {
    setPlanningDraftAssignments((current) => ({ ...current, [requirementId]: [] }));
  };

  const handleAddGuestSpeaker = (requirement: ServiceRequirement) => {
    const guestSpeakerName = (planningGuestInputs[requirement.id] ?? '').trim();
    if (!guestSpeakerName) {
      setUpdateMessage('Add a guest speaker name before assigning it.');
      return;
    }

    const existingItem = (planningDraftAssignments[requirement.id] ?? [])[0];
    if (existingItem) {
      if (!existingItem.assignedUserId && existingItem.assignedTo.toLowerCase() === guestSpeakerName.toLowerCase()) {
        setUpdateMessage(`${guestSpeakerName} is already planned for ${requirement.roleName}.`);
        return;
      }
      setUpdateMessage(`Remove ${existingItem.assignedTo} from ${requirement.roleName} before adding another person.`);
      return;
    }

    setPlanningDraftAssignments((current) => ({
      ...current,
      [requirement.id]: [{ assignedTo: guestSpeakerName }],
    }));
    setPlanningGuestInputs((current) => ({ ...current, [requirement.id]: '' }));
  };

  const handleConfirmActivityPlan = async () => {
    if (!selectedChurch || !selectedPlanningActivity || !planningForm.serviceDate) {
      return;
    }

    if (!planningHasUnsavedChanges && planningHasAssignments) {
      setUpdateMessage(`${selectedPlanningActivity.label} is already planned for ${formatServiceDate(planningForm.serviceDate)}.`);
      return;
    }

    const draftAssignments = selectedPlanningRequirements.flatMap((requirement) =>
      (planningDraftAssignments[requirement.id] ?? []).slice(0, 1).map((item) => ({
        ...item,
        roleName: requirement.roleName,
        teamName: requirement.teamName,
      })),
    );

    if (draftAssignments.length === 0) {
      setUpdateMessage('Add at least one person to the activity before confirming the plan.');
      return;
    }

    const livePlanningSignature = buildPlanningConflictSignature(scopedAssignments, planningForm.serviceDate, selectedPlanningRequirements);
    if (planningBaselineSignature && livePlanningSignature !== planningBaselineSignature) {
      setUpdateMessage('Another admin updated this Sunday plan while you were working. Reopen the activity to review the latest assignments before saving.');
      return;
    }

    const existingAssignments = scopedAssignments.filter((assignment) =>
      selectedPlanningActivities.some((activity) =>
        buildRequirementsForActivities([activity], selectedChurchRoleConfigs).some((requirement) =>
          assignment.serviceDate === planningForm.serviceDate
          && assignment.teamName === requirement.teamName
          && assignment.roleName === requirement.roleName,
        ),
      ),
    );

    const buildRoleKey = (roleName: string, teamName: string) => `${teamName}::${roleName}`;
    const buildAssigneeKey = (assignedTo: string, assignedUserId?: string) => assignedUserId ?? assignedTo.trim().toLowerCase();
    const draftByRole = new Map(draftAssignments.map((item) => [buildRoleKey(item.roleName, item.teamName), item]));

    const assignmentsToDelete = existingAssignments.filter((assignment) => {
      const draftItem = draftByRole.get(buildRoleKey(assignment.roleName, assignment.teamName));
      if (!draftItem) {
        return true;
      }
      return buildAssigneeKey(assignment.assignedTo, assignment.assignedUserId) !== buildAssigneeKey(draftItem.assignedTo, draftItem.assignedUserId);
    });

    const assignmentsToCreate = draftAssignments.filter((draftAssignment) => !existingAssignments.some((assignment) =>
      assignment.roleName === draftAssignment.roleName
      && assignment.teamName === draftAssignment.teamName
      && assignment.serviceDate === planningForm.serviceDate
      && buildAssigneeKey(assignment.assignedTo, assignment.assignedUserId) === buildAssigneeKey(draftAssignment.assignedTo, draftAssignment.assignedUserId),
    ));

    setIsCreatingAssignment(true);
    try {
      if (isFirebaseConfigured) {
        await Promise.all(assignmentsToDelete.map((assignment) => deleteVolunteerAssignment(assignment.id)));
      }
      const createdAssignments: VolunteerAssignment[] = [];
      for (const [index, item] of assignmentsToCreate.entries()) {
        let assignmentId = createId(`assignment-${index}`);
        if (isFirebaseConfigured) {
          assignmentId = await createVolunteerAssignment({
            churchId: selectedChurch.id,
            teamName: item.teamName,
            roleName: item.roleName,
            serviceDate: planningForm.serviceDate,
            assignedTo: item.assignedTo,
            assignedUserId: item.assignedUserId,
            createdBy: adminSession?.email ?? 'church-admin@example.com',
          });
        }
        createdAssignments.push({
          id: assignmentId,
          churchId: selectedChurch.id,
          teamName: item.teamName,
          roleName: item.roleName,
          serviceDate: planningForm.serviceDate,
          assignedTo: item.assignedTo,
          assignedUserId: item.assignedUserId,
          responseStatus: 'pending',
        });
      }

      const nextAssignments = [
        ...scopedAssignments.filter((assignment) => !assignmentsToDelete.some((deletedAssignment) => deletedAssignment.id === assignment.id)),
        ...createdAssignments,
      ].reduce<VolunteerAssignment[]>((uniqueAssignments, assignment) => {
        if (uniqueAssignments.some((currentAssignment) => currentAssignment.id === assignment.id)) {
          return uniqueAssignments;
        }

        uniqueAssignments.push(assignment);
        return uniqueAssignments;
      }, []);
      setAssignments((current) => [
        ...current.filter((assignment) => !assignmentsToDelete.some((deletedAssignment) => deletedAssignment.id === assignment.id)),
        ...createdAssignments,
      ].reduce<VolunteerAssignment[]>((uniqueAssignments, assignment) => {
        if (uniqueAssignments.some((currentAssignment) => currentAssignment.id === assignment.id)) {
          return uniqueAssignments;
        }

        uniqueAssignments.push(assignment);
        return uniqueAssignments;
      }, []).sort((left, right) => left.serviceDate.localeCompare(right.serviceDate) || left.assignedTo.localeCompare(right.assignedTo)));
      setPlanningBaselineSignature(buildPlanningConflictSignature(nextAssignments, planningForm.serviceDate, selectedPlanningRequirements));
      setSelectedPlanningMemberId(null);
      setOpenedPlanningKey(null);
      setPlanningForm((current) => ({
        ...current,
        activityKey: '',
        allowOtherMembers: false,
      }));
      setPlanningGuestInputs({});
      setUpdateMessage(`${selectedPlanningActivity.label} is planned for ${formatServiceDate(planningForm.serviceDate)}. Choose another Sunday activity, or reopen a planned team to continue working on it.`);
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          activityPlannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      await appendAuditEntry({
        churchId: selectedChurch.id,
        entityType: 'planning',
        actionLabel: 'Confirmed Sunday plan',
        targetLabel: selectedPlanningActivity.label,
        summary: `${adminSession?.email ?? 'Church admin'} confirmed ${draftAssignments.length} role assignment${draftAssignments.length > 1 ? 's' : ''} for ${formatServiceDate(planningForm.serviceDate)}.`,
        actor: adminSession?.email ?? 'Church admin',
      });
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to confirm the activity plan.');
    } finally {
      setIsCreatingAssignment(false);
    }
  };

  const handleDeleteAssignment = async (assignment: VolunteerAssignment) => {
    const canDeleteAssignment =
      adminProfile.roleKey === 'networkSuperAdmin'
      || adminProfile.roleKey === 'churchAdmin'
      || adminProfile.roleKey === 'pastor'
      || (adminProfile.roleKey === 'teamLeader' && adminProfile.teamNames.includes(assignment.teamName));
    if (!canDeleteAssignment) {
      setUpdateMessage('You can only remove assignments inside the teams you manage.');
      return;
    }
    try {
      if (isFirebaseConfigured) {
        await deleteVolunteerAssignment(assignment.id);
      }
      setAssignments((current) => current.filter((currentAssignment) => currentAssignment.id !== assignment.id));
      setUpdateMessage(`Removed ${assignment.roleName} for ${assignment.assignedTo} on ${formatServiceDate(assignment.serviceDate)}.`);
      await appendAuditEntry({
        churchId: assignment.churchId,
        entityType: 'planning',
        actionLabel: 'Removed assignment',
        targetLabel: `${assignment.roleName} - ${assignment.assignedTo}`,
        summary: `${adminSession?.email ?? 'Church admin'} removed the planned assignment from ${assignment.teamName}.`,
        actor: adminSession?.email ?? 'Church admin',
      });
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to delete the assignment.');
    }
  };

  const handlePublishAnnouncement = async () => {
    if (!canPublishUpdates) {
      setUpdateMessage('Only super admins, church admins, and pastors can publish updates.');
      return;
    }
    if (!selectedChurch || !announcementForm.title.trim() || !announcementForm.body.trim()) {
      setUpdateMessage('Add both a title and body before publishing the announcement.');
      return;
    }

    const visibleUntilAt = buildAnnouncementVisibleUntilAt(announcementForm.visibilityMode, announcementForm.visibleUntilDate);
    if (announcementForm.visibilityMode === 'untilDate' && !visibleUntilAt) {
      setUpdateMessage('Choose a valid end date for this announcement.');
      return;
    }

    try {
      if (isFirebaseConfigured) {
        await publishAnnouncement({
          churchId: selectedChurch.id,
          title: announcementForm.title,
          body: announcementForm.body,
          publishedBy: adminSession?.email ?? 'Church admin',
          isPublic: announcementForm.isPublic,
          visibleUntilAt,
        });
      }
      setAnnouncements((current) => [
        {
          id: createId('announcement'),
          churchId: selectedChurch.id,
          title: announcementForm.title.trim(),
          body: announcementForm.body.trim(),
          publishedAt: new Date().toISOString(),
          visibleUntilAt,
          publishedBy: adminSession?.email ?? 'Church admin',
          isPublic: announcementForm.isPublic,
        },
        ...current,
      ]);
      setAnnouncementForm({
        title: '',
        body: '',
        isPublic: false,
        visibilityMode: '7days',
        visibleUntilDate: toLocalDateInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
      });
      setUpdateMessage(`Published a church update for ${selectedChurch.displayCity}.`);
      await appendAuditEntry({
        churchId: selectedChurch.id,
        entityType: 'church',
        actionLabel: 'Published announcement',
        targetLabel: announcementForm.title.trim(),
        summary: `${adminSession?.email ?? 'Church admin'} published an announcement for ${selectedChurch.displayCity}.`,
        actor: adminSession?.email ?? 'Church admin',
      });
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to publish the announcement.');
    }
  };

  const handleDeleteAnnouncement = async (announcement: ChurchAnnouncement) => {
    if (!canPublishUpdates) {
      setUpdateMessage('Only super admins, church admins, and pastors can delete announcements.');
      return;
    }

    try {
      if (isFirebaseConfigured) {
        await deleteAnnouncement(announcement.id);
      }

      setAnnouncements((current) => current.filter((item) => item.id !== announcement.id));
      setUpdateMessage(`Deleted the announcement "${announcement.title}".`);
      await appendAuditEntry({
        churchId: announcement.churchId,
        entityType: 'church',
        actionLabel: 'Deleted announcement',
        targetLabel: announcement.title,
        summary: `${adminSession?.email ?? 'Church admin'} deleted an announcement for ${selectedChurch?.displayCity ?? 'the selected church'}.`,
        actor: adminSession?.email ?? 'Church admin',
      });
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to delete the announcement.');
    }
  };

  const handleEventPosterUpload = async (file: File | null) => {
    if (!file) {
      setEventForm((current) => ({ ...current, posterUrl: '', posterFileName: '' }));
      return;
    }

    if (!file.type.startsWith('image/')) {
      setUpdateMessage('Choose an image file for the event poster.');
      return;
    }

    try {
      const posterUrl = await readPosterFileAsDataUrl(file);
      setEventForm((current) => ({
        ...current,
        posterUrl,
        posterFileName: file.name,
      }));
      setUpdateMessage(`Poster ready: ${file.name}`);
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to load the selected poster.');
    }
  };

  const handlePublishEvent = async () => {
    if (!canPublishEvents) {
      setUpdateMessage('Only super admins, church admins, and pastors can publish events.');
      return;
    }
    if (!selectedChurch || !eventForm.title.trim() || !eventForm.startAt || !eventForm.endAt) {
      setUpdateMessage('Add the event title, start time, and end time before publishing.');
      return;
    }

    const scopeType = effectiveEventScopeType;
    if (scopeType === 'network' && !canPublishCommonEvents) {
      setUpdateMessage('Only super admins can publish common events across all churches.');
      return;
    }
    const eventChurchId = scopeType === 'network' ? 'network' : selectedChurch.id;
    const scopeLabel = scopeType === 'network' ? 'All churches' : selectedChurch.displayCity;
    const location = (
      eventForm.locationMode === 'online'
        ? 'Online'
        : eventForm.locationMode === 'other'
          ? eventForm.customLocation.trim()
          : selectedChurch.address
    ).trim();

    if (!location) {
      setUpdateMessage('Choose the event venue before publishing.');
      return;
    }

    try {
      if (isFirebaseConfigured) {
        await publishEvent({
          churchId: eventChurchId,
          scopeType,
          scopeLabel,
          title: eventForm.title,
          description: eventForm.description,
          location,
          startAt: eventForm.startAt,
          endAt: eventForm.endAt,
          createdBy: adminSession?.email ?? 'Church admin',
          posterUrl: eventForm.posterUrl,
          isPublic: eventForm.isPublic,
        });
      }
      setEvents((current) => [
        ...current,
        {
          id: createId('event'),
          churchId: eventChurchId,
          scopeType,
          scopeLabel,
          title: eventForm.title.trim(),
          description: eventForm.description.trim(),
          location,
          startAt: eventForm.startAt,
          endAt: eventForm.endAt,
          createdBy: adminSession?.email ?? 'Church admin',
          posterUrl: eventForm.posterUrl || undefined,
          isPublic: eventForm.isPublic,
        },
      ].sort((left, right) => left.startAt.localeCompare(right.startAt)));
      setEventForm({
        scopeType: 'church',
        title: '',
        description: '',
        locationMode: 'church',
        location: selectedChurch.address,
        customLocation: '',
        startAt: '',
        endAt: '',
        posterUrl: '',
        posterFileName: '',
        isPublic: false,
      });
      setUpdateMessage(scopeType === 'network'
        ? 'Published a common event across all churches.'
        : `Published an event for ${selectedChurch.displayCity}.`);
      await appendAuditEntry({
        churchId: eventChurchId,
        entityType: 'church',
        actionLabel: 'Published event',
        targetLabel: eventForm.title.trim(),
        summary: scopeType === 'network'
          ? `${adminSession?.email ?? 'Church admin'} published a common event across all churches.`
          : `${adminSession?.email ?? 'Church admin'} published a new event for ${selectedChurch.displayCity}.`,
        actor: adminSession?.email ?? 'Church admin',
      });
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to publish the event.');
    }
  };

  const handleDeleteEvent = async (event: ChurchEventItem) => {
    if (!canCancelPublishedEvent(event)) {
      setUpdateMessage(event.scopeType === 'network' || event.churchId === 'network'
        ? 'Only super admins can cancel common events.'
        : 'Only super admins, church admins, and pastors can cancel church-specific events.');
      return;
    }

    const confirmCancel = typeof window === 'undefined'
      ? true
      : window.confirm(`Are you sure you want to cancel the event "${event.title}"?`);
    if (!confirmCancel) {
      return;
    }

    try {
      if (isFirebaseConfigured) {
        await deleteEvent(event.id);
      }

      setEvents((current) => current.filter((item) => item.id !== event.id));
      setUpdateMessage(`Cancelled the event "${event.title}".`);
      await appendAuditEntry({
        churchId: event.churchId,
        entityType: 'church',
        actionLabel: 'Cancelled event',
        targetLabel: event.title,
        summary: `${adminSession?.email ?? 'Church admin'} cancelled ${event.scopeType === 'network' ? 'a common event' : 'a church-specific event'} for ${selectedChurch?.displayCity ?? 'the selected church'}.`,
        actor: adminSession?.email ?? 'Church admin',
      });
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to cancel the event.');
    }
  };

  const handleCancelCommonMeeting = async (meeting: CommonMeetingOccurrence) => {
    if (!selectedChurch || !canManageCommonMeetings) {
      setUpdateMessage('Only super admins, church admins, and pastors can cancel common meetings.');
      return;
    }

    const confirmCancel = typeof window === 'undefined'
      ? true
      : window.confirm(`Are you sure you want to cancel ${meeting.title} on ${formatServiceDate(meeting.occurrenceDate)}?`);
    if (!confirmCancel) {
      return;
    }

    try {
      if (isFirebaseConfigured) {
        await cancelCommonMeetingOccurrence({
          churchId: selectedChurch.id,
          meetingKey: meeting.key,
          occurrenceDate: meeting.occurrenceDate,
          title: meeting.title,
        });
      }
      setCommonMeetingCancellationKeys((current) =>
        current.includes(`${meeting.key}:${meeting.occurrenceDate}`)
          ? current
          : [...current, `${meeting.key}:${meeting.occurrenceDate}`],
      );
      setUpdateMessage(`${meeting.title} on ${formatServiceDate(meeting.occurrenceDate)} has been cancelled for ${selectedChurch.displayCity}.`);
      await appendAuditEntry({
        churchId: selectedChurch.id,
        entityType: 'church',
        actionLabel: 'Cancelled common meeting',
        targetLabel: meeting.title,
        summary: `${adminSession?.email ?? 'Church admin'} cancelled ${meeting.title} for ${formatServiceDate(meeting.occurrenceDate)}.`,
        actor: adminSession?.email ?? 'Church admin',
      });
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to cancel the common meeting.');
    }
  };

  const handleRestoreCommonMeeting = async (meeting: CommonMeetingOccurrence) => {
    if (!selectedChurch || !canManageCommonMeetings) {
      setUpdateMessage('Only super admins, church admins, and pastors can restore common meetings.');
      return;
    }

    try {
      if (isFirebaseConfigured) {
        await restoreCommonMeetingOccurrence(selectedChurch.id, meeting.key, meeting.occurrenceDate);
      }
      setCommonMeetingCancellationKeys((current) => current.filter((item) => item !== `${meeting.key}:${meeting.occurrenceDate}`));
      setUpdateMessage(`${meeting.title} on ${formatServiceDate(meeting.occurrenceDate)} has been restored for ${selectedChurch.displayCity}.`);
      await appendAuditEntry({
        churchId: selectedChurch.id,
        entityType: 'church',
        actionLabel: 'Restored common meeting',
        targetLabel: meeting.title,
        summary: `${adminSession?.email ?? 'Church admin'} restored ${meeting.title} for ${formatServiceDate(meeting.occurrenceDate)}.`,
        actor: adminSession?.email ?? 'Church admin',
      });
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to restore the common meeting.');
    }
  };

  const handleCancelChurchSpecificMeeting = async (meeting: ChurchSpecificMeetingOccurrence) => {
    if (!selectedChurch || !canManageCommonMeetings) {
      setUpdateMessage('Only super admins, church admins, and pastors can cancel church-specific meetings.');
      return;
    }

    const confirmCancel = typeof window === 'undefined'
      ? true
      : window.confirm(`Are you sure you want to cancel ${meeting.title} on ${formatServiceDate(meeting.occurrenceDate)}?`);
    if (!confirmCancel) {
      return;
    }

    try {
      if (isFirebaseConfigured) {
        await cancelChurchSpecificMeetingOccurrence({
          churchId: selectedChurch.id,
          meetingKey: meeting.key,
          occurrenceDate: meeting.occurrenceDate,
          title: meeting.title,
        });
      }
      setChurchSpecificMeetingCancellationKeys((current) =>
        current.includes(`${meeting.key}:${meeting.occurrenceDate}`)
          ? current
          : [...current, `${meeting.key}:${meeting.occurrenceDate}`],
      );
      setUpdateMessage(`${meeting.title} on ${formatServiceDate(meeting.occurrenceDate)} has been cancelled for ${selectedChurch.displayCity}.`);
      await appendAuditEntry({
        churchId: selectedChurch.id,
        entityType: 'church',
        actionLabel: 'Cancelled church meeting',
        targetLabel: meeting.title,
        summary: `${adminSession?.email ?? 'Church admin'} cancelled ${meeting.title} for ${formatServiceDate(meeting.occurrenceDate)}.`,
        actor: adminSession?.email ?? 'Church admin',
      });
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to cancel the church-specific meeting.');
    }
  };

  const handleRestoreChurchSpecificMeeting = async (meeting: ChurchSpecificMeetingOccurrence) => {
    if (!selectedChurch || !canManageCommonMeetings) {
      setUpdateMessage('Only super admins, church admins, and pastors can restore church-specific meetings.');
      return;
    }

    try {
      if (isFirebaseConfigured) {
        await restoreChurchSpecificMeetingOccurrence(selectedChurch.id, meeting.key, meeting.occurrenceDate);
      }
      setChurchSpecificMeetingCancellationKeys((current) => current.filter((item) => item !== `${meeting.key}:${meeting.occurrenceDate}`));
      setUpdateMessage(`${meeting.title} on ${formatServiceDate(meeting.occurrenceDate)} has been restored for ${selectedChurch.displayCity}.`);
      await appendAuditEntry({
        churchId: selectedChurch.id,
        entityType: 'church',
        actionLabel: 'Restored church meeting',
        targetLabel: meeting.title,
        summary: `${adminSession?.email ?? 'Church admin'} restored ${meeting.title} for ${formatServiceDate(meeting.occurrenceDate)}.`,
        actor: adminSession?.email ?? 'Church admin',
      });
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to restore the church-specific meeting.');
    }
  };

  const handleCreateChurch = async () => {
    if (adminProfile.roleKey !== 'networkSuperAdmin') {
      return;
    }

    if (!churchForm.name.trim() || !churchForm.displayCity.trim()) {
      setUpdateMessage('Add the church name and city before creating a new location.');
      return;
    }

    try {
      const newChurch = await createChurchLocation({
        ...churchForm,
        teams: [...defaultTeams],
      });
      setChurches((current) => [...current, newChurch].sort((left, right) => left.displayCity.localeCompare(right.displayCity)));
      setChurchForm({
        name: '',
        city: '',
        displayCity: '',
        address: '',
        serviceTimes: '',
        sharedDrivePath: '',
        googleMapsLabel: '',
        contactEmail: '',
        contactPhone: '',
        instagramUrl: '',
        facebookUrl: '',
      });
      setUpdateMessage(`Added ${newChurch.displayCity} and the default teams were created for that church.`);
      await appendAuditEntry({
        churchId: newChurch.id,
        entityType: 'church',
        actionLabel: 'Created church',
        targetLabel: newChurch.displayCity,
        summary: `${adminSession?.email ?? 'Church admin'} created a new church location with the default ministry teams.`,
        actor: adminSession?.email ?? 'Church admin',
      });
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to add the church location.');
    }
  };

  const handleSaveChurchEdit = async (church: Church) => {
    if (!canEditChurch) {
      setUpdateMessage('Only super admins can edit church details.');
      return;
    }

    const draft = churchEditDrafts[church.id];
    if (!draft) {
      return;
    }

    try {
      if (isFirebaseConfigured) {
        await updateChurchLocation({
          churchId: church.id,
          ...draft,
        });
      }

      setChurches((current) => current.map((item) => item.id === church.id ? { ...item, ...draft } : item));
      setChurchEditId(null);
      setUpdateMessage(`Updated ${draft.displayCity || church.displayCity} church details.`);
      await appendAuditEntry({
        churchId: church.id,
        entityType: 'church',
        actionLabel: 'Updated church',
        targetLabel: draft.displayCity || church.displayCity,
        summary: `${adminSession?.email ?? 'Church admin'} updated church details, support contacts, and social links.`,
        actor: adminSession?.email ?? 'Church admin',
      });
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to update the church details.');
    }
  };

  const handleExportArchive = (plansOverride?: ArchivedServicePlan[]) => {
    const plansToExport = plansOverride ?? archivedPlans;
    if (!selectedChurch || plansToExport.length === 0 || typeof window === 'undefined' || !canExportArchive) {
      return;
    }

    const exportWorkbook = formatArchiveExportWorkbookXml(selectedChurch.displayCity, plansToExport);
    const blob = new Blob([exportWorkbook], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = plansOverride ? `${selectedChurch.id}-${plansToExport[0]?.serviceDate ?? 'loaded'}-service-plan.xls` : `${selectedChurch.id}-service-plan-archive.xls`;
    anchor.click();
    window.URL.revokeObjectURL(url);
    void appendAuditEntry({
      churchId: selectedChurch.id,
      entityType: 'archive',
      actionLabel: plansOverride ? 'Exported loaded Sunday' : 'Exported archive',
      targetLabel: plansOverride ? formatServiceDate(plansToExport[0]?.serviceDate ?? '') : `${selectedChurch.displayCity} archive`,
      summary: `${adminSession?.email ?? 'Church admin'} exported ${plansOverride ? 'the loaded Sunday workbook' : 'the archived Sunday workbook'}.`,
      actor: adminSession?.email ?? 'Church admin',
    });
  };

  const loadArchiveIntoViewer = (serviceDate: string, showMessage: boolean) => {
    if (!serviceDate) {
      if (showMessage) {
        setUpdateMessage('Choose an archived Sunday before loading the archive view.');
      }
      return;
    }

    const planToLoad = archivedPlans.find((plan) => plan.serviceDate === serviceDate) ?? null;
    if (!planToLoad) {
      if (showMessage) {
        setUpdateMessage('No saved archive was found for that Sunday.');
      }
      setLoadedArchivePlan(null);
      setExpandedArchiveActivityKeys({});
      return;
    }

    setLoadedArchivePlan(planToLoad);
    setExpandedArchiveActivityKeys({});

    if (showMessage) {
      setUpdateMessage(`Loaded archive for ${formatServiceDate(serviceDate)}.`);
    }
    void appendAuditEntry({
      churchId: selectedChurch?.id ?? '',
      entityType: 'archive',
      actionLabel: 'Loaded archive',
      targetLabel: formatServiceDate(serviceDate),
      summary: `${adminSession?.email ?? 'Church admin'} opened an archived Sunday service plan for review.`,
      actor: adminSession?.email ?? 'Church admin',
    });

    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        archiveDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }
  };

  const handleLoadArchive = () => {
    if (!selectedArchiveSunday) {
      setUpdateMessage('Choose an archived Sunday before loading the archive view.');
      return;
    }

    loadArchiveIntoViewer(selectedArchiveSunday, true);
  };

  if (!adminSession) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-brand-block">
            <OfficialSignature />
            <p className="panel-kicker">Admin Dashboard</p>
            <h1>Bethel Connect Admin</h1>
            <p className="detail-copy">
              Sign in to manage church members, approvals, Sunday planning, prayer moderation, and church communication.
            </p>
          </div>
          <div className="auth-actions">
            <button type="button" className="action-button publish" onClick={() => void handleSignInWithGoogle()} disabled={isAuthenticating}>
              {isAuthenticating ? 'Connecting...' : isFirebaseConfigured ? 'Continue With Google' : 'Open Demo Dashboard'}
            </button>
          </div>
          <p className="auth-hint">
            {isFirebaseConfigured ? 'Use a Google account that already has a church admin, super admin, pastor, or team leader role to access the dashboard.' : 'Firebase keys are missing, so the demo dashboard opens with the local prototype data.'}
          </p>
          {authError ? <p className="auth-error">{authError}</p> : null}
        </div>
      </div>
    );
  }

  if (isResolvingAdminProfile) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-brand-block">
            <OfficialSignature />
            <p className="panel-kicker">Admin Dashboard</p>
            <h1>Bethel Connect Admin</h1>
            <p className="detail-copy">
              Checking admin access for {adminSession.email}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!adminProfile.hasDashboardPermission) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-brand-block">
            <OfficialSignature />
            <p className="panel-kicker">Admin Dashboard</p>
            <h1>Bethel Connect Admin</h1>
            <p className="detail-copy">
              This account does not have admin access. Only super admins, church admins, pastors, and team leaders can sign in.
            </p>
          </div>
          {authError ? <p className="auth-error">{authError}</p> : null}
          <div className="auth-actions">
            <button type="button" className="action-button reject" onClick={() => void handleSignOut()}>
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <div className="mobile-admin-dock">
        <div className="mobile-admin-title-strip">
          <div className="mobile-admin-title-block">
            <OfficialSignature />
            <div className="mobile-admin-title-copy">
              <p className="brand-kicker">Admin Dashboard</p>
              <h1>{mobileAdminTitle}</h1>
            </div>
          </div>
          <div className="mobile-admin-title-actions">
            <span className="topbar-chip">Role: {roleLabels[adminProfile.roleKey]}</span>
            <button type="button" className="topbar-button topbar-signout mobile-admin-signout" onClick={() => void handleSignOut()}>Sign Out</button>
          </div>
        </div>
        {adminProfile.roleKey === 'networkSuperAdmin' ? (
          <div className="mobile-admin-scope-strip">
            <label className="auth-label" htmlFor="mobile-scope-church">Church location</label>
            <select
              id="mobile-scope-church"
              className="auth-input mobile-admin-scope-select"
              value={selectedChurchId}
              onChange={(event) => setSelectedChurchId(event.target.value)}
            >
              {scopeChurchChoices.map((church) => (
                <option key={church.id} value={church.id}>{church.displayCity}</option>
              ))}
            </select>
          </div>
        ) : null}
        <nav className="mobile-admin-nav" aria-label="Admin sections">
          {visibleNavigation.map((item) => (
            <button key={item.key} type="button" className={`mobile-admin-nav-item ${item.key === activeView ? 'active' : ''}`} onClick={() => setActiveView(item.key)}>
              {item.label}
            </button>
          ))}
        </nav>
      </div>
      <aside className="sidebar">
        <div className="brand-block">
          <OfficialSignature />
          <p className="brand-kicker">Admin Dashboard</p>
          <h1>Bethel Connect</h1>
          <p className="brand-copy">Church-wide approvals, member management, planning, and communication in one connected workspace.</p>
        </div>

        <nav className="nav-list" aria-label="Admin sections">
          {visibleNavigation.map((item) => (
            <button key={item.key} type="button" className={`nav-item ${item.key === activeView ? 'active' : ''}`} onClick={() => setActiveView(item.key)}>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-panel">
          <p className="panel-kicker">Environment</p>
          <div className="status-list">
            <div className="status-row">
              <span className="status-key">Firebase readiness</span>
              <strong className={`status-value ${isFirebaseConfigured ? 'status-ok' : 'status-warn'}`}>{configuredCount}/{firebaseConfigStatus.length}</strong>
            </div>
            <div className="status-row status-row-stack">
              <span className="status-key">Signed in</span>
              <strong className="status-value">{adminSession.email}</strong>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        {!adminProfile.hasDashboardPermission ? (
          <div className="notice-banner">
            Signed in as {adminSession.email}, but this account does not yet have dashboard permission. In Firestore, open users/{adminSession.uid} and set a role like networkSuperAdmin, churchAdmin, or teamLeader.
          </div>
        ) : null}
        {!isFirebaseConfigured ? <div className="notice-banner">Firebase is not fully configured, so the admin app is currently running in local prototype mode with saved planning data in browser storage.</div> : null}
        {updateMessage ? <div className="notice-banner inline-banner">{updateMessage}</div> : null}
        <div className="mobile-view-intro">
          <p className="topbar-kicker">Church Network Dashboard</p>
          <h2>{viewTitle[activeView]}</h2>
          <p className="topbar-summary">{viewSummary[activeView]}</p>
        </div>

        <header className="topbar">
          <div className="topbar-copy">
            <p className="topbar-kicker">Church Network Dashboard</p>
            <h2>{viewTitle[activeView]}</h2>
            <p className="topbar-summary">{viewSummary[activeView]}</p>
          </div>
          <div className="topbar-side">
            <div className="topbar-actions">
              <span className="topbar-chip">Data: {isFirebaseConfigured ? 'Live Firebase' : 'Prototype Mode'}</span>
              <span className="topbar-chip">Admin: {adminSession.email}</span>
              <span className="topbar-chip">Role: {roleLabels[adminProfile.roleKey]}</span>
              <button type="button" className="topbar-button topbar-signout" onClick={() => void handleSignOut()}>Sign Out</button>
            </div>
            {adminProfile.roleKey === 'networkSuperAdmin' ? (
              <div className="desktop-admin-scope-strip">
                <label className="auth-label" htmlFor="desktop-scope-church">Church location</label>
                <select
                  id="desktop-scope-church"
                  className="auth-input desktop-admin-scope-select"
                  value={selectedChurchId}
                  onChange={(event) => setSelectedChurchId(event.target.value)}
                >
                  {scopeChurchChoices.map((church) => (
                    <option key={church.id} value={church.id}>{church.displayCity}</option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </header>
        {activeView === 'overview' ? (
          <section className="dashboard-grid overview-grid">
            <article className="metric-card">
              <p className="panel-kicker">Pending approvals</p>
              <strong>{scopedRequests.filter((request) => request.status === 'pending').length}</strong>
              <span>People still waiting for an onboarding decision in this church.</span>
            </article>
            <article className="metric-card">
              <p className="panel-kicker">Sunday coverage</p>
              <strong>{sundayCoveragePercent}%</strong>
              <span>{totalSundayRequirements - uncoveredRequirementsCount} of {totalSundayRequirements} Sunday roles are currently covered.</span>
            </article>
            <article className="metric-card">
              <p className="panel-kicker">Members tracked</p>
              <strong>{scopedMembers.length}</strong>
              <span>Managed members currently visible in this church scope.</span>
            </article>
            <article className="metric-card">
              <p className="panel-kicker">Waiting for response</p>
              <strong>{pendingSundayResponses}</strong>
              <span>Assignments on the active Sunday that still need a member response.</span>
            </article>
            <article className="metric-card">
              <p className="panel-kicker">Next event</p>
              <strong>{nextEvent ? nextEvent.title : 'None'}</strong>
              <span>{nextEvent ? formatDateTimeRange(nextEvent.startAt, nextEvent.endAt) : 'No upcoming church event or meeting is scheduled yet.'}</span>
            </article>
            <article className="detail-card">
              <p className="panel-kicker">Useful insights</p>
              <h3>What needs attention next</h3>
              <div className="detail-block"><strong>Approval queue</strong><span>{scopedRequests.filter((request) => request.status === 'pending').length > 0 ? 'Review new access requests soon.' : 'No one is waiting in the onboarding queue.'}</span></div>
              <div className="detail-block"><strong>Sunday readiness</strong><span>{uncoveredRequirementsCount > 0 ? `${uncoveredRequirementsCount} Sunday role${uncoveredRequirementsCount > 1 ? 's are' : ' is'} still unfilled.` : 'All planned Sunday roles currently have someone assigned.'}</span></div>
              <div className="detail-block"><strong>Member follow-up</strong><span>{membersWithoutTeamCount > 0 ? `${membersWithoutTeamCount} member${membersWithoutTeamCount > 1 ? 's have' : ' has'} not been assigned to a team yet.` : 'Managed members are assigned and ready for Sunday planning.'}</span></div>
            </article>
            <article className="wide-card">
              <div className="section-heading">
                <div>
                  <p className="panel-kicker">Volunteer planning</p>
                  <h3>Next Sunday coverage for {selectedChurch?.displayCity ?? 'the selected church'}</h3>
                </div>
              </div>
              <div className="member-grid">
                {sundayAssignments.map((assignment) => (
                  <article key={assignment.id} className="member-tile">
                    <div className="member-tile-top">
                      <div>
                        <h3>{assignment.assignedTo}</h3>
                        <p className="member-email">{selectedChurch?.displayCity}</p>
                      </div>
                      <span className={`response-tag ${assignment.responseStatus}`}>{assignment.responseStatus}</span>
                    </div>
                    <div className="member-meta-list">
                      <div className="member-meta-item">
                        <span className="member-meta-icon member-meta-role"><RoleIcon roleKey="volunteer" /></span>
                        <div><strong>Role</strong><p>{assignment.roleName}</p></div>
                      </div>
                      <div className="member-meta-item">
                        <span className="member-meta-icon member-meta-team"><TeamIcon teamName={assignment.teamName} /></span>
                        <div><strong>Team</strong><p>{assignment.teamName}</p></div>
                      </div>
                    </div>
                  </article>
                ))}
                {sundayAssignments.length === 0 ? <div className="empty-card">No assignments are planned yet for the active Sunday.</div> : null}
              </div>
            </article>
            <article className="wide-card">
              <p className="panel-kicker">Recent activity</p>
              <h3>Latest admin changes</h3>
              <div className="update-list event-instance-list">
                {auditEntries.slice(0, 4).map((entry) => (
                  <div key={entry.id} className="update-card compact-update-card">
                    <strong>{entry.actionLabel}</strong>
                    <p className="detail-copy">{entry.targetLabel}</p>
                    <p className="muted-line">{entry.summary}</p>
                  </div>
                ))}
                {auditEntries.length === 0 ? <div className="empty-card">Admin actions like approvals, church edits, and Sunday plan changes will appear here.</div> : null}
              </div>
            </article>
          </section>
        ) : null}

        {activeView === 'approvals' ? (
          <section className="dashboard-grid approvals-layout">
            <article className="wide-card">
              <div className="section-heading">
                <div>
                  <p className="panel-kicker">Approval queue</p>
                  <h3>Requests for {selectedChurch?.displayCity ?? 'the selected church'}</h3>
                </div>
                <div className="chip-row">
                  <span className="mini-chip">Showing {filteredRequests.length}</span>
                  {selectedRequestIds.length > 0 ? <span className="mini-chip">Selected {selectedRequestIds.length}</span> : null}
                </div>
              </div>
              <div className="filter-cluster approvals-toolbar">
                <div className="filter-panel">
                  <label className="auth-label" htmlFor="approval-search">Search requests</label>
                  <input id="approval-search" className="auth-input" type="text" value={approvalSearch} onChange={(event) => setApprovalSearch(event.target.value)} placeholder="Search by name, email, or note" />
                </div>
                <div className="filter-panel">
                  <label className="auth-label" htmlFor="approval-status">Status</label>
                  <select id="approval-status" className="auth-input" value={approvalStatusFilter} onChange={(event) => setApprovalStatusFilter(event.target.value as 'all' | AccessRequest['status'])}>
                    <option value="all">All statuses</option>
                    <option value="pending">Pending only</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
                <div className="filter-panel">
                  <label className="auth-label" htmlFor="approval-role">Requested role</label>
                  <select id="approval-role" className="auth-input" value={approvalRoleFilter} onChange={(event) => setApprovalRoleFilter(event.target.value as 'all' | RoleKey)}>
                    <option value="all">All roles</option>
                    {(['member', 'volunteer', 'teamLeader', 'pastor', 'churchAdmin'] as RoleKey[]).map((role) => (
                      <option key={role} value={role}>{roleLabels[role]}</option>
                    ))}
                  </select>
                </div>
                <div className="approvals-bulk-actions">
                  <button type="button" className="action-button approve compact-action" onClick={() => void handleApproveRequest('approved', filteredRequests.filter((request) => selectedRequestIds.includes(request.id) && request.status === 'pending'))} disabled={!canReviewApprovals || selectedRequestIds.length === 0}>Bulk approve</button>
                  <button type="button" className="action-button reject compact-action" onClick={() => void handleApproveRequest('rejected', filteredRequests.filter((request) => selectedRequestIds.includes(request.id) && request.status === 'pending'))} disabled={!canReviewApprovals || selectedRequestIds.length === 0}>Bulk reject</button>
                  <button type="button" className="member-cancel-button compact-action" onClick={() => setSelectedRequestIds(filteredRequests.map((request) => request.id))} disabled={filteredRequests.length === 0}>Select visible</button>
                  <button type="button" className="member-cancel-button compact-action" onClick={() => setSelectedRequestIds([])} disabled={selectedRequestIds.length === 0}>Clear</button>
                </div>
              </div>
              <div className="request-list">
                {filteredRequests.map((request) => (
                  <button key={request.id} type="button" className={`request-card ${request.id === selectedRequest?.id ? 'selected' : ''}`} onClick={() => setSelectedRequestId(request.id)}>
                    <div className="request-top">
                      <label className="request-select-box" onClick={(event) => event.stopPropagation()}>
                        <input type="checkbox" checked={selectedRequestIds.includes(request.id)} onChange={() => toggleRequestSelection(request.id)} />
                      </label>
                      <div>
                        <p className="panel-kicker">{request.id}</p>
                        <h3>{request.fullName}</h3>
                      </div>
                      <span className={`status-badge ${request.status}`}>{request.status}</span>
                    </div>
                    <p>{request.note}</p>
                    {request.status === 'rejected' && request.rejectionReason ? <p className="muted-line">Reason: {request.rejectionReason}</p> : null}
                    <p className="muted-line">{request.email} | {request.requestedAt}</p>
                    <div className="chip-row">
                      {request.requestedRoles.map((role) => <span key={role} className="mini-chip">{roleLabels[role]}</span>)}
                    </div>
                  </button>
                ))}
                {filteredRequests.length === 0 ? <div className="empty-card">No approval requests match the current filters for this church.</div> : null}
              </div>
            </article>
            <article className="detail-card">
              <p className="panel-kicker">Selected request</p>
              <h3>{selectedRequest?.fullName ?? 'No request selected'}</h3>
              {selectedRequest ? (
                <>
                  <div className="detail-block"><strong>Email</strong><span>{selectedRequest.email}</span></div>
                  <div className="detail-block"><strong>Phone</strong><span>{selectedRequest.phoneNumber || 'No phone number provided yet'}</span></div>
                  <div className="detail-block">
                    <strong>Requested roles</strong>
                    <div className="chip-row">{selectedRequest.requestedRoles.map((role) => <span key={role} className="mini-chip">{roleLabels[role]}</span>)}</div>
                  </div>
                  <div className="detail-block"><strong>Request note</strong><span>{selectedRequest.note}</span></div>
                  <div className="detail-block">
                    <strong>Rejection reason</strong>
                    <textarea
                      className="auth-input"
                      rows={4}
                      value={rejectionReasonDraft}
                      onChange={(event) => setRejectionReasonDraft(event.target.value)}
                      placeholder="Explain what the member should correct before submitting again"
                      disabled={!canReviewApprovals}
                    />
                  </div>
                  {selectedRequest.status === 'rejected' && selectedRequest.rejectionReason ? (
                    <div className="detail-block">
                      <strong>Current rejection note</strong>
                      <span>{selectedRequest.rejectionReason}</span>
                    </div>
                  ) : null}
                  <div className="action-stack horizontal">
                    <button type="button" className="action-button approve" onClick={() => void handleApproveRequest('approved')} disabled={!canReviewApprovals || selectedRequest.status !== 'pending'}>Approve</button>
                    <button type="button" className="action-button reject" onClick={() => void handleApproveRequest('rejected')} disabled={!canReviewApprovals || selectedRequest.status !== 'pending'}>Reject</button>
                  </div>
                </>
              ) : <div className="empty-card">Choose a request to view details.</div>}
            </article>
            <article className="wide-card">
              <div className="section-heading">
                <div>
                  <p className="panel-kicker">Prayer moderation</p>
                  <h3>Prayer requests for {selectedChurch?.displayCity ?? 'the selected church'}</h3>
                </div>
              </div>
              {!canModeratePrayer ? <div className="notice-banner inline-banner">Only super admins, church admins, and pastors can approve, hide, or remove prayer requests.</div> : null}
              <div className="prayer-moderation-grid">
                {scopedPrayerRequests.map((request) => (
                  <article key={request.id} className="request-card selected">
                    <div className="request-top">
                      <div>
                        <p className="panel-kicker">Submitted {request.createdAt}</p>
                        <h3>{selectedChurch?.displayCity}</h3>
                      </div>
                      <span className={`status-badge ${request.status}`}>{request.status}</span>
                    </div>
                    <p>{request.preview}</p>
                    <div className="action-stack horizontal">
                      <button type="button" className="action-button approve" onClick={() => void handleModeratePrayer(request.id, 'approved')} disabled={!canModeratePrayer}>Approve</button>
                      <button type="button" className="action-button reject" onClick={() => void handleModeratePrayer(request.id, 'hidden')} disabled={!canModeratePrayer}>Hide</button>
                      <button type="button" className="action-button reject compact-action prayer-remove-button" onClick={() => void handleRemovePrayerRequest(request.id)} disabled={!canModeratePrayer}>Remove</button>
                    </div>
                  </article>
                ))}
                {scopedPrayerRequests.length === 0 ? <div className="empty-card">No prayer requests are waiting for this church.</div> : null}
              </div>
            </article>
          </section>
        ) : null}

        {activeView === 'memberSetup' ? (
          <section className="dashboard-grid members-layout">
            <article className="wide-card members-create-card">
              <p className="panel-kicker">Create a managed member profile</p>
              <h3>Add a church member directly</h3>
              <div className="form-grid member-form-grid">
                <div className="multi-select-panel">
                  <strong>Name</strong>
                  <input className="auth-input" type="text" value={managedMemberForm.fullName} onChange={(event) => setManagedMemberForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Full name" />
                </div>
                <div className="multi-select-panel">
                  <strong>Email</strong>
                  <input className="auth-input" type="email" value={managedMemberForm.email} onChange={(event) => setManagedMemberForm((current) => ({ ...current, email: event.target.value }))} placeholder="member@example.com" />
                </div>
                <div className="multi-select-panel">
                  <strong>Role</strong>
                  <div className="chip-row selection-chip-grid">
                    {memberRoleOptions.map((roleKey) => (
                      <button key={roleKey} type="button" className={`member-edit-button ${managedMemberForm.roleKey === roleKey ? 'member-save-button' : ''}`} onClick={() => setManagedMemberForm((current) => ({ ...current, roleKey }))}>
                        {roleLabels[roleKey]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="multi-select-panel">
                  <strong>Teams</strong>
                  <div className="chip-row selection-chip-grid">
                    {selectedChurchTeams.map((teamName) => {
                      const active = managedMemberForm.teamNames.includes(teamName);
                      return (
                        <button key={teamName} type="button" className={`member-edit-button ${active ? 'member-save-button' : ''}`} onClick={() => setManagedMemberForm((current) => ({
                          ...current,
                          teamNames: active ? current.teamNames.filter((currentTeam) => currentTeam !== teamName) : [...current.teamNames, teamName],
                        }))}>
                          {teamName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="member-tile-actions">
                <button type="button" className="action-button publish member-save-button" onClick={() => void handleCreateManagedMember()}>Add member</button>
              </div>
            </article>
            <article className="wide-card planning-role-setup">
              <div className="section-heading">
                <div>
                  <p className="panel-kicker">Team setup</p>
                  <h3>Define teams and roles for {selectedChurch?.displayCity ?? 'the selected church'}</h3>
                </div>
              </div>
              <div className="planning-role-stack">
                <section className="planning-role-section">
                  <h4>Add team</h4>
                  <p className="planning-role-copy">Create a ministry team for this church. It appears below in Team setup without changing the service order.</p>
                  <div className="planning-team-form">
                    <input className="auth-input" type="text" value={newTeamName} onChange={(event) => setNewTeamName(event.target.value)} placeholder="New ministry team" />
                    <button type="button" className="action-button publish planning-inline-action" onClick={() => void handleAddTeam()}>Add team</button>
                  </div>
                </section>
                <section className="planning-role-section">
                  <h4>Add a role for any team</h4>
                  <p className="planning-role-copy">Choose a team first, then add a role that should appear inside that team tile below.</p>
                  <div className="planning-role-form">
                    <select className="auth-input" value={newRoleForm.teamName} onChange={(event) => setNewRoleForm((current) => ({ ...current, teamName: event.target.value }))}>
                      {orderedSelectedChurchTeams.map((teamName) => <option key={teamName} value={teamName}>{teamName}</option>)}
                    </select>
                    <input className="auth-input" type="text" value={newRoleForm.roleName} onChange={(event) => setNewRoleForm((current) => ({ ...current, roleName: event.target.value }))} placeholder="Role name" />
                    <button type="button" className="action-button publish planning-inline-action" onClick={() => handleAddRole()}>Add role</button>
                  </div>
                </section>
                <div className="planning-role-list">
                  {orderedSelectedChurchTeams.map((teamName) => {
                    const teamRoles = selectedChurchRoleConfigs.filter((role) => role.teamName === teamName);
                    const expanded = expandedTeamName === teamName;
                    return (
                      <article key={teamName} className={`planning-role-team-card ${expanded ? 'expanded' : ''}`}>
                        <button type="button" className="planning-role-team-toggle" onClick={() => setExpandedTeamName((current) => current === teamName ? '' : teamName)}>
                          <div className="planning-role-team-header">
                            <div className="planning-role-team-heading">
                              <strong>{teamName}</strong>
                              <div className="planning-role-team-summary">
                                <span className="planning-role-team-icon-shell"><TeamIcon teamName={teamName} /></span>
                                <span className="planning-role-team-count">{teamRoles.length} roles</span>
                              </div>
                            </div>
                            <ChevronIcon className={`planning-activity-chevron ${expanded ? 'expanded' : ''}`} />
                          </div>
                        </button>
                        {expanded ? (
                          <>
                            <div className="planning-team-card-actions">
                              {teamIsDefault(teamName) ? <span className="planning-role-status">Default Team</span> : <button type="button" className="planning-role-delete" onClick={() => void handleDeleteTeam(teamName)}>Delete team</button>}
                            </div>
                            <div className="planning-role-list-inner">
                              {teamRoles.map((role) => (
                                <div key={role.id} className="planning-role-pill">
                                  <div className="planning-role-pill-top">
                                    <strong>{role.roleName}</strong>
                                    <button type="button" className="planning-role-delete" onClick={() => handleDeleteRole(role.id)}>Delete role</button>
                                  </div>
                                  <span>{teamName}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </div>
            </article>
          </section>
        ) : null}

        {activeView === 'members' ? (
          <section className="dashboard-grid members-layout">
            <article className="wide-card">
              <div className="section-heading">
                <div>
                  <p className="panel-kicker">Manage Members</p>
                  <h3>{selectedChurch?.displayCity ?? 'Selected church'} members</h3>
                </div>
                <div className="chip-row">
                  <span className="mini-chip">Showing {visibleMemberRecords.length}</span>
                  <span className="mini-chip">Total {scopedMembers.length}</span>
                </div>
              </div>
              <div className="filter-cluster member-filters">
                <div className="filter-panel">
                  <label className="auth-label" htmlFor="member-search">Search members</label>
                  <input id="member-search" className="auth-input" type="text" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search name, email, or team" />
                </div>
                <div className="filter-panel">
                  <label className="auth-label" htmlFor="member-role-filter">Role</label>
                  <select id="member-role-filter" className="auth-input" value={memberRoleFilter} onChange={(event) => setMemberRoleFilter(event.target.value as 'all' | RoleKey)}>
                    <option value="all">All roles</option>
                    {(['member', 'volunteer', 'teamLeader', 'pastor', 'churchAdmin'] as RoleKey[]).map((role) => (
                      <option key={role} value={role}>{roleLabels[role]}</option>
                    ))}
                  </select>
                </div>
                <div className="filter-panel">
                  <label className="auth-label" htmlFor="member-team-filter">Team</label>
                  <select id="member-team-filter" className="auth-input" value={memberTeamFilter} onChange={(event) => setMemberTeamFilter(event.target.value as 'all' | string)}>
                    <option value="all">All teams</option>
                    {orderedSelectedChurchTeams.map((teamName) => <option key={teamName} value={teamName}>{teamName}</option>)}
                  </select>
                </div>
                <div className="filter-panel">
                  <label className="auth-label" htmlFor="member-status-filter">Status</label>
                  <select id="member-status-filter" className="auth-input" value={memberStatusFilter} onChange={(event) => setMemberStatusFilter(event.target.value as typeof memberStatusFilter)}>
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="unassigned-team">No team assigned</option>
                  </select>
                </div>
                <div className="filter-panel">
                  <label className="auth-label" htmlFor="member-sort-key">Sort by</label>
                  <select id="member-sort-key" className="auth-input" value={memberSortKey} onChange={(event) => setMemberSortKey(event.target.value as typeof memberSortKey)}>
                    <option value="name">Name</option>
                    <option value="role">Role</option>
                    <option value="team">Team</option>
                    <option value="status">Status</option>
                  </select>
                </div>
              </div>
              <div className="member-grid">
                {visibleMemberRecords.map((member) => {
                  const memberDraft = memberEditDrafts[member.id] ?? { email: member.email, phoneNumber: member.phoneNumber ?? '', roleKey: member.roleKey, teamNames: member.teamNames };
                  const isEditing = memberEditId === member.id;
                  return (
                    <article key={member.id} className="member-tile">
                      <div className="member-tile-top">
                        <div>
                          <h3>{member.fullName}</h3>
                          <p className="member-email">{member.email}</p>
                        </div>
                        {canManageMembers ? (
                          <div className="member-card-actions">
                            <button
                              type="button"
                              className="member-edit-button"
                              onClick={() => handleStartMemberEdit(member)}
                              disabled={!canEditMemberRecord(member)}
                              title={!canEditMemberRecord(member) ? 'You do not have permission to edit this member.' : undefined}
                            >
                              Edit
                            </button>
                            {canDeleteMembers ? (
                              <button
                                type="button"
                                className="action-button reject compact-action"
                                onClick={() => void handleDeleteMember(member)}
                                disabled={!canDeleteMemberRecord(member)}
                                title={
                                  member.id === adminSession?.uid
                                    ? 'You cannot delete your own admin profile.'
                                    : !canDeleteMemberRecord(member)
                                      ? 'Church admins and pastors cannot delete church admin or super admin profiles.'
                                      : undefined
                                }
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="member-meta-list">
                        <div className="member-meta-item">
                          <span className="member-meta-icon member-meta-role"><RoleIcon roleKey={isEditing ? memberDraft.roleKey : member.roleKey} /></span>
                          <div><strong>Role</strong><p>{roleLabels[isEditing ? memberDraft.roleKey : member.roleKey]}</p></div>
                        </div>
                      <div className="member-meta-item">
                        <span className="member-meta-icon member-meta-team"><TeamIcon teamName={(isEditing ? memberDraft.teamNames[0] : member.teamNames[0]) || 'Member'} /></span>
                        <div><strong>Teams</strong><p>{(isEditing ? memberDraft.teamNames : member.teamNames).join(', ') || 'No team assigned'}</p></div>
                      </div>
                      </div>
                      {isEditing ? (
                        <div className="member-edit-panel">
                          <div className="member-edit-group">
                            <strong>Email</strong>
                            <input
                              className="auth-input"
                              type="email"
                              value={memberDraft.email}
                              onChange={(event) => setMemberEditDrafts((current) => ({
                                ...current,
                                [member.id]: {
                                  ...memberDraft,
                                  email: event.target.value,
                                },
                              }))}
                              placeholder="member@example.com"
                            />
                          </div>
                          <div className="member-edit-group">
                            <strong>Mobile number</strong>
                            <input
                              className="auth-input"
                              type="tel"
                              value={memberDraft.phoneNumber}
                              onChange={(event) => setMemberEditDrafts((current) => ({
                                ...current,
                                [member.id]: {
                                  ...memberDraft,
                                  phoneNumber: event.target.value,
                                },
                              }))}
                              placeholder="Please enter the member mobile number"
                            />
                          </div>
                          <div className="member-edit-group">
                            <strong>Role</strong>
                            <div className="chip-row selection-chip-grid">
                              {memberRoleOptions.map((roleKey) => (
                                <button key={roleKey} type="button" className={`member-edit-button ${memberDraft.roleKey === roleKey ? 'member-save-button' : ''}`} onClick={() => setMemberEditDrafts((current) => ({ ...current, [member.id]: { ...memberDraft, roleKey } }))}>
                                  {roleLabels[roleKey]}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="member-edit-group">
                            <strong>Teams</strong>
                            <div className="chip-row selection-chip-grid">
                              {selectedChurchTeams.map((teamName) => {
                                const active = memberDraft.teamNames.includes(teamName);
                                return (
                                  <button key={teamName} type="button" className={`member-edit-button ${active ? 'member-save-button' : ''}`} onClick={() => setMemberEditDrafts((current) => ({
                                    ...current,
                                    [member.id]: {
                                      ...memberDraft,
                                      teamNames: active ? memberDraft.teamNames.filter((currentTeam) => currentTeam !== teamName) : [...memberDraft.teamNames, teamName],
                                    },
                                  }))}>
                                    {teamName}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div className="member-tile-actions">
                            <button type="button" className="action-button publish member-save-button" onClick={() => void handleSaveMemberEdit(member)}>Save</button>
                            <button type="button" className="member-cancel-button" onClick={() => setMemberEditId(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </article>
          </section>
        ) : null}
        {activeView === 'planning' ? (
          <section className="dashboard-grid planning-layout">
            <article className="wide-card">
              <div className="section-heading">
                <div>
                  <p className="panel-kicker">Sunday service order</p>
                  <h3>Plan the next two Sundays</h3>
                </div>
              </div>
              <div className="planning-sunday-toolbar">
                {upcomingPlanningSundays.map((serviceDate, index) => (
                  <button
                    key={serviceDate}
                    type="button"
                    className={`member-edit-button planning-sunday-switch-button ${serviceDate === selectedPlanningSunday ? 'active' : ''}`}
                    aria-pressed={serviceDate === selectedPlanningSunday}
                    onClick={() => setSelectedPlanningSunday(serviceDate)}
                  >
                    {index === 0 ? 'Current Sunday' : 'Next Sunday'}
                  </button>
                ))}
                {canEditServiceOrder ? <button type="button" className={`action-button publish planning-order-toggle ${isEditingServiceOrder ? 'active' : ''}`} onClick={() => void handleToggleServiceOrderEditing()}><span>{isEditingServiceOrder ? 'Done' : 'Change service order'}</span></button> : null}
              </div>
              <div className="planning-sunday-columns">
                {(upcomingPlanningSundays.includes(selectedPlanningSunday) ? [selectedPlanningSunday] : [upcomingPlanningSundays[0]].filter(Boolean)).map((serviceDate) => (
                  <div key={serviceDate} className="planning-sunday-card">
                    <div className="planning-sunday-header">
                      <div>
                        <strong>{formatServiceDate(serviceDate)}</strong>
                        <p>{serviceDate === upcomingPlanningSundays[0] ? 'Current Sunday' : 'Next Sunday'}</p>
                      </div>
                    </div>
                    <div className="planning-activity-list">
                      {visibleServiceOrder.map((activity) => {
                        const activityKey = `${serviceDate}:${activity.id}`;
                        const expanded = expandedActivityKeys[activityKey] === true;
                        const requirements = buildRequirementsForActivities([activity], selectedChurchRoleConfigs);
                        const canPlanActivity = canPlanAllTeams || (adminProfile.roleKey === 'teamLeader' && requirements.some((requirement) => adminProfile.teamNames.includes(requirement.teamName)));
                        return (
                          <div key={activityKey} className={`planning-activity-tile ${expanded ? 'expanded' : ''}`}>
                            <button type="button" className="planning-activity-toggle" onClick={() => setExpandedActivityKeys((current) => ({ ...current, [activityKey]: !expanded }))}>
                              <div className="planning-activity-heading">
                                <strong>{activity.activityName}</strong>
                                <div className="planning-activity-team-line">
                                  <span className="planning-activity-team-icon"><TeamIcon teamName={activity.teamName} /></span>
                                  <p>{activity.teamName}</p>
                                </div>
                              </div>
                              <ChevronIcon className={`planning-activity-chevron ${expanded ? 'expanded' : ''}`} />
                            </button>
                            {isEditingServiceOrder && canEditServiceOrder ? (
                              <div className="planning-activity-reorder-row">
                                <button type="button" className="member-edit-button" onClick={() => handleMoveActivity(activity.id, 'up')}>Up</button>
                                <button type="button" className="member-edit-button" onClick={() => handleMoveActivity(activity.id, 'down')}>Down</button>
                              </div>
                            ) : null}
                            {expanded ? (
                              <div className="planning-activity-body">
                                <div className="planning-activity-controls">
                                  {canPlanActivity ? <button type="button" className="member-edit-button" onClick={() => openActivityPlanner(serviceDate, activity)}>Plan</button> : null}
                                </div>
                                {requirements.map((requirement) => {
                                  const plannedAssignments = getAssignmentsForRequirement(scopedAssignments, serviceDate, requirement);
                                  return (
                                    <article key={`${serviceDate}-${requirement.id}`} className="planning-requirement-row">
                                      <div className="planning-requirement-side">
                                        <strong>{requirement.roleName}</strong>
                                        <span className="mini-chip">{plannedAssignments.length} planned</span>
                                      </div>
                                      <div className="planning-requirement-teamline">
                                        <span className="planning-requirement-teamicon"><TeamIcon teamName={requirement.teamName === 'Service Flow' ? 'Member' : requirement.teamName} /></span>
                                        <p>{requirement.teamName === 'Service Flow' ? 'Any church member' : requirement.teamName}</p>
                                      </div>
                                      {plannedAssignments.length > 0 ? (
                                        <div className="planning-assignee-list">
                                          {plannedAssignments.map((assignment) => (
                                            <div key={assignment.id} className="planning-assignee-card">
                                              <div><strong>{assignment.assignedTo}</strong><p>{assignment.assignedUserId ? 'Confirmed member assignment' : 'Guest or external assignment'}</p></div>
                                              <span className={`response-tag ${assignment.responseStatus}`}>{assignment.responseStatus}</span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : <p className="planning-assignee-line">No one is planned for this role yet.</p>}
                                    </article>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="composer-card">
              <p className="panel-kicker">Activity planner</p>
              <h3>Plan Sunday roles</h3>
              <div ref={activityPlannerRef} className="planning-form-grid planning-activity-picker">
                <div className="planning-activity-field">
                  <label className="auth-label" htmlFor="planning-service-date">Sunday</label>
                  <select id="planning-service-date" className="auth-input" value={planningForm.serviceDate} onChange={(event) => setPlanningForm((current) => ({ ...current, serviceDate: event.target.value }))}>
                    {upcomingPlanningSundays.map((serviceDate) => <option key={serviceDate} value={serviceDate}>{formatServiceDate(serviceDate)}</option>)}
                  </select>
                </div>
                <div className="planning-activity-field">
                  <label className="auth-label" htmlFor="planning-activity-key">Activity</label>
                  <select id="planning-activity-key" className="auth-input" value={planningForm.activityKey} onChange={(event) => setPlanningForm((current) => ({ ...current, activityKey: event.target.value }))}>
                    <option value="">Choose Sunday activity</option>
                    {visiblePlanningActivityOptions.map((activity) => <option key={activity.key} value={activity.key}>{activity.label}</option>)}
                  </select>
                </div>
                <div className="planning-activity-action">
                  <span className="planning-activity-action-label">Open planner</span>
                  <button
                    type="button"
                    className="action-button publish"
                    onClick={() => {
                      const activity = selectedPlanningActivity;
                      if (!activity || !planningForm.serviceDate) {
                        setUpdateMessage('Choose both the Sunday and activity before opening the planner.');
                        return;
                      }
                      const anchorActivity = selectedChurchServiceOrder.find((entry) => activity.activityIds.includes(entry.id));
                      if (!anchorActivity) {
                        setUpdateMessage('Choose a valid Sunday activity before opening the planner.');
                        return;
                      }
                      openActivityPlanner(planningForm.serviceDate, anchorActivity, `Planning ${activity.label} for ${formatServiceDate(planningForm.serviceDate)}.`);
                    }}
                  >
                    Plan
                  </button>
                </div>
              </div>
              {selectedPlanningActivity && openedPlanningKey === `${planningForm.serviceDate}:${selectedPlanningActivity.key}` ? (
                <div className="planning-activity-workbench">
                  <div className="planning-workbench-header">
                    <div><h4>{selectedPlanningActivity.label}</h4><p>{formatServiceDate(planningForm.serviceDate)} | {selectedPlanningActivity.teamName}</p></div>
                    <button type="button" className={`member-edit-button planning-other-member-toggle ${planningForm.allowOtherMembers ? 'active' : ''}`} onClick={() => setPlanningForm((current) => ({ ...current, allowOtherMembers: !current.allowOtherMembers }))}>Other member</button>
                  </div>
                  {isCompactAdminView ? (
                    <div className="planning-mobile-helper">
                      <strong>{selectedPlanningMember ? `Selected member: ${selectedPlanningMember.fullName}` : 'Mobile planning mode'}</strong>
                      <p>{selectedPlanningMember ? 'Tap an empty role slot to assign the selected member, or tap the member again to clear the selection.' : 'Tap a member below, then use the role-slot button to assign them.'}</p>
                    </div>
                  ) : null}
                  {planningBaselineSignature ? (
                    <div className="notice-banner inline-banner">This planner locks onto the latest saved version for this Sunday. If another admin changes the same activity while you are working, you will be asked to reopen it before saving.</div>
                  ) : null}
                  <div className="planning-workbench-grid">
                    <div className="planning-workbench-panel">
                      <h4>Eligible members</h4>
                      <div className="planning-member-list">
                        {visibleMembers.map((member) => (
                          isCompactAdminView ? (
                            <button
                              key={member.id}
                              type="button"
                              className={`planning-member-card planning-member-card-button ${selectedPlanningMemberId === member.id ? 'active' : ''}`}
                              onClick={() => handleSelectPlanningMember(member.id)}
                            >
                              <span className="member-meta-icon member-meta-role planning-member-card-icon"><RoleIcon roleKey={member.roleKey} /></span>
                              <div className="planning-member-card-content">
                                <strong>{member.fullName}</strong>
                                <p>{member.teamNames.join(', ') || 'No team assigned'}</p>
                                <div className="planning-member-card-tags">
                                  <span className="mini-chip">{roleLabels[member.roleKey]}</span>
                                  {member.teamNames[0] ? <span className="mini-chip">{member.teamNames[0]}</span> : null}
                                </div>
                              </div>
                            </button>
                          ) : (
                            <div key={member.id} className="planning-member-card planning-member-card-draggable" draggable onDragStart={(event) => { event.dataTransfer.setData('text/plain', member.id); setDraggedPlanningMemberId(member.id); }}>
                              <span className="member-meta-icon member-meta-role planning-member-card-icon"><RoleIcon roleKey={member.roleKey} /></span>
                              <div className="planning-member-card-content">
                                <strong>{member.fullName}</strong>
                                <p>{member.teamNames.join(', ') || 'No team assigned'}</p>
                                <div className="planning-member-card-tags">
                                  <span className="mini-chip">{roleLabels[member.roleKey]}</span>
                                  {member.teamNames[0] ? <span className="mini-chip">{member.teamNames[0]}</span> : null}
                                </div>
                              </div>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                    <div className="planning-workbench-panel">
                      <h4>Role slots</h4>
                      <div className="planning-slot-board">
                        {selectedPlanningRequirements.map((requirement) => (
                          <div key={requirement.id} className="planning-slot-card" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                            event.preventDefault();
                            const memberId = event.dataTransfer.getData('text/plain') || draggedPlanningMemberId;
                            if (memberId) { handleDropPlanningMember(requirement, memberId); }
                            setDraggedPlanningMemberId(null);
                          }}>
                            <div className="planning-slot-header">
                              <div><strong>{requirement.roleName}</strong><p>{requirement.teamName === 'Service Flow' ? 'Any church member' : requirement.teamName}</p></div>
                              <span className="mini-chip">{(planningDraftAssignments[requirement.id] ?? []).length} planned</span>
                            </div>
                            {(planningDraftAssignments[requirement.id] ?? []).length > 0 ? (
                              <div className="planning-slot-assignees">
                                {(planningDraftAssignments[requirement.id] ?? []).map((item) => (
                                  <div key={`${requirement.id}-${item.assignedUserId ?? item.assignedTo}`} className="planning-slot-assignee">
                                    <span>{item.assignedTo}</span>
                                    <button type="button" className="planning-slot-remove" onClick={() => handleRemoveDraftAssignment(requirement.id)}>Remove</button>
                                  </div>
                                ))}
                              </div>
                            ) : <div className="planning-slot-empty">{isCompactAdminView ? 'Select a member above, then assign them here.' : 'Drop a member tile here.'}</div>}
                            {(suggestionMapByRequirement[requirement.id] ?? []).length > 0 ? (
                              <div className="planning-suggestion-block">
                                <strong>Suggested from previous plans</strong>
                                <div className="planning-suggestion-list">
                                  {(suggestionMapByRequirement[requirement.id] ?? []).map((member) => (
                                    <button
                                      key={`${requirement.id}-${member.id}`}
                                      type="button"
                                      className="member-edit-button planning-suggestion-button"
                                      onClick={() => {
                                        if (isCompactAdminView) {
                                          handleSelectPlanningMember(member.id);
                                          setUpdateMessage(`${member.fullName} is selected. Use the assign button for ${requirement.roleName}.`);
                                          return;
                                        }
                                        handleDropPlanningMember(requirement, member.id);
                                      }}
                                      disabled={(planningDraftAssignments[requirement.id] ?? []).length > 0}
                                    >
                                      {member.fullName}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {isCompactAdminView ? (
                              <button
                                type="button"
                                className={`member-edit-button planning-slot-assign-button ${selectedPlanningMember ? 'active' : ''}`}
                                onClick={() => handleAssignSelectedPlanningMember(requirement)}
                                disabled={!selectedPlanningMember || (planningDraftAssignments[requirement.id] ?? []).length > 0}
                              >
                                {selectedPlanningMember ? `Assign ${selectedPlanningMember.fullName}` : 'Select a member first'}
                              </button>
                            ) : null}
                            {requirement.teamName === 'Speakers Team' ? (
                              <div className="planning-guest-row">
                                <input className="auth-input" type="text" value={planningGuestInputs[requirement.id] ?? ''} onChange={(event) => setPlanningGuestInputs((current) => ({ ...current, [requirement.id]: event.target.value }))} placeholder="Guest speaker name" />
                                <button type="button" className="member-edit-button" onClick={() => handleAddGuestSpeaker(requirement)}>Add guest</button>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="planning-workbench-actions">
                    <button
                      type="button"
                      className={`action-button approve ${!planningHasUnsavedChanges && planningHasAssignments ? 'planning-confirmed-button' : ''}`}
                      onClick={() => void handleConfirmActivityPlan()}
                      disabled={isCreatingAssignment || !planningHasAssignments || !planningHasUnsavedChanges}
                    >
                      {isCreatingAssignment ? 'Saving...' : !planningHasAssignments ? 'Add assignments first' : !planningHasUnsavedChanges ? 'Activity planned' : 'Confirm activity plan'}
                    </button>
                  </div>
                </div>
              ) : null}
            </article>

            {adminProfile.roleKey === 'teamLeader' ? (
              <article className="detail-card">
                <p className="panel-kicker">My team members</p>
                <h3>Members you can plan</h3>
                <p className="detail-copy">This list shows members from the teams you lead, so you can plan roles without needing the full member-management section.</p>
                <div className="chip-row">
                  {adminProfile.teamNames.map((teamName) => (
                    <span key={teamName} className="mini-chip">{teamName}</span>
                  ))}
                </div>
                <div className="planning-member-list">
                  {managedTeamMembers.map((member) => (
                    <div key={member.id} className="planning-member-card">
                      <span className="member-meta-icon member-meta-role planning-member-card-icon"><RoleIcon roleKey={member.roleKey} /></span>
                      <div className="planning-member-card-content">
                        <strong>{member.fullName}</strong>
                        <p>{member.email}</p>
                        <div className="planning-member-card-tags">
                          <span className="mini-chip">{roleLabels[member.roleKey]}</span>
                          {member.teamNames.map((teamName) => (
                            <span key={`${member.id}-${teamName}`} className="mini-chip">{teamName}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                  {managedTeamMembers.length === 0 ? <div className="empty-card">No members are assigned to your managed teams yet.</div> : null}
                </div>
              </article>
            ) : null}

            <article className="detail-card">
              <p className="panel-kicker">Assignments</p>
              <h3>All service teams assignments for {formatServiceDate(selectedPlanningSunday)}</h3>
              <div className="planning-assignment-board">
                {sundayAssignments.map((assignment) => (
                  <div key={assignment.id} className="planning-assignment-card">
                    <div className="planning-assignment-top">
                      <div><strong>{assignment.assignedTo}</strong><p>{assignment.teamName} | {assignment.roleName}</p></div>
                      <span className={`response-tag ${assignment.responseStatus}`}>{assignment.responseStatus}</span>
                    </div>
                    <div className="planning-assignment-actions">
                      <button
                        type="button"
                        className="member-edit-button"
                        onClick={() => {
                          const matchingActivity = selectedChurchServiceOrder.find((activity) =>
                            buildRequirementsForActivities([activity], selectedChurchRoleConfigs).some((requirement) =>
                              requirement.teamName === assignment.teamName && requirement.roleName === assignment.roleName,
                            ),
                          );
                          if (matchingActivity) {
                            openActivityPlanner(assignment.serviceDate, matchingActivity, `Reassign ${assignment.roleName} for ${formatServiceDate(assignment.serviceDate)}.`);
                          }
                        }}
                      >
                        Reassign
                      </button>
                      <button type="button" className="planning-assignment-delete" onClick={() => void handleDeleteAssignment(assignment)}>Delete assignment</button>
                    </div>
                  </div>
                ))}
                {sundayAssignments.length === 0 ? <div className="empty-card">No assignments are planned yet for the active Sunday.</div> : null}
              </div>
            </article>

            <article className="wide-card planning-archive-viewer">
              <div className="section-heading">
                <div><p className="panel-kicker">Archive</p><h3>Archived Sundays</h3></div>
              </div>
              <div className="planning-archive-toolbar">
                <div className="filter-panel">
                  <label className="auth-label" htmlFor="archive-sunday">Select archived Sunday</label>
                  <select
                    id="archive-sunday"
                    className="auth-input"
                    value={selectedArchiveSunday}
                    onChange={(event) => {
                      const nextSunday = event.target.value;
                      setSelectedArchiveSunday(nextSunday);
                      setLoadedArchivePlan((current) => current?.serviceDate === nextSunday ? current : null);
                      setExpandedArchiveActivityKeys({});
                    }}
                    disabled={archivedPlans.length === 0}
                  >
                    <option value="">{archivedPlans.length === 0 ? 'No archived Sunday yet' : 'Choose archived Sunday'}</option>
                    {archivedPlans.map((plan) => <option key={plan.serviceDate} value={plan.serviceDate}>{formatServiceDate(plan.serviceDate)}</option>)}
                  </select>
                </div>
                  <div className="chip-row">
                    <span className="mini-chip">Saved file entries: {archivedPlans.length}</span>
                    <button type="button" className="action-button approve" onClick={() => handleLoadArchive()} disabled={!selectedArchiveSunday}>Load archive</button>
                    {canExportArchive ? <button type="button" className="action-button publish" onClick={() => handleExportArchive()} disabled={archivedPlans.length === 0}>Export archive file</button> : null}
                    {canExportArchive ? <button type="button" className="member-edit-button" onClick={() => loadedArchivePlan ? handleExportArchive([loadedArchivePlan]) : undefined} disabled={!loadedArchivePlan}>Export loaded Sunday</button> : null}
                </div>
              </div>
              {selectedArchiveSunday && (!loadedArchivePlan || loadedArchivePlan.serviceDate !== selectedArchiveSunday) ? (
                <div className="notice-banner inline-banner">Archived Sunday selected. Press <strong>Load archive</strong> to open it.</div>
              ) : null}
              {loadedArchivePlan ? (
                <div ref={archiveDetailRef} className="planning-archive-loaded">
                  <div className="section-heading">
                    <div>
                      <p className="panel-kicker">Archive detail</p>
                      <h3>Service order for {formatServiceDate(loadedArchivePlan.serviceDate)}</h3>
                      <p className="detail-copy">Expand any activity below to review its saved assignments.</p>
                    </div>
                    <span className="archive-loaded-badge">Loaded archive</span>
                  </div>
                    <div className="planning-sunday-card">
                    <div className="planning-sunday-header">
                      <div>
                        <strong>{formatServiceDate(loadedArchivePlan.serviceDate)}</strong>
                        <p>Archived Sunday service order</p>
                      </div>
                      <span className="mini-chip">{loadedArchivePlan.activities.length} activities</span>
                    </div>
                    <div className="planning-activity-list">
                      {loadedArchivePlan.activities.map((activity) => {
                        const activityKey = `archive:${loadedArchivePlan.serviceDate}:${activity.activityName}`;
                        const expanded = expandedArchiveActivityKeys[activityKey] === true;
                        const assignedRoles = activity.roles.filter((role) => role.assignments.length > 0);
                        return (
                          <div key={activityKey} className={`planning-activity-tile ${expanded ? 'expanded' : ''}`}>
                            <button type="button" className="planning-activity-toggle planning-archive-toggle" onClick={() => setExpandedArchiveActivityKeys((current) => ({ ...current, [activityKey]: !expanded }))}>
                              <div className="planning-activity-heading">
                                <strong>{activity.activityName}</strong>
                                <div className="planning-activity-team-line">
                                  <span className="planning-activity-team-icon"><TeamIcon teamName={activity.teamName === 'Service Flow' ? 'Member' : activity.teamName} /></span>
                                  <p>{activity.teamName === 'Service Flow' ? 'Any church member' : activity.teamName}</p>
                                </div>
                              </div>
                              <ChevronIcon className={`planning-activity-chevron ${expanded ? 'expanded' : ''}`} />
                            </button>
                            {expanded ? (
                              <div className="planning-activity-body">
                                {assignedRoles.map((role) => (
                                  <article key={`${activity.activityName}:${role.roleName}`} className="planning-requirement-row">
                                    <div className="planning-requirement-side">
                                      <strong>{role.roleName}</strong>
                                      <span className="mini-chip">{role.assignments.length} planned</span>
                                    </div>
                                    <div className="planning-requirement-teamline">
                                      <span className="planning-requirement-teamicon"><TeamIcon teamName={activity.teamName === 'Service Flow' ? 'Member' : activity.teamName} /></span>
                                      <p>{activity.teamName === 'Service Flow' ? 'Any church member' : activity.teamName}</p>
                                    </div>
                                    {role.assignments.length > 0 ? (
                                      <div className="planning-assignee-list">
                                        {role.assignments.map((assignment) => (
                                          <div key={`${role.roleName}:${assignment.assignedTo}`} className="planning-assignee-card">
                                            <div>
                                              <strong>{assignment.assignedTo}</strong>
                                              <p>{assignment.assignedUserId ? 'Assigned member' : 'Saved archive entry'}</p>
                                            </div>
                                            <span className={`response-tag ${assignment.responseStatus}`}>{assignment.responseStatus}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}
                                  </article>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="planning-sunday-card">
                  <div className="empty-card">Select an archived Sunday above and click <strong>Load archive</strong> to review the saved service plan.</div>
                </div>
              )}
            </article>
          </section>
        ) : null}

        {activeView === 'updates' ? (
          <section className="dashboard-grid updates-layout">
            <article className="composer-card updates-card event-management-card">
              <p className="panel-kicker">Announcements</p>
              <h3>Announcements for {selectedChurch?.displayCity ?? 'the selected church'}</h3>
              {!canPublishUpdates ? <p className="detail-copy event-scope-note">{updatesPublishNote}</p> : null}
              <div className="form-grid">
                <input className="auth-input" type="text" value={announcementForm.title} onChange={(event) => setAnnouncementForm((current) => ({ ...current, title: event.target.value }))} placeholder="Announcement title" />
                <textarea className="auth-input content-area" value={announcementForm.body} onChange={(event) => setAnnouncementForm((current) => ({ ...current, body: event.target.value }))} placeholder="Announcement body" />
                <select className="auth-input" value={announcementForm.visibilityMode} onChange={(event) => setAnnouncementForm((current) => ({ ...current, visibilityMode: event.target.value as AnnouncementVisibilityMode }))}>
                  <option value="7days">Show for 7 days</option>
                  <option value="14days">Show for 14 days</option>
                  <option value="30days">Show for 30 days</option>
                  <option value="untilDate">Show until a selected date</option>
                </select>
                <input
                  className="auth-input"
                  type="date"
                  value={announcementForm.visibleUntilDate}
                  onChange={(event) => setAnnouncementForm((current) => ({ ...current, visibleUntilDate: event.target.value }))}
                  disabled={announcementForm.visibilityMode !== 'untilDate'}
                />
                <button type="button" className="action-button publish" onClick={() => void handlePublishAnnouncement()} disabled={!canPublishUpdates}>Publish announcement</button>
              </div>
              <div className="update-list event-instance-list">
                {activeScopedAnnouncements.map((announcement) => (
                  <div key={announcement.id} className="update-card announcement-update-card">
                    <div className="announcement-update-card-top">
                      <strong>{announcement.title}</strong>
                      <button type="button" className="action-button reject compact-action announcement-delete-button" onClick={() => void handleDeleteAnnouncement(announcement)} disabled={!canPublishUpdates}>Delete</button>
                    </div>
                    <p className="detail-copy">{announcement.body}</p>
                    <p className="detail-copy">{formatAnnouncementVisibleUntil(announcement.visibleUntilAt)}</p>
                  </div>
                ))}
                {activeScopedAnnouncements.length === 0 ? <div className="empty-card">No active announcements are published for this church.</div> : null}
              </div>
            </article>

            <article className="composer-card updates-card event-management-card">
              <p className="panel-kicker">Events</p>
              <h3>Publish events for {selectedChurch?.displayCity ?? 'the selected church'}</h3>
              {!canPublishEvents ? <p className="detail-copy event-scope-note">{updatesPublishNote}</p> : null}
              <div className="form-grid">
                <div className="form-row event-scope-row">
                  <label className="toggle-row">
                    <input
                      type="radio"
                      checked={effectiveEventScopeType === 'church'}
                      onChange={() => setEventForm((current) => ({
                        ...current,
                        scopeType: 'church',
                        isPublic: false,
                        locationMode: current.locationMode === 'other' ? 'other' : 'church',
                        location: current.locationMode === 'other'
                          ? current.customLocation
                          : (selectedChurch?.address ?? ''),
                      }))}
                    />
                    Church specific event
                  </label>
                  {canPublishCommonEvents ? (
                    <label className="toggle-row">
                      <input
                        type="radio"
                        checked={effectiveEventScopeType === 'network'}
                        onChange={() => setEventForm((current) => ({
                          ...current,
                          scopeType: 'network',
                          isPublic: true,
                          locationMode: current.locationMode === 'other' ? 'other' : 'online',
                          location: current.locationMode === 'other' ? current.customLocation : 'Online',
                        }))}
                      />
                      Common event across all churches
                    </label>
                  ) : (
                    <p className="detail-copy event-scope-note">Church admins and pastors can publish church-specific events only.</p>
                  )}
                </div>
                <input className="auth-input" type="text" value={eventForm.title} onChange={(event) => setEventForm((current) => ({ ...current, title: event.target.value }))} placeholder="Event title" />
                <textarea className="auth-input content-area" value={eventForm.description} onChange={(event) => setEventForm((current) => ({ ...current, description: event.target.value }))} placeholder="Event description" />
                <div className="form-row">
                  <input className="auth-input" type="datetime-local" value={eventForm.startAt} onChange={(event) => setEventForm((current) => ({ ...current, startAt: event.target.value }))} />
                  <input className="auth-input" type="datetime-local" value={eventForm.endAt} onChange={(event) => setEventForm((current) => ({ ...current, endAt: event.target.value }))} />
                </div>
                <div className="form-row event-location-row">
                  <label className="toggle-row">
                    <input
                      type="radio"
                      checked={eventForm.locationMode === 'church'}
                      onChange={() => setEventForm((current) => ({
                        ...current,
                        locationMode: 'church',
                        location: selectedChurch?.address ?? '',
                      }))}
                    />
                    Church location
                  </label>
                  <label className="toggle-row">
                    <input
                      type="radio"
                      checked={eventForm.locationMode === 'online'}
                      onChange={() => setEventForm((current) => ({
                        ...current,
                        locationMode: 'online',
                        location: 'Online',
                      }))}
                    />
                    Online
                  </label>
                  <label className="toggle-row">
                    <input
                      type="radio"
                      checked={eventForm.locationMode === 'other'}
                      onChange={() => setEventForm((current) => ({
                        ...current,
                        locationMode: 'other',
                        customLocation: current.customLocation,
                        location: current.customLocation,
                      }))}
                    />
                    Other
                  </label>
                </div>
                {eventForm.locationMode === 'other' ? (
                  <input
                    className="auth-input"
                    type="text"
                    value={eventForm.customLocation}
                    onChange={(event) => setEventForm((current) => ({
                      ...current,
                      customLocation: event.target.value,
                      location: event.target.value,
                    }))}
                    placeholder="Specify venue"
                  />
                ) : (
                  <input
                    className="auth-input"
                    type="text"
                    value={eventForm.locationMode === 'church' ? (selectedChurch?.address ?? '') : 'Online'}
                    readOnly
                  />
                )}
                <div className="form-row event-poster-row">
                  <label className="event-poster-upload">
                    <span>Upload poster</span>
                    <input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0] ?? null; void handleEventPosterUpload(file); event.currentTarget.value = ''; }} />
                  </label>
                  {eventForm.posterUrl ? (
                    <div className="event-poster-preview-shell">
                      <img className="event-poster-preview" src={eventForm.posterUrl} alt="Event poster preview" />
                      <div className="event-poster-copy">
                        <strong>{eventForm.posterFileName || 'Poster selected'}</strong>
                        <button type="button" className="member-cancel-button compact-action" onClick={() => setEventForm((current) => ({ ...current, posterUrl: '', posterFileName: '' }))}>Remove poster</button>
                      </div>
                    </div>
                  ) : (
                    <div className="empty-card compact-empty-card">No poster uploaded for this event.</div>
                  )}
                </div>
                <button type="button" className="action-button publish" onClick={() => void handlePublishEvent()} disabled={!canPublishEvents}>Publish event</button>
              </div>
            </article>
            <article className="wide-card updates-meetings-summary">
              <div className="updates-meetings-summary-grid">
                <div className="common-meeting-intro">
                  <strong>{`${selectedChurch?.displayCity ?? 'Church'} Meetings`}</strong>
                  <p className="detail-copy">Default church-specific meetings and Sunday service instances for the selected church.</p>
                </div>
                <div className="common-meeting-intro">
                  <strong>Bethel Church Common Meetings</strong>
                  <p className="detail-copy">Shared recurring Bethel meetings across all churches, with per-instance cancel and restore controls.</p>
                </div>
              </div>
            </article>
            <article className="composer-card updates-card event-management-card">
              <p className="panel-kicker">Church specific events</p>
              <h3>Published church-specific events for {selectedChurch?.displayCity ?? 'the selected church'}</h3>
              <div className="event-filter-row">
                {([
                  ['thisWeek', 'This week'],
                  ['nextWeek', 'Next week'],
                  ['all', 'All events'],
                ] as const).map(([filterKey, label]) => (
                  <button
                    key={filterKey}
                    type="button"
                    className={`member-edit-button event-filter-button ${churchSpecificEventFilter === filterKey ? 'active' : ''}`}
                    onClick={() => setChurchSpecificEventFilter(filterKey)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="update-list event-instance-list">
                {filteredUpcomingChurchSpecificMeetings.map((meeting) => (
                  <div key={`${meeting.key}-${meeting.occurrenceDate}`} className={`update-card announcement-update-card ${meeting.isCancelled ? 'common-meeting-cancelled' : ''}`}>
                    <div className="announcement-update-card-top">
                      <strong>{meeting.title}</strong>
                      {!meeting.isCancelled ? (
                        <button type="button" className="action-button reject compact-action announcement-delete-button" onClick={() => void handleCancelChurchSpecificMeeting(meeting)} disabled={!canManageCommonMeetings}>Cancel</button>
                      ) : (
                        <button type="button" className="action-button publish compact-action announcement-delete-button" onClick={() => void handleRestoreChurchSpecificMeeting(meeting)} disabled={!canManageCommonMeetings}>Restore instance</button>
                      )}
                    </div>
                    <p className="muted-line"><span className="mini-chip">{selectedChurch?.displayCity ?? 'Church'} event</span></p>
                    <p className="detail-copy">{meeting.description}</p>
                    <p className="muted-line">{formatDateTimeRange(meeting.startAt, meeting.endAt)}</p>
                    <p className="muted-line">{meeting.location}</p>
                  </div>
                ))}
                {filteredScopedChurchSpecificEvents.map((event) => (
                  <div key={event.id} className="update-card announcement-update-card">
                    {event.posterUrl ? <img className="update-card-poster" src={event.posterUrl} alt={`${event.title} poster`} /> : null}
                    <div className="announcement-update-card-top">
                      <strong>{event.title}</strong>
                      <button type="button" className="action-button reject compact-action announcement-delete-button" onClick={() => void handleDeleteEvent(event)} disabled={!canCancelPublishedEvent(event)}>Cancel</button>
                    </div>
                    <p className="muted-line"><span className="mini-chip">{event.scopeLabel ?? selectedChurch?.displayCity ?? 'Church'} event</span></p>
                    <p className="detail-copy">{event.description}</p>
                    <p className="muted-line">{formatDateTimeRange(event.startAt, event.endAt)}</p>
                    <p className="muted-line">{event.location}</p>
                  </div>
                ))}
                {filteredUpcomingChurchSpecificMeetings.length === 0 && filteredScopedChurchSpecificEvents.length === 0 ? <div className="empty-card">No church-specific meeting instances or published events match this filter.</div> : null}
              </div>
            </article>

            <article className="composer-card updates-card event-management-card">
              <p className="panel-kicker">Common events</p>
              <h3>Published common events across all churches</h3>
              <div className="event-filter-row">
                {([
                  ['thisWeek', 'This week'],
                  ['nextWeek', 'Next week'],
                  ['all', 'All events'],
                ] as const).map(([filterKey, label]) => (
                  <button
                    key={filterKey}
                    type="button"
                    className={`member-edit-button event-filter-button ${commonEventFilter === filterKey ? 'active' : ''}`}
                    onClick={() => setCommonEventFilter(filterKey)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="update-list event-instance-list">
                {filteredUpcomingCommonMeetings.map((meeting) => (
                  <div key={`${meeting.key}-${meeting.occurrenceDate}`} className={`update-card announcement-update-card ${meeting.isCancelled ? 'common-meeting-cancelled' : ''}`}>
                    <div className="announcement-update-card-top">
                      <strong>{meeting.title}</strong>
                      {!meeting.isCancelled ? (
                        <button type="button" className="action-button reject compact-action announcement-delete-button" onClick={() => void handleCancelCommonMeeting(meeting)} disabled={!canManageCommonMeetings}>Cancel</button>
                      ) : (
                        <button type="button" className="action-button publish compact-action announcement-delete-button" onClick={() => void handleRestoreCommonMeeting(meeting)} disabled={!canManageCommonMeetings}>Restore instance</button>
                      )}
                    </div>
                    <p className="muted-line"><span className="mini-chip">Bethel Church event</span></p>
                    <p className="detail-copy">{meeting.description}</p>
                    <p className="muted-line">{formatDateTimeRange(meeting.startAt, meeting.endAt)}</p>
                    <p className="muted-line">{meeting.location}</p>
                  </div>
                ))}
                {filteredScopedCommonEvents.map((event) => (
                  <div key={event.id} className="update-card announcement-update-card">
                    {event.posterUrl ? <img className="update-card-poster" src={event.posterUrl} alt={`${event.title} poster`} /> : null}
                    <div className="announcement-update-card-top">
                      <strong>{event.title}</strong>
                      <button type="button" className="action-button reject compact-action announcement-delete-button" onClick={() => void handleDeleteEvent(event)} disabled={!canCancelPublishedEvent(event)}>Cancel Event</button>
                    </div>
                    <p className="muted-line"><span className="mini-chip">Common event</span></p>
                    <p className="detail-copy">{event.description}</p>
                    <p className="muted-line">{formatDateTimeRange(event.startAt, event.endAt)}</p>
                    <p className="muted-line">{event.location}</p>
                  </div>
                ))}
                {filteredUpcomingCommonMeetings.length === 0 && filteredScopedCommonEvents.length === 0 ? <div className="empty-card">No common meetings or published common events match this filter.</div> : null}
              </div>
            </article>
          </section>
        ) : null}

        {activeView === 'churches' ? (
          <section className="dashboard-grid">
            {adminProfile.roleKey === 'networkSuperAdmin' ? (
              <article className="wide-card">
                <div className="section-heading">
                  <div>
                    <p className="panel-kicker">Add church location</p>
                    <h3>Create a new church with the default teams already included</h3>
                  </div>
                </div>
                <div className="form-grid church-form-grid">
                  <input className="auth-input" type="text" value={churchForm.name} onChange={(event) => setChurchForm((current) => ({ ...current, name: event.target.value }))} placeholder="Church name" />
                  <input className="auth-input" type="text" value={churchForm.city} onChange={(event) => setChurchForm((current) => ({ ...current, city: event.target.value }))} placeholder="City" />
                  <input className="auth-input" type="text" value={churchForm.displayCity} onChange={(event) => setChurchForm((current) => ({ ...current, displayCity: event.target.value }))} placeholder="Display city" />
                  <input className="auth-input" type="text" value={churchForm.address} onChange={(event) => setChurchForm((current) => ({ ...current, address: event.target.value }))} placeholder="Address" />
                  <input className="auth-input" type="text" value={churchForm.serviceTimes} onChange={(event) => setChurchForm((current) => ({ ...current, serviceTimes: event.target.value }))} placeholder="Service time" />
                  <input className="auth-input" type="text" value={churchForm.sharedDrivePath} onChange={(event) => setChurchForm((current) => ({ ...current, sharedDrivePath: event.target.value }))} placeholder="Drive path" />
                  <input className="auth-input" type="text" value={churchForm.googleMapsLabel} onChange={(event) => setChurchForm((current) => ({ ...current, googleMapsLabel: event.target.value }))} placeholder="Google Maps label" />
                  <input className="auth-input" type="email" value={churchForm.contactEmail} onChange={(event) => setChurchForm((current) => ({ ...current, contactEmail: event.target.value }))} placeholder="Contact email" />
                  <input className="auth-input" type="text" value={churchForm.contactPhone} onChange={(event) => setChurchForm((current) => ({ ...current, contactPhone: event.target.value }))} placeholder="Contact phone" />
                  <input className="auth-input" type="text" value={churchForm.instagramUrl} onChange={(event) => setChurchForm((current) => ({ ...current, instagramUrl: event.target.value }))} placeholder="Instagram URL" />
                  <input className="auth-input" type="text" value={churchForm.facebookUrl} onChange={(event) => setChurchForm((current) => ({ ...current, facebookUrl: event.target.value }))} placeholder="Facebook URL" />
                  <button type="button" className="action-button publish" onClick={() => void handleCreateChurch()}>Add church location</button>
                </div>
              </article>
            ) : null}
            {churches.map((church) => {
              const isEditing = churchEditId === church.id;
              const draft = churchEditDrafts[church.id] ?? {
                name: church.name,
                city: church.city,
                displayCity: church.displayCity,
                address: church.address,
                serviceTimes: church.serviceTimes,
                sharedDrivePath: church.sharedDrivePath,
                googleMapsLabel: church.googleMapsLabel,
                contactEmail: church.contactEmail ?? '',
                contactPhone: church.contactPhone ?? '',
                instagramUrl: church.instagramUrl ?? '',
                facebookUrl: church.facebookUrl ?? '',
              };

              return (
                <article key={church.id} className="church-card church-editor-card">
                  <div className="section-heading">
                    <div>
                      <p className="panel-kicker">{church.city}</p>
                      <h3>{church.displayCity}</h3>
                    </div>
                    {canEditChurch ? (
                      <div className="chip-row">
                        {!isEditing ? <button type="button" className="action-button church-edit-button" onClick={() => startChurchEdit(church)}>Edit church</button> : null}
                      </div>
                    ) : null}
                  </div>
                  {isEditing ? (
                    <div className="form-grid church-edit-grid">
                      <input className="auth-input" type="text" value={draft.name} onChange={(event) => setChurchEditDrafts((current) => ({ ...current, [church.id]: { ...draft, name: event.target.value } }))} placeholder="Church name" />
                      <input className="auth-input" type="text" value={draft.displayCity} onChange={(event) => setChurchEditDrafts((current) => ({ ...current, [church.id]: { ...draft, displayCity: event.target.value } }))} placeholder="Display city" />
                      <input className="auth-input" type="text" value={draft.city} onChange={(event) => setChurchEditDrafts((current) => ({ ...current, [church.id]: { ...draft, city: event.target.value } }))} placeholder="City" />
                      <input className="auth-input" type="text" value={draft.serviceTimes} onChange={(event) => setChurchEditDrafts((current) => ({ ...current, [church.id]: { ...draft, serviceTimes: event.target.value } }))} placeholder="Service times" />
                      <input className="auth-input church-edit-span" type="text" value={draft.address} onChange={(event) => setChurchEditDrafts((current) => ({ ...current, [church.id]: { ...draft, address: event.target.value } }))} placeholder="Address" />
                      <input className="auth-input" type="text" value={draft.sharedDrivePath} onChange={(event) => setChurchEditDrafts((current) => ({ ...current, [church.id]: { ...draft, sharedDrivePath: event.target.value } }))} placeholder="Drive path" />
                      <input className="auth-input" type="text" value={draft.googleMapsLabel} onChange={(event) => setChurchEditDrafts((current) => ({ ...current, [church.id]: { ...draft, googleMapsLabel: event.target.value } }))} placeholder="Google Maps label" />
                      <input className="auth-input" type="email" value={draft.contactEmail} onChange={(event) => setChurchEditDrafts((current) => ({ ...current, [church.id]: { ...draft, contactEmail: event.target.value } }))} placeholder="Contact email" />
                      <input className="auth-input" type="text" value={draft.contactPhone} onChange={(event) => setChurchEditDrafts((current) => ({ ...current, [church.id]: { ...draft, contactPhone: event.target.value } }))} placeholder="Contact phone" />
                      <input className="auth-input" type="text" value={draft.instagramUrl} onChange={(event) => setChurchEditDrafts((current) => ({ ...current, [church.id]: { ...draft, instagramUrl: event.target.value } }))} placeholder="Instagram URL" />
                      <input className="auth-input" type="text" value={draft.facebookUrl} onChange={(event) => setChurchEditDrafts((current) => ({ ...current, [church.id]: { ...draft, facebookUrl: event.target.value } }))} placeholder="Facebook URL" />
                      <div className="member-tile-actions church-edit-actions">
                        <button type="button" className="action-button publish" onClick={() => void handleSaveChurchEdit(church)}>Save church</button>
                        <button type="button" className="member-cancel-button" onClick={() => setChurchEditId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="detail-copy">{church.name}</p>
                      <p className="detail-copy">{church.address}</p>
                      <div className="stats-inline"><span>{church.serviceTimes}</span><span>{church.members} members</span></div>
                      <div className="detail-block"><strong>Contact email</strong><span>{church.contactEmail || 'Not added yet'}</span></div>
                      <div className="detail-block"><strong>Contact phone</strong><span>{church.contactPhone || 'Not added yet'}</span></div>
                      <div className="detail-block"><strong>Teams</strong><span>{mergeTeams(defaultTeams as unknown as string[], church.teams).join(', ')}</span></div>
                      <div className="detail-block"><strong>Instagram</strong><span>{church.instagramUrl || 'Not added yet'}</span></div>
                      <div className="detail-block"><strong>Facebook</strong><span>{church.facebookUrl || 'Not added yet'}</span></div>
                    </>
                  )}
                </article>
              );
            })}
          </section>
        ) : null}

        {activeView === 'roles' ? <section className="dashboard-grid">{roleMatrix.map((item) => <article key={item.role} className="role-card"><p className="panel-kicker">Permission design</p><h3>{item.role}</h3><p className="detail-copy">{item.summary}</p></article>)}</section> : null}
        {activeView === 'help' ? (
          <section className="dashboard-grid help-layout">
            {adminHelpSections.map((section) => (
              <article key={section.title} className="wide-card help-card">
                <p className="panel-kicker">{section.kicker}</p>
                <h3>{section.title}</h3>
                <p className="detail-copy">{section.body}</p>
                <div className="help-bullet-list">
                  {section.bullets.map((bullet) => <p key={bullet} className="help-bullet-item">{bullet}</p>)}
                </div>
              </article>
            ))}
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default App;

function OfficialSignature() {
  return (
    <div className="official-signature" aria-label="Official church signature">
      <img className="official-logo-image" src={`${import.meta.env.BASE_URL}official-church-logo.jpg`} alt="Bethel International Pentecostal Church" />
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <span className={className} aria-hidden="true">
      <svg viewBox="0 0 20 20" focusable="false">
        <path d="M5 7L10 12L15 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function RoleIcon({ roleKey }: { roleKey: RoleKey }) {
  if (roleKey === 'networkSuperAdmin') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M10 40V25L23 15L36 25V40" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="round" />
        <path d="M23 1V14M17 8H29" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
        <rect x="19" y="29" width="8" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="3.2" />
        <path d="M2 41V31L9 25L16 31V41" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinejoin="round" />
        <path d="M30 41V31L37 25L44 31V41" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinejoin="round" />
        <path d="M50 10L51.8 14.6L56.8 14.9L53 18L54.2 22.9L50 20.3L45.8 22.9L47 18L43.2 14.9L48.2 14.6L50 10Z" fill="currentColor" />
      </svg>
    );
  }

  if (roleKey === 'churchAdmin') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M12 42V22L32 9L52 22V42" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinejoin="round" />
        <path d="M32 0V12M25 6H39" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
        <rect x="26" y="28" width="12" height="14" rx="2.4" fill="none" stroke="currentColor" strokeWidth="3.4" />
        <path d="M49 9L50.7 13.4L55.5 13.7L51.9 16.7L53 21.3L49 18.9L45 21.3L46.1 16.7L42.5 13.7L47.3 13.4L49 9Z" fill="currentColor" />
      </svg>
    );
  }

  if (roleKey === 'teamLeader') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="25" cy="17" r="8" fill="none" stroke="currentColor" strokeWidth="3.4" />
        <path d="M12 45C15 30 19 23 25 23C31 23 35 30 38 45" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
        <circle cx="45" cy="28" r="8" fill="none" stroke="currentColor" strokeWidth="3" />
        <path d="M45 22.8L46.4 26.1L50 26.3L47.2 28.6L48.1 32L45 30.1L41.9 32L42.8 28.6L40 26.3L43.6 26.1L45 22.8Z" fill="currentColor" />
      </svg>
    );
  }

  if (roleKey === 'pastor') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="3.2" />
        <path d="M24 27C27 19 29 16 32 16C35 16 37 19 40 27" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M47 19C53 17.5 57 21 58 26" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M51 13C59 10.5 64 16.5 64 26" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
        <circle cx="12" cy="39" r="4.2" fill="none" stroke="currentColor" strokeWidth="2.8" />
        <circle cx="32" cy="43" r="4.2" fill="none" stroke="currentColor" strokeWidth="2.8" />
        <circle cx="52" cy="39" r="4.2" fill="none" stroke="currentColor" strokeWidth="2.8" />
        <path d="M6 54C8.5 46 10.5 43 12 43C13.5 43 17 46 19 54" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M26 58C28.5 49 30 46 32 46C34 46 37.5 49 40 58" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M46 54C48.5 46 50.5 43 52 43C53.5 43 57 46 59 54" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (roleKey === 'volunteer') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="26" cy="17" r="8" fill="none" stroke="currentColor" strokeWidth="3.4" />
        <path d="M12 45C15 30 19 23 26 23C33 23 37 30 40 45" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M50 8V24M42 16H58" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="17" r="8" fill="none" stroke="currentColor" strokeWidth="3.6" />
      <path d="M18 46C22 29 26 23 32 23C38 23 42 29 46 46" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" />
    </svg>
  );
}

function TeamIcon({ teamName }: { teamName: string }) {
  const normalizedTeam = teamName.trim().toLowerCase();

  if (normalizedTeam.includes('worship')) {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="20" r="4.4" fill="none" stroke="#16364B" strokeWidth="2.8" />
        <path d="M25 29C27 24 29.3 22 32 22C34.7 22 37 24 39 29" fill="none" stroke="#16364B" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M32 31V45" fill="none" stroke="#BD8A37" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M24 38H40" fill="none" stroke="#BD8A37" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M15 44C20.5 36 26.2 32 32 32C37.8 32 43.5 36 49 44" fill="none" stroke="#2E7B69" strokeWidth="2.3" strokeLinecap="round" />
      </svg>
    );
  }

  if (normalizedTeam.includes('speaker')) {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M22 46H42" fill="none" stroke="#16364B" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M25.5 46L29.5 30H34.5L38.5 46" fill="none" stroke="#16364B" strokeWidth="2.8" strokeLinejoin="round" />
        <circle cx="32" cy="18" r="4.2" fill="none" stroke="#16364B" strokeWidth="2.8" />
        <path d="M43 27C48 25 52 27.5 52 32" fill="none" stroke="#BD8A37" strokeWidth="2.3" strokeLinecap="round" />
        <path d="M46 20C53 16.5 58 21 58 30" fill="none" stroke="#BD8A37" strokeWidth="2.3" strokeLinecap="round" />
      </svg>
    );
  }

  if (normalizedTeam.includes('food')) {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="11.5" fill="none" stroke="#16364B" strokeWidth="2.8" />
        <circle cx="32" cy="32" r="20.5" fill="none" stroke="#16364B" strokeWidth="2.8" />
        <path d="M12 22V42" fill="none" stroke="#BD8A37" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M9 22H15" fill="none" stroke="#BD8A37" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M9 29H15" fill="none" stroke="#BD8A37" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M52 21V42" fill="none" stroke="#2E7B69" strokeWidth="2.8" strokeLinecap="round" />
        <ellipse cx="52" cy="21" rx="3.2" ry="2.3" fill="none" stroke="#2E7B69" strokeWidth="2.3" />
      </svg>
    );
  }

  if (normalizedTeam.includes('sunday school')) {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect x="18" y="20" width="28" height="19" rx="3" fill="none" stroke="#16364B" strokeWidth="2.8" />
        <path d="M32 20V39" fill="none" stroke="#16364B" strokeWidth="2.3" />
        <path d="M22 27H27" fill="none" stroke="#BD8A37" strokeWidth="2.3" strokeLinecap="round" />
        <path d="M22 33H27" fill="none" stroke="#BD8A37" strokeWidth="2.3" strokeLinecap="round" />
        <path d="M37 27H42" fill="none" stroke="#BD8A37" strokeWidth="2.3" strokeLinecap="round" />
        <path d="M37 33H42" fill="none" stroke="#BD8A37" strokeWidth="2.3" strokeLinecap="round" />
        <path d="M20 48C24 43 28 40 32 40C36 40 40 43 44 48" fill="none" stroke="#2E7B69" strokeWidth="2.3" strokeLinecap="round" />
      </svg>
    );
  }

  if (normalizedTeam.includes('tech')) {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect x="17" y="21" width="22" height="15" rx="3.5" fill="none" stroke="#16364B" strokeWidth="2.8" />
        <path d="M28 39V44" fill="none" stroke="#16364B" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M22 48H34" fill="none" stroke="#16364B" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M46 20V44" fill="none" stroke="#BD8A37" strokeWidth="2.8" strokeLinecap="round" />
        <circle cx="46" cy="32" r="4.4" fill="none" stroke="#BD8A37" strokeWidth="2.3" />
        <path d="M56 25V51" fill="none" stroke="#2E7B69" strokeWidth="2.8" strokeLinecap="round" />
        <circle cx="56" cy="42" r="4.4" fill="none" stroke="#2E7B69" strokeWidth="2.3" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="24" r="6" fill="none" stroke="#16364B" strokeWidth="2.8" />
      <path d="M22 46C25 33 28 28 32 28C36 28 39 33 42 46" fill="none" stroke="#16364B" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}
