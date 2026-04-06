export type NetworkChurch = {
  id: string;
  name: string;
  city: string;
  displayCity: string;
  address: string;
  serviceTimes: string;
  googleMapsLabel: string;
  contactEmail: string;
  contactPhone: string;
  whatsappUrl: string;
  weeklyMeetingUrl?: string;
  youtubeUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  teams: string[];
};

export const supportedTeams = [
  'Worship Team',
  'Speakers Team',
  'Food Team',
  'Sunday School Team',
];

export const networkChurches: NetworkChurch[] = [
  {
    id: 'cologne',
    name: 'Bethel Cologne',
    city: 'Bergisch Gladbach, Germany',
    displayCity: 'Bethel Cologne',
    address: 'Martin-Luther-Strasse 13, 51469 Bergisch Gladbach',
    serviceTimes: 'Sunday 10:00',
    googleMapsLabel: 'Bethel International Pentecostal Church (B.I.P.C.) Bergisch Gladbach',
    contactEmail: 'info@bethel-pentecostal.org',
    contactPhone: '+49 172 5818673',
    whatsappUrl: 'https://wa.me/491725818673',
    weeklyMeetingUrl: 'https://us06web.zoom.us/j/85421151544?pwd=TjNYd080NitrRWhwOWdwUTN1c2kyQT09',
    youtubeUrl: 'https://www.youtube.com/@bipcgermany',
    teams: supportedTeams,
  },
  {
    id: 'berlin',
    name: 'Bethel Berlin',
    city: 'Potsdam, Germany',
    displayCity: 'Bethel Berlin',
    address: 'Schilfhof 24, 14478 Potsdam',
    serviceTimes: 'Sunday 11:00',
    googleMapsLabel: 'Bethel International Pentecostal Church (B.I.P.C), Berlin',
    contactEmail: 'info@bethel-pentecostal.org',
    contactPhone: '+49 172 5818673',
    whatsappUrl: 'https://wa.me/491725818673',
    weeklyMeetingUrl: 'https://us06web.zoom.us/j/85421151544?pwd=TjNYd080NitrRWhwOWdwUTN1c2kyQT09',
    youtubeUrl: 'https://www.youtube.com/@bipcgermany',
    teams: supportedTeams,
  },
  {
    id: 'frankfurt',
    name: 'Bethel Frankfurt',
    city: 'Hanau, Germany',
    displayCity: 'Bethel Frankfurt',
    address: 'Hindemithstrasse 32, 63452 Hanau',
    serviceTimes: 'Sunday 16:00',
    googleMapsLabel: 'Bethel International Pentecostal Church Hanau',
    contactEmail: 'info@bethel-pentecostal.org',
    contactPhone: '+49 172 5818673',
    whatsappUrl: 'https://wa.me/491725818673',
    weeklyMeetingUrl: 'https://us06web.zoom.us/j/85421151544?pwd=TjNYd080NitrRWhwOWdwUTN1c2kyQT09',
    youtubeUrl: 'https://www.youtube.com/@bipcgermany',
    teams: supportedTeams,
  },
  {
    id: 'stuttgart',
    name: 'Bethel Stuttgart',
    city: 'Boeblingen, Germany',
    displayCity: 'Bethel Stuttgart',
    address: 'FeG Boeblingen, Hanns-Klemm-Strasse 9, 71034 Boeblingen',
    serviceTimes: 'Sunday 14:00',
    googleMapsLabel: 'Bethel International Pentecostal Church (B.I.P.C), Boeblingen',
    contactEmail: 'info@bethel-pentecostal.org',
    contactPhone: '+49 172 5818673',
    whatsappUrl: 'https://wa.me/491725818673',
    weeklyMeetingUrl: 'https://us06web.zoom.us/j/85421151544?pwd=TjNYd080NitrRWhwOWdwUTN1c2kyQT09',
    youtubeUrl: 'https://www.youtube.com/@bipcgermany',
    teams: supportedTeams,
  },
  {
    id: 'nuremberg',
    name: 'Bethel Nuremberg',
    city: 'Erlangen, Germany',
    displayCity: 'Bethel Nuremberg',
    address: 'Suedliche Stadtmauerstrasse 21, 91054 Erlangen',
    serviceTimes: 'Sunday 10:00',
    googleMapsLabel: 'Bethel International Pentecostal Church Erlangen',
    contactEmail: 'info@bethel-pentecostal.org',
    contactPhone: '+49 172 5818673',
    whatsappUrl: 'https://wa.me/491725818673',
    weeklyMeetingUrl: 'https://us06web.zoom.us/j/85421151544?pwd=TjNYd080NitrRWhwOWdwUTN1c2kyQT09',
    youtubeUrl: 'https://www.youtube.com/@bipcgermany',
    teams: supportedTeams,
  },
  {
    id: 'freiburg',
    name: 'Bethel Freiburg im Breisgau',
    city: 'Freiburg im Breisgau, Germany',
    displayCity: 'Bethel Freiburg im Breisgau',
    address: 'Engesserstrasse 13, 79108 Freiburg im Breisgau',
    serviceTimes: 'Sunday 14:00',
    googleMapsLabel: 'Bethel International Pentecostal Church Freiburg im Breisgau',
    contactEmail: 'info@bethel-pentecostal.org',
    contactPhone: '+49 172 5818673',
    whatsappUrl: 'https://wa.me/491725818673',
    weeklyMeetingUrl: 'https://us06web.zoom.us/j/85421151544?pwd=TjNYd080NitrRWhwOWdwUTN1c2kyQT09',
    youtubeUrl: 'https://www.youtube.com/@bipcgermany',
    teams: supportedTeams,
  },
  {
    id: 'osnabruck',
    name: 'Bethel Osnabrueck',
    city: 'Osnabrueck, Germany',
    displayCity: 'Bethel Osnabrueck',
    address: 'Koksche Str. 74, 49080 Osnabrueck',
    serviceTimes: 'Sunday 15:00',
    googleMapsLabel: 'Bethel International Pentecostal Church Osnabruck',
    contactEmail: 'info@bethel-pentecostal.org',
    contactPhone: '+49 172 5818673',
    whatsappUrl: 'https://wa.me/491725818673',
    weeklyMeetingUrl: 'https://us06web.zoom.us/j/85421151544?pwd=TjNYd080NitrRWhwOWdwUTN1c2kyQT09',
    youtubeUrl: 'https://www.youtube.com/@bipcgermany',
    teams: supportedTeams,
  },
  {
    id: 'leipzig',
    name: 'Bethel Leipzig',
    city: 'Leipzig, Germany',
    displayCity: 'Bethel Leipzig',
    address: 'Puschstrasse 9, 04103 Leipzig',
    serviceTimes: 'Sunday 09:30',
    googleMapsLabel: 'Bethel International Pentecostal Church at Leipzig',
    contactEmail: 'info@bethel-pentecostal.org',
    contactPhone: '+49 172 5818673',
    whatsappUrl: 'https://wa.me/491725818673',
    weeklyMeetingUrl: 'https://us06web.zoom.us/j/85421151544?pwd=TjNYd080NitrRWhwOWdwUTN1c2kyQT09',
    youtubeUrl: 'https://www.youtube.com/@bipcgermany',
    teams: supportedTeams,
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

export const onboardingFlow = [
  'Browse the app in guest mode',
  'Sign in with Google',
  'Create a profile and pick a church',
  'Wait for admin approval',
  'Join the approved church space',
  'Receive team assignments later from admins or team leaders',
];

export const stackSummary = [
  'Expo + React Native for Android, iOS, and web',
  'Firebase Authentication for sign-in and approval-linked access',
  'Cloud Firestore for church, member, and team data',
  'Cloud Functions for approvals, moderation, and notifications',
  'Google Shared Drive for documents and ministry files',
];
