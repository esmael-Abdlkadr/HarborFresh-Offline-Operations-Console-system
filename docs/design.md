# Design Document — TASK-120 HarborFresh Offline Operations Console

## 1. Project Overview
A fully offline, browser-based React SPA for a seafood co-op. All data lives in IndexedDB (via Dexie.js). No backend, no network calls. Runs on a single kiosk device.

## 2. Tech Stack

| Layer | Library | Version | Purpose |
|---|---|---|---|
| Framework | React | 18.x | Component model |
| Routing | React Router | 6.x | SPA navigation + route guards |
| Local DB | Dexie.js | 3.x | IndexedDB wrapper |
| Drag & Drop | dnd-kit | 6.x | Dispatch Kanban board |
| Crypto | WebCrypto (built-in) | — | PBKDF2, AES-GCM |
| Testing | Vitest | 1.x | Unit & component tests |
| Testing | React Testing Library | 14.x | Component interaction tests |
| Testing | Playwright | 1.x | E2E smoke tests |
| Build | Vite | 5.x | Dev server + bundle |
| Language | TypeScript | 5.x | Type safety |

## 3. Architecture

### 3.1 Layered Structure
```
UI (Pages + Components)
        ↓
  React Hooks / Context
        ↓
  Service Layer (pure async functions — no React deps)
        ↓
  Dexie DB Layer (IndexedDB)
```

The service layer is pure TypeScript with no React imports. Services accept `User` (actor) as a parameter for RBAC and audit logging. They are independently unit-testable with a mock Dexie instance.

### 3.2 Role-Based Access Control
RBAC is enforced at three levels:
1. **Route level**: `ProtectedRoute` wrapper renders `ForbiddenPage` for wrong role (no redirect)
2. **UI level**: Buttons/actions conditionally rendered based on `useAuth().hasRole()`
3. **Service level**: Every mutating service call validates `actor.role` and throws if unauthorized

Role matrix (summarized):

| Feature | Admin | ContentEditor | ContentReviewer | Member | Dispatcher | FinanceClerk | Instructor |
|---|---|---|---|---|---|---|---|
| Create Fish | ✓ | ✓ | — | — | — | — | — |
| Review Fish | ✓ | — | ✓ | — | — | — | — |
| Create Campaign | ✓ | — | — | — | — | — | — |
| Join Campaign | ✓ | — | — | ✓ | — | — | — |
| Dispatch Board | ✓ | — | — | — | ✓ | — | — |
| Finance | ✓ | — | — | — | — | ✓ | — |
| Manage Courses | ✓ | — | — | — | — | — | ✓ |
| Enroll in Courses | ✓ | — | — | ✓ | — | — | — |
| Admin Panel | ✓ | — | — | — | — | — | — |

### 3.3 Encryption Key Lifecycle
- Derived with PBKDF2 (100,000 iterations, SHA-256) from the user's password on login
- Held only in React auth context memory (`CryptoKey` object)
- Never serialized or written to disk
- Cleared to `null` on logout or session expiry
- Required for reading/writing encrypted fields (`invoiceNotes`, `accountIdentifier`, `sensitiveNotes`)

## 4. IndexedDB Schema (Dexie v1)

```
users          ++id, &username
sessions       ++id, userId
fishEntries    ++id, slug, status, scheduledPublishAt, *tags
fishRevisions  ++id, fishId, version
campaigns      ++id, status, cutoffAt
orders         ++id, campaignId, memberId, status, operationId
deliveryTasks  ++id, batchId, status, priority
deliveryBatches++id, date, status
dispatchLogs   ++id, batchId, taskId, timestamp
courses        ++id, status, instructorId
enrollments    ++id, courseId, memberId, status, operationId
notifications  ++id, recipientId, status, isRead
ledgerEntries  ++id, type, accountCode, hash, status
attachments    ++id, ledgerEntryId, fingerprint
auditLogs      ++id, actor, action, entityType, timestamp
```

## 5. Key Workflows

### 5.1 Fish Draft → Publish
```
ContentEditor creates draft
    → submits for review (status: in_review)
        → ContentReviewer approves (optionally schedules)
            → if scheduledPublishAt in future: status stays 'approved', 60s scheduler publishes at time
            → if immediate: status becomes 'published'
        → ContentReviewer rejects (status: rejected, comment in revision diffSummary)
            → ContentEditor can edit and re-submit
```

### 5.2 Group-Buy Order Lifecycle
```
Admin creates Campaign (Open)
    → Members join via Checkout Drawer (operationId idempotency)
        → cutoffAt passes:
            if orderCount >= minParticipants → Campaign Confirmed, orders → Confirmed
            else → Campaign Cancelled, orders → Cancelled
        → Unpaid orders (Created state) auto-close after 30 min
```

### 5.3 Enrollment with Waitlist
```
Member enrolls (operationId idempotency + prerequisite check)
    → if seats available: Enrolled
    → if full: Waitlisted (position assigned)
        → another member drops (before dropDeadline)
            → first waitlisted member promoted to Enrolled
```

## 6. Data Export/Import
- **Export**: reads all tables → serializes to JSON → encrypts with AES-GCM (PBKDF2-derived key from user-supplied password) → triggers browser download
- **Import**: upload file → decrypt → confirmation modal → clear all tables → re-insert
- Format: `{ version: 1, salt: hex, iv: hex, ciphertext: base64 }`

## 7. Schedulers
All schedulers run as `setInterval` calls in `App.tsx`:

| Interval | Function | Purpose |
|---|---|---|
| 60s | `fishService.processScheduledPublish()` | Auto-publish approved entries |
| 60s | `campaignService.checkAndCloseExpired()` | Confirm/cancel campaigns at cutoff |
| 60s | `orderService.autoCloseUnpaid()` | Cancel unpaid orders after 30 min |
| 30s | `notificationService.retryFailed()` | Retry up to 3 failed notifications |
