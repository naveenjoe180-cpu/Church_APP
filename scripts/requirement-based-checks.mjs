import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = process.cwd();

const files = {
  userApp: join(root, 'church-network-app', 'src', 'prototype', 'ChurchNetworkPrototypeApp.tsx'),
  adminApp: join(root, 'church-network-admin', 'src', 'App.tsx'),
  adminData: join(root, 'church-network-admin', 'src', 'services', 'firebaseData.ts'),
  userAccess: join(root, 'church-network-app', 'src', 'services', 'accessRequests.ts'),
  userAssignments: join(root, 'church-network-app', 'src', 'services', 'teamAssignments.ts'),
  userUpdates: join(root, 'church-network-app', 'src', 'services', 'churchUpdates.ts'),
  userNotifications: join(root, 'church-network-app', 'src', 'services', 'notifications.ts'),
  firebaseConfig: join(root, 'church-network-app', 'src', 'config', 'firebase.ts'),
  firestoreRules: join(root, 'firebase', 'firestore.rules'),
  functionsIndex: join(root, 'functions', 'src', 'index.ts'),
};

const content = Object.fromEntries(
  Object.entries(files).map(([key, filePath]) => [key, readFileSync(filePath, 'utf8')]),
);

function includesAll(fileKey, snippets) {
  return snippets.every((snippet) => content[fileKey].includes(snippet));
}

function matches(fileKey, pattern) {
  return pattern.test(content[fileKey]);
}

const tests = [
  {
    id: 'USER-REQ-001',
    area: 'User App',
    requirement: 'Guest mode title strip should use Bethel Connect branding.',
    status: includesAll('userApp', ['Bethel Connect', 'Sign Out']) ? 'PASS' : 'FAIL',
    evidence: ['ChurchNetworkPrototypeApp.tsx'],
  },
  {
    id: 'USER-REQ-002',
    area: 'User App',
    requirement: 'Access request form should require a mobile number and show a clear prompt.',
    status: includesAll('userApp', [
      'Please enter your mobile number',
      'Please enter your mobile number before sending the access request.',
    ]) ? 'PASS' : 'FAIL',
    evidence: ['ChurchNetworkPrototypeApp.tsx'],
  },
  {
    id: 'USER-REQ-003',
    area: 'User App',
    requirement: 'Access request form should clearly ask the user to select a church location.',
    status: includesAll('userApp', [
      'Please select the Church Location',
      'Please select the Church Location before sending your request.',
    ]) ? 'PASS' : 'FAIL',
    evidence: ['ChurchNetworkPrototypeApp.tsx'],
  },
  {
    id: 'USER-REQ-004',
    area: 'User App',
    requirement: 'Rejected requests should show the rejection reason to the user.',
    status: includesAll('userApp', ['Reason from admin:', 'Request Rejected']) ? 'PASS' : 'FAIL',
    evidence: ['ChurchNetworkPrototypeApp.tsx'],
  },
  {
    id: 'USER-REQ-005',
    area: 'User App',
    requirement: 'My Team Plan should exist as a dedicated tile.',
    status: includesAll('userApp', ['My Team Plan']) ? 'PASS' : 'FAIL',
    evidence: ['ChurchNetworkPrototypeApp.tsx'],
  },
  {
    id: 'USER-REQ-006',
    area: 'User App',
    requirement: 'My Team Plan should provide Current Sunday and Next Sunday selectors.',
    status: includesAll('userApp', ['Current Sunday', 'Next Sunday']) ? 'PASS' : 'FAIL',
    evidence: ['ChurchNetworkPrototypeApp.tsx'],
  },
  {
    id: 'USER-REQ-007',
    area: 'User App',
    requirement: 'My Team Plan should provide explicit team navigation controls.',
    status: includesAll('userApp', ['Choose team']) ? 'PASS' : 'FAIL',
    evidence: ['ChurchNetworkPrototypeApp.tsx'],
  },
  {
    id: 'USER-REQ-008',
    area: 'User App',
    requirement: 'My Team Plan should show a No plan yet summary before the detail is opened.',
    status: includesAll('userApp', ['No plan yet']) ? 'PASS' : 'FAIL',
    evidence: ['ChurchNetworkPrototypeApp.tsx'],
  },
  {
    id: 'USER-REQ-009',
    area: 'User App',
    requirement: 'The user app should surface clearer offline/error states for content and team plans.',
    status: includesAll('userApp', ['contentNotice', 'teamPlanNotice', 'assignmentNotice']) ? 'PASS' : 'FAIL',
    evidence: ['ChurchNetworkPrototypeApp.tsx'],
  },
  {
    id: 'USER-REQ-010',
    area: 'User App',
    requirement: 'Notification setup should not depend only on EXPO_PUBLIC_EXPO_PROJECT_ID.',
    status: includesAll('firebaseConfig', ['Constants.expoConfig?.extra?.eas?.projectId', 'Constants.easConfig?.projectId']) ? 'PASS' : 'FAIL',
    evidence: ['firebase.ts'],
  },
  {
    id: 'ADMIN-REQ-001',
    area: 'Admin App',
    requirement: 'Admin navigation should use Manage Members and Add Members and Teams labels.',
    status: includesAll('adminApp', ['Manage Members', 'Add Members and Teams']) ? 'PASS' : 'FAIL',
    evidence: ['App.tsx'],
  },
  {
    id: 'ADMIN-REQ-002',
    area: 'Admin App',
    requirement: 'Team Leader should not see Approval Queue or Manage Members in admin navigation.',
    status: matches('adminApp', /teamLeader'.*approvals'.*members/s) ? 'PASS' : 'FAIL',
    evidence: ['App.tsx'],
  },
  {
    id: 'ADMIN-REQ-003',
    area: 'Admin App',
    requirement: 'Team Leader should not be able to publish announcements or events and should see a note.',
    status: includesAll('adminApp', [
      'Only Church Admin, Pastor, and Super Admin can publish announcements and events.',
      'disabled={!canPublishUpdates}',
    ]) ? 'PASS' : 'FAIL',
    evidence: ['App.tsx'],
  },
  {
    id: 'ADMIN-REQ-004',
    area: 'Admin App',
    requirement: 'Event cancellation should require confirmation and use Cancel Event wording.',
    status: includesAll('adminApp', ['Cancel Event', 'Are you sure you want to cancel the event']) ? 'PASS' : 'FAIL',
    evidence: ['App.tsx'],
  },
  {
    id: 'ADMIN-REQ-005',
    area: 'Admin App',
    requirement: 'Sunday service order should provide Current Sunday and Next Sunday selectors.',
    status: includesAll('adminApp', ['Current Sunday', 'Next Sunday']) ? 'PASS' : 'FAIL',
    evidence: ['App.tsx'],
  },
  {
    id: 'ADMIN-REQ-006',
    area: 'Admin App',
    requirement: 'Rejecting an approval should require a rejection reason.',
    status: includesAll('adminApp', [
      'Add a rejection reason before rejecting the request.',
      'Enter a rejection reason so the member understands what needs to be corrected:',
    ]) ? 'PASS' : 'FAIL',
    evidence: ['App.tsx'],
  },
  {
    id: 'ADMIN-REQ-007',
    area: 'Admin App',
    requirement: 'Deleting a member should require an explicit confirmation dialog.',
    status: includesAll('adminApp', ['Are you sure you want to delete the member']) ? 'PASS' : 'FAIL',
    evidence: ['App.tsx'],
  },
  {
    id: 'ADMIN-REQ-008',
    area: 'Admin App',
    requirement: 'Only super admins, church admins, pastors, and team leaders should be allowed into the admin app.',
    status: includesAll('adminApp', [
      'This Google account does not have admin access.',
      'Only super admins, church admins, pastors, and team leaders can sign in to Bethel Connect Admin.',
    ]) ? 'PASS' : 'FAIL',
    evidence: ['App.tsx'],
  },
  {
    id: 'BACKEND-REQ-001',
    area: 'Backend',
    requirement: 'Rejection reason should be persisted when an access request is rejected.',
    status: includesAll('adminData', ['rejectionReason', 'nextStatus === \'rejected\' ? (rejectionReason?.trim() || null) : null']) ? 'PASS' : 'FAIL',
    evidence: ['firebaseData.ts'],
  },
  {
    id: 'BACKEND-REQ-002',
    area: 'Backend',
    requirement: 'Access requests should not allow self-elevation beyond member during signup.',
    status: includesAll('userAccess', ['requestedRoles: [\'member\']']) && includesAll('firestoreRules', [
      'request.resource.data.requestedRoles.size() == 1',
      'request.resource.data.requestedRoles[0] == "member"',
    ]) ? 'PASS' : 'FAIL',
    evidence: ['accessRequests.ts', 'firestore.rules'],
  },
  {
    id: 'BACKEND-REQ-003',
    area: 'Backend',
    requirement: 'Automated cleanup for expired content and old reminders should exist.',
    status: includesAll('functionsIndex', ['export const cleanupExpiredContent = onSchedule', 'notificationReminders', 'visibleUntilAt']) ? 'PASS' : 'FAIL',
    evidence: ['index.ts'],
  },
  {
    id: 'BACKEND-REQ-004',
    area: 'Backend',
    requirement: 'Mobile notification device registration should write Expo device tokens to Firestore.',
    status: includesAll('userNotifications', ['getExpoPushTokenAsync', 'notificationDevices', 'channel: \'expo\'']) ? 'PASS' : 'FAIL',
    evidence: ['notifications.ts'],
  },
];

const qualityChecks = [
  {
    id: 'RISK-001',
    area: 'Stability',
    requirement: 'Admin app should not silently show mock access requests or assignments on live Firestore read failures.',
    status: includesAll('adminApp', ['setAccessRequests(mockAccessRequests)', 'setAssignments(mockAssignments)']) ? 'FAIL' : 'PASS',
    evidence: ['App.tsx'],
  },
  {
    id: 'RISK-002',
    area: 'Stability',
    requirement: 'User app should avoid showing mock announcements/events when Firebase is unavailable in production mode.',
    status: includesAll('userUpdates', ['onData(mockAnnouncements', 'mockEvents']) ? 'FAIL' : 'PASS',
    evidence: ['churchUpdates.ts'],
  },
  {
    id: 'RISK-003',
    area: 'Stability',
    requirement: 'User app should avoid showing mock team plans when Firebase is unavailable in production mode.',
    status: includesAll('userAssignments', ['const fallbackAssignments = dedupeAssignments(', 'mockAssignments.filter']) ? 'FAIL' : 'PASS',
    evidence: ['teamAssignments.ts'],
  },
];

const allChecks = [...tests, ...qualityChecks];
const passCount = allChecks.filter((item) => item.status === 'PASS').length;
const failCount = allChecks.filter((item) => item.status === 'FAIL').length;
const timestamp = new Date().toISOString();

const markdown = [
  '# Requirement-Based Test Report',
  '',
  `Generated: ${timestamp}`,
  '',
  `Summary: ${passCount} passed, ${failCount} failed`,
  '',
  '## Requirement Checks',
  '',
  '| ID | Area | Status | Requirement | Evidence |',
  '| --- | --- | --- | --- | --- |',
  ...tests.map((item) => `| ${item.id} | ${item.area} | ${item.status} | ${item.requirement} | ${item.evidence.join(', ')} |`),
  '',
  '## Quality Risk Checks',
  '',
  '| ID | Area | Status | Check | Evidence |',
  '| --- | --- | --- | --- | --- |',
  ...qualityChecks.map((item) => `| ${item.id} | ${item.area} | ${item.status} | ${item.requirement} | ${item.evidence.join(', ')} |`),
  '',
].join('\n');

const report = {
  generatedAt: timestamp,
  summary: {
    total: allChecks.length,
    passed: passCount,
    failed: failCount,
  },
  requirementChecks: tests,
  qualityChecks,
};

const markdownPath = join(root, 'docs', 'test-reports', 'requirement-based-test-report.md');
const jsonPath = join(root, 'docs', 'test-reports', 'requirement-based-test-report.json');

mkdirSync(dirname(markdownPath), { recursive: true });
writeFileSync(markdownPath, markdown, 'utf8');
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(markdown);
