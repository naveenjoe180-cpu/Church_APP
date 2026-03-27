# Firebase Setup Notes

## Required environment variables

Create a local `.env` file inside `church-network-app` and add:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
```

## Services to enable

- Authentication
- Firestore Database
- Cloud Functions
- Cloud Messaging
- Hosting

## Authentication setup for prototype 1

- Enable Google provider
- Enable email/password provider
- Keep phone OTP for phase 2
- Require admin approval before private content is unlocked

## Firestore collections to create first

- `churches`
- `users`
- `accessRequests`
- `teams`
- `announcements`
- `events`
- `documents`
- `prayerRequests`

## Backend logic to implement next

- Create access request after signup
- Admin approves request and assigns roles
- Role-aware content visibility
- Prayer request moderation
- Volunteer schedule acceptance

## Current status

The app already reads `EXPO_PUBLIC_FIREBASE_*` placeholders from code, but it is not connected to a real Firebase project yet.
