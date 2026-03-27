# Church Network Prototype

This repository contains the first prototype scaffold for a church network platform with a member app and a separate web admin dashboard.

## What is included

- A member-facing Expo app in `church-network-app`
- A separate web admin dashboard in `church-network-admin`
- Firebase rules and index drafts in `firebase`
- Product and backend planning documents in `docs`

## Prototype goals

The first prototype focuses on:

- Public guest-mode access
- Role-aware access design
- Multi-church network structure
- Admin approval workflow
- Team scheduling and church updates
- Anonymous prayer request moderation

## Recommended stack

- Frontend: Expo + React Native + TypeScript
- Backend: Firebase Authentication, Firestore, Cloud Functions, Cloud Messaging
- File repository: Google Shared Drive
- Web hosting: Firebase Hosting

## Run the member app

From `church-network-app`:

```powershell
corepack yarn install
npx expo start
```

For web:

```powershell
npx expo start --web --port 8082
```

## Run the admin dashboard

From `church-network-admin`:

```powershell
corepack yarn install
corepack yarn dev
```

## Documents

- `docs/product-blueprint.md`
- `docs/data-model.md`
- `docs/firebase-setup.md`
- `docs/firebase-architecture.md`
- `docs/roadmap.md`

## Next implementation steps

1. Connect both frontends to one real Firebase project.
2. Build live signup, profile, and access-request persistence.
3. Add admin dashboard approval actions backed by Firestore.
4. Add role-aware queries, rules, and notifications.
5. Add Google Shared Drive document metadata and uploads.

## Current prototype flow

The app currently includes:

- Guest-mode public information
- Sign-in method selection
- Profile and church selection form
- Pending approval state
- Approved member preview

The admin dashboard currently includes:

- Approval queue
- Church and team overview
- Prayer moderation queue
- Role matrix
- Firebase environment readiness panel
