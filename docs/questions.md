# Questions & Ambiguities — TASK-120 HarborFresh

## 1. Delivery / Project Type
- **Question**: The prompt says "runs entirely on a single device without an internet connection." Should this be delivered as a pure frontend SPA with no backend service?
- **My Understanding**: Yes — IndexedDB is the sole database. No server, no Docker, no network calls.
- **Solution**: Deliver as `pure_frontend` (Vite + React + TypeScript). `npm run dev` is the only start command.

## 2. "Payment" for Group-Buy Orders
- **Question**: The prompt says payment is "recorded as an offline method" — does this mean there is NO payment processing, only a status field?
- **My Understanding**: Correct. Attendants manually mark `paymentMethod` (Cash / CardOnPickup / ManualMark) on an order. No payment gateway, no total charged externally.
- **Solution**: `Order.paymentMethod` is an optional field updated when status transitions to `Confirmed`.

## 3. Campaign Creation Role
- **Question**: Who can create a group-buy campaign? The prompt lists "Member" as a participant but doesn't explicitly name the creator role.
- **My Understanding**: Administrator manages campaigns (creates, cancels, confirms) while Members join them.
- **Solution**: Campaign creation is restricted to `Administrator`. Members can only join via the Checkout Drawer.

## 4. Fish Entry Media Assets — Storage Size
- **Question**: The prompt says "local media assets such as images/audio/video." How large can these be? IndexedDB has practical limits (typically 50–80% of free disk).
- **My Understanding**: No explicit size limit is stated in the prompt. We cap individual asset uploads at 50 MB per file to avoid silent failures.
- **Solution**: `MediaAsset` upload validates `file.size <= 52_428_800` (50 MB). A warning toast appears for assets > 20 MB.

## 5. Versioned Publishing — "Last 50 Versions"
- **Question**: Does "within the last 50 versions" mean rollback is only available for versions n-50 through n, or that exactly 50 revisions are stored (oldest pruned)?
- **My Understanding**: Store up to 50 revisions; when a 51st is created, delete the oldest.
- **Solution**: After each `saveRevision()`, if `revisionCount > 50`, delete the oldest by ascending `version`.

## 6. Dispatch Board — Driver Identity
- **Question**: Are "drivers" separate entities, or are they system users with a Dispatcher role?
- **My Understanding**: Dispatchers are the users who plan routes; "drivers" on a batch may or may not be system users. The prompt does not define a Driver role.
- **Solution**: `DeliveryBatch.driverId` references a `User` id. The Dispatcher role manages all batch/task assignments. If no driver-specific user exists, the Dispatcher assigns themselves.

## 7. Course Drop Deadline — Exact Rule
- **Question**: Prompt says "drop allowed until 11:59 PM the day before." Is this relative to the course's `startDate` or some other date?
- **My Understanding**: Drop deadline = the day before `startDate` at 23:59 local time.
- **Solution**: `dropDeadline` defaults to `startDate - 1 day at 23:59` in the `createCourse` service. It can be overridden by the Instructor/Administrator.

## 8. Finance — "Chart-of-Accounts Code" Format
- **Question**: The prompt requires a "required chart-of-accounts code" but does not specify the format (numeric, alphanumeric, hierarchical like 1000.10).
- **My Understanding**: Accept any non-empty alphanumeric string up to 20 characters.
- **Solution**: Validate `accountCode` as non-empty, max 20 chars, matching `/^[A-Z0-9.\-]+$/i`.

## 9. Notification Center — "Local Retry Queue" Failures
- **Question**: What constitutes a "failure" for a local in-app notification? There is no network call.
- **My Understanding**: A failure is a JavaScript error during template rendering (e.g., missing template key, malformed templateData).
- **Solution**: Wrap `deliver()` in try/catch; any thrown error counts as a delivery failure and increments `retries`.

## 10. Export/Import — Encryption Password Source
- **Question**: Should the export password be the user's login password, or a separately chosen password?
- **My Understanding**: A separately entered password is safer (avoids leaking login credentials). The prompt says "encrypted JSON file" but doesn't specify the key source.
- **Solution**: The Export modal prompts for a dedicated export password (separate from login). The password is not stored anywhere — it is derived into an AES-GCM key at export/import time only.
