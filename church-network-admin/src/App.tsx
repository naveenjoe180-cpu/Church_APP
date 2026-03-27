import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';

import { firebaseConfigStatus, firestoreDb, isFirebaseConfigured } from './config/firebase';
import {
  addChurchTeam,
  createChurchLocation,
  createManagedMember,
  createVolunteerAssignment,
  deleteVolunteerAssignment,
  publishAnnouncement,
  publishEvent,
  removeChurchTeam,
  subscribeToAccessRequests,
  subscribeToAnnouncements,
  subscribeToEvents,
  subscribeToMembers,
  subscribeToPrayerRequests,
  subscribeToVolunteerAssignments,
  updateAccessRequestStatus,
  updateMemberAssignments,
  updatePrayerRequestStatus,
} from './services/firebaseData';
import { subscribeToChurches } from './services/churches';
import {
  ensureAdminUserProfile,
  onAdminAuthChanged,
  signInAdminWithEmail,
  signInAdminWithGoogle,
  signOutAdmin,
  type AdminSession,
} from './services/auth';
import {
  churches as mockChurches,
  churchAnnouncements as mockAnnouncements,
  churchEvents as mockEvents,
  members as mockMembers,
  pendingAccessRequests as mockAccessRequests,
  pendingPrayerRequests as mockPrayerRequests,
  roleLabels,
  roleMatrix,
  volunteerAssignments as mockAssignments,
} from './data/mockData';
import type {
  AccessRequest,
  Church,
  ChurchAnnouncement,
  ChurchEventItem,
  MemberRecord,
  PrayerRequest,
  RoleKey,
  VolunteerAssignment,
} from './types';

type ViewKey = 'overview' | 'approvals' | 'members' | 'planning' | 'updates' | 'churches' | 'prayers' | 'roles';

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
  { key: 'members', label: 'Members' },
  { key: 'planning', label: 'Team Planning' },
  { key: 'updates', label: 'Church Updates' },
  { key: 'churches', label: 'Churches And Teams' },
  { key: 'prayers', label: 'Prayer Moderation' },
  { key: 'roles', label: 'Role Matrix' },
] as const;

const viewTitle: Record<ViewKey, string> = {
  overview: 'Overview',
  approvals: 'Approval Queue',
  members: 'Members',
  planning: 'Team Planning',
  updates: 'Church Updates',
  churches: 'Churches And Teams',
  prayers: 'Prayer Moderation',
  roles: 'Role Matrix',
};

const viewSummary: Record<ViewKey, string> = {
  overview: 'Track church readiness, member activity, ministry planning, and urgent actions from one shared control room.',
  approvals: 'Review new requests church by church and keep onboarding clear for local admins and leaders.',
  members: 'Manage approved members, their effective role, and the teams they serve in for each church.',
  planning: 'Shape Sunday service flow, assign one person per role, and archive completed Sundays for later review.',
  updates: 'Publish local announcements and church events with addresses and audience scope tied to the selected church.',
  churches: 'Add church locations, keep church details current, and review each church team structure.',
  prayers: 'Moderate prayer requests with the church scope already applied so each location handles its own queue.',
  roles: 'Review the permission model for super admins, church admins, pastors, team leaders, volunteers, and members.',
};

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

const initialManagedMemberForm: ManagedMemberForm = { fullName: '', email: '', roleKey: 'member', teamNames: [] };

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
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

function formatServiceDate(value: string) {
  const date = new Date(value);
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
      upcoming.push(cursor.toISOString().slice(0, 10));
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
      past.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  return past;
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
    return Array.isArray(parsedValue) ? parsedValue : [];
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

function getHighestRole(roleFlags: Record<string, unknown> | undefined, teamNames: string[]): RoleKey {
  if (roleFlags?.networkSuperAdmin === true) return 'networkSuperAdmin';
  if (roleFlags?.churchAdmin === true) return 'churchAdmin';
  if (roleFlags?.pastor === true) return 'pastor';
  if (roleFlags?.teamLeader === true) return 'teamLeader';
  return teamNames.length > 0 ? 'volunteer' : 'member';
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

function buildArchivePlan(serviceDate: string, serviceOrder: ServiceActivity[], roleConfigs: RoleConfig[], assignments: VolunteerAssignment[]) {
  const activities = serviceOrder.map((activity) => {
    const roles = buildRequirementsForActivities([activity], roleConfigs).map((requirement) => ({
      roleName: requirement.roleName,
      assignments: getAssignmentsForRequirement(assignments, serviceDate, requirement).map((assignment) => ({
        assignedTo: assignment.assignedTo,
        assignedUserId: assignment.assignedUserId,
        responseStatus: assignment.responseStatus,
      })),
    }));

    return { activityName: activity.activityName, teamName: activity.teamName, roles };
  });

  return activities.some((activity) => activity.roles.some((role) => role.assignments.length > 0))
    ? { serviceDate, activities }
    : null;
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
  const [emailAuthForm, setEmailAuthForm] = useState({ email: '', password: '' });
  const [churches, setChurches] = useState<Church[]>(mockChurches);
  const [selectedChurchId, setSelectedChurchId] = useState(mockChurches[0]?.id ?? '');
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>(mockAccessRequests);
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>(mockPrayerRequests);
  const [announcements, setAnnouncements] = useState<ChurchAnnouncement[]>(mockAnnouncements);
  const [events, setEvents] = useState<ChurchEventItem[]>(mockEvents);
  const [members, setMembers] = useState<MemberRecord[]>(mockMembers);
  const [assignments, setAssignments] = useState<VolunteerAssignment[]>(mockAssignments);
  const [selectedRequestId, setSelectedRequestId] = useState(mockAccessRequests[0]?.id ?? '');
  const [updateMessage, setUpdateMessage] = useState('');
  const [roleConfigsByChurch, setRoleConfigsByChurch] = useState<Record<string, RoleConfig[]>>({});
  const [serviceOrderByChurch, setServiceOrderByChurch] = useState<Record<string, ServiceActivity[]>>({});
  const [managedMemberForm, setManagedMemberForm] = useState<ManagedMemberForm>(initialManagedMemberForm);
  const [memberEditId, setMemberEditId] = useState<string | null>(null);
  const [memberEditDrafts, setMemberEditDrafts] = useState<Record<string, { roleKey: RoleKey; teamNames: string[] }>>({});
  const [newTeamName, setNewTeamName] = useState('');
  const [newRoleForm, setNewRoleForm] = useState<{ teamName: string; roleName: string }>({ teamName: defaultTeams[1], roleName: '' });
  const [expandedTeamName, setExpandedTeamName] = useState<string>(defaultTeams[1]);
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
  const [expandedActivityKeys, setExpandedActivityKeys] = useState<Record<string, boolean>>({});
  const [isEditingServiceOrder, setIsEditingServiceOrder] = useState(false);
  const [archivedPlans, setArchivedPlans] = useState<ArchivedServicePlan[]>([]);
  const [selectedArchiveSunday, setSelectedArchiveSunday] = useState('');
  const [announcementForm, setAnnouncementForm] = useState({ title: '', body: '', isPublic: false });
  const [eventForm, setEventForm] = useState({
    title: '',
    description: '',
    location: mockChurches[0]?.address ?? '',
    startAt: '',
    endAt: '',
    isPublic: true,
  });
  const [churchForm, setChurchForm] = useState({
    name: '',
    city: '',
    displayCity: '',
    address: '',
    serviceTimes: '',
    sharedDrivePath: '',
    googleMapsLabel: '',
    instagramUrl: '',
    facebookUrl: '',
  });
  const [isCreatingAssignment, setIsCreatingAssignment] = useState(false);

  const selectedChurch = churches.find((church) => church.id === selectedChurchId) ?? churches[0] ?? null;
  const selectedChurchTeams = selectedChurch ? mergeTeams(defaultTeams as unknown as string[], selectedChurch.teams) : [...defaultTeams];
  const selectedChurchRoleConfigs = selectedChurch ? roleConfigsByChurch[selectedChurch.id] ?? getDefaultRoleConfigs(selectedChurch.id) : [];
  const orderedSelectedChurchTeams = useMemo(
    () => orderTeamsByRoleCount(selectedChurchTeams, selectedChurchRoleConfigs),
    [selectedChurchRoleConfigs, selectedChurchTeams],
  );
  const selectedChurchServiceOrder = selectedChurch ? serviceOrderByChurch[selectedChurch.id] ?? getDefaultServiceOrder(selectedChurch.id) : [];
  const scopedRequests = useMemo(() => accessRequests.filter((request) => !selectedChurch || request.churchId === selectedChurch.id), [accessRequests, selectedChurch]);
  const scopedPrayerRequests = useMemo(() => prayerRequests.filter((request) => !selectedChurch || request.churchId === selectedChurch.id), [prayerRequests, selectedChurch]);
  const scopedAnnouncements = useMemo(() => announcements.filter((announcement) => !selectedChurch || announcement.churchId === selectedChurch.id), [announcements, selectedChurch]);
  const scopedEvents = useMemo(() => events.filter((event) => !selectedChurch || event.churchId === selectedChurch.id), [events, selectedChurch]);
  const scopedMembers = useMemo(() => members.filter((member) => !selectedChurch || member.churchId === selectedChurch.id), [members, selectedChurch]);
  const scopedAssignments = useMemo(() => assignments.filter((assignment) => !selectedChurch || assignment.churchId === selectedChurch.id), [assignments, selectedChurch]);
  const selectedRequest =
    scopedRequests.find((request) => request.id === selectedRequestId)
    ?? scopedRequests[0]
    ?? accessRequests.find((request) => request.id === selectedRequestId)
    ?? null;
  const upcomingPlanningSundays = useMemo(() => getUpcomingSundayDates(2), []);
  const archivedPlanningSundays = useMemo(() => getPastSundayDates(260), []);
  const planningActivityOptions = useMemo(() => buildPlanningActivityOptions(selectedChurchServiceOrder), [selectedChurchServiceOrder]);
  const selectedPlanningActivity = useMemo(
    () => planningActivityOptions.find((activity) => activity.key === planningForm.activityKey) ?? null,
    [planningActivityOptions, planningForm.activityKey],
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
  const canManagePlanningStructure = adminProfile.roleKey === 'networkSuperAdmin' || adminProfile.roleKey === 'churchAdmin';
  const canPlanAllTeams = adminProfile.roleKey === 'networkSuperAdmin' || adminProfile.roleKey === 'churchAdmin';

  useEffect(() => {
    return onAdminAuthChanged((session) => {
      setAdminSession(session);
      if (!session && isFirebaseConfigured) {
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
      if (!active) {
        return;
      }

      setAdminProfile({
        hasDashboardPermission: roleKey === 'networkSuperAdmin' || roleKey === 'churchAdmin' || roleKey === 'teamLeader' || roleKey === 'pastor',
        roleKey,
        churchIds: roleKey === 'networkSuperAdmin' ? mockChurches.map((church) => church.id) : churchAccess,
        teamNames: teamAccess,
      });
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
    setSelectedArchiveSunday(storedArchivedPlans[0]?.serviceDate ?? '');
    setEventForm((current) => ({
      ...current,
      location: selectedChurch.address,
    }));
  }, [selectedChurch, selectedChurchTeams]);

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
    const unsubscribeRequests = subscribeToAccessRequests(activeChurchId, setAccessRequests, () => setAccessRequests(mockAccessRequests));
    const unsubscribePrayers = subscribeToPrayerRequests(activeChurchId, setPrayerRequests, () => setPrayerRequests(mockPrayerRequests));
    const unsubscribeMembers = subscribeToMembers(activeChurchId, setMembers, () => setMembers(mockMembers));
    const unsubscribeAnnouncements = activeChurchId
      ? subscribeToAnnouncements(activeChurchId, setAnnouncements, () => setAnnouncements(mockAnnouncements))
      : () => undefined;
    const unsubscribeEvents = activeChurchId
      ? subscribeToEvents(activeChurchId, setEvents, () => setEvents(mockEvents))
      : () => undefined;
    const unsubscribeAssignments = subscribeToVolunteerAssignments(activeChurchId, null, setAssignments, () => setAssignments(mockAssignments));

    return () => {
      unsubscribeRequests();
      unsubscribePrayers();
      unsubscribeMembers();
      unsubscribeAnnouncements();
      unsubscribeEvents();
      unsubscribeAssignments();
    };
  }, [selectedChurch?.id]);

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
    setSelectedArchiveSunday((current) => current || mergedPlans[0]?.serviceDate || '');
    saveArchivedPlans(selectedChurch.id, mergedPlans);
  }, [archivedPlanningSundays, assignments, roleConfigsByChurch, selectedChurch, serviceOrderByChurch]);

  const allowedChurchIds = adminProfile.roleKey === 'networkSuperAdmin' ? churches.map((church) => church.id) : adminProfile.churchIds;
  const scopeChurchChoices = churches.filter((church) => allowedChurchIds.length === 0 || allowedChurchIds.includes(church.id));

  useEffect(() => {
    if (!selectedChurchId && scopeChurchChoices[0]?.id) {
      setSelectedChurchId(scopeChurchChoices[0].id);
      return;
    }

    if (selectedChurchId && scopeChurchChoices.length > 0 && !scopeChurchChoices.some((church) => church.id === selectedChurchId)) {
      setSelectedChurchId(scopeChurchChoices[0].id);
    }
  }, [scopeChurchChoices, selectedChurchId]);

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

  const handleSignInWithEmail = async () => {
    setIsAuthenticating(true);
    setAuthError('');
    try {
      if (!emailAuthForm.email.trim() || !emailAuthForm.password.trim()) {
        throw new Error('Add both email and password to continue.');
      }

      const session = await signInAdminWithEmail(emailAuthForm.email, emailAuthForm.password);
      setAdminSession(session);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to sign in with email right now.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignOut = async () => {
    await signOutAdmin();
    setAdminSession(null);
    setAuthError('');
  };

  const handleApproveRequest = async (nextStatus: 'approved' | 'rejected') => {
    if (!selectedRequest) {
      return;
    }

    try {
      if (isFirebaseConfigured) {
        await updateAccessRequestStatus(selectedRequest, nextStatus, selectedRequest.requestedRoles);
      }
      setAccessRequests((current) => current.map((request) => request.id === selectedRequest.id ? { ...request, status: nextStatus } : request));
      setUpdateMessage(nextStatus === 'approved' ? `Approved ${selectedRequest.fullName}.` : `Rejected ${selectedRequest.fullName}.`);
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to update the access request.');
    }
  };

  const handleModeratePrayer = async (requestId: string, nextStatus: 'approved' | 'hidden') => {
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

  const handleCreateManagedMember = async () => {
    if (!selectedChurch) {
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
      };
      setMembers((current) => [...current, nextMember].sort((left, right) => left.fullName.localeCompare(right.fullName)));
      setManagedMemberForm(initialManagedMemberForm);
      setUpdateMessage(`Created a managed member profile for ${selectedChurch.displayCity}.`);
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to create the managed member profile.');
    }
  };

  const handleStartMemberEdit = (member: MemberRecord) => {
    setMemberEditId(member.id);
    setMemberEditDrafts((current) => ({
      ...current,
      [member.id]: {
        roleKey: member.roleKey,
        teamNames: member.teamNames,
      },
    }));
  };

  const handleSaveMemberEdit = async (member: MemberRecord) => {
    const draft = memberEditDrafts[member.id];
    if (!draft) {
      return;
    }

    try {
      const effectiveRole = normalizeMemberRole(draft.roleKey, draft.teamNames);
      if (isFirebaseConfigured) {
        await updateMemberAssignments({
          memberId: member.id,
          churchId: member.churchId,
          roleKey: effectiveRole,
          teamNames: draft.teamNames,
        });
      }
      setMembers((current) =>
        current.map((currentMember) =>
          currentMember.id === member.id
            ? { ...currentMember, roleKey: effectiveRole, teamName: draft.teamNames[0] ?? '', teamNames: draft.teamNames }
            : currentMember,
        ),
      );
      setMemberEditId(null);
      setUpdateMessage(`Updated ${member.fullName}.`);
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to save the member update.');
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
      setExpandedTeamName(defaultTeams[1]);
      setUpdateMessage(`Removed ${teamName}. Existing assignments stay in history.`);
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
  };

  const handleMoveActivity = (activityId: string, direction: 'up' | 'down') => {
    if (!selectedChurch || !canManagePlanningStructure) {
      return;
    }
    setServiceOrderByChurch((current) => {
      const serviceOrder = [...(current[selectedChurch.id] ?? getDefaultServiceOrder(selectedChurch.id))];
      const currentIndex = serviceOrder.findIndex((activity) => activity.id === activityId);
      const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (currentIndex === -1 || nextIndex < 0 || nextIndex >= serviceOrder.length) {
        return current;
      }
      const [movedActivity] = serviceOrder.splice(currentIndex, 1);
      serviceOrder.splice(nextIndex, 0, movedActivity);
      return { ...current, [selectedChurch.id]: serviceOrder };
    });
  };

  const openActivityPlanner = (serviceDate: string, activity: ServiceActivity, message?: string) => {
    const activityKey = getActivityPlanningKey(activity.activityName, activity.id);
    setSelectedPlanningSunday(serviceDate);
    setPlanningForm((current) => ({ ...current, serviceDate, activityKey }));
    setOpenedPlanningKey(`${serviceDate}:${activityKey}`);

    const activitiesToPlan = selectedChurchServiceOrder.filter((entry) => getActivityPlanningKey(entry.activityName, entry.id) === activityKey);
    const requirements = buildRequirementsForActivities(activitiesToPlan, selectedChurchRoleConfigs);
    setPlanningDraftAssignments(
      requirements.reduce<Record<string, PlanningDraftItem[]>>((drafts, requirement) => {
        const existingAssignment = getAssignmentsForRequirement(scopedAssignments, serviceDate, requirement)[0];
        drafts[requirement.id] = existingAssignment
          ? [{ assignedTo: existingAssignment.assignedTo, assignedUserId: existingAssignment.assignedUserId }]
          : [];
        return drafts;
      }, {}),
    );
    setUpdateMessage(message ?? `Planning ${activity.activityName} for ${formatServiceDate(serviceDate)}. Drag the right people into the role slots, then confirm the plan.`);
  };

  const handleDropPlanningMember = (requirement: ServiceRequirement, memberId: string) => {
    const member = visibleMembers.find((item) => item.id === memberId);
    if (!member) {
      return;
    }

    const canUseMember =
      requirement.teamName === 'Service Flow'
      || planningForm.allowOtherMembers
      || member.teamNames.includes(requirement.teamName);
    if (!canUseMember) {
      setUpdateMessage(`${member.fullName} is outside ${requirement.teamName}. Turn on "Other member" first if you want to assign them here.`);
      return;
    }

    const existingItem = (planningDraftAssignments[requirement.id] ?? [])[0];
    if (existingItem?.assignedUserId === member.id) {
      setUpdateMessage(`${member.fullName} is already planned for ${requirement.roleName}.`);
      return;
    }
    if (existingItem) {
      setUpdateMessage(`Remove ${existingItem.assignedTo} from ${requirement.roleName} before adding another person.`);
      return;
    }

    setPlanningDraftAssignments((current) => ({
      ...current,
      [requirement.id]: [{ assignedTo: member.fullName, assignedUserId: member.id }],
    }));
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

      setAssignments((current) => [
        ...current.filter((assignment) => !assignmentsToDelete.some((deletedAssignment) => deletedAssignment.id === assignment.id)),
        ...createdAssignments,
      ].sort((left, right) => left.serviceDate.localeCompare(right.serviceDate) || left.assignedTo.localeCompare(right.assignedTo)));
      setUpdateMessage(`Confirmed ${selectedPlanningActivity.label} for ${formatServiceDate(planningForm.serviceDate)}.`);
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to confirm the activity plan.');
    } finally {
      setIsCreatingAssignment(false);
    }
  };

  const handleDeleteAssignment = async (assignment: VolunteerAssignment) => {
    try {
      if (isFirebaseConfigured) {
        await deleteVolunteerAssignment(assignment.id);
      }
      setAssignments((current) => current.filter((currentAssignment) => currentAssignment.id !== assignment.id));
      setUpdateMessage(`Removed ${assignment.roleName} for ${assignment.assignedTo} on ${formatServiceDate(assignment.serviceDate)}.`);
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to delete the assignment.');
    }
  };

  const handlePublishAnnouncement = async () => {
    if (!selectedChurch || !announcementForm.title.trim() || !announcementForm.body.trim()) {
      setUpdateMessage('Add both a title and body before publishing the announcement.');
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
        });
      }
      setAnnouncements((current) => [
        {
          id: createId('announcement'),
          churchId: selectedChurch.id,
          title: announcementForm.title.trim(),
          body: announcementForm.body.trim(),
          publishedAt: new Date().toISOString(),
          publishedBy: adminSession?.email ?? 'Church admin',
          isPublic: announcementForm.isPublic,
        },
        ...current,
      ]);
      setAnnouncementForm({ title: '', body: '', isPublic: false });
      setUpdateMessage(`Published a church update for ${selectedChurch.displayCity}.`);
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to publish the announcement.');
    }
  };

  const handlePublishEvent = async () => {
    if (!selectedChurch || !eventForm.title.trim() || !eventForm.startAt || !eventForm.endAt) {
      setUpdateMessage('Add the event title, start time, and end time before publishing.');
      return;
    }

    try {
      if (isFirebaseConfigured) {
        await publishEvent({
          churchId: selectedChurch.id,
          title: eventForm.title,
          description: eventForm.description,
          location: eventForm.location || selectedChurch.address,
          startAt: eventForm.startAt,
          endAt: eventForm.endAt,
          createdBy: adminSession?.email ?? 'Church admin',
          isPublic: eventForm.isPublic,
        });
      }
      setEvents((current) => [
        ...current,
        {
          id: createId('event'),
          churchId: selectedChurch.id,
          title: eventForm.title.trim(),
          description: eventForm.description.trim(),
          location: eventForm.location || selectedChurch.address,
          startAt: eventForm.startAt,
          endAt: eventForm.endAt,
          createdBy: adminSession?.email ?? 'Church admin',
          isPublic: eventForm.isPublic,
        },
      ].sort((left, right) => left.startAt.localeCompare(right.startAt)));
      setEventForm({
        title: '',
        description: '',
        location: selectedChurch.address,
        startAt: '',
        endAt: '',
        isPublic: true,
      });
      setUpdateMessage(`Published an event for ${selectedChurch.displayCity}.`);
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to publish the event.');
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
        instagramUrl: '',
        facebookUrl: '',
      });
      setUpdateMessage(`Added ${newChurch.displayCity} and the default teams were created for that church.`);
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Unable to add the church location.');
    }
  };

  const handleExportArchive = () => {
    if (!selectedChurch || archivedPlans.length === 0 || typeof window === 'undefined') {
      return;
    }

    const blob = new Blob([JSON.stringify(archivedPlans, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${selectedChurch.id}-service-plan-archives.json`;
    anchor.click();
    window.URL.revokeObjectURL(url);
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
          {isFirebaseConfigured ? (
            <>
              <p className="auth-divider">or continue with email</p>
              <div className="auth-form">
                <label className="auth-label" htmlFor="admin-email">Email</label>
                <input id="admin-email" className="auth-input" type="email" value={emailAuthForm.email} onChange={(event) => setEmailAuthForm((current) => ({ ...current, email: event.target.value }))} placeholder="bethelchurchnuremberg@gmail.com" />
                <label className="auth-label" htmlFor="admin-password">Password</label>
                <input id="admin-password" className="auth-input" type="password" value={emailAuthForm.password} onChange={(event) => setEmailAuthForm((current) => ({ ...current, password: event.target.value }))} placeholder="Password" />
                <button type="button" className="action-button approve" onClick={() => void handleSignInWithEmail()} disabled={isAuthenticating}>
                  {isAuthenticating ? 'Connecting...' : 'Continue With Email'}
                </button>
              </div>
            </>
          ) : null}
          <p className="auth-hint">
            {isFirebaseConfigured ? 'Use a church admin, super admin, or team leader account to access the dashboard.' : 'Firebase keys are missing, so the demo dashboard opens with the local prototype data.'}
          </p>
          {authError ? <p className="auth-error">{authError}</p> : null}
        </div>
      </div>
    );
  }

  const sundayAssignments = scopedAssignments.filter((assignment) => assignment.serviceDate === selectedPlanningSunday);

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <OfficialSignature />
          <p className="brand-kicker">Admin Dashboard</p>
          <h1>Bethel Connect</h1>
          <p className="brand-copy">Church-wide approvals, member management, planning, and communication in one connected workspace.</p>
        </div>

        <nav className="nav-list" aria-label="Admin sections">
          {navigation.map((item) => (
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
          </div>
        </header>
        <section className="scope-studio">
          <article className="scope-card scope-card-primary">
            <p className="panel-kicker">Scope studio</p>
            <h3>Choose the church once, then work everywhere with the same scope.</h3>
            <p className="scope-card-copy">Approvals, members, planning, church updates, and prayer moderation all follow this church selection.</p>
            <div className="scope-card-controls">
              <label className="auth-label" htmlFor="scope-church">Church location</label>
              <select id="scope-church" className="auth-input" value={selectedChurchId} onChange={(event) => setSelectedChurchId(event.target.value)}>
                {scopeChurchChoices.map((church) => (
                  <option key={church.id} value={church.id}>{church.displayCity}</option>
                ))}
              </select>
            </div>
          </article>
          <article className="scope-card scope-card-stat">
            <p className="panel-kicker">Pending approvals</p>
            <h3>{scopedRequests.filter((request) => request.status === 'pending').length}</h3>
            <p className="scope-card-copy">Requests waiting in the selected church queue.</p>
          </article>
          <article className="scope-card scope-card-stat">
            <p className="panel-kicker">Members tracked</p>
            <h3>{scopedMembers.length}</h3>
            <p className="scope-card-copy">{selectedChurch?.displayCity ?? 'Selected church'} members currently visible to this admin account.</p>
          </article>
        </section>

        {activeView === 'overview' ? (
          <section className="dashboard-grid overview-grid">
            <article className="hero-card">
              <p className="panel-kicker">{selectedChurch?.displayCity ?? 'Church'} overview</p>
              <h3>Keep onboarding, Sunday planning, and church updates aligned from one professional workspace.</h3>
              <p>Use the shared scope bar above to switch location once. The dashboard then updates approvals, prayer moderation, members, planning, and communication together.</p>
              <div className="hero-actions">
                <span className="pill strong">Shared church scope</span>
                <span className="pill">Sunday-ready planning</span>
                <span className="pill">Live member coordination</span>
              </div>
            </article>
            <article className="metric-card">
              <p className="panel-kicker">Pending approvals</p>
              <strong>{scopedRequests.filter((request) => request.status === 'pending').length}</strong>
              <span>People waiting for onboarding review in the selected church.</span>
            </article>
            <article className="metric-card">
              <p className="panel-kicker">Pending prayers</p>
              <strong>{scopedPrayerRequests.filter((request) => request.status === 'pending').length}</strong>
              <span>Prayer requests currently waiting for moderation.</span>
            </article>
            <article className="metric-card">
              <p className="panel-kicker">Members tracked</p>
              <strong>{scopedMembers.length}</strong>
              <span>Managed members currently visible in this church scope.</span>
            </article>
            <article className="metric-card">
              <p className="panel-kicker">Assignments</p>
              <strong>{sundayAssignments.length}</strong>
              <span>Planned assignments for the active planning Sunday.</span>
            </article>
            <article className="metric-card">
              <p className="panel-kicker">Announcements</p>
              <strong>{scopedAnnouncements.length}</strong>
              <span>Published church updates prepared for the selected church.</span>
            </article>
            <article className="metric-card">
              <p className="panel-kicker">Upcoming events</p>
              <strong>{scopedEvents.length}</strong>
              <span>Local events and service-related moments coming up next.</span>
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
              </div>
              <div className="request-list">
                {scopedRequests.map((request) => (
                  <button key={request.id} type="button" className={`request-card ${request.id === selectedRequest?.id ? 'selected' : ''}`} onClick={() => setSelectedRequestId(request.id)}>
                    <div className="request-top">
                      <div>
                        <p className="panel-kicker">{request.id}</p>
                        <h3>{request.fullName}</h3>
                      </div>
                      <span className={`status-badge ${request.status}`}>{request.status}</span>
                    </div>
                    <p>{request.note}</p>
                    <p className="muted-line">{request.email} | {request.requestedAt}</p>
                  </button>
                ))}
                {scopedRequests.length === 0 ? <div className="empty-card">No approval requests are waiting for this church.</div> : null}
              </div>
            </article>
            <article className="detail-card">
              <p className="panel-kicker">Selected request</p>
              <h3>{selectedRequest?.fullName ?? 'No request selected'}</h3>
              {selectedRequest ? (
                <>
                  <div className="detail-block"><strong>Email</strong><span>{selectedRequest.email}</span></div>
                  <div className="detail-block">
                    <strong>Requested roles</strong>
                    <div className="chip-row">{selectedRequest.requestedRoles.map((role) => <span key={role} className="mini-chip">{roleLabels[role]}</span>)}</div>
                  </div>
                  <div className="detail-block"><strong>Request note</strong><span>{selectedRequest.note}</span></div>
                  <div className="action-stack horizontal">
                    <button type="button" className="action-button approve" onClick={() => void handleApproveRequest('approved')}>Approve</button>
                    <button type="button" className="action-button reject" onClick={() => void handleApproveRequest('rejected')}>Reject</button>
                  </div>
                </>
              ) : <div className="empty-card">Choose a request to view details.</div>}
            </article>
          </section>
        ) : null}

        {activeView === 'members' ? (
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
                    {(['member', 'volunteer', 'teamLeader', 'pastor', 'churchAdmin'] as RoleKey[]).map((roleKey) => (
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
            <article className="wide-card">
              <div className="section-heading">
                <div>
                  <p className="panel-kicker">Members</p>
                  <h3>{selectedChurch?.displayCity ?? 'Selected church'} members</h3>
                </div>
              </div>
              <div className="member-grid">
                {scopedMembers.map((member) => {
                  const memberDraft = memberEditDrafts[member.id] ?? { roleKey: member.roleKey, teamNames: member.teamNames };
                  const isEditing = memberEditId === member.id;
                  return (
                    <article key={member.id} className="member-tile">
                      <div className="member-tile-top">
                        <div>
                          <h3>{member.fullName}</h3>
                          <p className="member-email">{member.email}</p>
                        </div>
                        <button type="button" className="member-edit-button" onClick={() => handleStartMemberEdit(member)}>Edit</button>
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
                            <strong>Role</strong>
                            <div className="chip-row selection-chip-grid">
                              {(['member', 'volunteer', 'teamLeader', 'pastor', 'churchAdmin'] as RoleKey[]).map((roleKey) => (
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
            {canManagePlanningStructure ? (
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
            ) : null}

            <article className="wide-card">
              <div className="section-heading">
                <div>
                  <p className="panel-kicker">Sunday service order</p>
                  <h3>Plan the next two Sundays</h3>
                </div>
                {canManagePlanningStructure ? <button type="button" className={`action-button publish planning-order-toggle ${isEditingServiceOrder ? 'active' : ''}`} onClick={() => setIsEditingServiceOrder((current) => !current)}>Change service order</button> : null}
              </div>
              <div className="planning-sunday-columns">
                {upcomingPlanningSundays.map((serviceDate) => (
                  <div key={serviceDate} className="planning-sunday-card">
                    <div className="planning-sunday-header">
                      <div>
                        <strong>{formatServiceDate(serviceDate)}</strong>
                        <p>{serviceDate === selectedPlanningSunday ? 'Active planning Sunday' : 'Upcoming service'}</p>
                      </div>
                      <button type="button" className="member-edit-button" onClick={() => setSelectedPlanningSunday(serviceDate)}>Select</button>
                    </div>
                    <div className="planning-activity-list">
                      {selectedChurchServiceOrder.map((activity) => {
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
                            {expanded ? (
                              <div className="planning-activity-body">
                                <div className="planning-activity-controls">
                                  {canPlanActivity ? <button type="button" className="member-edit-button" onClick={() => openActivityPlanner(serviceDate, activity)}>Plan</button> : null}
                                  {isEditingServiceOrder && canManagePlanningStructure ? (
                                    <>
                                      <button type="button" className="member-edit-button" onClick={() => handleMoveActivity(activity.id, 'up')}>Up</button>
                                      <button type="button" className="member-edit-button" onClick={() => handleMoveActivity(activity.id, 'down')}>Down</button>
                                    </>
                                  ) : null}
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
              <h3>Plan the next service role</h3>
              <div className="planning-form-grid planning-activity-picker">
                <select className="auth-input" value={planningForm.serviceDate} onChange={(event) => setPlanningForm((current) => ({ ...current, serviceDate: event.target.value }))}>
                  {upcomingPlanningSundays.map((serviceDate) => <option key={serviceDate} value={serviceDate}>{formatServiceDate(serviceDate)}</option>)}
                </select>
                <select className="auth-input" value={planningForm.activityKey} onChange={(event) => setPlanningForm((current) => ({ ...current, activityKey: event.target.value }))}>
                  <option value="">Choose service activity</option>
                  {planningActivityOptions.map((activity) => <option key={activity.key} value={activity.key}>{activity.label}</option>)}
                </select>
                <button
                  type="button"
                  className="action-button publish"
                  onClick={() => {
                    const activity = selectedPlanningActivity;
                    if (!activity || !planningForm.serviceDate) {
                      setUpdateMessage('Choose both the Sunday and activity before opening the planner.');
                      return;
                    }
                    setOpenedPlanningKey(`${planningForm.serviceDate}:${activity.key}`);
                    const activitiesToPlan = selectedChurchServiceOrder.filter((entry) => activity.activityIds.includes(entry.id));
                    const requirements = buildRequirementsForActivities(activitiesToPlan, selectedChurchRoleConfigs);
                    setPlanningDraftAssignments(
                      requirements.reduce<Record<string, PlanningDraftItem[]>>((drafts, requirement) => {
                        const existingAssignment = getAssignmentsForRequirement(scopedAssignments, planningForm.serviceDate, requirement)[0];
                        drafts[requirement.id] = existingAssignment ? [{ assignedTo: existingAssignment.assignedTo, assignedUserId: existingAssignment.assignedUserId }] : [];
                        return drafts;
                      }, {}),
                    );
                    setUpdateMessage(`Planning ${activity.label} for ${formatServiceDate(planningForm.serviceDate)}.`);
                  }}
                >
                  Plan
                </button>
              </div>
              {selectedPlanningActivity && openedPlanningKey === `${planningForm.serviceDate}:${selectedPlanningActivity.key}` ? (
                <div className="planning-activity-workbench">
                  <div className="planning-workbench-header">
                    <div><h4>{selectedPlanningActivity.label}</h4><p>{formatServiceDate(planningForm.serviceDate)} | {selectedPlanningActivity.teamName}</p></div>
                    <button type="button" className={`member-edit-button planning-other-member-toggle ${planningForm.allowOtherMembers ? 'active' : ''}`} onClick={() => setPlanningForm((current) => ({ ...current, allowOtherMembers: !current.allowOtherMembers }))}>Other member</button>
                  </div>
                  <div className="planning-workbench-grid">
                    <div className="planning-workbench-panel">
                      <h4>Eligible members</h4>
                      <div className="planning-member-list">
                        {visibleMembers.map((member) => (
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
                            ) : <div className="planning-slot-empty">Drop a member tile here.</div>}
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
                    <button type="button" className="action-button approve" onClick={() => void handleConfirmActivityPlan()} disabled={isCreatingAssignment}>{isCreatingAssignment ? 'Saving...' : 'Confirm activity plan'}</button>
                  </div>
                </div>
              ) : null}
            </article>

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
                  <select id="archive-sunday" className="auth-input" value={selectedArchiveSunday} onChange={(event) => setSelectedArchiveSunday(event.target.value)} disabled={archivedPlans.length === 0}>
                    {archivedPlans.length === 0 ? <option value="">No archived Sunday yet</option> : null}
                    {archivedPlans.map((plan) => <option key={plan.serviceDate} value={plan.serviceDate}>{formatServiceDate(plan.serviceDate)}</option>)}
                  </select>
                </div>
                <div className="chip-row">
                  <span className="mini-chip">Saved file entries: {archivedPlans.length}</span>
                  <button type="button" className="action-button publish" onClick={() => handleExportArchive()} disabled={archivedPlans.length === 0}>Export archive file</button>
                </div>
              </div>
            </article>
          </section>
        ) : null}

        {activeView === 'updates' ? (
          <section className="dashboard-grid updates-layout">
            <article className="composer-card updates-card">
              <p className="panel-kicker">Announcements</p>
              <h3>Announcements for {selectedChurch?.displayCity ?? 'the selected church'}</h3>
              <div className="form-grid">
                <input className="auth-input" type="text" value={announcementForm.title} onChange={(event) => setAnnouncementForm((current) => ({ ...current, title: event.target.value }))} placeholder="Announcement title" />
                <textarea className="auth-input content-area" value={announcementForm.body} onChange={(event) => setAnnouncementForm((current) => ({ ...current, body: event.target.value }))} placeholder="Announcement body" />
                <button type="button" className="action-button publish" onClick={() => void handlePublishAnnouncement()}>Publish announcement</button>
              </div>
              <div className="update-list">
                {scopedAnnouncements.map((announcement) => (
                  <div key={announcement.id} className="update-card">
                    <strong>{announcement.title}</strong>
                    <p className="detail-copy">{announcement.body}</p>
                  </div>
                ))}
                {scopedAnnouncements.length === 0 ? <div className="empty-card">No announcements published yet for this church.</div> : null}
              </div>
            </article>

            <article className="composer-card updates-card">
              <p className="panel-kicker">Events</p>
              <h3>Events for {selectedChurch?.displayCity ?? 'the selected church'}</h3>
              <div className="form-grid">
                <input className="auth-input" type="text" value={eventForm.title} onChange={(event) => setEventForm((current) => ({ ...current, title: event.target.value }))} placeholder="Event title" />
                <textarea className="auth-input content-area" value={eventForm.description} onChange={(event) => setEventForm((current) => ({ ...current, description: event.target.value }))} placeholder="Event description" />
                <div className="form-row">
                  <input className="auth-input" type="datetime-local" value={eventForm.startAt} onChange={(event) => setEventForm((current) => ({ ...current, startAt: event.target.value }))} />
                  <input className="auth-input" type="datetime-local" value={eventForm.endAt} onChange={(event) => setEventForm((current) => ({ ...current, endAt: event.target.value }))} />
                </div>
                <input className="auth-input" type="text" value={eventForm.location} onChange={(event) => setEventForm((current) => ({ ...current, location: event.target.value }))} placeholder="Church address" />
                <button type="button" className="action-button publish" onClick={() => void handlePublishEvent()}>Publish event</button>
              </div>
              <div className="update-list">
                {scopedEvents.map((event) => (
                  <div key={event.id} className="update-card">
                    <strong>{event.title}</strong>
                    <p className="detail-copy">{event.description}</p>
                    <p className="muted-line">{formatDateTimeRange(event.startAt, event.endAt)}</p>
                    <p className="muted-line">{event.location}</p>
                  </div>
                ))}
                {scopedEvents.length === 0 ? <div className="empty-card">No events published yet for this church.</div> : null}
              </div>
            </article>
          </section>
        ) : null}

        {activeView === 'churches' ? <section className="dashboard-grid">{adminProfile.roleKey === 'networkSuperAdmin' ? <article className="wide-card"><div className="section-heading"><div><p className="panel-kicker">Add church location</p><h3>Create a new church with the default teams already included</h3></div></div><div className="form-grid church-form-grid"><input className="auth-input" type="text" value={churchForm.name} onChange={(event) => setChurchForm((current) => ({ ...current, name: event.target.value }))} placeholder="Church name" /><input className="auth-input" type="text" value={churchForm.city} onChange={(event) => setChurchForm((current) => ({ ...current, city: event.target.value }))} placeholder="City" /><input className="auth-input" type="text" value={churchForm.displayCity} onChange={(event) => setChurchForm((current) => ({ ...current, displayCity: event.target.value }))} placeholder="Display city" /><input className="auth-input" type="text" value={churchForm.address} onChange={(event) => setChurchForm((current) => ({ ...current, address: event.target.value }))} placeholder="Address" /><input className="auth-input" type="text" value={churchForm.serviceTimes} onChange={(event) => setChurchForm((current) => ({ ...current, serviceTimes: event.target.value }))} placeholder="Service time" /><input className="auth-input" type="text" value={churchForm.sharedDrivePath} onChange={(event) => setChurchForm((current) => ({ ...current, sharedDrivePath: event.target.value }))} placeholder="Drive path" /><input className="auth-input" type="text" value={churchForm.googleMapsLabel} onChange={(event) => setChurchForm((current) => ({ ...current, googleMapsLabel: event.target.value }))} placeholder="Google Maps label" /><input className="auth-input" type="text" value={churchForm.instagramUrl} onChange={(event) => setChurchForm((current) => ({ ...current, instagramUrl: event.target.value }))} placeholder="Instagram URL" /><input className="auth-input" type="text" value={churchForm.facebookUrl} onChange={(event) => setChurchForm((current) => ({ ...current, facebookUrl: event.target.value }))} placeholder="Facebook URL" /><button type="button" className="action-button publish" onClick={() => void handleCreateChurch()}>Add church location</button></div></article> : null}{churches.map((church) => <article key={church.id} className="church-card"><p className="panel-kicker">{church.city}</p><h3>{church.displayCity}</h3><p className="detail-copy">{church.name}</p><p className="detail-copy">{church.address}</p><div className="stats-inline"><span>{church.serviceTimes}</span><span>{church.members} members</span></div><div className="detail-block"><strong>Teams</strong><span>{mergeTeams(defaultTeams as unknown as string[], church.teams).join(', ')}</span></div><div className="detail-block"><strong>Instagram</strong><span>{church.instagramUrl || 'Not added yet'}</span></div><div className="detail-block"><strong>Facebook</strong><span>{church.facebookUrl || 'Not added yet'}</span></div></article>)}</section> : null}

        {activeView === 'prayers' ? <section className="dashboard-grid"><article className="wide-card"><div className="section-heading"><div><p className="panel-kicker">Prayer moderation</p><h3>Requests for {selectedChurch?.displayCity ?? 'the selected church'}</h3></div></div><div className="request-list">{scopedPrayerRequests.map((request) => <article key={request.id} className="request-card selected"><div className="request-top"><div><p className="panel-kicker">Submitted {request.createdAt}</p><h3>{selectedChurch?.displayCity}</h3></div><span className={`status-badge ${request.status}`}>{request.status}</span></div><p>{request.preview}</p><div className="action-stack horizontal"><button type="button" className="action-button approve" onClick={() => void handleModeratePrayer(request.id, 'approved')}>Approve</button><button type="button" className="action-button reject" onClick={() => void handleModeratePrayer(request.id, 'hidden')}>Hide</button></div></article>)}{scopedPrayerRequests.length === 0 ? <div className="empty-card">No prayer requests are waiting for this church.</div> : null}</div></article></section> : null}

        {activeView === 'roles' ? <section className="dashboard-grid">{roleMatrix.map((item) => <article key={item.role} className="role-card"><p className="panel-kicker">Permission design</p><h3>{item.role}</h3><p className="detail-copy">{item.summary}</p></article>)}</section> : null}
      </main>
    </div>
  );
}

export default App;

function OfficialSignature() {
  return (
    <div className="official-signature" aria-label="Official church signature">
      <img className="official-logo-image" src="/official-church-logo.jpg" alt="Bethel International Pentecostal Church" />
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
        <circle cx="18" cy="18" r="6" fill="none" stroke="currentColor" strokeWidth="3.2" />
        <circle cx="32" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="3.2" />
        <circle cx="46" cy="18" r="6" fill="none" stroke="currentColor" strokeWidth="3.2" />
        <path d="M8 44C11 32 14 26 18 26C22 26 25 32 28 44" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M22 36C25 24 28 18 32 18C36 18 39 24 42 36" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M36 44C39 32 42 26 46 26C50 26 53 32 56 44" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M26 30L29 15L33 30" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M37 33L43 12" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
        <circle cx="45" cy="8" r="2.8" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <path d="M5 12C10 7.5 15 7.5 20 12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M27 6C31 1.5 35 1.5 39 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M44 12C49 7.5 54 7.5 59 12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M10 50H54" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    );
  }

  if (normalizedTeam.includes('speaker')) {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="28" cy="14" r="6" fill="none" stroke="currentColor" strokeWidth="3.2" />
        <path d="M18 44H40L34 26H22L18 44Z" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="round" />
        <path d="M28 20V30" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
        <circle cx="28" cy="18" r="2.3" fill="currentColor" stroke="none" />
        <path d="M42 14C48 12 52 15 53 20" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M48 8C56 6 61 12 61 20" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (normalizedTeam.includes('food')) {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="28" cy="32" r="16" fill="none" stroke="currentColor" strokeWidth="3.2" />
        <circle cx="28" cy="32" r="9" fill="none" stroke="currentColor" strokeWidth="2.7" />
        <path d="M10 16V46" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M4 16H16" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M4 28H14" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M50 14V46" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
        <ellipse cx="50" cy="14" rx="4.2" ry="2.8" fill="none" stroke="currentColor" strokeWidth="2.8" />
      </svg>
    );
  }

  if (normalizedTeam.includes('sunday school')) {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="14" cy="24" r="5" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="28" cy="20" r="5" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="42" cy="24" r="5" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="52" cy="16" r="5.5" fill="none" stroke="currentColor" strokeWidth="3.2" />
        <path d="M8 44C10.5 34 12 30 14 30C16 30 20 34 23 44" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M22 40C24.5 30 26 26 28 26C30 26 34 30 37 40" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M36 44C38.5 34 40 30 42 30C44 30 48 34 51 44" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M46 39C48.5 26 50 22 52 22C54 22 58 27 61 39" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (normalizedTeam.includes('tech')) {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect x="10" y="12" width="24" height="16" rx="3.2" fill="none" stroke="currentColor" strokeWidth="3.2" />
        <path d="M17 34H27" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M22 28V34" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="46" cy="22" r="4.2" fill="none" stroke="currentColor" strokeWidth="2.9" />
        <circle cx="57" cy="22" r="4.2" fill="none" stroke="currentColor" strokeWidth="2.9" />
        <path d="M46 34V47" fill="none" stroke="currentColor" strokeWidth="2.9" strokeLinecap="round" />
        <path d="M57 34V47" fill="none" stroke="currentColor" strokeWidth="2.9" strokeLinecap="round" />
        <path d="M42 39H50" fill="none" stroke="currentColor" strokeWidth="2.9" strokeLinecap="round" />
        <path d="M53 30H61" fill="none" stroke="currentColor" strokeWidth="2.9" strokeLinecap="round" />
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
