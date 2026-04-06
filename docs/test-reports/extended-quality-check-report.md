# Extended Quality Check Report

Generated: 2026-04-06T19:01:45.119Z

Summary: 20 passed, 0 failed

| ID | Area | Status | Requirement | Method | Evidence | Details |
| --- | --- | --- | --- | --- | --- | --- |
| RULES-001 | Firestore Rules | PASS | Self-signup must be restricted to a pending member-only role payload. | Static contract check against the access-request create rule. | firebase/firestore.rules |  |
| RULES-002 | Firestore Rules | PASS | Self-updates for unapproved users must stay limited to safe profile fields. | Static contract check against the safe self-update rule. | firebase/firestore.rules |  |
| RULES-003 | Firestore Rules | PASS | Only the network super admin should be able to write church records. | Static contract check against the churches collection rule. | firebase/firestore.rules |  |
| RULES-004 | Firestore Rules | PASS | Only the network super admin should be able to create or change network-scope events. | Static contract check against event create/update/delete rules. | firebase/firestore.rules |  |
| RULES-005 | Firestore Rules | PASS | Team leaders and church managers should be able to maintain schedule assignments while members keep read-only team visibility. | Static contract check against assignment read/write/update/delete rules. | firebase/firestore.rules |  |
| RULES-006 | Firestore Rules | PASS | Notification device records must stay self-owned and church-scoped. | Static contract check against notification-device rules. | firebase/firestore.rules |  |
| RULES-007 | Firestore Rules | PASS | Team leaders should have church-scoped visibility into user records for planning. | Static contract check against the users read rule. | firebase/firestore.rules |  |
| RULES-008 | Firestore Rules | PASS | Access requests should be readable by the requester, church managers of the requested church, and super admins. | Static contract check against access-request read/update rules. | firebase/firestore.rules |  |
| CFG-001 | Configuration | PASS | The user app should gate Firebase usage behind explicit configuration checks. | Static configuration integrity check. | church-network-app/src/config/firebase.ts |  |
| CFG-002 | Configuration | PASS | The user app should resolve the Expo project id from either env vars or Expo/EAS runtime config. | Static notification-config integrity check. | church-network-app/src/config/firebase.ts |  |
| CFG-003 | Configuration | PASS | The Android Google services file should be wired through the EAS file secret fallback. | Static app-config integrity check. | church-network-app/app.config.js |  |
| CFG-004 | Configuration | PASS | The admin app should gate Firebase usage behind explicit configuration checks. | Static configuration integrity check. | church-network-admin/src/config/firebase.ts |  |
| CFG-005 | Configuration | PASS | The admin web build should support the /admin/ hosting base path. | Static hosting-config integrity check. | church-network-admin/vite.config.ts |  |
| BLD-001 | Build Smoke | PASS | The user web export should generate a deployable index and JavaScript bundle. | Artifact presence check after Expo web export. | church-network-app/dist/index.html, church-network-app/dist/_expo/static/js/web | Found 3 user-app JavaScript bundle(s). |
| BLD-002 | Build Smoke | PASS | The admin production build should generate deployable HTML, JS, and CSS assets. | Artifact presence check after Vite production build. | church-network-admin/dist/index.html, church-network-admin/dist/assets | Found 1 admin JavaScript bundle(s) and 1 CSS bundle(s). |
| BLD-003 | Build Smoke | PASS | The admin build should emit /admin/ asset paths for hosted deployment. | Deployment-shape check against the built admin index.html. | church-network-admin/dist/index.html |  |
| BLD-004 | Build Smoke | PASS | The built user and admin HTML shells should both include a root mount and boot script references. | HTML shell smoke check against both built index files. | church-network-app/dist/index.html, church-network-admin/dist/index.html |  |
| PERF-001 | Resource / Bundle | PASS | The user web export total JavaScript should stay within the local 2.0 MB review budget. | Measured the total size of emitted user-app JavaScript bundles. | church-network-app/dist/_expo/static/js/web | Measured total JS size: 1.40 MB. |
| PERF-002 | Resource / Bundle | PASS | The largest admin JavaScript chunk should stay within the local 1.0 MB review budget. | Measured the size of the largest emitted admin-app JavaScript bundle. | church-network-admin/dist/assets | Measured largest admin JS chunk: 673.5 KB. |
| PERF-003 | Resource / Bundle | PASS | The admin CSS payload should stay within the local 150 KB review budget. | Measured the total size of emitted admin CSS bundles. | church-network-admin/dist/assets | Measured total admin CSS size: 42.0 KB. |
