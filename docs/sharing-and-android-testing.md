# Sharing And Android Testing

## Live Web Testing

The current Firebase Hosting deployment is live at:

- User app: `https://bethelconnect-user.web.app/`
- Admin app: `https://bethelconnect-user.web.app/admin`

These URLs are the easiest way to share the project for browser-based testing.

## Rebuild And Redeploy Web Hosting

From the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\prepare-shareable-build.ps1
npx.cmd firebase-tools deploy --only hosting
```

This creates:

- `hosting/` for the user app
- `hosting/admin/` for the admin app

## Android APK Testing

The Expo app is configured for Android builds with:

- package id: `org.bethelpentecostal.bethelconnect`
- EAS config: `eas.json`

To create a tester APK:

1. Sign in to Expo/EAS:

```powershell
cd .\church-network-app
npx.cmd eas-cli login
```

2. Start the internal APK build:

```powershell
npx.cmd eas-cli build -p android --profile preview
```

3. When the build finishes, download the APK from the Expo build URL and share it with testers.

## Notes

- The user app is suitable for Android testing.
- The admin app is currently best shared as a hosted web dashboard rather than as a phone app.
- If Expo login is not active on the machine, APK builds cannot start until `eas-cli login` is completed.
