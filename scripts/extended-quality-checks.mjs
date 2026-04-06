import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = process.cwd();

const files = {
  firestoreRules: join(root, 'firebase', 'firestore.rules'),
  userFirebaseConfig: join(root, 'church-network-app', 'src', 'config', 'firebase.ts'),
  adminFirebaseConfig: join(root, 'church-network-admin', 'src', 'config', 'firebase.ts'),
  appConfig: join(root, 'church-network-app', 'app.config.js'),
  adminViteConfig: join(root, 'church-network-admin', 'vite.config.ts'),
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

function collectFiles(dirPath, predicate, acc = []) {
  if (!statSafe(dirPath)?.isDirectory()) {
    return acc;
  }

  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const nextPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectFiles(nextPath, predicate, acc);
      continue;
    }
    if (predicate(nextPath)) {
      acc.push(nextPath);
    }
  }
  return acc;
}

function statSafe(filePath) {
  try {
    return statSync(filePath);
  } catch {
    return null;
  }
}

function sizeOf(filePath) {
  return statSafe(filePath)?.size ?? 0;
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

const userDist = join(root, 'church-network-app', 'dist');
const adminDist = join(root, 'church-network-admin', 'dist');
const userBuiltIndexPath = join(userDist, 'index.html');
const adminBuiltIndexPath = join(adminDist, 'index.html');

const userJsAssets = collectFiles(userDist, (filePath) => filePath.endsWith('.js'));
const adminJsAssets = collectFiles(adminDist, (filePath) => filePath.endsWith('.js'));
const adminCssAssets = collectFiles(adminDist, (filePath) => filePath.endsWith('.css'));
const builtIndexContent = {
  user: statSafe(userBuiltIndexPath) ? readFileSync(userBuiltIndexPath, 'utf8') : '',
  admin: statSafe(adminBuiltIndexPath) ? readFileSync(adminBuiltIndexPath, 'utf8') : '',
};

const totalUserJs = userJsAssets.reduce((sum, filePath) => sum + sizeOf(filePath), 0);
const largestAdminJs = adminJsAssets.reduce((max, filePath) => Math.max(max, sizeOf(filePath)), 0);
const totalAdminCss = adminCssAssets.reduce((sum, filePath) => sum + sizeOf(filePath), 0);

const checks = [
  {
    id: 'RULES-001',
    area: 'Firestore Rules',
    requirement: 'Self-signup must be restricted to a pending member-only role payload.',
    status: includesAll('firestoreRules', [
      'request.resource.data.requestedRoles.size() == 1',
      'request.resource.data.requestedRoles[0] == "member"',
      'request.resource.data.status == "pending"',
    ]) ? 'PASS' : 'FAIL',
    method: 'Static contract check against the access-request create rule.',
    evidence: ['firebase/firestore.rules'],
  },
  {
    id: 'RULES-002',
    area: 'Firestore Rules',
    requirement: 'Self-updates for unapproved users must stay limited to safe profile fields.',
    status: includesAll('firestoreRules', [
      'request.resource.data.diff(resource.data).affectedKeys().hasOnly([',
      '"displayName"',
      '"photoUrl"',
      '"phoneNumber"',
      '"primaryChurchId"',
      '"pendingChurchId"',
      '"updatedAt"',
    ]) ? 'PASS' : 'FAIL',
    method: 'Static contract check against the safe self-update rule.',
    evidence: ['firebase/firestore.rules'],
  },
  {
    id: 'RULES-003',
    area: 'Firestore Rules',
    requirement: 'Only the network super admin should be able to write church records.',
    status: includesAll('firestoreRules', [
      'match /churches/{churchId}',
      'allow write: if isNetworkSuperAdmin();',
    ]) ? 'PASS' : 'FAIL',
    method: 'Static contract check against the churches collection rule.',
    evidence: ['firebase/firestore.rules'],
  },
  {
    id: 'RULES-004',
    area: 'Firestore Rules',
    requirement: 'Only the network super admin should be able to create or change network-scope events.',
    status: includesAll('firestoreRules', [
      'match /events/{eventId}',
      'request.resource.data.scopeType != "network"',
      'resource.data.scopeType != "network"',
    ]) ? 'PASS' : 'FAIL',
    method: 'Static contract check against event create/update/delete rules.',
    evidence: ['firebase/firestore.rules'],
  },
  {
    id: 'RULES-005',
    area: 'Firestore Rules',
    requirement: 'Team leaders and church managers should be able to maintain schedule assignments while members keep read-only team visibility.',
    status: includesAll('firestoreRules', [
      'match /scheduleAssignments/{assignmentId}',
      'isTeamLeader(request.resource.data.churchId, request.resource.data.teamId)',
      'resource.data.assignedUserId == request.auth.uid',
      '(resource.data.teamId is string && belongsToTeam(resource.data.teamId))',
    ]) ? 'PASS' : 'FAIL',
    method: 'Static contract check against assignment read/write/update/delete rules.',
    evidence: ['firebase/firestore.rules'],
  },
  {
    id: 'RULES-006',
    area: 'Firestore Rules',
    requirement: 'Notification device records must stay self-owned and church-scoped.',
    status: includesAll('firestoreRules', [
      'match /notificationDevices/{deviceId}',
      'request.resource.data.userId == request.auth.uid',
      'request.resource.data.channel == "expo"',
      'hasValidNotificationChurchIds(request.resource.data.churchIds)',
    ]) ? 'PASS' : 'FAIL',
    method: 'Static contract check against notification-device rules.',
    evidence: ['firebase/firestore.rules'],
  },
  {
    id: 'RULES-007',
    area: 'Firestore Rules',
    requirement: 'Team leaders should have church-scoped visibility into user records for planning.',
    status: includesAll('firestoreRules', [
      'match /users/{uid}',
      '(hasRole("teamLeader") && belongsToChurch(resource.data.primaryChurchId))',
    ]) ? 'PASS' : 'FAIL',
    method: 'Static contract check against the users read rule.',
    evidence: ['firebase/firestore.rules'],
  },
  {
    id: 'RULES-008',
    area: 'Firestore Rules',
    requirement: 'Access requests should be readable by the requester, church managers of the requested church, and super admins.',
    status: includesAll('firestoreRules', [
      'match /accessRequests/{requestId}',
      'resource.data.uid == request.auth.uid',
      'isNetworkSuperAdmin()',
      'isChurchManager(resource.data.requestedChurchId)',
    ]) ? 'PASS' : 'FAIL',
    method: 'Static contract check against access-request read/update rules.',
    evidence: ['firebase/firestore.rules'],
  },
  {
    id: 'CFG-001',
    area: 'Configuration',
    requirement: 'The user app should gate Firebase usage behind explicit configuration checks.',
    status: includesAll('userFirebaseConfig', [
      'firebaseConfigStatus',
      'isFirebaseConfigured',
      'if (isFirebaseConfigured)',
    ]) ? 'PASS' : 'FAIL',
    method: 'Static configuration integrity check.',
    evidence: ['church-network-app/src/config/firebase.ts'],
  },
  {
    id: 'CFG-002',
    area: 'Configuration',
    requirement: 'The user app should resolve the Expo project id from either env vars or Expo/EAS runtime config.',
    status: includesAll('userFirebaseConfig', [
      'process.env.EXPO_PUBLIC_EXPO_PROJECT_ID',
      'Constants.expoConfig?.extra?.eas?.projectId',
      'Constants.easConfig?.projectId',
    ]) ? 'PASS' : 'FAIL',
    method: 'Static notification-config integrity check.',
    evidence: ['church-network-app/src/config/firebase.ts'],
  },
  {
    id: 'CFG-003',
    area: 'Configuration',
    requirement: 'The Android Google services file should be wired through the EAS file secret fallback.',
    status: includesAll('appConfig', [
      'process.env.GOOGLE_SERVICES_JSON',
      'androidConfig.googleServicesFile',
    ]) ? 'PASS' : 'FAIL',
    method: 'Static app-config integrity check.',
    evidence: ['church-network-app/app.config.js'],
  },
  {
    id: 'CFG-004',
    area: 'Configuration',
    requirement: 'The admin app should gate Firebase usage behind explicit configuration checks.',
    status: includesAll('adminFirebaseConfig', [
      'firebaseConfigStatus',
      'isFirebaseConfigured',
      'if (isFirebaseConfigured)',
    ]) ? 'PASS' : 'FAIL',
    method: 'Static configuration integrity check.',
    evidence: ['church-network-admin/src/config/firebase.ts'],
  },
  {
    id: 'CFG-005',
    area: 'Configuration',
    requirement: 'The admin web build should support the /admin/ hosting base path.',
    status: includesAll('adminViteConfig', [
      "base: process.env.VITE_BASE_PATH || '/'",
    ]) ? 'PASS' : 'FAIL',
    method: 'Static hosting-config integrity check.',
    evidence: ['church-network-admin/vite.config.ts'],
  },
  {
    id: 'BLD-001',
    area: 'Build Smoke',
    requirement: 'The user web export should generate a deployable index and JavaScript bundle.',
    status: statSafe(join(userDist, 'index.html')) && userJsAssets.length > 0 ? 'PASS' : 'FAIL',
    method: 'Artifact presence check after Expo web export.',
    evidence: ['church-network-app/dist/index.html', 'church-network-app/dist/_expo/static/js/web'],
    details: `Found ${userJsAssets.length} user-app JavaScript bundle(s).`,
  },
  {
    id: 'BLD-002',
    area: 'Build Smoke',
    requirement: 'The admin production build should generate deployable HTML, JS, and CSS assets.',
    status: statSafe(join(adminDist, 'index.html')) && adminJsAssets.length > 0 && adminCssAssets.length > 0 ? 'PASS' : 'FAIL',
    method: 'Artifact presence check after Vite production build.',
    evidence: ['church-network-admin/dist/index.html', 'church-network-admin/dist/assets'],
    details: `Found ${adminJsAssets.length} admin JavaScript bundle(s) and ${adminCssAssets.length} CSS bundle(s).`,
  },
  {
    id: 'BLD-003',
    area: 'Build Smoke',
    requirement: 'The admin build should emit /admin/ asset paths for hosted deployment.',
    status: builtIndexContent.admin.includes('/admin/assets/') && builtIndexContent.admin.includes('/admin/favicon.png') ? 'PASS' : 'FAIL',
    method: 'Deployment-shape check against the built admin index.html.',
    evidence: ['church-network-admin/dist/index.html'],
  },
  {
    id: 'BLD-004',
    area: 'Build Smoke',
    requirement: 'The built user and admin HTML shells should both include a root mount and boot script references.',
    status:
      builtIndexContent.user.includes('<div id="root"></div>')
      && builtIndexContent.user.includes('<script')
      && builtIndexContent.admin.includes('<div id="root"></div>')
      && builtIndexContent.admin.includes('<script')
        ? 'PASS'
        : 'FAIL',
    method: 'HTML shell smoke check against both built index files.',
    evidence: ['church-network-app/dist/index.html', 'church-network-admin/dist/index.html'],
  },
  {
    id: 'PERF-001',
    area: 'Resource / Bundle',
    requirement: 'The user web export total JavaScript should stay within the local 2.0 MB review budget.',
    status: totalUserJs > 0 && totalUserJs <= 2 * 1024 * 1024 ? 'PASS' : 'FAIL',
    method: 'Measured the total size of emitted user-app JavaScript bundles.',
    evidence: ['church-network-app/dist/_expo/static/js/web'],
    details: `Measured total JS size: ${formatBytes(totalUserJs)}.`,
  },
  {
    id: 'PERF-002',
    area: 'Resource / Bundle',
    requirement: 'The largest admin JavaScript chunk should stay within the local 1.0 MB review budget.',
    status: largestAdminJs > 0 && largestAdminJs <= 1024 * 1024 ? 'PASS' : 'FAIL',
    method: 'Measured the size of the largest emitted admin-app JavaScript bundle.',
    evidence: ['church-network-admin/dist/assets'],
    details: `Measured largest admin JS chunk: ${formatBytes(largestAdminJs)}.`,
  },
  {
    id: 'PERF-003',
    area: 'Resource / Bundle',
    requirement: 'The admin CSS payload should stay within the local 150 KB review budget.',
    status: totalAdminCss > 0 && totalAdminCss <= 150 * 1024 ? 'PASS' : 'FAIL',
    method: 'Measured the total size of emitted admin CSS bundles.',
    evidence: ['church-network-admin/dist/assets'],
    details: `Measured total admin CSS size: ${formatBytes(totalAdminCss)}.`,
  },
];

const passCount = checks.filter((check) => check.status === 'PASS').length;
const failCount = checks.filter((check) => check.status === 'FAIL').length;
const generatedAt = new Date().toISOString();

const markdown = [
  '# Extended Quality Check Report',
  '',
  `Generated: ${generatedAt}`,
  '',
  `Summary: ${passCount} passed, ${failCount} failed`,
  '',
  '| ID | Area | Status | Requirement | Method | Evidence | Details |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...checks.map((check) => `| ${check.id} | ${check.area} | ${check.status} | ${check.requirement} | ${check.method} | ${check.evidence.join(', ')} | ${check.details ?? ''} |`),
  '',
].join('\n');

const report = {
  generatedAt,
  summary: {
    total: checks.length,
    passed: passCount,
    failed: failCount,
  },
  checks,
};

const markdownPath = join(root, 'docs', 'test-reports', 'extended-quality-check-report.md');
const jsonPath = join(root, 'docs', 'test-reports', 'extended-quality-check-report.json');

mkdirSync(dirname(markdownPath), { recursive: true });
writeFileSync(markdownPath, markdown, 'utf8');
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(markdown);
