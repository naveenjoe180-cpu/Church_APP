# Data Model Draft

## Core entities

### `churches`

- `id`
- `name`
- `displayCity`
- `serviceCity`
- `address`
- `serviceTimes`
- `contactEmail`
- `contactPhone`
- `googleMapsLabel`
- `googleMapsUrl`
- `instagramUrl`
- `facebookUrl`
- `youtubeUrl`
- `weeklyMeetingUrl`
- `countryCode`
- `isActive`

### `users`

- `uid`
- `email`
- `displayName`
- `photoUrl`
- `phoneNumber`
- `churchIds`
- `primaryChurchId`
- `roleKeys`
- `teamIds`
- `approvalStatus`
- `otpPhase2Enabled`
- `profileVisibility`
- `createdAt`
- `updatedAt`

### `accessRequests`

- `id`
- `uid`
- `requestedChurchId`
- `requestedRoles`
- `notes`
- `status`
- `reviewedBy`
- `reviewedAt`
- `createdAt`

### `teams`

- `id`
- `churchId`
- `name`
- `type`
- `supportsRoleAssignments`
- `isActive`

### `teamMemberships`

- `id`
- `uid`
- `churchId`
- `teamId`
- `role`
- `status`

### `announcements`

- `id`
- `scopeType`
- `scopeChurchId`
- `scopeTeamId`
- `title`
- `body`
- `audienceRoles`
- `isPublic`
- `publishedBy`
- `publishedAt`

### `events`

- `id`
- `churchId`
- `teamId`
- `title`
- `description`
- `startAt`
- `endAt`
- `location`
- `isPublic`
- `createdBy`

### `scheduleAssignments`

- `id`
- `churchId`
- `teamId`
- `eventId`
- `serviceDate`
- `roleName`
- `assignedUserId`
- `assignedBy`
- `inviteStatus`
- `respondedAt`

### `prayerRequests`

- `id`
- `churchId`
- `submittedByUid`
- `content`
- `isAnonymous`
- `status`
- `moderatedBy`
- `moderatedAt`
- `createdAt`

### `documents`

- `id`
- `churchId`
- `teamId`
- `title`
- `caption`
- `driveUrl`
- `driveFileId`
- `mimeType`
- `visibility`
- `uploadedBy`
- `createdAt`

### `notifications`

- `id`
- `title`
- `body`
- `scopeType`
- `scopeChurchId`
- `scopeTeamId`
- `targetRoles`
- `sentBy`
- `sentAt`

## Permission strategy

- Firebase Authentication handles identity.
- Firestore stores profile, role, church, and team memberships.
- Custom claims can store high-level privileges like `networkSuperAdmin`.
- Firestore rules should enforce church- and team-scoped reads and writes.
- Sensitive profile fields should be split from member-visible profile fields.

## Suggested structure for private profile fields

### `userPrivateProfiles`

- `uid`
- `address`
- `birthDate`
- `emergencyContact`
- `notes`

Only pastors and admins should read this collection.
