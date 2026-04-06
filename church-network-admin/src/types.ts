export type RoleKey =
  | 'networkSuperAdmin'
  | 'churchAdmin'
  | 'pastor'
  | 'teamLeader'
  | 'volunteer'
  | 'member';

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected';
export type PrayerStatus = 'pending' | 'approved' | 'hidden';

export type Church = {
  id: string;
  name: string;
  city: string;
  displayCity: string;
  address: string;
  admins: number;
  members: number;
  serviceTimes: string;
  sharedDrivePath: string;
  googleMapsLabel: string;
  contactEmail?: string;
  contactPhone?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  teams: string[];
};

export type AccessRequest = {
  id: string;
  uid?: string;
  fullName: string;
  email: string;
  phoneNumber?: string;
  churchId: string;
  requestedRoles: RoleKey[];
  note: string;
  requestedAt: string;
  status: AccessRequestStatus;
  rejectionReason?: string;
};

export type PrayerRequest = {
  id: string;
  churchId: string;
  preview: string;
  createdAt: string;
  status: PrayerStatus;
};

export type ChurchAnnouncement = {
  id: string;
  churchId: string;
  title: string;
  body: string;
  publishedAt: string;
  visibleUntilAt?: string;
  publishedBy: string;
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
  createdBy: string;
  teamName?: string;
  posterUrl?: string;
  isPublic: boolean;
};

export type VolunteerAssignment = {
  id: string;
  churchId: string;
  teamName: string;
  roleName: string;
  serviceDate: string;
  assignedTo: string;
  assignedUserId?: string;
  responseStatus: 'pending' | 'accepted' | 'declined';
};

export type MemberRecord = {
  id: string;
  fullName: string;
  email: string;
  churchId: string;
  roleKey: RoleKey;
  teamName: string;
  teamNames: string[];
  approvalStatus: AccessRequestStatus;
  phoneNumber?: string;
  phoneVerificationStatus: 'missing' | 'pending' | 'verified';
};

export type AuditEntry = {
  id: string;
  churchId: string;
  entityType: 'approval' | 'member' | 'team' | 'role' | 'planning' | 'church' | 'archive';
  actionLabel: string;
  targetLabel: string;
  summary: string;
  actor: string;
  createdAt: string;
};

