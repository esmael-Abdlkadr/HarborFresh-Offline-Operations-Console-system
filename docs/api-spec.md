# API / Service Contracts — TASK-120 HarborFresh

> This is a pure frontend project. There are no HTTP endpoints. This document defines the **service layer contracts** — the TypeScript function signatures, input validation rules, and error codes that every service must implement.

---

## Error Code Conventions
All service errors are thrown as plain objects: `{ code: string; message: string; details?: object }`

---

## Auth Service

```ts
authService.login(username: string, password: string): Promise<User>
```
| Error Code | Condition |
|---|---|
| `AUTH_WRONG_PASSWORD` | Password does not match (or user not found — same message to prevent enumeration) |
| `AUTH_LOCKED` | Account locked; response includes `{ lockedUntil: number }` |

```ts
authService.logout(): void
authService.restoreSession(): Promise<User | null>
```

---

## Fish Service

```ts
fishService.createEntry(data: Partial<FishEntry>, actor: User): Promise<FishEntry>
```
| Error Code | Condition |
|---|---|
| `FISH_REQUIRED_FIELDS_MISSING` | Any taxonomy field or commonName/scientificName absent |
| `FISH_SLUG_COLLISION` | Slug generation hit 10 collision attempts |

```ts
fishService.saveRevision(entryId: number, updates: Partial<FishEntry>, actor: User): Promise<FishEntry>
fishService.submitForReview(entryId: number, actor: User): Promise<void>
```
| Error Code | Condition |
|---|---|
| `FISH_INVALID_STATUS_TRANSITION` | Entry not in `draft` or `rejected` |
| `FISH_ROLE_NOT_ALLOWED` | Actor is not ContentEditor or Administrator |

```ts
fishService.reviewEntry(entryId: number, decision: 'approve' | 'reject', comment: string, actor: User): Promise<void>
```
| Error Code | Condition |
|---|---|
| `FISH_INVALID_STATUS_TRANSITION` | Entry not in `in_review` |
| `FISH_REVIEW_COMMENT_REQUIRED` | Decision is `reject` and comment is empty |

```ts
fishService.rollbackToVersion(entryId: number, targetVersion: number, actor: User): Promise<FishEntry>
```
| Error Code | Condition |
|---|---|
| `FISH_VERSION_NOT_FOUND` | Target revision does not exist |

---

## Campaign & Order Service

```ts
campaignService.createCampaign(data, actor): Promise<Campaign>
```
| Error Code | Condition |
|---|---|
| `CAMPAIGN_CUTOFF_IN_PAST` | `cutoffAt <= Date.now()` |
| `CAMPAIGN_ROLE_NOT_ALLOWED` | Actor is not Administrator |

```ts
orderService.joinCampaign(campaignId: number, memberId: number, quantity: number, operationId: string): Promise<Order>
```
| Error Code | Condition |
|---|---|
| `ORDER_CAMPAIGN_CLOSED` | Campaign status is not `Open` or cutoff has passed |
| `ORDER_ALREADY_EXISTS` | Member already has a non-cancelled order for this campaign |

```ts
orderService.transitionStatus(orderId: number, newStatus: OrderStatus, actor: User, paymentData?: PaymentData): Promise<Order>
```
| Error Code | Condition |
|---|---|
| `ORDER_INVALID_TRANSITION` | Transition not in the allowed state machine map |
| `ORDER_VERSION_CONFLICT` | `order.version` does not match `expectedVersion` |
| `ORDER_PAYMENT_REQUIRED` | Transitioning to `Confirmed` without `paymentMethod` |

---

## Dispatch Service

```ts
dispatchService.assignTask(taskId: number, batchId: number, reason: string, actor: User): Promise<void>
```
| Error Code | Condition |
|---|---|
| `DISPATCH_REASON_TOO_SHORT` | `reason.length < 10` |
| `DISPATCH_CAPACITY_EXCEEDED` | Adding task would exceed `vehicleCapacityLbs`; includes `{ overBy: number }` |
| `DISPATCH_TIME_CONFLICT` | Task's promised window does not overlap with batch shift |

```ts
dispatchService.unassignTask(taskId: number, reason: string, actor: User): Promise<void>
dispatchService.autoPlan(date: string, actor: User): Promise<void>
dispatchService.recalculate(date: string, actor: User, reason: string): Promise<void>
dispatchService.detectConflicts(batchId: number): Promise<ConflictResult[]>
```

---

## Course Service

```ts
courseService.enroll(courseId: number, memberId: number, operationId: string): Promise<Enrollment>
```
| Error Code | Condition |
|---|---|
| `ENROLL_PREREQ_NOT_MET` | Missing prerequisite completions; includes `{ missing: number[] }` |
| `ENROLL_COURSE_NOT_OPEN` | Course status is not `Open` or `Full` |
| `ENROLL_DUPLICATE` | Member already has an active enrollment (and operationId is different) |

```ts
courseService.drop(enrollmentId: number, actor: User, reason?: string): Promise<void>
```
| Error Code | Condition |
|---|---|
| `ENROLL_DROP_DEADLINE_PASSED` | `Date.now() > dropDeadlineMs` |
| `ENROLL_WRONG_STATUS` | Enrollment is not `Enrolled` or `Waitlisted` |

---

## Finance Service

```ts
financeService.createEntry(data: Partial<LedgerEntry>, actor: User): Promise<LedgerEntry>
```
| Error Code | Condition |
|---|---|
| `FINANCE_AMOUNT_INVALID` | Amount has more than 2 decimal places or is non-positive |
| `FINANCE_TAX_RATE_OUT_OF_RANGE` | `salesTaxRate < 0` or `> 12.00` |
| `FINANCE_ACCOUNT_CODE_REQUIRED` | `accountCode` is empty |
| `FINANCE_DATE_INVALID` | Date is not valid MM/DD/YYYY |
| `FINANCE_DUPLICATE_VOUCHER` | SHA-256 hash matches a non-void entry; includes `{ existingId: number }` |

```ts
financeService.postEntry(entryId: number, actor: User): Promise<void>
```
| Error Code | Condition |
|---|---|
| `FINANCE_OCR_REVIEW_PENDING` | `ocrSourceText` is set but `ocrReviewedBy` is null |
| `FINANCE_WRONG_STATUS` | Entry is not in `Draft` |

```ts
financeService.voidEntry(entryId: number, actor: User, reason: string): Promise<void>
financeService.attachFile(entryId: number, file: File, actor: User): Promise<Attachment>
```
| Error Code | Condition |
|---|---|
| `ATTACHMENT_TYPE_NOT_ALLOWED` | MIME type not in `['application/pdf', 'image/jpeg', 'image/png']` |
| `ATTACHMENT_TOO_LARGE` | `file.size > 10_485_760` |
| `ATTACHMENT_DUPLICATE` | Same SHA-256 fingerprint already attached to this entry |

```ts
financeService.exportDataset(password: string): Promise<Blob>
financeService.importDataset(file: File, password: string): Promise<void>
```
| Error Code | Condition |
|---|---|
| `EXPORT_ENCRYPT_FAILED` | WebCrypto error during encryption |
| `IMPORT_WRONG_PASSWORD` | Decryption produces invalid JSON |
| `IMPORT_VERSION_MISMATCH` | File `version` field !== 1 |

---

## Notification Service

```ts
notificationService.send(recipientId: number, templateKey: NotificationTemplate, templateData: Record<string, string>): Promise<Notification>
notificationService.retryFailed(): Promise<void>
```

Delivery failure rules:
- Failure = any thrown JS error during template rendering
- Max `retries = 3`; after 3 failures, status stays `Failed` permanently
- Retry scheduler runs every 30 seconds via `setInterval` in `App.tsx`
