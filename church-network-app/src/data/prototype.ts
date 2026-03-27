export type NetworkChurch = {
  id: string;
  name: string;
  city: string;
  displayCity: string;
  address: string;
  serviceTimes: string;
  googleMapsLabel: string;
  contactEmail: string;
  instagramUrl?: string;
  facebookUrl?: string;
};

export const publicHighlights = [
  {
    title: 'Church Locations',
    body: 'Guests can browse the Germany church locations and choose the church they belong to during signup.',
  },
  {
    title: 'Service Times',
    body: 'Sunday services, weekly meetings, and church contact details stay visible even before approval.',
  },
  {
    title: 'Media And Links',
    body: 'The network YouTube channel and church-specific social links stay available in guest mode.',
  },
];

export const privateModules = [
  'Announcements',
  'Event Calendar',
  'Team Schedules',
  'Ministry Updates',
  'Prayer Wall',
  'Document Sharing',
  'Member Directory',
  'Push Notifications',
];

export const supportedTeams = [
  'Worship Team',
  'Speakers Team',
  'Food Team',
  'Sunday School Team',
];

export const networkChurches: NetworkChurch[] = [
  {
    id: 'cologne',
    name: 'BIPC Cologne',
    city: 'Bergisch Gladbach, Germany',
    displayCity: 'Cologne',
    address: 'Martin-Luther-Strasse 13, 51469 Bergisch Gladbach',
    serviceTimes: 'Sunday 10:00',
    googleMapsLabel: 'Bethel International Pentecostal Church (B.I.P.C.) Bergisch Gladbach',
    contactEmail: 'info@bethel-pentecostal.org',
  },
  {
    id: 'berlin',
    name: 'BIPC Berlin',
    city: 'Potsdam, Germany',
    displayCity: 'Berlin',
    address: 'Schilfhof 24, 14478 Potsdam',
    serviceTimes: 'Sunday 11:00',
    googleMapsLabel: 'Bethel International Pentecostal Church (B.I.P.C), Berlin',
    contactEmail: 'info@bethel-pentecostal.org',
  },
  {
    id: 'frankfurt',
    name: 'BIPC Frankfurt',
    city: 'Hanau, Germany',
    displayCity: 'Frankfurt',
    address: 'Hindemithstrasse 32, 63452 Hanau',
    serviceTimes: 'Sunday 16:00',
    googleMapsLabel: 'Bethel International Pentecostal Church Hanau',
    contactEmail: 'info@bethel-pentecostal.org',
  },
  {
    id: 'stuttgart',
    name: 'BIPC Stuttgart',
    city: 'Boeblingen, Germany',
    displayCity: 'Stuttgart',
    address: 'FeG Boeblingen, Hanns-Klemm-Strasse 9, 71034 Boeblingen',
    serviceTimes: 'Sunday 14:00',
    googleMapsLabel: 'Bethel International Pentecostal Church (B.I.P.C), Boeblingen',
    contactEmail: 'info@bethel-pentecostal.org',
  },
  {
    id: 'nuremberg',
    name: 'BIPC Nuremberg',
    city: 'Erlangen, Germany',
    displayCity: 'Nuremberg',
    address: 'Suedliche Stadtmauerstrasse 21, 91054 Erlangen',
    serviceTimes: 'Sunday 10:00',
    googleMapsLabel: 'Bethel International Pentecostal Church Erlangen',
    contactEmail: 'info@bethel-pentecostal.org',
  },
  {
    id: 'freiburg',
    name: 'BIPC Freiburg im Breisgau',
    city: 'Freiburg im Breisgau, Germany',
    displayCity: 'Freiburg im Breisgau',
    address: 'Engesserstrasse 13, 79108 Freiburg im Breisgau',
    serviceTimes: 'Sunday 14:00',
    googleMapsLabel: 'Bethel International Pentecostal Church Freiburg im Breisgau',
    contactEmail: 'info@bethel-pentecostal.org',
  },
  {
    id: 'osnabruck',
    name: 'BIPC Osnabrueck',
    city: 'Osnabrueck, Germany',
    displayCity: 'Osnabrueck',
    address: 'Koksche Str. 74, 49080 Osnabrueck',
    serviceTimes: 'Sunday 15:00',
    googleMapsLabel: 'Bethel International Pentecostal Church Osnabruck',
    contactEmail: 'info@bethel-pentecostal.org',
  },
  {
    id: 'leipzig',
    name: 'BIPC Leipzig',
    city: 'Leipzig, Germany',
    displayCity: 'Leipzig',
    address: 'Puschstrasse 9, 04103 Leipzig',
    serviceTimes: 'Sunday 09:30',
    googleMapsLabel: 'Bethel International Pentecostal Church at Leipzig',
    contactEmail: 'info@bethel-pentecostal.org',
  },
];

export const signInMethods = [
  {
    key: 'google' as const,
    title: 'Google Sign-In',
    body: 'Recommended for the first release because it matches your Gmail-based church workflow.',
  },
  {
    key: 'email' as const,
    title: 'Email And Password',
    body: 'Useful as a fallback for members who need a non-Google account path.',
  },
];

export const roleSummary = [
  {
    title: 'Network Super Admin',
    body: 'Manages all churches, sees all members across the network, and controls network-wide settings.',
  },
  {
    title: 'Church Admin',
    body: 'Approves members, manages one church only, and assigns local roles and teams after approval.',
  },
  {
    title: 'Pastor',
    body: 'Sees expanded member details within the assigned church and helps oversee ministry content.',
  },
  {
    title: 'Team Leader',
    body: 'Plans ministry updates, volunteer schedules, and team assignments inside the assigned church.',
  },
  {
    title: 'Volunteer And Member',
    body: 'Joins the approved church space, receives updates, and accesses only assigned teams and roles.',
  },
];

export const onboardingFlow = [
  'Browse the app in guest mode',
  'Sign in with Google or email',
  'Create a profile and pick a church',
  'Wait for admin approval',
  'Join the approved church space',
  'Receive team assignments later from admins or team leaders',
  'Phase 2 adds OTP verification',
];

export const stackSummary = [
  'Expo + React Native for Android, iOS, and web',
  'Firebase Authentication for sign-in and approval-linked access',
  'Cloud Firestore for church, member, and team data',
  'Cloud Functions for approvals, moderation, and notifications',
  'Google Shared Drive for documents and ministry files',
];
