# Requirement-Based Test Report

Generated: 2026-04-06T19:00:59.822Z

Summary: 25 passed, 0 failed

## Requirement Checks

| ID | Area | Status | Requirement | Evidence |
| --- | --- | --- | --- | --- |
| USER-REQ-001 | User App | PASS | Guest mode title strip should use Bethel Connect branding. | ChurchNetworkPrototypeApp.tsx |
| USER-REQ-002 | User App | PASS | Access request form should require a mobile number and show a clear prompt. | ChurchNetworkPrototypeApp.tsx |
| USER-REQ-003 | User App | PASS | Access request form should clearly ask the user to select a church location. | ChurchNetworkPrototypeApp.tsx |
| USER-REQ-004 | User App | PASS | Rejected requests should show the rejection reason to the user. | ChurchNetworkPrototypeApp.tsx |
| USER-REQ-005 | User App | PASS | My Team Plan should exist as a dedicated tile. | ChurchNetworkPrototypeApp.tsx |
| USER-REQ-006 | User App | PASS | My Team Plan should provide Current Sunday and Next Sunday selectors. | ChurchNetworkPrototypeApp.tsx |
| USER-REQ-007 | User App | PASS | My Team Plan should provide explicit team navigation controls. | ChurchNetworkPrototypeApp.tsx |
| USER-REQ-008 | User App | PASS | My Team Plan should show a No plan yet summary before the detail is opened. | ChurchNetworkPrototypeApp.tsx |
| USER-REQ-009 | User App | PASS | The user app should surface clearer offline/error states for content and team plans. | ChurchNetworkPrototypeApp.tsx |
| USER-REQ-010 | User App | PASS | Notification setup should not depend only on EXPO_PUBLIC_EXPO_PROJECT_ID. | firebase.ts |
| ADMIN-REQ-001 | Admin App | PASS | Admin navigation should use Manage Members and Add Members and Teams labels. | App.tsx |
| ADMIN-REQ-002 | Admin App | PASS | Team Leader should not see Approval Queue or Manage Members in admin navigation. | App.tsx |
| ADMIN-REQ-003 | Admin App | PASS | Team Leader should not be able to publish announcements or events and should see a note. | App.tsx |
| ADMIN-REQ-004 | Admin App | PASS | Event cancellation should require confirmation and use Cancel Event wording. | App.tsx |
| ADMIN-REQ-005 | Admin App | PASS | Sunday service order should provide Current Sunday and Next Sunday selectors. | App.tsx |
| ADMIN-REQ-006 | Admin App | PASS | Rejecting an approval should require a rejection reason. | App.tsx |
| ADMIN-REQ-007 | Admin App | PASS | Deleting a member should require an explicit confirmation dialog. | App.tsx |
| ADMIN-REQ-008 | Admin App | PASS | Only super admins, church admins, pastors, and team leaders should be allowed into the admin app. | App.tsx |
| BACKEND-REQ-001 | Backend | PASS | Rejection reason should be persisted when an access request is rejected. | firebaseData.ts |
| BACKEND-REQ-002 | Backend | PASS | Access requests should not allow self-elevation beyond member during signup. | accessRequests.ts, firestore.rules |
| BACKEND-REQ-003 | Backend | PASS | Automated cleanup for expired content and old reminders should exist. | index.ts |
| BACKEND-REQ-004 | Backend | PASS | Mobile notification device registration should write Expo device tokens to Firestore. | notifications.ts |

## Quality Risk Checks

| ID | Area | Status | Check | Evidence |
| --- | --- | --- | --- | --- |
| RISK-001 | Stability | PASS | Admin app should not silently show mock access requests or assignments on live Firestore read failures. | App.tsx |
| RISK-002 | Stability | PASS | User app should avoid showing mock announcements/events when Firebase is unavailable in production mode. | churchUpdates.ts |
| RISK-003 | Stability | PASS | User app should avoid showing mock team plans when Firebase is unavailable in production mode. | teamAssignments.ts |
