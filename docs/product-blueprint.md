# Product Blueprint

## Vision

Build one church network platform for Android, iOS, and web that supports public information, member onboarding, approvals, announcements, events, ministry coordination, and role-based access across multiple church locations.

## Primary user groups

- Guest
- Member
- Volunteer
- Team Leader
- Pastor
- Church Admin
- Network Super Admin

Users can have multiple roles at the same time.

## MVP scope

### Public guest mode

- Church locations
- Service times
- Contact details
- Weekly meeting links
- YouTube channel link
- General church information

### Private member features

- Announcements
- Event calendar
- Ministry updates
- Team schedules
- Volunteer rota
- Member directory
- Document sharing from Google Drive
- Push notifications
- Anonymous prayer request wall

### Admin and leader features

- Review signup requests
- Approve or reject access
- Assign church and roles at approval time
- Add team memberships later from the church admin or team leader side
- Publish announcements
- Create events
- Upload or attach Google Drive resources
- Manage volunteer schedules
- Moderate prayer wall submissions

## Approval and access flow

1. User opens the app in guest mode.
2. User signs up with Google or email/password.
3. User creates a profile and selects their church location in the network.
4. Access request is created with `pending` status.
5. Church admin or network admin reviews the request.
6. Admin adds the user into the selected church space.
7. Team memberships are assigned later by the church admin or team leader.
8. User receives approved church access.
9. Phase 2 adds OTP verification before private access is fully activated.

## Role model

### Network Super Admin

- Full access across all churches
- Can view all churches and all members
- Can manage church admins
- Can manage network-wide content and configuration

### Church Admin

- Full access within one church location
- Approves members for that church
- Assigns roles and teams for that church only

### Pastor

- Can view expanded member details
- Can manage church-facing content depending on assigned permissions

### Team Leader

- Can manage updates, schedules, and volunteer assignments for assigned teams

### Volunteer

- Can receive assignments
- Can accept or decline scheduled service requests

### Member

- Can access approved private church content

### Guest

- Can access only public information

## Supported teams in prototype 1

Each church manages its own teams independently. The prototype starts with these common team types:

- Worship Team
- Speakers Team
- Food Team
- Sunday School Team

## Privacy rules

- Member directory shows only name and profile photo to general members.
- Additional member details are visible only to pastors and admins.
- Only network super admins can view all churches and all members across the network.
- Church admins are restricted to their own church and members.
- Prayer requests are anonymous to the wider wall and require moderation before publication.
- The user who submits a prayer request should see a confirmation that it was received and will appear after review.

## Technical approach

- Use Expo and React Native for Android, iOS, and web from one codebase.
- Use Firebase Authentication for login and approval-linked access.
- Use Firestore for structured data and permissions-aware reads.
- Use Cloud Functions for approval workflows, role sync, notifications, and moderation logic.
- Use Firebase Cloud Messaging for push notifications.
- Use Google Shared Drive for files and documents.
- Use Firebase Hosting for the web app.

## Prototype success criteria for 2 weeks

- Public guest home works on mobile and web
- Signup request flow is designed
- Admin approval model is defined
- Role and church scoped data model is ready
- Core content modules are outlined in UI
- Firebase integration plan is ready for implementation
