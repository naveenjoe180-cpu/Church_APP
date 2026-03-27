# Firebase Architecture

## Recommended project shape

Start with one Firebase project for the prototype so authentication, Firestore, Cloud Functions, Cloud Messaging, and Hosting stay simple to manage.

Recommended environments after prototype:

- `church-network-dev`
- `church-network-staging`
- `church-network-prod`

## Frontend applications

### Member app

- Project: `church-network-app`
- Targets: Android, iOS, web
- Stack: Expo + React Native + TypeScript
- Hosting target for web: Firebase Hosting site for member users

### Admin dashboard

- Project: `church-network-admin`
- Target: web only
- Stack: React + Vite + TypeScript
- Hosting target: separate Firebase Hosting site for admins and team leaders

## Authentication model

Enable these providers for prototype 1:

- Google
- Email and password

Planned for phase 2:

- Phone OTP

## Approval flow

1. User signs in with Google or email/password.
2. App creates a `users/{uid}` record with `approvalStatus = "pending"`.
3. App creates an `accessRequests/{requestId}` record.
4. Church admin or network super admin reviews the request in the admin dashboard.
5. Admin approves the user into the selected church first.
6. Church admin or team leader assigns team memberships later when needed.
7. Cloud Functions updates the user profile and any high-level auth claims.
8. User can now access private content for the assigned church and later receives team access when assigned.

## Role strategy

Use Firestore as the source of truth for detailed role and team access.

Use Firebase custom claims only for high-level platform capabilities:

- `networkSuperAdmin`
- `hasAdminAccess`

Keep detailed scope in Firestore:

- church memberships
- team memberships
- pastor access
- leader access

Visibility rules:

- only `networkSuperAdmin` can query across all churches and users
- church admins are restricted to their own church
- members see only their own church content and assigned teams

## Firestore collections

- `churches`
- `teams`
- `users`
- `userPrivateProfiles`
- `accessRequests`
- `announcements`
- `events`
- `scheduleAssignments`
- `prayerRequests`
- `documents`
- `auditLogs`

## Church profile fields

Each church document should include:

- display city for the app label such as `Berlin`
- actual service city when different such as `Potsdam`
- full address
- service time
- Google Maps label or URL
- church-specific Instagram URL
- optional church-specific Facebook URL
- network-level YouTube URL when shared across all churches

## Cloud Functions to add next

- `createAccessRequest`
- `approveAccessRequest`
- `rejectAccessRequest`
- `assignTeamRoles`
- `publishAnnouncementNotification`
- `sendVolunteerAssignmentNotification`
- `moderatePrayerRequest`

## Hosting split

Use two Hosting targets in the same Firebase project during the prototype:

- member site for the Expo web build
- admin site for the Vite dashboard

This keeps auth shared while separating user and admin entry points.

## Google Shared Drive structure

Recommended path layout:

- `Shared Drive / Church Network / Shared`
- `Shared Drive / Church Network / {Church Name} / Announcements`
- `Shared Drive / Church Network / {Church Name} / Worship Team`
- `Shared Drive / Church Network / {Church Name} / Speakers Team`
- `Shared Drive / Church Network / {Church Name} / Food Team`
- `Shared Drive / Church Network / {Church Name} / Sunday School Team`

Store metadata in Firestore and the actual file in Google Drive.

## Why this structure

- One Firebase project is fastest for the prototype.
- Separate web admin hosting gives a clearer operational boundary.
- Firestore handles permissions and filtering far better than Google Drive alone.
- Shared Drive remains the file repository without becoming the main database.
