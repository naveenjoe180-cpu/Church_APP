import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
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

import { firebaseConfigStatus, firebaseNextSteps, isFirebaseConfigured } from '../config/firebase';
import {
  type NetworkChurch,
  networkChurches,
  onboardingFlow,
  privateModules,
  publicHighlights,
  roleSummary,
  signInMethods,
  stackSummary,
  supportedTeams,
} from '../data/prototype';
import { createAccessRequest } from '../services/accessRequests';
import {
  createEmailAccount,
  onMemberAuthChanged,
  signInWithGoogle,
  signOutMember,
  updateMemberDisplayName,
  type AuthSession,
} from '../services/auth';
import { subscribeToChurches } from '../services/churches';
import {
  subscribeToChurchAnnouncements,
  subscribeToChurchEvents,
  type ChurchAnnouncement,
  type ChurchEventItem,
} from '../services/churchUpdates';
import { subscribeToMemberProfile, type MemberProfile } from '../services/memberProfile';
import {
  subscribeToMemberAssignments,
  updateMemberAssignmentResponse,
  type MemberAssignment,
} from '../services/teamAssignments';
import { colors } from '../theme';

type AppStage = 'guest' | 'signin' | 'profile' | 'pending' | 'approved';
type SignInMethod = 'google' | 'email';

type RequestForm = {
  displayName: string;
  email: string;
  phoneNumber: string;
  requestedChurchId: string;
  note: string;
};

type EmailAuthForm = {
  email: string;
  password: string;
};

const initialForm: RequestForm = {
  displayName: '',
  email: '',
  phoneNumber: '',
  requestedChurchId: 'cologne',
  note: '',
};

const initialEmailAuthForm: EmailAuthForm = {
  email: '',
  password: '',
};

const officialLogo = require('../../assets/official-church-logo.jpg');

const stageOrder: AppStage[] = ['guest', 'signin', 'profile', 'pending', 'approved'];

export function ChurchNetworkPrototypeApp() {
  const [stage, setStage] = useState<AppStage>('guest');
  const [signInMethod, setSignInMethod] = useState<SignInMethod>('google');
  const [requestForm, setRequestForm] = useState<RequestForm>(initialForm);
  const [emailAuthForm, setEmailAuthForm] = useState<EmailAuthForm>(initialEmailAuthForm);
  const [validationMessage, setValidationMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [requestReference, setRequestReference] = useState<string | null>(null);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [memberProfile, setMemberProfile] = useState<MemberProfile | null>(null);
  const [isSyncingAccess, setIsSyncingAccess] = useState(isFirebaseConfigured);
  const [churches, setChurches] = useState<NetworkChurch[]>(networkChurches);
  const [churchAnnouncements, setChurchAnnouncements] = useState<ChurchAnnouncement[]>([]);
  const [churchEvents, setChurchEvents] = useState<ChurchEventItem[]>([]);
  const [memberAssignments, setMemberAssignments] = useState<MemberAssignment[]>([]);
  const [churchContentNotice, setChurchContentNotice] = useState('');
  const [assignmentNotice, setAssignmentNotice] = useState('');
  const [respondingAssignmentId, setRespondingAssignmentId] = useState<string | null>(null);

  const activeChurchId = memberProfile?.pendingChurchId || memberProfile?.primaryChurchId || requestForm.requestedChurchId;
  const selectedChurch = useMemo(
    () => churches.find((church) => church.id === activeChurchId) ?? churches[0] ?? networkChurches[0],
    [activeChurchId, churches],
  );

  const stageIndex = stageOrder.indexOf(stage);
  const configuredKeys = firebaseConfigStatus.filter((item) => item.configured).length;
  const firebaseBadgeLabel = isSyncingAccess
    ? 'Checking Access'
    : isFirebaseConfigured
      ? 'Firebase Ready'
      : 'Firebase Pending';
  const firebaseBadgeTone = isSyncingAccess ? 'soft' : isFirebaseConfigured ? 'mint' : 'soft';
  const heroPrimaryLabel =
    stage === 'guest'
      ? 'Request Access'
      : stage === 'profile'
        ? 'Send Request'
        : stage === 'pending' || stage === 'approved'
          ? 'Sign Out'
          : 'Continue Flow';

  const openUrl = (url: string) => {
    void Linking.openURL(url);
  };

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
      setMemberAssignments([]);
      setChurchContentNotice('');
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

    return () => {
      unsubscribeAnnouncements();
      unsubscribeEvents();
    };
  }, [selectedChurch?.id, stage]);

  useEffect(() => {
    if (stage !== 'approved' || !selectedChurch?.id || !authSession?.uid) {
      setMemberAssignments([]);
      setAssignmentNotice('');
      return undefined;
    }

    setAssignmentNotice('');

    return subscribeToMemberAssignments(
      authSession.uid,
      selectedChurch.id,
      (nextAssignments) => {
        setMemberAssignments(nextAssignments);
      },
      (error) => {
        setAssignmentNotice((current) => current || error.message);
      },
    );
  }, [authSession?.uid, selectedChurch?.id, stage]);

  const beginAuthenticatedProfile = (session: AuthSession) => {
    setAuthSession(session);
    setRequestForm((current) => ({
      ...current,
      email: session.email,
      displayName: current.displayName || session.displayName || '',
    }));
    setValidationMessage('');
    setStage('profile');
  };

  const authenticateMember = async () => {
    setValidationMessage('');
    setIsAuthenticating(true);

    try {
      if (!isFirebaseConfigured) {
        throw new Error('Add the Firebase configuration before using live sign-in.');
      }

      if (signInMethod === 'google') {
        const session = await signInWithGoogle();
        beginAuthenticatedProfile(session);
        return;
      }

      if (!emailAuthForm.email.trim() || emailAuthForm.password.length < 6) {
        throw new Error('Enter an email and a password with at least 6 characters.');
      }

      const session = await createEmailAccount(emailAuthForm.email, emailAuthForm.password);
      beginAuthenticatedProfile(session);
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
    setEmailAuthForm(initialEmailAuthForm);
    setValidationMessage('');
    setIsSubmitting(false);
    setIsAuthenticating(false);
    setRequestReference(null);
    setAuthSession(null);
    setMemberProfile(null);
    setIsSyncingAccess(false);
    setMemberAssignments([]);
    setChurchAnnouncements([]);
    setChurchEvents([]);
    setChurchContentNotice('');
    setAssignmentNotice('');
    setRespondingAssignmentId(null);
    void signOutMember();
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
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroBrandColumn}>
              <OfficialSignature />
            </View>
            <View style={styles.heroSeal}>
              <Text style={styles.heroSealLabel}>Prototype</Text>
              <Text style={styles.heroSealValue}>01</Text>
              <Text style={styles.heroSealFoot}>Guest, member, and team journeys</Text>
            </View>
          </View>
          <View style={styles.heroBadgeRow}>
            <Badge label="Germany Network" tone="gold" />
            <Badge label={firebaseBadgeLabel} tone={firebaseBadgeTone} />
          </View>
          <Text style={styles.eyebrow}>Bethel Connect</Text>
          <Text style={styles.title}>Church life, updates, and ministry planning in one polished Bethel experience.</Text>
          <Text style={styles.subtitle}>
            The experience now centers the official church identity while keeping the member journey clear, warm, and easy to navigate.
          </Text>
          <View style={styles.metricRow}>
            <MetricCard label="Churches" value={`${churches.length}`} hint="Germany locations" />
            <MetricCard label="Teams" value={`${supportedTeams.length}`} hint="Church-specific ministry types" />
            <MetricCard label="Config" value={`${configuredKeys}/6`} hint="Firebase keys" />
          </View>
          <View style={styles.actionRowWide}>
            <PrimaryButton label={heroPrimaryLabel} onPress={() => {
              if (stage === 'guest') {
                setStage('signin');
                return;
              }
              if (stage === 'signin') {
                void authenticateMember();
                return;
              }
              if (stage === 'profile') {
                void submitRequest();
                return;
              }
              resetDemo();
            }} />
            <SecondaryButton label="Open YouTube" onPress={() => openUrl('https://www.youtube.com/@bipcgermany')} />
          </View>
          <View style={styles.stageWrap}>
            {stageOrder.map((item, index) => (
              <View key={item} style={[styles.stageChip, index <= stageIndex && styles.stageChipReached, item === stage && styles.stageChipActive]}>
                <Text style={[styles.stageChipText, index <= stageIndex && styles.stageChipTextReached, item === stage && styles.stageChipTextActive]}>
                  {item === 'signin' ? 'Sign in' : capitalize(item)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.storyBand}>
          <StoryCard title="Guest discovery" body="Visitors can browse churches, timings, and media before signing in." />
          <StoryCard title="Protected access" body="Schedules, member content, and planning stay locked until approval." />
          <StoryCard title="Church identity" body="Each church keeps its own members, teams, maps, and social links after approval." />
        </View>

        {stage === 'guest' ? <GuestScreen churches={churches} onRequestAccess={() => setStage('signin')} onOpenUrl={openUrl} /> : null}
        {stage === 'signin' ? <SignInChoiceScreen selectedMethod={signInMethod} emailAuthForm={emailAuthForm} validationMessage={validationMessage} isAuthenticating={isAuthenticating} onBack={() => setStage('guest')} onContinue={() => void authenticateMember()} onEmailAuthChange={setEmailAuthForm} onSelectMethod={setSignInMethod} /> : null}
        {stage === 'profile' ? <ProfileScreen churches={churches} form={requestForm} selectedChurchName={selectedChurch.name} validationMessage={validationMessage} isSubmitting={isSubmitting} authSession={authSession} onBack={() => setStage('signin')} onChange={setRequestForm} onSubmit={() => void submitRequest()} /> : null}
        {stage === 'pending' ? <PendingApprovalScreen approvalStatus={memberProfile?.approvalStatus ?? 'pending'} churchName={selectedChurch.name} email={requestForm.email} signInMethod={signInMethod} requestReference={requestReference} onBackToGuest={resetDemo} onReturnToProfile={() => setStage('profile')} /> : null}
        {stage === 'approved' ? (
          <ApprovedPreviewScreen
            form={requestForm}
            church={selectedChurch}
            announcements={churchAnnouncements}
            events={churchEvents}
            assignments={memberAssignments}
            contentNotice={churchContentNotice}
            assignmentNotice={assignmentNotice}
            respondingAssignmentId={respondingAssignmentId}
            onRespondToAssignment={(assignment, responseStatus) => void respondToAssignment(assignment, responseStatus)}
            onReset={resetDemo}
          />
        ) : null}

        <SectionHeader title="Build readiness" body="The visual shell is stronger now. The next major step is wiring live Firebase auth, approvals, and church data." />
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Firebase setup status</Text>
          {firebaseConfigStatus.map((item) => (
            <View key={item.key} style={styles.statusRow}>
              <Text style={styles.statusKey}>{item.key}</Text>
              <Text style={item.configured ? styles.statusDone : styles.statusTodo}>{item.configured ? 'Configured' : 'Pending'}</Text>
            </View>
          ))}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Next backend steps</Text>
          {firebaseNextSteps.map((item) => (
            <Text key={item} style={styles.bulletItem}>{`\u2022 ${item}`}</Text>
          ))}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Platform stack</Text>
          {stackSummary.map((item) => (
            <Text key={item} style={styles.bulletItem}>{`\u2022 ${item}`}</Text>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function GuestScreen({
  churches,
  onRequestAccess,
  onOpenUrl,
}: {
  churches: NetworkChurch[];
  onRequestAccess: () => void;
  onOpenUrl: (url: string) => void;
}) {
  return (
    <>
      <SectionHeader title="Guest mode" body="A welcoming front door for service times, locations, media, and first contact with the church network." />
      <View style={styles.grid}>
        {publicHighlights.map((item) => (
          <View key={item.title} style={styles.card}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardBody}>{item.body}</Text>
          </View>
        ))}
      </View>

      <SectionHeader title="Germany locations" body="Each location card is ready for church-specific maps, local social links, and real production data." />
      <View style={styles.locationGrid}>
          {churches.map((church) => (
            <View key={church.id} style={styles.locationCard}>
            <View style={styles.locationTop}>
              <View style={styles.locationCopy}>
                <Text style={styles.locationTitle}>{church.displayCity}</Text>
                <Text style={styles.locationSubtitle}>{church.city}</Text>
              </View>
              <Text style={styles.locationTime}>{church.serviceTimes}</Text>
            </View>
            <Text style={styles.locationAddress}>{church.address}</Text>
            <Text style={styles.locationMeta}>{church.googleMapsLabel}</Text>
            <Text style={styles.locationMeta}>{church.contactEmail}</Text>
          </View>
        ))}
      </View>

      <View style={styles.linkPanel}>
        <Text style={styles.linkPanelTitle}>Public church links</Text>
        <View style={styles.linkRow}>
          <LinkButton label="Weekly Meeting" url="https://meet.google.com" onOpenUrl={onOpenUrl} />
          <LinkButton label="YouTube Channel" url="https://www.youtube.com/@bipcgermany" onOpenUrl={onOpenUrl} />
          <LinkButton label="Instagram" url="https://www.instagram.com/bethel_international_church/" onOpenUrl={onOpenUrl} />
        </View>
      </View>

      <View style={styles.actionRow}>
        <PrimaryButton label="Request Access" onPress={onRequestAccess} />
      </View>
    </>
  );
}

function SignInChoiceScreen({
  selectedMethod,
  emailAuthForm,
  validationMessage,
  isAuthenticating,
  onBack,
  onContinue,
  onEmailAuthChange,
  onSelectMethod,
}: {
  selectedMethod: SignInMethod;
  emailAuthForm: EmailAuthForm;
  validationMessage: string;
  isAuthenticating: boolean;
  onBack: () => void;
  onContinue: () => void;
  onEmailAuthChange: (nextValue: EmailAuthForm | ((current: EmailAuthForm) => EmailAuthForm)) => void;
  onSelectMethod: (method: SignInMethod) => void;
}) {
  const setEmailField = (key: keyof EmailAuthForm, value: string) => {
    onEmailAuthChange((current) => ({
      ...current,
      [key]: value,
    }));
  };

  return (
    <>
      <SectionHeader title="Choose a sign-in method" body="Google and email/password support the first prototype. OTP stays planned for the second phase." />
      <View style={styles.grid}>
        {signInMethods.map((method) => (
          <Pressable key={method.key} onPress={() => onSelectMethod(method.key)} style={[styles.card, method.key === selectedMethod && styles.cardActive]}>
            <Text style={styles.cardTitle}>{method.title}</Text>
            <Text style={styles.cardBody}>{method.body}</Text>
          </Pressable>
        ))}
      </View>
      {selectedMethod === 'google' ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Google sign-in</Text>
          <Text style={styles.cardBody}>Continue with the church member's Google account first, then complete the church profile in the next step.</Text>
        </View>
      ) : null}
      {selectedMethod === 'email' ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Create email account</Text>
          <FormField
            label="Email"
            value={emailAuthForm.email}
            placeholder="Enter your email"
            keyboardType="email-address"
            onChangeText={(value) => setEmailField('email', value)}
          />
          <FormField
            label="Password"
            value={emailAuthForm.password}
            placeholder="Create a password"
            secureTextEntry
            onChangeText={(value) => setEmailField('password', value)}
          />
          <Text style={styles.helperText}>Use at least 6 characters. Profile details are completed in the next step.</Text>
        </View>
      ) : null}
      {validationMessage ? <Text style={styles.errorText}>{validationMessage}</Text> : null}
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Approval flow</Text>
        {onboardingFlow.map((step, index) => (
          <View key={step} style={styles.timelineRow}>
            <View style={styles.timelineMarker}>
              <Text style={styles.timelineMarkerText}>{index + 1}</Text>
            </View>
            <Text style={styles.timelineText}>{step}</Text>
          </View>
        ))}
      </View>
      <View style={styles.actionRowWide}>
        <SecondaryButton label="Back" onPress={onBack} />
        <PrimaryButton label={isAuthenticating ? 'Connecting...' : selectedMethod === 'google' ? 'Continue With Google' : 'Create Account'} onPress={onContinue} disabled={isAuthenticating} />
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
        <FormField label="Phone number" value={form.phoneNumber} placeholder="Optional for prototype 1" keyboardType="phone-pad" onChangeText={(value) => setField('phoneNumber', value)} />
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
        {authSession?.providerId ? <Text style={styles.helperText}>Authenticated with: {authSession.providerId === 'google.com' ? 'Google' : 'Email and password'}</Text> : null}
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>You will join this church space after approval. Teams are assigned later by church admins and team leaders.</Text>
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
  signInMethod,
  requestReference,
  onBackToGuest,
  onReturnToProfile,
}: {
  approvalStatus: 'pending' | 'approved' | 'rejected';
  churchName: string;
  email: string;
  signInMethod: SignInMethod;
  requestReference: string | null;
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
            : `Your request for ${churchName} has been sent. An admin will review it before private content becomes visible.`}
        </Text>
        <Text style={styles.cardBody}>Signed up with: {signInMethod === 'google' ? 'Google' : 'Email and password'}</Text>
        <Text style={styles.cardBody}>Email: {email}</Text>
        {requestReference ? <Text style={styles.cardBody}>Request ID: {requestReference}</Text> : null}
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
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>
            {isRejected
              ? 'OTP stays planned for phase 2 and will only be requested after approval.'
              : 'Prayer requests will show a confirmation immediately and appear publicly only after moderation.'}
          </Text>
        </View>
      </View>
      <View style={styles.actionRowWide}>
        <SecondaryButton label="Sign Out" onPress={onBackToGuest} />
        <PrimaryButton
          label={isRejected ? 'Update Request' : 'Waiting For Approval'}
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
  assignments,
  contentNotice,
  assignmentNotice,
  respondingAssignmentId,
  onRespondToAssignment,
  onReset,
}: {
  form: RequestForm;
  church: NetworkChurch;
  announcements: ChurchAnnouncement[];
  events: ChurchEventItem[];
  assignments: MemberAssignment[];
  contentNotice: string;
  assignmentNotice: string;
  respondingAssignmentId: string | null;
  onRespondToAssignment: (assignment: MemberAssignment, responseStatus: 'accepted' | 'declined') => void;
  onReset: () => void;
}) {
  const nextEvent = events[0];
  const pendingAssignments = assignments.filter((assignment) => assignment.responseStatus === 'pending').length;

  return (
    <>
      <SectionHeader title="Approved member preview" body="Once approved, the product shifts into communication, coordination, and church life." />
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Welcome, {form.displayName || 'Member'}</Text>
        <Text style={styles.cardBody}>This is the post-approval preview for {church.name}. Members first enter their own church space, receive local church updates, and only see teams assigned by local admins or leaders.</Text>
        <View style={styles.contentMetricRow}>
          <View style={styles.contentMetricCard}>
            <Text style={styles.contentMetricLabel}>Church Space</Text>
            <Text style={styles.contentMetricValue}>{church.displayCity}</Text>
            <Text style={styles.contentMetricHint}>{church.serviceTimes}</Text>
          </View>
          <View style={styles.contentMetricCard}>
            <Text style={styles.contentMetricLabel}>Announcements</Text>
            <Text style={styles.contentMetricValue}>{announcements.length}</Text>
            <Text style={styles.contentMetricHint}>Recent communication in one place</Text>
          </View>
          <View style={styles.contentMetricCard}>
            <Text style={styles.contentMetricLabel}>Next Event</Text>
            <Text style={styles.contentMetricValue}>{nextEvent ? formatCompactDate(nextEvent.startAt) : 'Soon'}</Text>
            <Text style={styles.contentMetricHint}>{nextEvent ? nextEvent.title : 'Upcoming meetings will appear here'}</Text>
          </View>
          <View style={styles.contentMetricCard}>
            <Text style={styles.contentMetricLabel}>My Tasks</Text>
            <Text style={styles.contentMetricValue}>{assignments.length}</Text>
            <Text style={styles.contentMetricHint}>{pendingAssignments > 0 ? `${pendingAssignments} waiting for your response` : 'All current responses recorded'}</Text>
          </View>
        </View>
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>Only network super admins can see all churches and all members across the network.</Text>
        </View>
      </View>
      <View style={styles.moduleWrap}>
        {privateModules.map((item) => (
          <View key={item} style={[styles.modulePill, styles.modulePillActive]}>
            <Text style={[styles.modulePillText, styles.modulePillTextActive]}>{item}</Text>
          </View>
        ))}
      </View>
      <View style={styles.grid}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>My team assignments</Text>
          {assignmentNotice ? (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeText}>{assignmentNotice}</Text>
            </View>
          ) : null}
          <View style={styles.contentList}>
            {assignments.length > 0 ? (
              assignments.map((assignment, index) => (
                <View key={assignment.id} style={[styles.contentItem, index === 0 && styles.contentItemFirst]}>
                  <View style={styles.assignmentTopRow}>
                    <View style={styles.assignmentCopy}>
                      <Text style={styles.contentHeading}>{assignment.roleName}</Text>
                      <Text style={styles.contentMeta}>
                        {formatAssignmentDate(assignment.serviceDate)} | {assignment.teamName}
                      </Text>
                    </View>
                    <View style={[styles.assignmentStatusBadge, assignment.responseStatus === 'accepted' && styles.assignmentStatusAccepted, assignment.responseStatus === 'declined' && styles.assignmentStatusDeclined]}>
                      <Text style={[styles.assignmentStatusText, assignment.responseStatus !== 'pending' && styles.assignmentStatusTextDark]}>
                        {capitalize(assignment.responseStatus)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardBody}>
                    You are assigned to {assignment.roleName} for {church.displayCity}. Team leaders and church admins see your status beside the task.
                  </Text>
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
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyState}>No team assignments have been sent to you yet. When a leader assigns you, the task will appear here with pending, accepted, or declined status.</Text>
            )}
          </View>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Latest announcements</Text>
          {contentNotice ? (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeText}>{contentNotice}</Text>
            </View>
          ) : null}
          <View style={styles.contentList}>
            {announcements.length > 0 ? (
              announcements.slice(0, 3).map((announcement, index) => (
                <View key={announcement.id} style={[styles.contentItem, index === 0 && styles.contentItemFirst]}>
                  <Text style={styles.contentMeta}>
                    {formatDetailedDate(announcement.publishedAt)} | {announcement.publishedBy}
                  </Text>
                  <Text style={styles.contentHeading}>{announcement.title}</Text>
                  <Text style={styles.cardBody}>{announcement.body}</Text>
                  <Text style={styles.contentAudience}>{announcement.audienceLabel}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyState}>No church announcements have been published yet for this location.</Text>
            )}
          </View>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Upcoming events</Text>
          <View style={styles.contentList}>
            {events.length > 0 ? (
              events.slice(0, 3).map((event, index) => (
                <View key={event.id} style={[styles.contentItem, index === 0 && styles.contentItemFirst]}>
                  <Text style={styles.contentMeta}>{formatEventRange(event.startAt, event.endAt)}</Text>
                  <Text style={styles.contentHeading}>{event.title}</Text>
                  <Text style={styles.cardBody}>{event.description}</Text>
                  <Text style={styles.contentAudience}>
                    {event.location}
                    {event.teamName ? ` | ${event.teamName}` : ''}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyState}>No upcoming events are scheduled for this church yet.</Text>
            )}
          </View>
        </View>
      </View>
      <View style={styles.grid}>
        {roleSummary.map((item) => (
          <View key={item.title} style={styles.card}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardBody}>{item.body}</Text>
          </View>
        ))}
      </View>
      <View style={styles.actionRow}>
        <PrimaryButton label="Sign Out" onPress={onReset} />
      </View>
    </>
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
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.button, styles.primaryButton, disabled && styles.buttonDisabled]}>
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
}: {
  label: string;
  url: string;
  onOpenUrl: (url: string) => void;
}) {
  return (
    <Pressable onPress={() => onOpenUrl(url)} style={styles.linkButton}>
      <Text style={styles.linkButtonText}>{label}</Text>
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
  eyebrow: { color: colors.gold, fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2 },
  title: { color: colors.white, fontSize: 34, fontWeight: '800', lineHeight: 40 },
  subtitle: { color: '#D4DFEA', fontSize: 16, lineHeight: 24 },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { minWidth: 132, flexGrow: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  metricLabel: { color: '#C8D3DE', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  metricValue: { color: colors.white, fontSize: 28, fontWeight: '800', marginTop: 8 },
  metricHint: { color: '#B8C5D1', fontSize: 13, lineHeight: 18, marginTop: 6 },
  actionRow: { marginBottom: 20 },
  actionRowWide: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4, marginBottom: 4 },
  button: { minWidth: 148, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  primaryButton: { backgroundColor: colors.gold },
  buttonDisabled: { opacity: 0.55 },
  secondaryButton: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.softLine },
  primaryButtonText: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  secondaryButtonText: { color: colors.midnight, fontSize: 15, fontWeight: '800' },
  stageWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stageChip: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  stageChipReached: { borderColor: 'rgba(217, 164, 65, 0.24)' },
  stageChipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  stageChipText: { color: '#B7C3CE', fontSize: 13, fontWeight: '700' },
  stageChipTextReached: { color: colors.white },
  stageChipTextActive: { color: colors.ink },
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
  locationGrid: { gap: 14, marginBottom: 22 },
  locationCard: { backgroundColor: colors.paper, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: colors.softLine },
  locationTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  locationCopy: { flex: 1 },
  locationTitle: { color: colors.midnight, fontSize: 20, fontWeight: '800' },
  locationSubtitle: { color: colors.teal, fontSize: 14, fontWeight: '700', marginTop: 4 },
  locationTime: { color: colors.white, backgroundColor: colors.navy, overflow: 'hidden', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, fontWeight: '800' },
  locationAddress: { color: colors.ink, fontSize: 15, lineHeight: 22, marginTop: 14, marginBottom: 10 },
  locationMeta: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  linkPanel: { backgroundColor: colors.midnight, borderRadius: 28, padding: 20, marginBottom: 22 },
  linkPanelTitle: { color: colors.white, fontSize: 22, fontWeight: '800', lineHeight: 28, marginBottom: 14 },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  linkButton: { backgroundColor: colors.white, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  linkButtonText: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  panel: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.softLine, borderRadius: 24, padding: 18, marginBottom: 20 },
  panelTitle: { color: colors.midnight, fontSize: 18, fontWeight: '800', marginBottom: 10 },
  contentMetricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  contentMetricCard: { flexGrow: 1, minWidth: 144, backgroundColor: colors.parchment, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: colors.softLine },
  contentMetricLabel: { color: colors.teal, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  contentMetricValue: { color: colors.midnight, fontSize: 20, fontWeight: '800', marginTop: 8 },
  contentMetricHint: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 6 },
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
  moduleWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  modulePill: { backgroundColor: colors.paper, borderColor: colors.softLine, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  modulePillActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  modulePillText: { color: colors.navy, fontSize: 14, fontWeight: '700' },
  modulePillTextActive: { color: colors.white },
  contentList: { gap: 14 },
  contentItem: { paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.softLine },
  contentItemFirst: { paddingTop: 0, borderTopWidth: 0 },
  assignmentTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  assignmentCopy: { flex: 1 },
  assignmentActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
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
