import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { isFirebaseConfigured } from '../config/firebase';
import {
  type NetworkChurch,
  networkChurches,
  privateModules,
  publicHighlights,
  roleSummary,
  supportedTeams,
} from '../data/prototype';
import { createAccessRequest } from '../services/accessRequests';
import {
  onMemberAuthChanged,
  signInWithGoogle,
  signOutMember,
  updateMemberDisplayName,
  type AuthSession,
} from '../services/auth';
import { subscribeToChurches } from '../services/churches';
import {
  subscribeToChurchAnnouncements,
  subscribeToCommonMeetingCancellations,
  subscribeToChurchEvents,
  subscribeToChurchSpecificMeetingCancellations,
  subscribeToPublicCommonEvents,
  type ChurchAnnouncement,
  type ChurchEventItem,
} from '../services/churchUpdates';
import {
  deletePrayerRequest,
  markPrayerRequestPrayed,
  submitPrayerRequest,
  subscribeToChurchPrayerWall,
  subscribeToMemberPrayedPrayerRequests,
  subscribeToMemberPrayerRequests,
  type ChurchPrayerRequest,
} from '../services/prayerRequests';
import {
  subscribeToMemberProfile,
  type MemberProfile,
} from '../services/memberProfile';
import {
  subscribeToMemberAssignments,
  updateMemberAssignmentResponse,
  type MemberAssignment,
} from '../services/teamAssignments';
import { registerMemberNotifications } from '../services/notifications';
import { colors } from '../theme';

type AppStage = 'guest' | 'signin' | 'profile' | 'pending' | 'approved';
type SignInMethod = 'google';

type RequestForm = {
  displayName: string;
  email: string;
  phoneNumber: string;
  requestedChurchId: string;
  note: string;
};

type PrayerRequestForm = {
  content: string;
  isAnonymous: boolean;
};

const initialForm: RequestForm = {
  displayName: '',
  email: '',
  phoneNumber: '',
  requestedChurchId: 'cologne',
  note: '',
};

const initialPrayerRequestForm: PrayerRequestForm = {
  content: '',
  isAnonymous: false,
};

const officialLogo = require('../../assets/official-church-logo.jpg');

const approvedMemberViews = [
  { key: 'home', label: 'Home' },
  { key: 'sunday', label: 'Sunday Plan' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'prayer', label: 'Prayer' },
  { key: 'prayerWall', label: 'Prayer Wall' },
  { key: 'announcements', label: 'Announcements' },
  { key: 'events', label: 'Events' },
  { key: 'teams', label: 'My Teams' },
] as const;

const commonMeetingCards = [
  {
    key: 'daily-intercessory-prayer',
    title: 'Daily Intercessory Prayer',
    detail: 'Daily at 6:00 AM - 7:00 AM (Except Sundays)',
    location: 'Online',
    body: 'A shared daily prayer hour across Bethel churches, focused on intercession, spiritual covering, and church needs.',
  },
  {
    key: 'mid-week-meeting',
    title: 'Mid Week Meeting',
    detail: 'Wednesdays 19:00 - 20:30',
    location: 'Online',
    body: 'A common mid-week gathering for Bible teaching, encouragement, worship, and prayer during the week.',
  },
  {
    key: 'youth-meeting',
    title: 'Youth Meeting',
    detail: 'Fridays 20:00',
    location: 'Online',
    body: 'A regular youth gathering focused on fellowship, discipleship, worship, and spiritual growth for young people.',
  },
] as const;

const churchSpecificMeetingCardsByChurch: Record<string, Array<{
  key: string;
  title: string;
  detail: string;
  location: string;
  body: string;
}>> = {
  nuremberg: [
    {
      key: 'bible-reading',
      title: 'Bible Reading',
      detail: 'Mondays 20:00 - 21:00',
      location: 'Online',
      body: 'A church-specific Bible reading meeting for members in Nuremberg, focused on scripture reading and reflection together.',
    },
    {
      key: 'church-intercessory-prayer',
      title: 'Church Intercessory Prayer',
      detail: 'Tuesdays 21:00 - 21:30',
      location: 'Online',
      body: 'A Nuremberg church intercessory prayer gathering focused on local church needs, members, and ministry covering.',
    },
  ],
};

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
const memberRoleLabels = {
  networkSuperAdmin: 'Network Super Admin',
  churchAdmin: 'Church Admin',
  pastor: 'Pastor',
  teamLeader: 'Team Leader',
  volunteer: 'Volunteer',
  member: 'Member',
} as const;
const aboutUsSummary = [
  {
    title: 'A church built on love for God and people',
    body: 'Bethel International Pentecostal Church in Germany is under the pastoral care of Pastor Shaju Samuel and describes love for God and love for people as a central foundation of its life and ministry.',
  },
  {
    title: 'A multicultural church family',
    body: 'What began in 2011 with a small number of Malayalee families has grown into a church community with multiple nationalities, languages, and ethnic backgrounds worshipping together.',
  },
  {
    title: 'Worship, prayer, and ministry for every age',
    body: 'The church highlights worship in several languages and points to ministries such as youth gatherings, fasting prayer, cottage meetings, Sunday School, outreach, and early morning prayer.',
  },
  {
    title: 'Growing across Europe',
    body: 'The ministry now serves churches in several German cities and also describes branch churches in Sweden and Lithuania, with an invitation for visitors to experience both the presence of God and a family atmosphere.',
  },
];
const helpGuideSections = [
  {
    title: '1. Start as a guest',
    points: [
      'Before signing in, you can already explore the public side of Bethel Connect and learn about the church network.',
      'Use Public church links to open About Us, Church Locations, the church website, online meeting access, social channels, and Contact Us.',
      'Bethel Church Common Meetings are also visible in guest mode so visitors can see the regular online rhythm of the church.',
    ],
  },
  {
    title: '2. Sign in and request member access',
    points: [
      'Use Sign In and continue with Google to enter the secure member-access flow.',
      'If you are new, complete your member request by confirming your details, choosing the church you belong to, and adding an optional note for the church admin.',
      'Your request is sent to the selected church admin or a super admin for approval.',
    ],
  },
  {
    title: '3. Wait for approval',
    points: [
      'Until approval is granted, the app keeps you in an awaiting-approval state instead of opening the private member area.',
      'If your request needs a correction, you can return, update the details, and resubmit without creating a second account.',
      'Once approved, signing in with Google takes you directly into your member view without choosing the church again.',
    ],
  },
  {
    title: '4. Use your approved member space',
    points: [
      'After approval, your church dashboard opens with member-only tools and church-specific content.',
      'The approved member navigation includes Home, Sunday Plan, Calendar, Prayer, Prayer Wall, Announcements, Events, and My Teams.',
      'The content you see is connected to your own church, while network-wide items still remain visible where relevant.',
    ],
  },
  {
    title: '5. Follow your Home dashboard',
    points: [
      'Home is your starting point after approval and highlights the most important member information in one place.',
      'It helps you keep track of your next Sunday responsibility, church updates, prayer participation, and church-specific support paths.',
      'Use Home when you want a quick summary before moving into one of the dedicated sections.',
    ],
  },
  {
    title: '6. Use Sunday Plan correctly',
    points: [
      'Sunday Plan shows assignments that church leaders have prepared for you for upcoming Sundays.',
      'Assignments are grouped by Sunday and activity so you can understand the whole ministry flow, not just a single task.',
      'If you receive an assignment, respond by accepting or declining it so leaders can finalise the service plan.',
      'If an assignment is removed or reassigned by the church, it disappears from your active response list and no longer needs action from you.',
    ],
  },
  {
    title: '7. Use the Church Calendar',
    points: [
      'Calendar combines local church events, church-specific meetings, common Bethel meetings, and recurring Sunday Service entries.',
      'The calendar opens on the current month and highlights today so it is easy to orient yourself quickly.',
      'Each church automatically shows Sunday Service at the church’s current service time, and the calendar updates if the service time changes later.',
      'Selecting a date lets you review what is happening that day and use available event actions such as Add To Calendar or Download Invite.',
    ],
  },
  {
    title: '8. Understand meetings in the app',
    points: [
      'Bethel Church Common Meetings are shared across all churches and are visible to everyone, including guests.',
      'Church Specific Meetings are visible inside the approved member space for your own church only.',
      'Common and church-specific published events can also appear as meeting tiles when church leaders publish them.',
      'If a church admin or super admin cancels a meeting occurrence, it is removed from the calendar and related meeting sections.',
    ],
  },
  {
    title: '9. Use Prayer and Prayer Wall',
    points: [
      'Prayer lets you send a prayer request to your church and choose whether to share it anonymously.',
      'Your request appears publicly only after approval by church leadership.',
      'Prayer Wall displays approved prayer requests for members of your church as individual tiles.',
      'Use Pray on a prayer-wall tile to mark that you prayed; this changes to Prayed for you only and is not shown to other users.',
      'You can also remove your own prayer requests, and church leadership can hide or remove moderated requests when needed.',
    ],
  },
  {
    title: '10. Follow Announcements and Events',
    points: [
      'Announcements help you stay informed about church notices, service updates, and ministry communication.',
      'Events provide more structured information for gatherings, special programmes, conferences, or church activities.',
      'Events can be common across all churches or specific to your own church depending on how they are published by leadership.',
      'If an event includes a poster, it appears in the event view so members can recognise and share it more easily.',
    ],
  },
  {
    title: '11. Know your teams and role',
    points: [
      'My Teams shows the ministry teams you currently belong to and your current role in the church.',
      'This section helps you understand why certain Sunday assignments are reaching you and which leaders may coordinate with you.',
      'If you are approved but no team has been assigned yet, the app keeps the space visible and explains that assignment will appear once leadership adds you.',
    ],
  },
  {
    title: '12. Use contact and support wisely',
    points: [
      'Contact Us in Public church links opens WhatsApp so you can reach the church quickly.',
      'Support options inside the approved member space help when you have assignment questions, event questions, or access issues.',
      'Use the church website, online meeting link, and church social links when you need more public-facing church information beyond the app.',
    ],
  },
  {
    title: '13. Notifications and updates',
    points: [
      'The app is designed to surface assignment changes, approvals, announcements, and other church updates inside your member experience.',
      'If notifications are enabled on your mobile app device, they can help you notice changes without constantly opening the app.',
      'Important changes such as reassigned Sunday duties are also reflected directly inside the relevant app section.',
    ],
  },
  {
    title: '14. Recommended workflows',
    points: [
      'New visitor workflow: open Public church links, read About Us, review Church Locations, then sign in with Google when you are ready to request access.',
      'New member workflow: sign in, complete the church request, wait for approval, then return through Sign In for direct member access.',
      'Weekly member workflow: check Home, review Calendar, open Sunday Plan, respond to assignments, and stay aware of announcements and events.',
      'Prayer workflow: submit a prayer request in Prayer, then return later to Prayer Wall to stand with the church in prayer for approved needs.',
    ],
  },
];

export function ChurchNetworkPrototypeApp() {
  const [stage, setStage] = useState<AppStage>('guest');
  const [signInMethod, setSignInMethod] = useState<SignInMethod>('google');
  const [requestForm, setRequestForm] = useState<RequestForm>(initialForm);
  const [validationMessage, setValidationMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [requestReference, setRequestReference] = useState<string | null>(null);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [memberProfile, setMemberProfile] = useState<MemberProfile | null>(null);
  const [notificationStatusMessage, setNotificationStatusMessage] = useState('');
  const [isSyncingAccess, setIsSyncingAccess] = useState(isFirebaseConfigured);
  const [churches, setChurches] = useState<NetworkChurch[]>(networkChurches);
  const [churchAnnouncements, setChurchAnnouncements] = useState<ChurchAnnouncement[]>([]);
  const [churchEvents, setChurchEvents] = useState<ChurchEventItem[]>([]);
  const [publicCommonEvents, setPublicCommonEvents] = useState<ChurchEventItem[]>([]);
  const [commonMeetingCancellationKeys, setCommonMeetingCancellationKeys] = useState<string[]>([]);
  const [churchSpecificMeetingCancellationKeys, setChurchSpecificMeetingCancellationKeys] = useState<string[]>([]);
  const [churchPrayerRequests, setChurchPrayerRequests] = useState<ChurchPrayerRequest[]>([]);
  const [memberPrayerRequests, setMemberPrayerRequests] = useState<ChurchPrayerRequest[]>([]);
  const [prayedPrayerRequestIds, setPrayedPrayerRequestIds] = useState<string[]>([]);
  const [memberAssignments, setMemberAssignments] = useState<MemberAssignment[]>([]);
  const [churchContentNotice, setChurchContentNotice] = useState('');
  const [prayerNotice, setPrayerNotice] = useState('');
  const [assignmentNotice, setAssignmentNotice] = useState('');
  const [respondingAssignmentId, setRespondingAssignmentId] = useState<string | null>(null);
  const [prayerForm, setPrayerForm] = useState<PrayerRequestForm>(initialPrayerRequestForm);
  const [isSubmittingPrayerRequest, setIsSubmittingPrayerRequest] = useState(false);
  const [removingPrayerRequestId, setRemovingPrayerRequestId] = useState<string | null>(null);
  const [markingPrayerRequestId, setMarkingPrayerRequestId] = useState<string | null>(null);
  const [signInSectionY, setSignInSectionY] = useState<number | null>(null);
  const [eventClock, setEventClock] = useState(() => Date.now());
  const notificationRegistrationRef = useRef<string | null>(null);
  const previousAssignmentIdsRef = useRef<string[]>([]);
  const scrollViewRef = useRef<ScrollView | null>(null);

  const activeChurchId = memberProfile?.pendingChurchId || memberProfile?.primaryChurchId || requestForm.requestedChurchId;
  const selectedChurch = useMemo(
    () => churches.find((church) => church.id === activeChurchId) ?? churches[0] ?? networkChurches[0],
    [activeChurchId, churches],
  );
  const heroAssignments = useMemo(
    () =>
      [...memberAssignments].sort((left, right) => {
        const leftDate = parseCalendarDate(left.serviceDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const rightDate = parseCalendarDate(right.serviceDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return leftDate - rightDate;
      }),
    [memberAssignments],
  );
  const activeHeroAnnouncements = useMemo(
    () => churchAnnouncements.filter((announcement) => {
      if (!announcement.visibleUntilAt) {
        return true;
      }

      const visibleUntil = new Date(announcement.visibleUntilAt).getTime();
      return Number.isNaN(visibleUntil) || visibleUntil >= eventClock;
    }),
    [churchAnnouncements, eventClock],
  );
  const heroNextAssignment = heroAssignments[0];
  const heroPendingAssignments = heroAssignments.filter((assignment) => assignment.responseStatus === 'pending').length;
  const heroAcceptedAssignments = heroAssignments.filter((assignment) => assignment.responseStatus === 'accepted').length;

  const roleModeLabel = useMemo(() => {
    if (!authSession) {
      return 'Guest Mode';
    }

    if (memberProfile?.approvalStatus !== 'approved') {
      return memberProfile?.approvalStatus === 'rejected' ? 'Update Request' : 'Awaiting Member Approval';
    }

    if (memberProfile?.roleKey === 'networkSuperAdmin') {
      return 'Super Admin';
    }
    if (memberProfile?.roleKey === 'churchAdmin') {
      return 'Church Admin';
    }
    if (memberProfile?.roleKey === 'pastor') {
      return 'Pastor';
    }

    return 'Member Mode';
  }, [authSession, memberProfile?.approvalStatus, memberProfile?.roleKey]);

  const openUrl = (url: string) => {
    void Linking.openURL(url);
  };

  useEffect(() => {
    const intervalId = setInterval(() => {
      setEventClock(Date.now());
    }, 60_000);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    return subscribeToChurches(
      (nextChurches) => {
        setChurches(nextChurches);
      },
      (error) => {
        setValidationMessage((current) => current || error.message);
      },
    );
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      return undefined;
    }

    setIsSyncingAccess(true);

    return onMemberAuthChanged((session) => {
      setAuthSession(session);

      if (!session) {
        setMemberProfile(null);
        setIsSyncingAccess(false);
        return;
      }

      setRequestForm((current) => ({
        ...current,
        email: session.email,
        displayName: current.displayName || session.displayName || '',
      }));
      setIsSyncingAccess(true);
    });
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !authSession) {
      return undefined;
    }

    return subscribeToMemberProfile(
      authSession.uid,
      (profile) => {
        setMemberProfile(profile);
        setRequestForm((current) => ({
          ...current,
          email: profile?.email || authSession.email,
          displayName: current.displayName || profile?.displayName || authSession.displayName || '',
          phoneNumber: current.phoneNumber || profile?.phoneNumber || '',
          requestedChurchId: profile?.pendingChurchId || profile?.primaryChurchId || current.requestedChurchId,
        }));
        setIsSyncingAccess(false);
      },
      (error) => {
        setValidationMessage(error.message);
        setIsSyncingAccess(false);
      },
    );
  }, [authSession]);

  useEffect(() => {
    return subscribeToPublicCommonEvents(
      (nextEvents) => {
        setPublicCommonEvents(nextEvents);
      },
      (error) => {
        setChurchContentNotice((current) => current || error.message);
      },
    );
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || isSyncingAccess) {
      return;
    }

    if (!authSession) {
      setStage('guest');
      return;
    }

    if (memberProfile?.approvalStatus === 'approved') {
      setStage('approved');
      return;
    }

    if (memberProfile?.approvalStatus === 'pending' || memberProfile?.approvalStatus === 'rejected') {
      setStage('pending');
      return;
    }

    setStage('profile');
  }, [authSession, isSyncingAccess, memberProfile]);

  useEffect(() => {
    if (stage !== 'approved' || !selectedChurch?.id) {
      setChurchAnnouncements([]);
      setChurchEvents([]);
      setCommonMeetingCancellationKeys([]);
      setChurchSpecificMeetingCancellationKeys([]);
      setChurchPrayerRequests([]);
      setMemberPrayerRequests([]);
      setPrayedPrayerRequestIds([]);
      setMemberAssignments([]);
      previousAssignmentIdsRef.current = [];
      setChurchContentNotice('');
      setPrayerNotice('');
      setAssignmentNotice('');
      return undefined;
    }

    setChurchContentNotice('');

    const unsubscribeAnnouncements = subscribeToChurchAnnouncements(
      selectedChurch.id,
      (nextAnnouncements) => {
        setChurchAnnouncements(nextAnnouncements);
      },
      (error) => {
        setChurchContentNotice((current) => current || error.message);
      },
    );

    const unsubscribeEvents = subscribeToChurchEvents(
      selectedChurch.id,
      (nextEvents) => {
        setChurchEvents(nextEvents);
      },
      (error) => {
        setChurchContentNotice((current) => current || error.message);
      },
    );
    const unsubscribeCommonMeetingCancellations = subscribeToCommonMeetingCancellations(
      selectedChurch.id,
      (nextKeys) => {
        setCommonMeetingCancellationKeys(nextKeys);
      },
      (error) => {
        setChurchContentNotice((current) => current || error.message);
      },
    );
    const unsubscribeChurchSpecificMeetingCancellations = subscribeToChurchSpecificMeetingCancellations(
      selectedChurch.id,
      (nextKeys) => {
        setChurchSpecificMeetingCancellationKeys(nextKeys);
      },
      (error) => {
        setChurchContentNotice((current) => current || error.message);
      },
    );

    const unsubscribePrayerWall = subscribeToChurchPrayerWall(
      selectedChurch.id,
      (nextPrayerRequests) => {
        setChurchPrayerRequests(nextPrayerRequests);
      },
      (error) => {
        setPrayerNotice((current) => current || error.message);
      },
    );
    const unsubscribeMemberPrayerRequests = authSession
      ? subscribeToMemberPrayerRequests(
          authSession.uid,
          selectedChurch.id,
          (nextPrayerRequests) => {
            setMemberPrayerRequests(nextPrayerRequests);
          },
          (error) => {
            setPrayerNotice((current) => current || error.message);
          },
        )
      : () => undefined;
    const unsubscribePrayedPrayerRequests = authSession
      ? subscribeToMemberPrayedPrayerRequests(
          authSession.uid,
          selectedChurch.id,
          (nextPrayerRequestIds) => {
            setPrayedPrayerRequestIds(nextPrayerRequestIds);
          },
          (error) => {
            setPrayerNotice((current) => current || error.message);
          },
        )
      : () => undefined;

    return () => {
      unsubscribeAnnouncements();
      unsubscribeEvents();
      unsubscribeCommonMeetingCancellations();
      unsubscribeChurchSpecificMeetingCancellations();
      unsubscribePrayerWall();
      unsubscribeMemberPrayerRequests();
      unsubscribePrayedPrayerRequests();
    };
  }, [authSession, selectedChurch?.id, stage]);

  useEffect(() => {
    if (stage !== 'approved' || !selectedChurch?.id || !authSession?.uid) {
      setMemberAssignments([]);
      previousAssignmentIdsRef.current = [];
      setAssignmentNotice('');
      return undefined;
    }

    setAssignmentNotice('');

    return subscribeToMemberAssignments(
      authSession.uid,
      selectedChurch.id,
      (nextAssignments) => {
        const previousIds = previousAssignmentIdsRef.current;
        const nextIds = nextAssignments.map((assignment) => assignment.id);
        const removedAssignments = previousIds.filter((assignmentId) => !nextIds.includes(assignmentId));
        setMemberAssignments(nextAssignments);
        previousAssignmentIdsRef.current = nextIds;
        if (removedAssignments.length > 0) {
          setAssignmentNotice(
            removedAssignments.length === 1
              ? 'A Sunday assignment was reassigned or removed by your church team. It no longer needs your response.'
              : `${removedAssignments.length} Sunday assignments were reassigned or removed by your church team. They no longer need your response.`,
          );
        }
      },
      (error) => {
        setAssignmentNotice((current) => current || error.message);
      },
    );
  }, [authSession?.uid, selectedChurch?.id, stage]);

  useEffect(() => {
    if (!authSession?.uid || !isFirebaseConfigured) {
      notificationRegistrationRef.current = null;
      setNotificationStatusMessage('');
      return;
    }

    const registrationKey = [
      authSession.uid,
      memberProfile?.approvalStatus ?? 'profile',
      memberProfile?.pendingChurchId ?? '',
      memberProfile?.primaryChurchId ?? '',
    ].join(':');

    if (notificationRegistrationRef.current === registrationKey) {
      return;
    }

    notificationRegistrationRef.current = registrationKey;

    void registerMemberNotifications({
      uid: authSession.uid,
      email: authSession.email,
      displayName: authSession.displayName || requestForm.displayName || authSession.email,
      churchIds: [
        memberProfile?.pendingChurchId ?? '',
        memberProfile?.primaryChurchId ?? '',
        requestForm.requestedChurchId,
      ].filter(Boolean),
      approvalStatus: memberProfile?.approvalStatus ?? 'profile',
    }).then((result) => {
      setNotificationStatusMessage(result.message);
    }).catch((error) => {
      setNotificationStatusMessage(
        error instanceof Error ? error.message : 'Unable to enable notifications on this device right now.',
      );
    });
  }, [
    authSession?.displayName,
    authSession?.email,
    authSession?.uid,
    memberProfile?.approvalStatus,
    memberProfile?.pendingChurchId,
    memberProfile?.primaryChurchId,
    requestForm.displayName,
    requestForm.requestedChurchId,
  ]);

  useEffect(() => {
    if (stage === 'signin' && signInSectionY !== null) {
      scrollViewRef.current?.scrollTo({ y: Math.max(signInSectionY - 18, 0), animated: true });
    }
  }, [signInSectionY, stage]);

  const authenticateMember = async () => {
    setValidationMessage('');
    setIsAuthenticating(true);

    try {
      if (!isFirebaseConfigured) {
        throw new Error('Add the Firebase configuration before using live sign-in.');
      }

      const session = await signInWithGoogle();
      setAuthSession(session);
      setRequestForm((current) => ({
        ...current,
        email: session.email,
        displayName: current.displayName || session.displayName || '',
      }));
      setValidationMessage('Signed in with Google. Checking your member access now.');
      setIsSyncingAccess(true);
    } catch (error) {
      setValidationMessage(error instanceof Error ? error.message : 'Unable to complete sign-in.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const submitRequest = async () => {
    if (!requestForm.displayName.trim() || !requestForm.email.trim()) {
      setValidationMessage('Please fill in your name and email before sending the access request.');
      return;
    }

    if (!authSession) {
      setValidationMessage('Please complete sign-in before sending the access request.');
      return;
    }

    setIsSubmitting(true);
    setValidationMessage('');

    try {
      if (isFirebaseConfigured) {
        await updateMemberDisplayName(requestForm.displayName);
        const reference = await createAccessRequest(authSession, {
          displayName: requestForm.displayName,
          phoneNumber: requestForm.phoneNumber,
          requestedChurchId: requestForm.requestedChurchId,
          note: requestForm.note,
          signInMethod,
        });
        setRequestReference(reference);
      } else {
        setRequestReference(null);
      }

      setStage('pending');
    } catch (error) {
      setValidationMessage(
        error instanceof Error ? error.message : 'Unable to send the access request right now.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetDemo = () => {
    setStage('guest');
    setSignInMethod('google');
    setRequestForm(initialForm);
    setValidationMessage('');
    setIsSubmitting(false);
    setIsAuthenticating(false);
    setRequestReference(null);
    setAuthSession(null);
    setMemberProfile(null);
    setIsSyncingAccess(false);
    setMemberAssignments([]);
    previousAssignmentIdsRef.current = [];
    setChurchAnnouncements([]);
    setChurchEvents([]);
    setCommonMeetingCancellationKeys([]);
    setChurchSpecificMeetingCancellationKeys([]);
    setChurchPrayerRequests([]);
    setMemberPrayerRequests([]);
    setPrayedPrayerRequestIds([]);
    setChurchContentNotice('');
    setPrayerNotice('');
    setAssignmentNotice('');
    setPrayerForm(initialPrayerRequestForm);
    setIsSubmittingPrayerRequest(false);
    setRemovingPrayerRequestId(null);
    setMarkingPrayerRequestId(null);
    setRespondingAssignmentId(null);
    void signOutMember();
  };

  const sendPrayerRequest = async () => {
    if (!authSession || !selectedChurch?.id) {
      setPrayerNotice('Sign in to your approved church space before sending a prayer request.');
      return;
    }

    if (!prayerForm.content.trim()) {
      setPrayerNotice('Write the prayer request before sending it.');
      return;
    }

    setIsSubmittingPrayerRequest(true);
    setPrayerNotice('');

    try {
      await submitPrayerRequest(authSession, {
        churchId: selectedChurch.id,
        content: prayerForm.content,
        isAnonymous: prayerForm.isAnonymous,
        submittedByLabel: memberProfile?.displayName || authSession.displayName || requestForm.displayName || authSession.email,
      });
      setPrayerForm(initialPrayerRequestForm);
      setPrayerNotice('Prayer request sent. It will appear on the church prayer wall after an admin approves it.');
    } catch (error) {
      setPrayerNotice(error instanceof Error ? error.message : 'Unable to send the prayer request right now.');
    } finally {
      setIsSubmittingPrayerRequest(false);
    }
  };

  const removePrayerRequest = async (requestId: string) => {
    setRemovingPrayerRequestId(requestId);
    setPrayerNotice('');

    try {
      await deletePrayerRequest(requestId);
      setMemberPrayerRequests((current) => current.filter((request) => request.id !== requestId));
      setChurchPrayerRequests((current) => current.filter((request) => request.id !== requestId));
      setPrayerNotice('Prayer request removed. It will no longer appear on the church prayer wall.');
    } catch (error) {
      setPrayerNotice(error instanceof Error ? error.message : 'Unable to remove the prayer request right now.');
    } finally {
      setRemovingPrayerRequestId(null);
    }
  };

  const markPrayerAsPrayed = async (request: ChurchPrayerRequest) => {
    if (!authSession || !selectedChurch?.id) {
      setPrayerNotice('Sign in to your approved church space before responding on the prayer wall.');
      return;
    }

    setMarkingPrayerRequestId(request.id);
    setPrayerNotice('');

    try {
      await markPrayerRequestPrayed(authSession, {
        prayerRequestId: request.id,
        churchId: selectedChurch.id,
      });
      setPrayedPrayerRequestIds((current) => (current.includes(request.id) ? current : [...current, request.id]));
      setPrayerNotice('Thank you for praying. This prayer request is now marked as Prayed for you.');
    } catch (error) {
      setPrayerNotice(error instanceof Error ? error.message : 'Unable to save your prayer response right now.');
    } finally {
      setMarkingPrayerRequestId(null);
    }
  };

  const respondToAssignment = async (assignment: MemberAssignment, responseStatus: 'accepted' | 'declined') => {
    setAssignmentNotice('');
    setRespondingAssignmentId(assignment.id);

    try {
      await updateMemberAssignmentResponse(assignment.duplicateAssignmentIds ?? [assignment.id], responseStatus);
      setMemberAssignments((current) =>
        current.map((currentAssignment) =>
          currentAssignment.id === assignment.id
            ? { ...currentAssignment, responseStatus }
            : currentAssignment,
        ),
      );
      setAssignmentNotice(
        responseStatus === 'accepted'
          ? 'Assignment accepted. Your team leader and church admin will see the update immediately.'
          : 'Assignment declined. Your team leader and church admin can now reassign this task.',
      );
    } catch (error) {
      setAssignmentNotice(error instanceof Error ? error.message : 'Unable to update your assignment response.');
    } finally {
      setRespondingAssignmentId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={[styles.glow, styles.glowTop]} />
      <View style={[styles.glow, styles.glowBottom]} />
      <ScrollView ref={scrollViewRef} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroBrandColumn}>
              <OfficialSignature />
            </View>
            <View style={styles.heroModeRow}>
              <View style={styles.heroModeBadge}>
                <Text style={styles.heroModeBadgeText}>{roleModeLabel}</Text>
              </View>
              {authSession ? (
                <Pressable onPress={resetDemo} style={styles.heroSignOutButton}>
                  <Text style={styles.heroSignOutButtonText}>Sign Out</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => {
                    setStage('signin');
                  }}
                  style={styles.heroSignOutButton}
                >
                  <Text style={styles.heroSignOutButtonText}>Sign In</Text>
                </Pressable>
              )}
            </View>
          </View>
          <View style={styles.heroBadgeRow}>
            <Badge label="Germany Network" tone="gold" />
          </View>
          <Text style={styles.eyebrow}>Bethel Connect</Text>
          {stage === 'approved' ? (
            <View style={styles.heroApprovedPanel}>
              <Text style={styles.heroApprovedLabel}>Welcome to {selectedChurch.name}</Text>
              <Text style={styles.heroApprovedBody}>
                {requestForm.displayName || 'Member'}, you are now inside the {selectedChurch.displayCity} church space. This is where you receive church announcements,
                see your next Sunday role, and respond when leaders assign you to serve.
              </Text>
              <View style={styles.heroApprovedMetrics}>
                <View style={styles.heroApprovedMetricCard}>
                  <Text style={styles.heroApprovedMetricLabel}>Church Space</Text>
                  <Text style={styles.heroApprovedMetricValue}>{selectedChurch.displayCity}</Text>
                  <Text style={styles.heroApprovedMetricHint}>{selectedChurch.serviceTimes}</Text>
                </View>
                <View style={styles.heroApprovedMetricCard}>
                  <Text style={styles.heroApprovedMetricLabel}>Sunday Plan</Text>
                  <Text style={styles.heroApprovedMetricValue}>{heroNextAssignment ? formatAssignmentDate(heroNextAssignment.serviceDate) : 'Open'}</Text>
                  <Text style={styles.heroApprovedMetricHint}>{heroNextAssignment ? `${heroNextAssignment.roleName} | ${heroNextAssignment.teamName}` : 'Your next service role will appear here'}</Text>
                </View>
                <View style={styles.heroApprovedMetricCard}>
                  <Text style={styles.heroApprovedMetricLabel}>Church Updates</Text>
                  <Text style={styles.heroApprovedMetricValue}>{activeHeroAnnouncements.length + churchEvents.length}</Text>
                  <Text style={styles.heroApprovedMetricHint}>{activeHeroAnnouncements.length} announcements and {churchEvents.length} upcoming events</Text>
                </View>
                <View style={styles.heroApprovedMetricCard}>
                  <Text style={styles.heroApprovedMetricLabel}>My Responses</Text>
                  <Text style={styles.heroApprovedMetricValue}>{heroPendingAssignments > 0 ? heroPendingAssignments.toString() : heroAcceptedAssignments.toString()}</Text>
                  <Text style={styles.heroApprovedMetricHint}>{heroPendingAssignments > 0 ? 'Assignments waiting for your response' : `${heroAcceptedAssignments} accepted so far`}</Text>
                </View>
              </View>
            </View>
          ) : null}
          {authSession && stage === 'profile' ? (
            <View style={styles.actionRowWide}>
              <PrimaryButton label="Complete Profile" onPress={() => setStage('profile')} />
            </View>
          ) : null}
          {authSession && stage === 'pending' ? (
            <View style={styles.actionRowWide}>
              <PrimaryButton
                label={memberProfile?.approvalStatus === 'rejected' ? 'Update Request' : 'View Request'}
                onPress={() => {
                  if (memberProfile?.approvalStatus === 'rejected') {
                    setStage('profile');
                    return;
                  }

                  setStage('pending');
                }}
              />
            </View>
          ) : null}
        </View>

        <PublicChurchLinksSection church={selectedChurch} churches={churches} onOpenUrl={openUrl} />
        <CommonMeetingsSection church={selectedChurch} onOpenUrl={openUrl} publishedEvents={publicCommonEvents} eventClock={eventClock} />

        {stage === 'guest' ? <GuestScreen onRequestAccess={() => setStage('signin')} /> : null}
        {stage === 'signin' ? (
          <View onLayout={(event) => setSignInSectionY(event.nativeEvent.layout.y)}>
            <SignInChoiceScreen validationMessage={validationMessage} isAuthenticating={isAuthenticating} onBack={() => setStage('guest')} onContinue={() => void authenticateMember()} />
          </View>
        ) : null}
        {stage === 'profile' ? <ProfileScreen churches={churches} form={requestForm} selectedChurchName={selectedChurch.name} validationMessage={validationMessage} isSubmitting={isSubmitting} authSession={authSession} onBack={() => setStage('signin')} onChange={setRequestForm} onSubmit={() => void submitRequest()} /> : null}
        {stage === 'pending' ? <PendingApprovalScreen approvalStatus={memberProfile?.approvalStatus ?? 'pending'} churchName={selectedChurch.name} email={requestForm.email} requestReference={requestReference} notificationStatusMessage={notificationStatusMessage} onBackToGuest={resetDemo} onReturnToProfile={() => setStage('profile')} /> : null}
        {stage === 'approved' ? (
          <ApprovedPreviewScreen
            form={requestForm}
            church={selectedChurch}
            announcements={activeHeroAnnouncements}
            events={churchEvents}
            publicCommonEvents={publicCommonEvents}
            commonMeetingCancellationKeys={commonMeetingCancellationKeys}
            churchSpecificMeetingCancellationKeys={churchSpecificMeetingCancellationKeys}
            eventClock={eventClock}
            prayerRequests={churchPrayerRequests.map((request) => ({
              ...request,
              prayedByCurrentUser: prayedPrayerRequestIds.includes(request.id),
            }))}
            memberPrayerRequests={memberPrayerRequests}
            assignments={memberAssignments}
            contentNotice={churchContentNotice}
            prayerNotice={prayerNotice}
            assignmentNotice={assignmentNotice}
            notificationStatusMessage={notificationStatusMessage}
            prayerForm={prayerForm}
            isSubmittingPrayerRequest={isSubmittingPrayerRequest}
            removingPrayerRequestId={removingPrayerRequestId}
            markingPrayerRequestId={markingPrayerRequestId}
            respondingAssignmentId={respondingAssignmentId}
            onRespondToAssignment={(assignment, responseStatus) => void respondToAssignment(assignment, responseStatus)}
            onPrayerFormChange={setPrayerForm}
            onSendPrayerRequest={() => void sendPrayerRequest()}
            onRemovePrayerRequest={(requestId) => void removePrayerRequest(requestId)}
            onMarkPrayerAsPrayed={(request) => void markPrayerAsPrayed(request)}
            onOpenUrl={openUrl}
            memberProfile={memberProfile}
            onReset={resetDemo}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function GuestScreen({
  onRequestAccess,
}: {
  onRequestAccess: () => void;
}) {
  return (
    <>
      <View style={styles.actionRow}>
        <PrimaryButton label="Request Access" onPress={onRequestAccess} />
      </View>
    </>
  );
}

function SignInChoiceScreen({
  validationMessage,
  isAuthenticating,
  onBack,
  onContinue,
}: {
  validationMessage: string;
  isAuthenticating: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [highlightContinue, setHighlightContinue] = useState(true);

  useEffect(() => {
    let ticks = 0;
    const intervalId = setInterval(() => {
      ticks += 1;
      setHighlightContinue((current) => !current);

      if (ticks >= 8) {
        clearInterval(intervalId);
        setHighlightContinue(false);
      }
    }, 450);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  return (
    <>
      <SectionHeader title="Continue with Google" body="Sign in with Google to start your member request. Full member access opens after your church approves the request." />
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Google sign-in</Text>
        <Text style={styles.cardBody}>
          Continue with your Google account, then complete your church profile so the correct church admin can review it and grant full access.
        </Text>
      </View>
      {validationMessage ? <Text style={styles.errorText}>{validationMessage}</Text> : null}
      <View style={styles.actionRowWide}>
        <SecondaryButton label="Back" onPress={onBack} />
        <PrimaryButton label={isAuthenticating ? 'Connecting...' : 'Continue With Google'} onPress={onContinue} disabled={isAuthenticating} highlighted={highlightContinue && !isAuthenticating} />
      </View>
    </>
  );
}

function ProfileScreen({
  churches,
  form,
  selectedChurchName,
  validationMessage,
  isSubmitting,
  authSession,
  onBack,
  onChange,
  onSubmit,
}: {
  churches: NetworkChurch[];
  form: RequestForm;
  selectedChurchName: string;
  validationMessage: string;
  isSubmitting: boolean;
  authSession: AuthSession | null;
  onBack: () => void;
  onChange: (updater: RequestForm | ((current: RequestForm) => RequestForm)) => void;
  onSubmit: () => void;
}) {
  const setField = (key: keyof RequestForm, value: string) => {
    onChange((current) => ({
      ...current,
      [key]: value,
    }));
  };

  return (
    <>
      <SectionHeader title="Create your member request" body="A church-focused intake form that stays simple for members and useful for admins." />
      <View style={styles.panel}>
        <FormField label="Full name" value={form.displayName} placeholder="Enter your full name" onChangeText={(value) => setField('displayName', value)} />
        <FormField label="Email" value={form.email} placeholder="Enter your email" keyboardType="email-address" editable={false} onChangeText={(value) => setField('email', value)} />
        <FormField label="Phone number" value={form.phoneNumber} placeholder="+491725818673" keyboardType="phone-pad" onChangeText={(value) => setField('phoneNumber', value)} />
        <Text style={styles.fieldLabel}>Church location</Text>
        <View style={styles.optionWrap}>
          {churches.map((church) => (
            <Pressable key={church.id} onPress={() => setField('requestedChurchId', church.id)} style={[styles.selectorTile, church.id === form.requestedChurchId && styles.selectorTileActive]}>
              <Text style={[styles.selectorTitle, church.id === form.requestedChurchId && styles.selectorTitleActive]}>{church.displayCity}</Text>
              <Text style={[styles.selectorBody, church.id === form.requestedChurchId && styles.selectorBodyActive]}>{church.city}</Text>
            </Pressable>
          ))}
        </View>
        <FormField label="Note to admin" value={form.note} placeholder="Optional note about your church or service interests" multiline onChangeText={(value) => setField('note', value)} />
        <Text style={styles.helperText}>Selected church: {selectedChurchName}</Text>
        <Text style={styles.helperText}>Request is sent to the church admin for Approval.</Text>
        <Text style={styles.helperText}>After you send this request, your church admin will review it before full member access is opened.</Text>
        {authSession?.providerId ? <Text style={styles.helperText}>Authenticated with: Google</Text> : null}
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>You are signed in. Send your member request now, then wait for approval to get full access to the church space. Teams are assigned later by church admins and team leaders.</Text>
        </View>
        {validationMessage ? <Text style={styles.errorText}>{validationMessage}</Text> : null}
      </View>
      <View style={styles.actionRowWide}>
        <SecondaryButton label="Back" onPress={onBack} />
        <PrimaryButton label={isSubmitting ? 'Sending...' : 'Send Request'} onPress={onSubmit} disabled={isSubmitting} />
      </View>
    </>
  );
}

function PendingApprovalScreen({
  approvalStatus,
  churchName,
  email,
  requestReference,
  notificationStatusMessage,
  onBackToGuest,
  onReturnToProfile,
}: {
  approvalStatus: 'pending' | 'approved' | 'rejected';
  churchName: string;
  email: string;
  requestReference: string | null;
  notificationStatusMessage: string;
  onBackToGuest: () => void;
  onReturnToProfile: () => void;
}) {
  const isRejected = approvalStatus === 'rejected';

  return (
    <>
      <SectionHeader
        title={isRejected ? 'Request needs attention' : 'Pending approval'}
        body={
          isRejected
            ? 'If an admin rejects the request, the member can update the details and send it again.'
            : 'The waiting state should feel reassuring and transparent instead of silent.'
        }
      />
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{isRejected ? 'Update your details and resubmit' : 'Request sent successfully'}</Text>
        <Text style={styles.cardBody}>
          {isRejected
            ? `Your request for ${churchName} needs an update before access can be granted.`
            : `Your request for ${churchName} has been sent. Please wait for approval to get full member access.`}
        </Text>
        <Text style={styles.cardBody}>Signed in with: Google</Text>
        <Text style={styles.cardBody}>Email: {email}</Text>
        {requestReference ? <Text style={styles.cardBody}>Request ID: {requestReference}</Text> : null}
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>Request is sent to the church admin for Approval.</Text>
        </View>
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>
            {isRejected
              ? 'You can return to the profile form, adjust your details, and send the request again.'
              : `Once approved, you will first be added to the ${churchName} church space. Team access is assigned later by admins.`}
          </Text>
        </View>
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>
            {isRejected
              ? 'This screen updates automatically from Firebase after an admin review.'
              : 'This screen updates automatically from Firebase after an admin approval.'}
          </Text>
        </View>
        {notificationStatusMessage ? (
          <View style={styles.noticeBox}>
            <Text style={styles.noticeText}>{notificationStatusMessage}</Text>
          </View>
        ) : null}
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>
            {isRejected
              ? 'After approval, members return directly to the approved church space.'
              : 'Prayer requests will show a confirmation immediately and appear publicly only after moderation.'}
          </Text>
        </View>
      </View>
      <View style={styles.actionRowWide}>
        <SecondaryButton label="Sign Out" onPress={onBackToGuest} />
        <PrimaryButton
          label={isRejected ? 'Update Request' : 'Approval Pending'}
          onPress={isRejected ? onReturnToProfile : onBackToGuest}
          disabled={!isRejected}
        />
      </View>
    </>
  );
}

function ApprovedPreviewScreen({
  form,
  church,
  announcements,
  events,
  publicCommonEvents,
  commonMeetingCancellationKeys,
  churchSpecificMeetingCancellationKeys,
  eventClock,
  prayerRequests,
  memberPrayerRequests,
  assignments,
  contentNotice,
  prayerNotice,
  assignmentNotice,
  notificationStatusMessage,
  prayerForm,
  isSubmittingPrayerRequest,
  removingPrayerRequestId,
  markingPrayerRequestId,
  memberProfile,
  respondingAssignmentId,
  onRespondToAssignment,
  onPrayerFormChange,
  onSendPrayerRequest,
  onRemovePrayerRequest,
  onMarkPrayerAsPrayed,
  onOpenUrl,
  onReset,
}: {
  form: RequestForm;
  church: NetworkChurch;
  announcements: ChurchAnnouncement[];
  events: ChurchEventItem[];
  publicCommonEvents: ChurchEventItem[];
  commonMeetingCancellationKeys: string[];
  churchSpecificMeetingCancellationKeys: string[];
  eventClock: number;
  prayerRequests: ChurchPrayerRequest[];
  memberPrayerRequests: ChurchPrayerRequest[];
  assignments: MemberAssignment[];
  contentNotice: string;
  prayerNotice: string;
  assignmentNotice: string;
  notificationStatusMessage: string;
  prayerForm: PrayerRequestForm;
  isSubmittingPrayerRequest: boolean;
  removingPrayerRequestId: string | null;
  markingPrayerRequestId: string | null;
  memberProfile: MemberProfile | null;
  respondingAssignmentId: string | null;
  onRespondToAssignment: (assignment: MemberAssignment, responseStatus: 'accepted' | 'declined') => void;
  onPrayerFormChange: (nextValue: PrayerRequestForm | ((current: PrayerRequestForm) => PrayerRequestForm)) => void;
  onSendPrayerRequest: () => void;
  onRemovePrayerRequest: (requestId: string) => void;
  onMarkPrayerAsPrayed: (request: ChurchPrayerRequest) => void;
  onOpenUrl: (url: string) => void;
  onReset: () => void;
}) {
  const [showHelpGuide, setShowHelpGuide] = useState(false);
  const [activeView, setActiveView] = useState<(typeof approvedMemberViews)[number]['key']>('home');
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState('');
  const sortedAssignments = useMemo(
    () =>
      [...assignments].sort((left, right) => {
        const leftDate = parseCalendarDate(left.serviceDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const rightDate = parseCalendarDate(right.serviceDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return leftDate - rightDate;
      }),
    [assignments],
  );
  const pendingAssignments = sortedAssignments.filter((assignment) => assignment.responseStatus === 'pending').length;
  const acceptedAssignments = sortedAssignments.filter((assignment) => assignment.responseStatus === 'accepted').length;
  const nextAssignment = sortedAssignments[0];
  const activeAnnouncements = useMemo(
    () => announcements.filter((announcement) => {
      if (!announcement.visibleUntilAt) {
        return true;
      }

      const visibleUntil = new Date(announcement.visibleUntilAt).getTime();
      return Number.isNaN(visibleUntil) || visibleUntil >= eventClock;
    }),
    [announcements, eventClock],
  );
  const activeEvents = useMemo(
    () => events.filter((event) => {
      const endAt = new Date(event.endAt).getTime();
      return Number.isNaN(endAt) || endAt >= eventClock;
    }),
    [eventClock, events],
  );
  const activePublicCommonEvents = useMemo(
    () => publicCommonEvents.filter((event) => {
      const endAt = new Date(event.endAt).getTime();
      return Number.isNaN(endAt) || endAt >= eventClock;
    }),
    [eventClock, publicCommonEvents],
  );
  const groupedSundayPlan = useMemo(() => buildSundayPlanGroups(sortedAssignments), [sortedAssignments]);
  const memberTeams = memberProfile?.teamNames ?? [];
  const memberRole = memberProfile?.roleKey ? memberRoleLabels[memberProfile.roleKey] : 'Member';
  const calendarMonthDate = useMemo(() => getCalendarMonthDate(calendarMonthOffset), [calendarMonthOffset]);
  const nextEvent = useMemo(() => {
    const now = new Date(eventClock);
    const monthOffsets = [0, 1, 2];
    const recurringEvents = monthOffsets.flatMap((offset) => {
      const monthDate = getCalendarMonthDateFromBase(now, offset);
      return [
        ...buildSundayServiceCalendarEvents(church, monthDate),
        ...buildCommonMeetingCalendarEvents(church, monthDate, commonMeetingCancellationKeys),
        ...buildChurchSpecificMeetingCalendarEvents(church, monthDate, churchSpecificMeetingCancellationKeys),
      ];
    });

    const seenIds = new Set<string>();
    const upcomingCandidates = [...activeEvents, ...activePublicCommonEvents, ...recurringEvents]
      .filter((event) => {
        const endAt = new Date(event.endAt).getTime();
        return Number.isNaN(endAt) || endAt >= eventClock;
      })
      .filter((event) => {
        if (seenIds.has(event.id)) {
          return false;
        }
        seenIds.add(event.id);
        return true;
      })
      .sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime());

    return upcomingCandidates[0];
  }, [
    activeEvents,
    activePublicCommonEvents,
    church,
    churchSpecificMeetingCancellationKeys,
    commonMeetingCancellationKeys,
    eventClock,
  ]);
  const calendarEvents = useMemo(
    () => [
      ...activeEvents,
      ...buildSundayServiceCalendarEvents(church, calendarMonthDate),
      ...buildCommonMeetingCalendarEvents(church, calendarMonthDate, commonMeetingCancellationKeys),
      ...buildChurchSpecificMeetingCalendarEvents(church, calendarMonthDate, churchSpecificMeetingCancellationKeys),
    ],
    [activeEvents, church, calendarMonthDate, commonMeetingCancellationKeys, churchSpecificMeetingCancellationKeys],
  );
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonthDate, calendarEvents), [calendarEvents, calendarMonthDate]);
  const previousCalendarMonthDate = useMemo(() => getCalendarMonthDate(calendarMonthOffset - 1), [calendarMonthOffset]);
  const nextCalendarMonthDate = useMemo(() => getCalendarMonthDate(calendarMonthOffset + 1), [calendarMonthOffset]);
  const selectedCalendarEvents = useMemo(() => {
    const activeDateKey = selectedCalendarDate || calendarDays.find((day) => day.isCurrentMonth && day.events.length > 0)?.dateKey || '';
    return calendarDays.find((day) => day.dateKey === activeDateKey) ?? null;
  }, [calendarDays, selectedCalendarDate]);
  const churchSpecificMeetings = churchSpecificMeetingCardsByChurch[church.id] ?? [];
  const sundayServiceMeetingCard = useMemo(
    () => ({
      key: `sunday-service-${church.id}`,
      title: 'Sunday Service',
      detail: church.serviceTimes,
      location: church.address,
      body: `The weekly Sunday service for ${church.displayCity}.`,
    }),
    [church.address, church.displayCity, church.id, church.serviceTimes],
  );
  const publishedChurchSpecificEvents = useMemo(
    () => activeEvents.filter((event) => event.scopeType !== 'network' && event.churchId === church.id),
    [activeEvents, church.id],
  );

  useEffect(() => {
    const firstUsefulDate = calendarDays.find((day) => day.isCurrentMonth && day.events.length > 0)?.dateKey ?? '';
    setSelectedCalendarDate((current) => (current && calendarDays.some((day) => day.dateKey === current)) ? current : firstUsefulDate);
  }, [calendarDays]);

  const renderAssignmentActions = (assignment: MemberAssignment) => (
    <View style={styles.assignmentActionRow}>
      {assignment.responseStatus !== 'declined' ? (
        <SecondaryButton
          label={respondingAssignmentId === assignment.id ? 'Updating...' : 'Decline'}
          onPress={() => onRespondToAssignment(assignment, 'declined')}
          disabled={respondingAssignmentId === assignment.id}
        />
      ) : null}
      {assignment.responseStatus !== 'accepted' ? (
        <PrimaryButton
          label={respondingAssignmentId === assignment.id ? 'Updating...' : 'Accept'}
          onPress={() => onRespondToAssignment(assignment, 'accepted')}
          disabled={respondingAssignmentId === assignment.id}
        />
      ) : null}
      <SecondaryButton
        label="Add To Calendar"
        onPress={() =>
          onOpenUrl(
            buildGoogleCalendarUrl({
              title: `${assignment.roleName} | ${church.displayCity}`,
              description: `Sunday ministry assignment for ${assignment.teamName}.`,
              location: church.address,
              startAt: buildSundayAssignmentRange(assignment.serviceDate, church.serviceTimes).startAt,
              endAt: buildSundayAssignmentRange(assignment.serviceDate, church.serviceTimes).endAt,
            }),
          )
        }
      />
      <SecondaryButton
        label="Download Invite"
        onPress={() =>
          downloadCalendarInvite({
            title: `${assignment.roleName} | ${church.displayCity}`,
            description: `Sunday ministry assignment for ${assignment.teamName}.`,
            location: church.address,
            startAt: buildSundayAssignmentRange(assignment.serviceDate, church.serviceTimes).startAt,
            endAt: buildSundayAssignmentRange(assignment.serviceDate, church.serviceTimes).endAt,
            fileName: `${church.id}-${assignment.serviceDate}-${assignment.roleName}`,
          }, onOpenUrl)
        }
      />
    </View>
  );

  return (
    <>
      <SectionHeader title="Approved member space" body="Your church dashboard now keeps Sunday planning, updates, events, teams, and support in one place." />
      {notificationStatusMessage ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>{notificationStatusMessage}</Text>
        </View>
      ) : null}
      {churchSpecificMeetings.length > 0 ? (
        <View style={styles.linkPanel}>
          <Text style={styles.linkPanelTitle}>{`${church.displayCity} Meetings`}</Text>
          <Text style={styles.linkPanelBody}>
            Church-specific meetings for {church.displayCity}. These meetings are visible inside your approved member space and appear in the church calendar unless a church admin cancels an occurrence.
          </Text>
          <View style={styles.commonMeetingGrid}>
            <View key={sundayServiceMeetingCard.key} style={styles.commonMeetingCard}>
              <View style={styles.commonMeetingTop}>
                <Text style={styles.commonMeetingTitle}>{sundayServiceMeetingCard.title}</Text>
              </View>
              <Text style={styles.commonMeetingDetail}>{sundayServiceMeetingCard.detail}</Text>
              <Text style={styles.commonMeetingScope}>{sundayServiceMeetingCard.location}</Text>
              <Text style={styles.commonMeetingBody}>{sundayServiceMeetingCard.body}</Text>
            </View>
            {churchSpecificMeetings.map((meeting) => (
              <View key={meeting.key} style={styles.commonMeetingCard}>
                <View style={styles.commonMeetingTop}>
                  <Text style={styles.commonMeetingTitle}>{meeting.title}</Text>
                </View>
                <Text style={styles.commonMeetingDetail}>{meeting.detail}</Text>
                <Text style={styles.commonMeetingScope}>{meeting.location}</Text>
                <Text style={styles.commonMeetingBody}>{meeting.body}</Text>
              </View>
            ))}
            {publishedChurchSpecificEvents.map((event) => (
              <PublishedMeetingEventTile key={event.id} event={event} scopeLabel={church.displayCity} />
            ))}
          </View>
        </View>
      ) : publishedChurchSpecificEvents.length > 0 ? (
        <View style={styles.linkPanel}>
          <Text style={styles.linkPanelTitle}>{`${church.displayCity} Meetings`}</Text>
          <Text style={styles.linkPanelBody}>
            Church-specific meetings and published events for {church.displayCity}. These event tiles disappear automatically after the event ends.
          </Text>
          <View style={styles.commonMeetingGrid}>
            <View key={sundayServiceMeetingCard.key} style={styles.commonMeetingCard}>
              <View style={styles.commonMeetingTop}>
                <Text style={styles.commonMeetingTitle}>{sundayServiceMeetingCard.title}</Text>
              </View>
              <Text style={styles.commonMeetingDetail}>{sundayServiceMeetingCard.detail}</Text>
              <Text style={styles.commonMeetingScope}>{sundayServiceMeetingCard.location}</Text>
              <Text style={styles.commonMeetingBody}>{sundayServiceMeetingCard.body}</Text>
            </View>
            {publishedChurchSpecificEvents.map((event) => (
              <PublishedMeetingEventTile key={event.id} event={event} scopeLabel={church.displayCity} />
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.moduleWrap}>
        {approvedMemberViews.map((item) => (
          <Pressable key={item.key} onPress={() => setActiveView(item.key)} style={[styles.modulePill, activeView === item.key && styles.modulePillActive]}>
            <Text style={[styles.modulePillText, activeView === item.key && styles.modulePillTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      {activeView === 'home' ? (
        <View style={styles.grid}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>This week at {church.displayCity}</Text>
            <View style={styles.contentMetricRow}>
              <MetricCard label="Next Sunday" value={nextAssignment ? formatAssignmentDate(nextAssignment.serviceDate) : 'Open'} hint={nextAssignment ? `${getActivityName(nextAssignment)} | ${nextAssignment.roleName}` : 'No Sunday role has been assigned yet'} />
              <MetricCard label="Announcements" value={`${activeAnnouncements.length}`} hint={activeAnnouncements[0]?.title ?? 'No announcements published yet'} />
              <MetricCard
                label="Upcoming event"
                value={nextEvent?.title ?? 'Soon'}
                hint={nextEvent ? formatCompactDate(nextEvent.startAt) : 'No church event is scheduled yet'}
              />
              <MetricCard label="My teams" value={`${memberTeams.length || 0}`} hint={`${memberRole} | ${memberTeams[0] ?? 'Waiting for team assignment'}`} />
            </View>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Support and contact</Text>
            {assignmentNotice ? (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}>{assignmentNotice}</Text>
              </View>
            ) : null}
            <View style={styles.contentList}>
              <View style={[styles.contentItem, styles.contentItemFirst]}>
                <Text style={styles.contentHeading}>Contact {church.displayCity}</Text>
                <Text style={styles.cardBody}>{church.contactPhone} | {church.contactEmail}</Text>
                <View style={styles.assignmentActionRow}>
                  <SecondaryButton label="WhatsApp" onPress={() => onOpenUrl(church.whatsappUrl)} />
                  <SecondaryButton label="Email" onPress={() => onOpenUrl(`mailto:${church.contactEmail}`)} />
                  {church.weeklyMeetingUrl ? <SecondaryButton label="Online Meeting Link" onPress={() => onOpenUrl(church.weeklyMeetingUrl!)} /> : null}
                </View>
              </View>
            </View>
          </View>
        </View>
      ) : null}
      {activeView === 'sunday' ? (
        <View style={styles.grid}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>My Sunday plan</Text>
            {assignmentNotice ? (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}>{assignmentNotice}</Text>
              </View>
            ) : null}
            {groupedSundayPlan.length > 0 ? (
              groupedSundayPlan.map((serviceDay, dayIndex) => (
                <View key={serviceDay.serviceDate} style={[styles.contentItem, dayIndex === 0 && styles.contentItemFirst]}>
                  <Text style={styles.contentHeading}>{formatAssignmentDate(serviceDay.serviceDate)}</Text>
                  <Text style={styles.contentMeta}>{church.serviceTimes} | {church.displayCity}</Text>
                  <View style={styles.approvedActivityGroupList}>
                    {serviceDay.activities.map((activity) => (
                      <View key={`${serviceDay.serviceDate}-${activity.activityName}`} style={styles.approvedActivityCard}>
                        <Text style={styles.approvedActivityTitle}>{activity.activityName}</Text>
                        <Text style={styles.approvedActivityTeam}>{activity.teamName}</Text>
                        {activity.assignments.map((assignment) => (
                          <View key={assignment.id} style={styles.approvedRoleCard}>
                            <View style={styles.assignmentTopRow}>
                              <View style={styles.assignmentCopy}>
                                <Text style={styles.contentHeading}>{assignment.roleName}</Text>
                                <Text style={styles.contentMeta}>{assignment.teamName}</Text>
                              </View>
                              <View style={[styles.assignmentStatusBadge, assignment.responseStatus === 'accepted' && styles.assignmentStatusAccepted, assignment.responseStatus === 'declined' && styles.assignmentStatusDeclined]}>
                                <Text style={[styles.assignmentStatusText, assignment.responseStatus !== 'pending' && styles.assignmentStatusTextDark]}>
                                  {capitalize(assignment.responseStatus)}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.cardBody}>You are serving in {activity.activityName} as {assignment.roleName} for {church.displayCity}.</Text>
                            {renderAssignmentActions(assignment)}
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyState}>No Sunday assignments are visible yet. When your church schedules the coming service, this page will group your roles by activity and Sunday.</Text>
            )}
          </View>
        </View>
      ) : null}
      {activeView === 'announcements' ? (
        <View style={styles.grid}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Announcements</Text>
            {contentNotice ? (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}>{contentNotice}</Text>
              </View>
            ) : null}
            <View style={styles.contentList}>
              {activeAnnouncements.length > 0 ? (
                activeAnnouncements.map((announcement, index) => (
                  <View key={announcement.id} style={[styles.contentItem, index === 0 && styles.contentItemFirst]}>
                    <Text style={styles.contentMeta}>
                      {formatDetailedDate(announcement.publishedAt)} | {formatAnnouncementScope(announcement, church)}
                    </Text>
                    <Text style={styles.contentHeading}>{announcement.title}</Text>
                    <Text style={styles.cardBody}>{announcement.body}</Text>
                    <Text style={styles.contentAudience}>{announcement.audienceLabel}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyState}>No announcements are active for {church.displayCity} right now. New church updates will appear here as soon as leaders publish them.</Text>
              )}
            </View>
          </View>
        </View>
      ) : null}
      {activeView === 'events' ? (
        <View style={styles.grid}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Events</Text>
            <View style={styles.contentList}>
              {activeEvents.length > 0 ? (
                activeEvents.map((event, index) => (
                  <View key={event.id} style={[styles.contentItem, index === 0 && styles.contentItemFirst]}>
                    {event.posterUrl ? <Image source={{ uri: event.posterUrl }} style={styles.eventPoster} resizeMode="cover" /> : null}
                    <Text style={styles.contentMeta}>{formatEventRange(event.startAt, event.endAt)}</Text>
                    <Text style={styles.contentHeading}>{event.title}</Text>
                    <Text style={styles.cardBody}>{event.description}</Text>
                    <Text style={styles.contentAudience}>
                      {event.scopeType === 'network' ? 'All churches' : church.displayCity}
                      {' | '}
                      {event.location}
                      {event.teamName ? ` | ${event.teamName}` : ''}
                    </Text>
                    <View style={styles.assignmentActionRow}>
                      <SecondaryButton label="Add To Calendar" onPress={() => onOpenUrl(buildGoogleCalendarUrl({ title: event.title, description: event.description, location: event.location, startAt: event.startAt, endAt: event.endAt }))} />
                      <SecondaryButton label="Download Invite" onPress={() => downloadCalendarInvite({ title: event.title, description: event.description, location: event.location, startAt: event.startAt, endAt: event.endAt, fileName: `${church.id}-${event.title}` }, onOpenUrl)} />
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyState}>No upcoming events are scheduled for {church.displayCity} or the wider network yet. When church admins publish new gatherings, they will appear here with calendar actions.</Text>
              )}
            </View>
          </View>
        </View>
      ) : null}
      {activeView === 'calendar' ? (
        <View style={styles.calendarWorkspace}>
          <View style={[styles.card, styles.calendarBoardCard]}>
            <View style={styles.calendarHeader}>
              <View>
                <Text style={styles.cardTitle}>Church calendar</Text>
                <Text style={styles.cardBody}>Live events for {church.displayCity} plus shared gatherings for all BIPC churches.</Text>
              </View>
              <View style={styles.calendarHeaderActions}>
                <SecondaryButton label={formatCalendarShortMonth(previousCalendarMonthDate)} onPress={() => setCalendarMonthOffset((current) => current - 1)} />
                <View style={styles.calendarMonthBadge}>
                  <Text style={styles.calendarMonthBadgeText}>{formatCalendarMonthTitle(calendarMonthDate)}</Text>
                </View>
                <SecondaryButton label={formatCalendarShortMonth(nextCalendarMonthDate)} onPress={() => setCalendarMonthOffset((current) => current + 1)} />
              </View>
            </View>
            <View style={styles.calendarWeekdayRow}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((weekday) => (
                <Text key={weekday} style={styles.calendarWeekdayLabel}>{weekday}</Text>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {calendarDays.map((day) => {
                const isSelected = selectedCalendarEvents?.dateKey === day.dateKey;
                return (
                  <Pressable
                    key={day.dateKey}
                    onPress={() => setSelectedCalendarDate(day.dateKey)}
                    style={[
                      styles.calendarDayTile,
                      !day.isCurrentMonth && styles.calendarDayTileMuted,
                      day.events.length > 0 && styles.calendarDayTileActive,
                      day.isToday && styles.calendarDayTileToday,
                      isSelected && styles.calendarDayTileSelected,
                    ]}
                  >
                    <Text style={[styles.calendarDayNumber, !day.isCurrentMonth && styles.calendarDayNumberMuted]}>{day.dayNumber}</Text>
                    {day.events.length > 0 ? (
                      <>
                        <Text style={styles.calendarEventCount}>{day.events.length} event{day.events.length > 1 ? 's' : ''}</Text>
                        <Text style={styles.calendarEventPreview}>{day.events[0].scopeType === 'network' ? 'Network' : church.displayCity}</Text>
                      </>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={[styles.card, styles.calendarDetailCard]}>
            <Text style={styles.cardTitle}>{selectedCalendarEvents ? `Events on ${formatAssignmentDate(selectedCalendarEvents.dateKey)}` : 'Choose a day'}</Text>
            <View style={styles.contentList}>
              {selectedCalendarEvents && selectedCalendarEvents.events.length > 0 ? (
                selectedCalendarEvents.events.map((event, index) => (
                  <View key={event.id} style={[styles.contentItem, index === 0 && styles.contentItemFirst]}>
                    {event.posterUrl ? <Image source={{ uri: event.posterUrl }} style={styles.eventPoster} resizeMode="cover" /> : null}
                    <Text style={styles.contentMeta}>{formatEventRange(event.startAt, event.endAt)}</Text>
                    <Text style={styles.contentHeading}>{event.title}</Text>
                    <Text style={styles.cardBody}>{event.description}</Text>
                    <Text style={styles.contentAudience}>
                      {event.scopeType === 'network' ? 'All churches' : church.displayCity}
                      {' | '}
                      {event.location}
                      {event.teamName ? ` | ${event.teamName}` : ''}
                    </Text>
                    <View style={styles.assignmentActionRow}>
                      <SecondaryButton label="Add To Calendar" onPress={() => onOpenUrl(buildGoogleCalendarUrl({ title: event.title, description: event.description, location: event.location, startAt: event.startAt, endAt: event.endAt }))} />
                      <SecondaryButton label="Download Invite" onPress={() => downloadCalendarInvite({ title: event.title, description: event.description, location: event.location, startAt: event.startAt, endAt: event.endAt, fileName: `${church.id}-${event.title}` }, onOpenUrl)} />
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyState}>Select a highlighted day to review that day’s church and network events. Days without planned events stay empty.</Text>
              )}
            </View>
          </View>
        </View>
      ) : null}
      {activeView === 'prayer' ? (
        <View style={styles.grid}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Send a prayer request</Text>
            <Text style={styles.cardBody}>
              Share a request with {church.displayCity}. After a pastor or admin approves it, the request appears in the church Prayer Wall for members in the same church.
            </Text>
            <View style={styles.prayerComposer}>
              <FormField
                label="Prayer request"
                value={prayerForm.content}
                placeholder="Write the request you want the church to pray for"
                multiline
                onChangeText={(value) => onPrayerFormChange((current) => ({ ...current, content: value }))}
              />
              <View style={styles.prayerComposerActions}>
                <Pressable
                  onPress={() => onPrayerFormChange((current) => ({ ...current, isAnonymous: !current.isAnonymous }))}
                  style={[styles.prayerToggle, prayerForm.isAnonymous && styles.prayerToggleActive]}
                >
                  <Text style={[styles.prayerToggleText, prayerForm.isAnonymous && styles.prayerToggleTextActive]}>
                    {prayerForm.isAnonymous ? 'Anonymous sharing enabled' : 'Share anonymously'}
                  </Text>
                </Pressable>
                <PrimaryButton
                  label={isSubmittingPrayerRequest ? 'Sending...' : 'Send prayer request'}
                  onPress={onSendPrayerRequest}
                  disabled={isSubmittingPrayerRequest}
                />
              </View>
              {prayerNotice ? (
                <View style={styles.noticeBox}>
                  <Text style={styles.noticeText}>{prayerNotice}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>My prayer requests</Text>
            <Text style={styles.cardBody}>
              Track your submitted requests here. You can remove your own request any time. If it was already approved, it disappears from the public prayer wall too.
            </Text>
            <View style={styles.prayerWallList}>
              {memberPrayerRequests.length > 0 ? (
                memberPrayerRequests.map((request) => (
                  <View key={request.id} style={styles.prayerTile}>
                    <View style={styles.prayerTileTop}>
                      <View style={styles.prayerTileAuthorWrap}>
                        <Text style={styles.prayerTileAuthor}>{request.isAnonymous ? 'Shared anonymously' : 'Shared with your name'}</Text>
                        <Text style={styles.prayerTileMeta}>{formatDetailedDate(request.submittedAt)}</Text>
                      </View>
                      <View
                        style={[
                          styles.prayerStatusBadge,
                          request.status === 'pending' && styles.prayerStatusPending,
                          request.status === 'hidden' && styles.prayerStatusHidden,
                        ]}
                      >
                        <Text
                          style={[
                            styles.prayerStatusText,
                            request.status !== 'approved' && styles.prayerStatusTextMuted,
                          ]}
                        >
                          {capitalize(request.status)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.prayerTileBody}>{request.content}</Text>
                    <View style={styles.assignmentActionRow}>
                      <SecondaryButton
                        label={removingPrayerRequestId === request.id ? 'Removing...' : 'Remove request'}
                        onPress={() => onRemovePrayerRequest(request.id)}
                        disabled={removingPrayerRequestId === request.id}
                      />
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyState}>
                  You have not submitted any prayer requests for {church.displayCity} yet. When you send one, its review status will appear here.
                </Text>
              )}
            </View>
          </View>
        </View>
      ) : null}
      {activeView === 'prayerWall' ? (
        <View style={styles.grid}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Prayer Wall</Text>
            <Text style={styles.cardBody}>
              Approved prayer requests from members in {church.displayCity}. Anonymous submissions stay anonymous here for everyone else.
            </Text>
            <View style={styles.prayerWallList}>
              {prayerRequests.length > 0 ? (
                prayerRequests.map((request) => (
                  <View key={request.id} style={styles.prayerTile}>
                    <View style={styles.prayerTileTop}>
                      <View style={styles.prayerTileAuthorWrap}>
                        <Text style={styles.prayerTileAuthor}>{request.isAnonymous ? 'Anonymous' : request.submittedByLabel}</Text>
                        <Text style={styles.prayerTileMeta}>{formatDetailedDate(request.submittedAt)}</Text>
                      </View>
                      <View style={styles.prayerTileActions}>
                        {request.prayedByCurrentUser ? (
                          <View style={[styles.prayerStatusBadge, styles.prayerStatusPrayed]}>
                            <Text style={[styles.prayerStatusText, styles.prayerStatusTextPrayed]}>Prayed</Text>
                          </View>
                        ) : (
                          <SecondaryButton
                            label={markingPrayerRequestId === request.id ? 'Saving...' : 'Pray'}
                            onPress={() => onMarkPrayerAsPrayed(request)}
                            disabled={markingPrayerRequestId === request.id}
                          />
                        )}
                      </View>
                    </View>
                    <Text style={styles.prayerTileBody}>{request.content}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyState}>
                  No approved prayer requests are visible for {church.displayCity} yet. When church leaders approve new requests, they will appear here as prayer tiles.
                </Text>
              )}
            </View>
          </View>
        </View>
      ) : null}
      {activeView === 'teams' ? (
        <View style={styles.grid}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>My teams</Text>
            <View style={styles.contentMetricRow}>
              <MetricCard label="Current role" value={memberRole} hint="Your effective role across this church space" />
              <MetricCard label="Assigned teams" value={`${memberTeams.length || 0}`} hint={memberTeams[0] ?? 'No team has been assigned yet'} />
            </View>
            <View style={styles.contentList}>
              {memberTeams.length > 0 ? (
                memberTeams.map((teamName, index) => (
                  <View key={teamName} style={[styles.contentItem, index === 0 && styles.contentItemFirst]}>
                    <Text style={styles.contentHeading}>{teamName}</Text>
                    <Text style={styles.cardBody}>You currently serve in {teamName}. Sunday roles planned by leaders for this team will appear automatically in your Sunday Plan.</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyState}>You are approved in {church.displayCity}, but no ministry team has been assigned yet. Once a church admin or team leader adds you to a team, it will appear here.</Text>
              )}
            </View>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Support in your church</Text>
            <View style={styles.contentList}>
              <View style={[styles.contentItem, styles.contentItemFirst]}>
                <Text style={styles.contentHeading}>Need assignment help?</Text>
                <Text style={styles.cardBody}>Use your church’s support channels if your schedule changes or if you need help with access, Sunday planning, or events.</Text>
                <View style={styles.assignmentActionRow}>
                  <SecondaryButton label="WhatsApp Support" onPress={() => onOpenUrl(church.whatsappUrl)} />
                  <SecondaryButton label="Email Support" onPress={() => onOpenUrl(`mailto:${church.contactEmail}`)} />
                </View>
              </View>
            </View>
          </View>
        </View>
      ) : null}
      {showHelpGuide ? (
        <View style={styles.helpGuidePanel}>
          <Text style={styles.helpGuideTitle}>Bethel Connect help guide</Text>
          <Text style={styles.helpGuideIntro}>This guide explains the full Bethel Connect experience, from guest browsing and member approval to Sunday planning, prayer participation, calendar use, events, meetings, and support.</Text>
          {helpGuideSections.map((section) => (
            <View key={section.title} style={styles.helpGuideSection}>
              <Text style={styles.helpGuideSectionTitle}>{section.title}</Text>
              {section.points.map((point) => (
                <Text key={point} style={styles.helpGuideBullet}>{`\u2022 ${point}`}</Text>
              ))}
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.actionRowWide}>
        <SecondaryButton label={showHelpGuide ? 'Hide Help' : 'Help'} onPress={() => setShowHelpGuide((current) => !current)} />
      </View>
    </>
  );
}

function PublicChurchLinksSection({
  church,
  churches,
  onOpenUrl,
}: {
  church: NetworkChurch;
  churches: NetworkChurch[];
  onOpenUrl: (url: string) => void;
}) {
  const [showAboutUs, setShowAboutUs] = useState(false);
  const [showChurchLocations, setShowChurchLocations] = useState(false);
  const openPublicLink = (url: string) => {
    setShowAboutUs(false);
    setShowChurchLocations(false);
    onOpenUrl(url);
  };

  return (
    <View style={styles.linkPanel}>
      <Text style={styles.linkPanelTitle}>Public church links</Text>
      <View style={styles.linkRow}>
        <LinkButton
          label="About Us"
          onPress={() => {
            setShowChurchLocations(false);
            setShowAboutUs((current) => !current);
          }}
          active={showAboutUs}
        />
        <LinkButton
          label="Church Locations"
          onPress={() => {
            setShowAboutUs(false);
            setShowChurchLocations((current) => !current);
          }}
          active={showChurchLocations}
        />
        <LinkButton label="Church Website" url="https://bethel-pentecostal.org/" onOpenUrl={openPublicLink} />
        {church.weeklyMeetingUrl ? <LinkButton label="Online Meeting Link" url={church.weeklyMeetingUrl} onOpenUrl={openPublicLink} /> : null}
        {church.youtubeUrl ? <LinkButton label="YouTube Channel" url={church.youtubeUrl} onOpenUrl={openPublicLink} /> : null}
        {church.instagramUrl ? <LinkButton label="Instagram" url={church.instagramUrl} onOpenUrl={openPublicLink} /> : null}
        {church.facebookUrl ? <LinkButton label="Facebook" url={church.facebookUrl} onOpenUrl={openPublicLink} /> : null}
        <LinkButton label="Contact Us" url={church.whatsappUrl} onOpenUrl={openPublicLink} />
      </View>
      {showAboutUs ? (
        <View style={styles.aboutPanel}>
          <Text style={styles.aboutPanelTitle}>About Bethel International Pentecostal Church</Text>
          <Text style={styles.aboutPanelBody}>
            Bethel International Pentecostal Church describes itself as a loving church family where people from different backgrounds worship together, grow in prayer and ministry, and experience the power of Pentecost.
          </Text>
          <View style={styles.storyBand}>
            {aboutUsSummary.map((item) => (
              <StoryCard key={item.title} title={item.title} body={item.body} />
            ))}
          </View>
          <View style={styles.actionRowWide}>
            <SecondaryButton label="Read Full Page" onPress={() => onOpenUrl('https://bethel-pentecostal.org/about-us/')} />
          </View>
        </View>
      ) : null}
      {showChurchLocations ? (
        <View style={styles.aboutPanel}>
          <Text style={styles.aboutPanelTitle}>Church Locations</Text>
          <Text style={styles.aboutPanelBody}>
            Browse the Bethel church locations in Germany. Each church card keeps the local city, Sunday time, address, and contact details in one place.
          </Text>
          <View style={styles.locationGrid}>
            {churches.map((item) => (
              <View key={item.id} style={styles.locationCard}>
                <View style={styles.locationTop}>
                  <View style={styles.locationCopy}>
                    <Text style={styles.locationTitle}>{item.displayCity}</Text>
                    <Text style={styles.locationSubtitle}>{item.city}</Text>
                  </View>
                  <Text style={styles.locationTime}>{item.serviceTimes}</Text>
                </View>
                <Text style={styles.locationAddress}>{item.address}</Text>
                <Text style={styles.locationMeta}>{item.googleMapsLabel}</Text>
                <Text style={styles.locationMeta}>{item.contactEmail}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function CommonMeetingsSection({
  church,
  onOpenUrl,
  publishedEvents,
  eventClock,
}: {
  church: NetworkChurch;
  onOpenUrl: (url: string) => void;
  publishedEvents: ChurchEventItem[];
  eventClock: number;
}) {
  const commonMeetingUrl = church.weeklyMeetingUrl;
  const activePublishedEvents = useMemo(
    () => publishedEvents.filter((event) => {
      const endAt = new Date(event.endAt).getTime();
      return Number.isNaN(endAt) || endAt >= eventClock;
    }),
    [eventClock, publishedEvents],
  );

  return (
    <View style={styles.linkPanel}>
      <Text style={styles.linkPanelTitle}>Bethel Church Common Meetings</Text>
      <Text style={styles.linkPanelBody}>
        Shared meetings across Bethel churches in Germany. These are visible to everyone, including guests, and appear in the church calendar unless a local cancellation is made.
      </Text>
      <View style={styles.commonMeetingGrid}>
        {commonMeetingCards.map((meeting) => (
          <View key={meeting.key} style={styles.commonMeetingCard}>
            <View style={styles.commonMeetingTop}>
              <Text style={styles.commonMeetingTitle}>{meeting.title}</Text>
              {commonMeetingUrl ? (
                <Pressable onPress={() => onOpenUrl(commonMeetingUrl)} style={styles.commonMeetingJoinButton}>
                  <Text style={styles.commonMeetingJoinButtonText}>Join</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.commonMeetingDetail}>{meeting.detail}</Text>
            <Text style={styles.commonMeetingScope}>{meeting.location}</Text>
            <Text style={styles.commonMeetingBody}>{meeting.body}</Text>
          </View>
        ))}
        {activePublishedEvents.map((event) => (
          <PublishedMeetingEventTile key={event.id} event={event} scopeLabel="All churches" />
        ))}
      </View>
    </View>
  );
}

function PublishedMeetingEventTile({ event, scopeLabel }: { event: ChurchEventItem; scopeLabel: string }) {
  return (
    <View style={styles.commonMeetingCard}>
      {event.posterUrl ? <Image source={{ uri: event.posterUrl }} style={styles.commonMeetingPoster} resizeMode="cover" /> : null}
      <View style={styles.commonMeetingTop}>
        <Text style={styles.commonMeetingTitle}>{event.title}</Text>
      </View>
      <Text style={styles.commonMeetingDetail}>{formatEventRange(event.startAt, event.endAt)}</Text>
      <Text style={styles.commonMeetingBody}>{event.description}</Text>
      <Text style={styles.commonMeetingScope}>{scopeLabel} | {event.location}</Text>
    </View>
  );
}

function SectionHeader({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{body}</Text>
    </View>
  );
}

function BrandMark({
  inverse,
  subtitle,
  caption,
}: {
  inverse?: boolean;
  subtitle: string;
  caption: string;
}) {
  return (
    <View style={styles.brandMark}>
      <View style={styles.brandRow}>
        <Text style={[styles.brandWord, inverse && styles.brandWordInverse]}>BE</Text>
        <View style={styles.brandCrossWrap}>
          <View style={[styles.brandCrossVertical, inverse && styles.brandCrossInverse]} />
          <View style={[styles.brandCrossVerticalSoft, inverse && styles.brandCrossSoftInverse]} />
          <View style={[styles.brandCrossHorizontal, inverse && styles.brandCrossInverse]} />
          <View style={[styles.brandCrossHorizontalSoft, inverse && styles.brandCrossSoftInverse]} />
        </View>
        <Text style={[styles.brandWord, inverse && styles.brandWordInverse]}>HEL</Text>
      </View>
      <Text style={[styles.brandSubtitle, inverse && styles.brandSubtitleInverse]}>{subtitle}</Text>
      <Text style={[styles.brandCaption, inverse && styles.brandCaptionInverse]}>{caption}</Text>
    </View>
  );
}

function OfficialSignature() {
  return (
    <View style={styles.signaturePanel}>
      <Image source={officialLogo} resizeMode="contain" style={styles.signatureImage} />
    </View>
  );
}

function Badge({ label, tone }: { label: string; tone: 'gold' | 'mint' | 'soft' }) {
  return (
    <View style={[styles.badge, tone === 'gold' && styles.badgeGold, tone === 'mint' && styles.badgeMint, tone === 'soft' && styles.badgeSoft]}>
      <Text style={[styles.badgeText, (tone === 'gold' || tone === 'mint') && styles.badgeTextDark]}>{label}</Text>
    </View>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricHint}>{hint}</Text>
    </View>
  );
}

function StoryCard({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.storyCard}>
      <Text style={styles.storyTitle}>{title}</Text>
      <Text style={styles.storyBody}>{body}</Text>
    </View>
  );
}

function FormField({
  label,
  multiline,
  ...props
}: {
  label: string;
  value: string;
  placeholder: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  multiline?: boolean;
  editable?: boolean;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput {...props} multiline={multiline} placeholderTextColor="#8A8F98" style={[styles.input, multiline && styles.textArea]} />
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
  highlighted,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  highlighted?: boolean;
}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.button, styles.primaryButton, highlighted && styles.primaryButtonHighlighted, disabled && styles.buttonDisabled]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.button, styles.secondaryButton, disabled && styles.buttonDisabled]}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function LinkButton({
  label,
  url,
  onOpenUrl,
  onPress,
  active,
}: {
  label: string;
  url?: string;
  onOpenUrl?: (url: string) => void;
  onPress?: () => void;
  active?: boolean;
}) {
  return (
    <Pressable onPress={onPress ?? (() => url && onOpenUrl?.(url))} style={[styles.linkButton, active && styles.linkButtonActive]}>
      <Text style={[styles.linkButtonText, active && styles.linkButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function formatCompactDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Soon';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatDetailedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatAnnouncementScope(announcement: ChurchAnnouncement, church: NetworkChurch) {
  if (announcement.churchId === 'network') {
    return 'Bethel Church';
  }

  return church.name;
}

function formatEventRange(startAt: string, endAt: string) {
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

function formatAssignmentDate(value: string) {
  const date = parseCalendarDate(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function getActivityName(assignment: MemberAssignment) {
  const role = assignment.roleName.toLowerCase();
  const team = assignment.teamName.toLowerCase();

  if (team.includes('sunday school')) return 'Sunday School';
  if (team.includes('worship')) return 'Worship';
  if (team.includes('food')) return 'Food & Fellowship';
  if (team.includes('tech')) return 'Tech and Setup';
  if (role.includes('announcement')) return 'Announcements';
  if (role.includes('sermon')) return 'Sermon';
  if (role.includes('psalm') || role.includes('meditation') || role.includes('scripture')) return 'Psalm Meditation';
  if (team.includes('speaker')) return 'Speaker Segment';
  return assignment.teamName;
}

function buildSundayPlanGroups(assignments: MemberAssignment[]) {
  const groupedBySunday = new Map<
    string,
    Map<
      string,
      {
        activityName: string;
        teamName: string;
        assignments: MemberAssignment[];
      }
    >
  >();

  assignments.forEach((assignment) => {
    const activityName = getActivityName(assignment);
    const sundayKey = assignment.serviceDate;
    const activityMap = groupedBySunday.get(sundayKey) ?? new Map();
    const activityKey = `${activityName}::${assignment.teamName}`;
    const existing = activityMap.get(activityKey) ?? {
      activityName,
      teamName: assignment.teamName,
      assignments: [],
    };

    existing.assignments = [...existing.assignments, assignment].sort((left, right) => left.roleName.localeCompare(right.roleName));
    activityMap.set(activityKey, existing);
    groupedBySunday.set(sundayKey, activityMap);
  });

  return Array.from(groupedBySunday.entries())
    .map(([serviceDate, activities]) => ({
      serviceDate,
      activities: Array.from(activities.values()).sort((left, right) => left.activityName.localeCompare(right.activityName)),
    }))
    .sort((left, right) => left.serviceDate.localeCompare(right.serviceDate));
}

function getCalendarMonthDate(offset: number) {
  return getCalendarMonthDateFromBase(new Date(), offset);
}

function getCalendarMonthDateFromBase(baseDate: Date, offset: number) {
  const date = new Date(baseDate);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  date.setMonth(date.getMonth() + offset);
  return date;
}

function buildCalendarDays(monthDate: Date, events: ChurchEventItem[]) {
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const firstGridDate = new Date(monthStart);
  const startOffset = (monthStart.getDay() + 6) % 7;
  firstGridDate.setDate(monthStart.getDate() - startOffset);

  const finalGridDate = new Date(monthEnd);
  const endOffset = (7 - ((monthEnd.getDay() + 6) % 7) - 1 + 7) % 7;
  finalGridDate.setDate(monthEnd.getDate() + endOffset);

  const eventsByDate = events.reduce<Record<string, ChurchEventItem[]>>((groups, event) => {
    const eventStartDate = new Date(event.startAt);
    const eventEndDate = new Date(event.endAt);
    if (Number.isNaN(eventStartDate.getTime())) {
      return groups;
    }

    const startCursor = new Date(eventStartDate);
    startCursor.setHours(0, 0, 0, 0);

    const endCursor = Number.isNaN(eventEndDate.getTime()) ? new Date(eventStartDate) : new Date(eventEndDate);
    endCursor.setHours(0, 0, 0, 0);

    const cursor = new Date(startCursor);
    while (cursor <= endCursor) {
      const key = formatDateKey(cursor);
      groups[key] = [...(groups[key] ?? []), event].sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime());
      cursor.setDate(cursor.getDate() + 1);
    }

    return groups;
  }, {});

  const calendarDays: Array<{
    dateKey: string;
    dayNumber: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    events: ChurchEventItem[];
  }> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cursor = new Date(firstGridDate);
  while (cursor <= finalGridDate) {
    const dateKey = `${cursor.getFullYear()}-${`${cursor.getMonth() + 1}`.padStart(2, '0')}-${`${cursor.getDate()}`.padStart(2, '0')}`;
    calendarDays.push({
      dateKey,
      dayNumber: cursor.getDate(),
      isCurrentMonth: cursor.getMonth() === monthDate.getMonth(),
      isToday:
        cursor.getFullYear() === today.getFullYear()
        && cursor.getMonth() === today.getMonth()
        && cursor.getDate() === today.getDate(),
      events: eventsByDate[dateKey] ?? [],
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return calendarDays;
}

function buildCommonMeetingCalendarEvents(
  church: NetworkChurch,
  monthDate: Date,
  cancellationKeys: string[],
): ChurchEventItem[] {
  const commonEvents: ChurchEventItem[] = [];
  const cancelled = new Set(cancellationKeys);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0);

  for (let cursor = new Date(startOfMonth); cursor <= endOfMonth; cursor.setDate(cursor.getDate() + 1)) {
    const occurrenceDate = formatDateKey(cursor);
    const dayOfWeek = cursor.getDay();

    const dailyPrayerKey = buildCommonMeetingCancellationKey('daily-intercessory-prayer', occurrenceDate);
    if (dayOfWeek !== 0 && !cancelled.has(dailyPrayerKey)) {
      commonEvents.push(
        buildCommonMeetingOccurrence(church, 'daily-intercessory-prayer', 'Daily Intercessory Prayer', 'Shared prayer gathering across Bethel churches in Germany.', cursor, 6, 0, 7, 0),
      );
    }

    if (dayOfWeek === 3) {
      const midWeekKey = buildCommonMeetingCancellationKey('mid-week-meeting', occurrenceDate);
      if (!cancelled.has(midWeekKey)) {
        commonEvents.push(
          buildCommonMeetingOccurrence(church, 'mid-week-meeting', 'Mid Week Meeting', 'Weekly Bethel mid-week meeting for worship, Bible teaching, and prayer.', cursor, 19, 0, 20, 30),
        );
      }
    }

    if (dayOfWeek === 5) {
      const youthMeetingKey = buildCommonMeetingCancellationKey('youth-meeting', occurrenceDate);
      if (!cancelled.has(youthMeetingKey)) {
        commonEvents.push(
          buildCommonMeetingOccurrence(church, 'youth-meeting', 'Youth Meeting', 'Weekly youth gathering for fellowship, worship, and discipleship.', cursor, 20, 0, 21, 30),
        );
      }
    }
  }

  return commonEvents;
}

function buildSundayServiceCalendarEvents(
  church: NetworkChurch,
  monthDate: Date,
): ChurchEventItem[] {
  const serviceEvents: ChurchEventItem[] = [];
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0);

  for (let cursor = new Date(startOfMonth); cursor <= endOfMonth; cursor.setDate(cursor.getDate() + 1)) {
    if (cursor.getDay() !== 0) {
      continue;
    }

    serviceEvents.push(buildSundayServiceOccurrence(church, cursor));
  }

  return serviceEvents;
}

function buildChurchSpecificMeetingCalendarEvents(
  church: NetworkChurch,
  monthDate: Date,
  cancellationKeys: string[],
): ChurchEventItem[] {
  const templates = churchSpecificMeetingTemplatesByChurch[church.id] ?? [];
  if (templates.length === 0) {
    return [];
  }

  const specificEvents: ChurchEventItem[] = [];
  const cancelled = new Set(cancellationKeys);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0);

  for (let cursor = new Date(startOfMonth); cursor <= endOfMonth; cursor.setDate(cursor.getDate() + 1)) {
    const occurrenceDate = formatDateKey(cursor);
    const dayOfWeek = cursor.getDay();

    templates.forEach((template) => {
      if (!template.matchesDay(dayOfWeek)) {
        return;
      }

      const cancellationKey = buildChurchSpecificMeetingCancellationKey(template.key, occurrenceDate);
      if (!cancelled.has(cancellationKey)) {
        specificEvents.push(
          buildChurchSpecificMeetingOccurrence(
            church,
            template.key,
            template.title,
            template.description,
            cursor,
            template.startHour,
            template.startMinute,
            template.endHour,
            template.endMinute,
          ),
        );
      }
    });
  }

  return specificEvents;
}

function buildSundayServiceOccurrence(
  church: NetworkChurch,
  date: Date,
): ChurchEventItem {
  const startAt = new Date(date);
  const timeMatch = church.serviceTimes.match(/(\d{1,2}):(\d{2})/);

  if (timeMatch) {
    startAt.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
  } else {
    startAt.setHours(10, 0, 0, 0);
  }

  const endAt = new Date(startAt.getTime() + 150 * 60 * 1000);

  return {
    id: `sunday-service-${church.id}-${formatDateKey(date)}`,
    churchId: church.id,
    scopeType: 'church',
    scopeLabel: church.displayCity,
    title: 'Sunday Service',
    description: `Weekly Sunday service for ${church.displayCity}. This event follows the church's current Sunday start time automatically.`,
    location: church.address,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    isPublic: true,
  };
}

function buildCommonMeetingOccurrence(
  church: NetworkChurch,
  meetingKey: string,
  title: string,
  description: string,
  date: Date,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
): ChurchEventItem {
  const startAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), startHour, startMinute, 0, 0);
  const endAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), endHour, endMinute, 0, 0);

  return {
    id: `common-${meetingKey}-${formatDateKey(date)}`,
    churchId: church.id,
    scopeType: 'network',
    scopeLabel: 'All churches',
    title,
    description,
    location: 'Online',
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    isPublic: true,
  };
}

function buildChurchSpecificMeetingOccurrence(
  church: NetworkChurch,
  meetingKey: string,
  title: string,
  description: string,
  date: Date,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
): ChurchEventItem {
  const startAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), startHour, startMinute, 0, 0);
  const endAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), endHour, endMinute, 0, 0);

  return {
    id: `church-specific-${church.id}-${meetingKey}-${formatDateKey(date)}`,
    churchId: church.id,
    scopeType: 'church',
    scopeLabel: church.displayCity,
    title,
    description,
    location: 'Online',
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    isPublic: false,
  };
}

function buildCommonMeetingCancellationKey(meetingKey: string, occurrenceDate: string) {
  return `${meetingKey}:${occurrenceDate}`;
}

function buildChurchSpecificMeetingCancellationKey(meetingKey: string, occurrenceDate: string) {
  return `${meetingKey}:${occurrenceDate}`;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatCalendarMonthTitle(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(value);
}

function formatCalendarShortMonth(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
  }).format(value);
}

function buildSundayAssignmentRange(serviceDate: string, serviceTimes: string) {
  const start = parseCalendarDate(serviceDate);
  const timeMatch = serviceTimes.match(/(\d{1,2}):(\d{2})/);

  if (timeMatch) {
    start.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
  } else {
    start.setHours(10, 0, 0, 0);
  }

  const end = new Date(start.getTime() + 90 * 60 * 1000);
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
}

function buildGoogleCalendarUrl(event: {
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
}) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    details: event.description,
    location: event.location,
    dates: `${toGoogleCalendarDate(event.startAt)}/${toGoogleCalendarDate(event.endAt)}`,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function toGoogleCalendarDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function downloadCalendarInvite(
  event: {
    title: string;
    description: string;
    location: string;
    startAt: string;
    endAt: string;
    fileName: string;
  },
  onOpenUrl: (url: string) => void,
) {
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bethel Connect//Sunday Planner//EN',
    'BEGIN:VEVENT',
    `UID:${event.fileName}@bethelconnect`,
    `DTSTAMP:${toGoogleCalendarDate(new Date().toISOString())}`,
    `DTSTART:${toGoogleCalendarDate(event.startAt)}`,
    `DTEND:${toGoogleCalendarDate(event.endAt)}`,
    `SUMMARY:${escapeIcsValue(event.title)}`,
    `DESCRIPTION:${escapeIcsValue(event.description)}`,
    `LOCATION:${escapeIcsValue(event.location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${event.fileName}.ics`;
    anchor.click();
    window.URL.revokeObjectURL(url);
    return;
  }

  onOpenUrl(`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`);
}

function escapeIcsValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

function parseCalendarDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map((segment) => Number(segment));
    return new Date(year, month - 1, day);
  }

  return new Date(value);
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.parchment },
  glow: { position: 'absolute', borderRadius: 999, backgroundColor: colors.glow },
  glowTop: { width: 260, height: 260, top: -80, right: -20 },
  glowBottom: { width: 300, height: 300, bottom: 130, left: -120, backgroundColor: 'rgba(29, 89, 100, 0.12)' },
  scrollContent: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 56 },
  hero: { backgroundColor: colors.midnight, borderRadius: 30, padding: 22, marginBottom: 18, gap: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  heroTopRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' },
  heroBrandColumn: { flex: 1, minWidth: 240, gap: 12 },
  heroSeal: { minWidth: 144, maxWidth: 180, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 22, padding: 16 },
  heroSealLabel: { color: colors.gold, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2 },
  heroSealValue: { color: colors.white, fontSize: 40, fontWeight: '900', lineHeight: 44, marginTop: 8 },
  heroSealFoot: { color: '#B8C5D1', fontSize: 13, lineHeight: 19, marginTop: 8 },
  heroModeRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'flex-start', gap: 10 },
  heroBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  brandMark: { gap: 4, paddingTop: 2 },
  brandRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  brandWord: { color: colors.midnight, fontSize: 52, lineHeight: 56, fontWeight: '900', letterSpacing: 1.2 },
  brandWordInverse: { color: colors.white },
  brandCrossWrap: { width: 44, height: 96, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  brandCrossVertical: { position: 'absolute', width: 7, height: 96, borderRadius: 999, backgroundColor: colors.midnight },
  brandCrossVerticalSoft: { position: 'absolute', width: 3, height: 102, left: 14, borderRadius: 999, backgroundColor: 'rgba(16, 32, 51, 0.3)' },
  brandCrossHorizontal: { position: 'absolute', width: 60, height: 7, top: 28, borderRadius: 999, backgroundColor: colors.midnight },
  brandCrossHorizontalSoft: { position: 'absolute', width: 68, height: 3, top: 32, borderRadius: 999, backgroundColor: 'rgba(16, 32, 51, 0.24)' },
  brandCrossInverse: { backgroundColor: colors.white },
  brandCrossSoftInverse: { backgroundColor: 'rgba(255,255,255,0.36)' },
  brandSubtitle: { color: colors.midnight, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.15 },
  brandSubtitleInverse: { color: '#EAF0F5' },
  brandCaption: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  brandCaptionInverse: { color: '#B9C5D1' },
  signaturePanel: { alignSelf: 'flex-start', backgroundColor: colors.white, borderRadius: 20, padding: 12, borderWidth: 1, borderColor: 'rgba(16, 32, 51, 0.08)' },
  signatureImage: { width: 220, height: 220 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7 },
  badgeGold: { backgroundColor: colors.gold },
  badgeMint: { backgroundColor: colors.mint },
  badgeSoft: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  badgeText: { color: colors.white, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  badgeTextDark: { color: colors.ink },
  eyebrow: { color: colors.gold, fontSize: 28, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.6, lineHeight: 34 },
  title: { color: colors.white, fontSize: 34, fontWeight: '800', lineHeight: 40 },
  subtitle: { color: '#D4DFEA', fontSize: 16, lineHeight: 24 },
  heroApprovedPanel: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 24, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', gap: 12 },
  heroApprovedLabel: { color: colors.white, fontSize: 22, fontWeight: '800', lineHeight: 28 },
  heroApprovedBody: { color: '#D4DFEA', fontSize: 15, lineHeight: 22 },
  heroApprovedMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  heroApprovedMetricCard: { flexGrow: 1, minWidth: 144, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  heroApprovedMetricLabel: { color: colors.gold, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  heroApprovedMetricValue: { color: colors.white, fontSize: 20, fontWeight: '800', marginTop: 8 },
  heroApprovedMetricHint: { color: '#C8D3DE', fontSize: 13, lineHeight: 18, marginTop: 6 },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { minWidth: 132, flexGrow: 1, backgroundColor: colors.parchment, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: colors.softLine },
  metricLabel: { color: colors.teal, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  metricValue: { color: colors.midnight, fontSize: 28, fontWeight: '800', marginTop: 8 },
  metricHint: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 6 },
  actionRow: { marginBottom: 20 },
  actionRowWide: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4, marginBottom: 4 },
  button: { minWidth: 148, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  primaryButton: { backgroundColor: colors.gold },
  primaryButtonHighlighted: { backgroundColor: '#FFD56A', borderWidth: 2, borderColor: '#FFF4CC', shadowColor: '#D7A34A', shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  buttonDisabled: { opacity: 0.55 },
  secondaryButton: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.softLine },
  primaryButtonText: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  secondaryButtonText: { color: colors.midnight, fontSize: 15, fontWeight: '800' },
  heroModeBadge: { alignSelf: 'flex-start', backgroundColor: colors.gold, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  heroModeBadgeText: { color: colors.ink, fontSize: 15, fontWeight: '900', letterSpacing: 0.4 },
  heroSignOutButton: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  heroSignOutButtonText: { color: colors.white, fontSize: 14, fontWeight: '800' },
  authModeToggleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  authModeToggle: { flexGrow: 1, minWidth: 140, backgroundColor: colors.paper, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: colors.softLine, alignItems: 'center', justifyContent: 'center' },
  authModeToggleActive: { backgroundColor: '#FFF3D7', borderColor: colors.gold },
  authModeToggleText: { color: colors.midnight, fontSize: 15, fontWeight: '800' },
  authModeToggleTextActive: { color: colors.ink },
  storyBand: { gap: 12, marginBottom: 10 },
  storyCard: { backgroundColor: 'rgba(255,255,255,0.64)', borderRadius: 22, padding: 18, borderWidth: 1, borderColor: colors.softLine },
  storyTitle: { color: colors.navy, fontSize: 17, fontWeight: '800', marginBottom: 8 },
  storyBody: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  sectionHeader: { marginTop: 18, marginBottom: 12, gap: 6 },
  sectionTitle: { color: colors.midnight, fontSize: 28, fontWeight: '800', lineHeight: 32 },
  sectionBody: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  grid: { gap: 12, marginBottom: 20 },
  card: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.softLine, borderRadius: 24, padding: 18 },
  cardActive: { borderColor: colors.teal, borderWidth: 2, backgroundColor: '#F4FBFB' },
  cardTitle: { color: colors.navy, fontSize: 18, fontWeight: '800', marginBottom: 8 },
  cardBody: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  locationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 22 },
  commonMeetingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 14 },
  commonMeetingCard: { backgroundColor: colors.paper, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: colors.softLine, width: '31%', flexBasis: '31%', flexGrow: 0, flexShrink: 0, minWidth: 220 },
  commonMeetingTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  commonMeetingTitle: { color: colors.midnight, fontSize: 18, fontWeight: '800', lineHeight: 24 },
  commonMeetingPoster: { width: '100%', height: 146, borderRadius: 18, marginBottom: 14, backgroundColor: '#E7EDF2' },
  commonMeetingJoinButton: { backgroundColor: colors.navy, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, minWidth: 62, alignItems: 'center', justifyContent: 'center' },
  commonMeetingJoinButtonText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  commonMeetingDetail: { color: colors.teal, fontSize: 14, fontWeight: '800', marginTop: 8 },
  commonMeetingBody: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 10 },
  commonMeetingScope: { color: colors.navy, fontSize: 13, fontWeight: '700', lineHeight: 18, marginTop: 10 },
  locationCard: {
    backgroundColor: colors.paper,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.softLine,
    width: '31%',
    flexBasis: '31%',
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 220,
  },
  locationTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  locationCopy: { flex: 1 },
  locationTitle: { color: colors.midnight, fontSize: 20, fontWeight: '800' },
  locationSubtitle: { color: colors.teal, fontSize: 14, fontWeight: '700', marginTop: 4 },
  locationTime: { color: colors.white, backgroundColor: colors.navy, overflow: 'hidden', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, fontWeight: '800' },
  locationAddress: { color: colors.ink, fontSize: 15, lineHeight: 22, marginTop: 14, marginBottom: 10 },
  linkPanelBody: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  locationMeta: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  linkPanel: { backgroundColor: colors.midnight, borderRadius: 28, padding: 20, marginBottom: 22 },
  linkPanelTitle: { color: colors.white, fontSize: 22, fontWeight: '800', lineHeight: 28, marginBottom: 14 },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  linkButton: { backgroundColor: colors.white, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  linkButtonActive: { backgroundColor: colors.gold },
  linkButtonText: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  linkButtonTextActive: { color: colors.ink },
  aboutPanel: { marginTop: 16, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 22, padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  aboutPanelTitle: { color: colors.white, fontSize: 20, fontWeight: '800', lineHeight: 26, marginBottom: 10 },
  aboutPanelBody: { color: '#D4DFEA', fontSize: 15, lineHeight: 22, marginBottom: 14 },
  helpGuideActions: { marginTop: -4, marginBottom: 18, alignItems: 'flex-start' },
  helpGuidePanel: { backgroundColor: colors.paper, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: colors.softLine, marginBottom: 18 },
  helpGuideTitle: { color: colors.midnight, fontSize: 20, fontWeight: '800', marginBottom: 8 },
  helpGuideIntro: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 14 },
  helpGuideSection: { paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.softLine },
  helpGuideSectionTitle: { color: colors.navy, fontSize: 16, fontWeight: '800', marginBottom: 8 },
  helpGuideBullet: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 8 },
  panel: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.softLine, borderRadius: 24, padding: 18, marginBottom: 20 },
  panelTitle: { color: colors.midnight, fontSize: 18, fontWeight: '800', marginBottom: 10 },
  contentMetricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  contentMetricCard: { flexGrow: 1, minWidth: 144, backgroundColor: colors.parchment, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: colors.softLine },
  contentMetricLabel: { color: colors.teal, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  contentMetricValue: { color: colors.midnight, fontSize: 20, fontWeight: '800', marginTop: 8 },
  contentMetricHint: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 6 },
  calendarWorkspace: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20, alignItems: 'center' },
  calendarBoardCard: { flexBasis: '58%', flexGrow: 1, minWidth: 340 },
  calendarDetailCard: { flexBasis: '38%', flexGrow: 1, minWidth: 300 },
  calendarHeader: { gap: 12, marginBottom: 16 },
  eventPoster: { width: '100%', height: 172, borderRadius: 18, marginBottom: 12, backgroundColor: '#E7EDF2' },
  calendarHeaderActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  calendarMonthBadge: { backgroundColor: colors.parchment, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.softLine },
  calendarMonthBadgeText: { color: colors.midnight, fontSize: 15, fontWeight: '800' },
  calendarWeekdayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  calendarWeekdayLabel: { flexBasis: '13%', color: colors.teal, fontSize: 12, fontWeight: '800', textAlign: 'center', textTransform: 'uppercase' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  calendarDayTile: { flexBasis: '13%', minHeight: 80, backgroundColor: colors.white, borderRadius: 16, paddingHorizontal: 6, paddingVertical: 8, borderWidth: 1, borderColor: colors.softLine, justifyContent: 'space-between' },
  calendarDayTileMuted: { opacity: 0.55, backgroundColor: '#FBF8F1' },
  calendarDayTileActive: { borderColor: colors.teal, backgroundColor: '#F3FBFC' },
  calendarDayTileToday: { borderColor: colors.navy, borderWidth: 2, backgroundColor: '#EEF4FF' },
  calendarDayTileSelected: { borderColor: colors.gold, borderWidth: 2, backgroundColor: '#FFF8EA' },
  calendarDayNumber: { color: colors.midnight, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  calendarDayNumberMuted: { color: colors.muted },
  calendarEventCount: { color: colors.navy, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  calendarEventPreview: { color: colors.muted, fontSize: 11, textAlign: 'center', lineHeight: 14 },
  approvedActivityGroupList: { gap: 12, marginTop: 14 },
  approvedActivityCard: { backgroundColor: colors.parchment, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: colors.softLine, gap: 10 },
  approvedActivityTitle: { color: colors.midnight, fontSize: 18, fontWeight: '800' },
  approvedActivityTeam: { color: colors.teal, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
  approvedRoleCard: { backgroundColor: colors.white, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.softLine, gap: 10 },
  prayerComposer: { marginTop: 14, gap: 14 },
  prayerComposerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: -2 },
  prayerToggle: { backgroundColor: colors.parchment, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: colors.softLine },
  prayerToggleActive: { backgroundColor: '#FFF3D7', borderColor: colors.gold },
  prayerToggleText: { color: colors.midnight, fontSize: 14, fontWeight: '700' },
  prayerToggleTextActive: { color: colors.ink },
  prayerMyRequestsPanel: { backgroundColor: colors.white, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: colors.softLine, gap: 10 },
  prayerMyRequestsTitle: { color: colors.navy, fontSize: 17, fontWeight: '800' },
  prayerMyRequestsBody: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  prayerWallList: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14, alignItems: 'stretch' },
  prayerTile: { flexBasis: '31.5%', minWidth: 240, backgroundColor: colors.parchment, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.softLine, gap: 12 },
  prayerTileTop: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  prayerTileAuthorWrap: { flex: 1, minWidth: 180, gap: 4 },
  prayerTileActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
  prayerTileAuthor: { color: colors.navy, fontSize: 16, fontWeight: '800' },
  prayerTileMeta: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  prayerTileBody: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  prayerStatusBadge: { alignSelf: 'flex-start', backgroundColor: '#E8F6EC', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(32, 120, 76, 0.12)' },
  prayerStatusPrayed: { backgroundColor: '#EDF4FF', borderColor: 'rgba(50, 95, 171, 0.18)' },
  prayerStatusPending: { backgroundColor: '#FFF6DC', borderColor: 'rgba(217, 164, 65, 0.18)' },
  prayerStatusHidden: { backgroundColor: '#FBE7E4', borderColor: 'rgba(193, 79, 58, 0.14)' },
  prayerStatusText: { color: colors.success, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 },
  prayerStatusTextPrayed: { color: colors.navy },
  prayerStatusTextMuted: { color: colors.midnight },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  statusKey: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  statusDone: { color: colors.success, fontSize: 14, fontWeight: '700' },
  statusTodo: { color: colors.coral, fontSize: 14, fontWeight: '700' },
  bulletItem: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 10 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  timelineMarker: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  timelineMarkerText: { color: colors.white, fontSize: 14, fontWeight: '800' },
  timelineText: { flex: 1, color: colors.muted, fontSize: 15, lineHeight: 21 },
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { color: colors.ink, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  input: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.softLine, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, color: colors.ink, fontSize: 15 },
  textArea: { minHeight: 110, textAlignVertical: 'top' },
  optionWrap: { gap: 10, marginBottom: 16 },
  selectorTile: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.softLine, borderRadius: 16, padding: 14 },
  selectorTileActive: { borderColor: colors.teal, backgroundColor: '#F3FBFC' },
  selectorTitle: { color: colors.midnight, fontSize: 15, fontWeight: '800', marginBottom: 4 },
  selectorTitleActive: { color: colors.teal },
  selectorBody: { color: colors.muted, fontSize: 14 },
  selectorBodyActive: { color: colors.teal },
  helperText: { color: colors.teal, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  errorText: { color: '#A83A2E', fontSize: 14, fontWeight: '700', marginTop: 10 },
  recaptchaContainer: { width: 1, height: 1, opacity: 0, overflow: 'hidden' },
  moduleWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 22 },
  modulePill: { backgroundColor: colors.paper, borderColor: colors.softLine, borderWidth: 1, borderRadius: 22, paddingHorizontal: 20, paddingVertical: 16, minWidth: 164, alignItems: 'center', justifyContent: 'center' },
  modulePillActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  modulePillText: { color: colors.navy, fontSize: 17, fontWeight: '800', textAlign: 'center', lineHeight: 22 },
  modulePillTextActive: { color: colors.white },
  contentList: { gap: 14 },
  contentItem: { paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.softLine },
  contentItemFirst: { paddingTop: 0, borderTopWidth: 0 },
  assignmentTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  assignmentCopy: { flex: 1 },
  assignmentActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  planHeroCard: { backgroundColor: colors.parchment, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.softLine, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  planHeroCopy: { flex: 1 },
  planHeroLabel: { color: colors.teal, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  planHeroTitle: { color: colors.midnight, fontSize: 20, fontWeight: '800', lineHeight: 25 },
  planHeroMeta: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  assignmentStatusBadge: { borderRadius: 999, backgroundColor: colors.parchment, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.softLine },
  assignmentStatusAccepted: { backgroundColor: colors.mint, borderColor: colors.mint },
  assignmentStatusDeclined: { backgroundColor: colors.coral, borderColor: colors.coral },
  assignmentStatusText: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  assignmentStatusTextDark: { color: colors.midnight },
  contentMeta: { color: colors.teal, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  contentHeading: { color: colors.midnight, fontSize: 16, fontWeight: '800', marginBottom: 6 },
  contentAudience: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8 },
  emptyState: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  noticeBox: { backgroundColor: colors.parchment, borderRadius: 16, padding: 14, marginTop: 8 },
  noticeText: { color: colors.ink, fontSize: 14, lineHeight: 20 },
});
