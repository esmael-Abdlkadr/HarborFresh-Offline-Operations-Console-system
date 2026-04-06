# HarborFresh Offline Operations Console

HarborFresh is a fully offline single-page operations console for a seafood co-op. The app runs entirely in the browser with no backend or network API calls, persists operational data in IndexedDB via Dexie, and uses local-only auth and crypto primitives for secure data handling.

## Tech Stack

| Library | Version | Purpose |
|---|---:|---|
| React | 18.3.1 | SPA UI runtime |
| TypeScript | 5.9.x | Static typing |
| Vite | 5.4.x | Dev server + build |
| React Router | 6.30.x | Client-side routing + guards |
| Dexie | 3.2.x | IndexedDB service layer |
| dnd-kit | 6.x / 10.x | Dispatch board drag-and-drop |
| Vitest | 3.2.x | Unit/component test runner |
| Testing Library | 16.x | React component tests |
| Playwright | 1.59.x | E2E smoke tests |

## Start the App (Local)

```bash
npm install
npm run dev
```

Open **http://localhost:5173** (or the port Vite reports).

## Start the App (Docker)

```bash
docker compose up --build
```

Open **http://localhost:8120**.

No `npm install` or local Node setup required — Docker handles everything.

## First-Run Bootstrap

On the very first launch (empty IndexedDB), HarborFresh creates a single **Administrator** account with a randomly generated one-time password.

1. Open the app — it redirects you to `/login`.
2. The login page detects the first-run state and **displays the one-time bootstrap password** in a highlighted banner at the top. Use username `admin` and that password to sign in.
3. You are taken to the **Set Your Admin Password** page, which also shows the bootstrap password for reference. Enter and confirm a new permanent password (min 12 characters).
4. After saving, you are redirected to the dashboard and can create additional users from `/admin`.

The one-time password is stored only in `sessionStorage` during the first session and is cleared after the password change. It is never written to localStorage or IndexedDB.

## Run All Tests (Docker) — CI / clean-room verification

```bash
bash run_tests.sh
```

Use this path for CI or when you need a reproducible, isolated test environment with no local Node/browser setup. Three stages, all in Docker:

| Stage | What runs | Container |
|---|---|---|
| 1 | TypeScript check · production build · Vitest · ESLint | `node:22-alpine` |
| 2 | App starts for E2E | `nginx:1.27-alpine` |
| 3 | Playwright chromium E2E | `mcr.microsoft.com/playwright:v1.59.0-noble` |

## Run Tests Locally — day-to-day development

```bash
npm run build              # production build
npm run test               # Vitest unit + service tests
npm run lint               # ESLint
npx playwright install     # one-time: install Playwright browser binaries
npm run e2e                # Playwright E2E (starts dev server with test seed)
```

E2E tests start the dev server with `VITE_TEST_SEED=true`, which seeds known test accounts so all interaction flows can run without manual setup.

> **Note:** `npx playwright install` only needs to be run once per machine (or after upgrading Playwright). If you skip it, `npm run e2e` will fail with a message asking you to run it.

## Export / Import

- In **Finance > Export/Import** tab, enter an export password and click **Export All Data**.
- The app creates an AES-GCM encrypted JSON backup blob and downloads it.
- For import, choose file + password, click **Import Data**, then confirm the full replace modal.
- Import replaces all local IndexedDB data and logs the operation.

## Architecture Notes

- **Service layer pattern:** all business writes and reads are performed through `src/services/*` modules. Data queries are scoped by the calling user's role — non-admin users receive only their own records (notifications, orders, enrollments) from the service layer, not the full table.
- **IndexedDB schema:** centralized in `src/db/schema.ts`, with typed records in `src/types/index.ts`.
- **Encryption lifecycle:** field-level encryption keys are derived at login from the user password and held only in React memory context (`useAuth`), never persisted to disk. After a page refresh, the session is restored but the encryption key is not available. The Finance module explicitly requires a fresh login to re-derive the key.
- **Campaign creation:** both Administrator and Member roles can create group-buy campaigns. Members can start campaigns referencing published fish entries.
- **Course enrollment:** enrollment is idempotent per operationId and also guarded per member-per-course. The same member cannot consume multiple seats in the same course.
- **Dispatch planning:** "Auto Plan" (`dispatchService.generatePlan`) creates delivery tasks from confirmed orders and automatically synthesizes delivery batches from available drivers and vehicle constraints. Manual batch creation and single-task assignment are also supported. Conflict detection runs immediately and is visible per-batch.
- **Order lifecycle:** campaign cutoff confirms orders but does not auto-record payment. Payment must be explicitly recorded using offline methods (Cash, CardOnPickup, ManualMark). Unpaid orders auto-close after 30 minutes.
- **Route protection:** all module routes are protected with role-based guards. Direct URL access by unauthorized roles renders a Forbidden page.
