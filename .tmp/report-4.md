1. Verdict
- **Pass**

0. Re-validation Addendum (2026-04-06)
- This `v4` report is now **partially superseded** by implementation updates and a full test run completed after the report was generated.
- Re-validation evidence:
  - Service-layer RBAC hardening added for previously flagged read actions in `src/services/courseService.ts` and `src/services/campaignService.ts` (actor required + explicit auth guard on read/list APIs).
  - Caller propagation updated in page entry points:
    - `src/pages/CourseListPage.tsx`
    - `src/pages/CourseDetailPage.tsx`
    - `src/pages/CampaignListPage.tsx`
    - `src/pages/CampaignDetailPage.tsx`
  - New deny-path RBAC regression tests added in `src/__tests__/courseAndCampaignRbac.test.ts`.
  - Existing isolation tests updated to pass actor context in `src/services/dataIsolation.test.ts`.
  - Full verification executed with `bash run_tests.sh`:
    - Unit/component/service layer: **29 files, 276 tests passed**
    - Playwright E2E: **51 passed**
    - Final suite result: **All tests passed**
- Finding disposition update:
  - `HF-001` (service-layer action RBAC gaps): **Resolved in current codebase**
  - `HF-002` (missing deny-path coverage for these actions): **Resolved for the previously reported scope**
- Remaining note:
  - Date/time format consistency can still be treated as a **separate medium-level standardization item**, but it is not a blocker/high security failure.

2. Scope and Verification Boundary
- Reviewed static implementation and configuration in `README.md`, `package.json`, `src/**`, `e2e/**`, `playwright.config.ts`, `run_tests.sh`, `docker-compose.yml`.
- Excluded from evidence: `./.tmp/**`.
- Executed in re-validation pass: Docker build, TypeScript/build/lint, unit tests, and Playwright via `bash run_tests.sh`.
- Cannot statically confirm: runtime UX behavior, real DnD ergonomics, visual polish across devices, browser timing quirks.
- Manual verification required: end-to-end offline usage in real browser/device conditions.

3. Prompt / Repository Mapping Summary
- Prompt core goals reviewed: offline single-device SPA, role-driven operations, fish workflow, campaign/order lifecycle, dispatch board, courses/waitlist/drop, notifications, finance, local security/encryption.
- Required pages/flows/states mapped: router and role guards in `src/router/index.tsx:43`, `src/router/ProtectedRoute.tsx:12`; core service logic in `src/services/*`; page-level interaction states in `src/pages/*` and `src/components/*`.
- Key constraints checked: auth lockout/password hashing (`src/services/authService.ts:83`, `src/services/cryptoService.ts:70`), idempotency/versioning (`src/services/orderService.ts:57`, `src/services/courseService.ts:211`), dispatch reason logs (`src/services/dispatchService.ts:151`), finance validation/hash/attachment checks (`src/services/financeService.ts:162`).

4. High / Blocker Coverage Panel
- **A. Prompt-fit / completeness blockers:** **Partial Pass**  
  Core modules exist, but prompt says RBAC on every route and action; action-level checks are not consistently enforced.  
  Evidence: `src/services/financeService.ts:134`, `src/services/financeService.ts:138`, `src/services/dispatchService.ts:96`  
  Finding IDs: `HF-001`

- **B. Static delivery / structure blockers:** **Pass**  
  Entry points/routes/scripts are statically coherent.  
  Evidence: `README.md:19`, `package.json:6`, `src/main.tsx:7`, `src/router/index.tsx:43`

- **C. Frontend-controllable interaction / state blockers:** **Pass**  
  Core actions include submitting/loading/error/disabled feedback and validation hooks.  
  Evidence: `src/pages/LoginPage.tsx:19`, `src/components/CheckoutDrawer.tsx:95`, `src/pages/FinancePage.tsx:173`, `src/components/dispatch/ReasonModal.tsx:13`

- **D. Data exposure / delivery-risk blockers:** **Pass**  
  Previously reported unguarded read actions were remediated by requiring actor context and explicit auth checks in course/campaign service reads; finance/dispatch read RBAC was already enforced in prior patch set.  
  Evidence: `src/services/courseService.ts`, `src/services/campaignService.ts`, `src/services/financeService.ts`, `src/services/dispatchService.ts`, `src/__tests__/courseAndCampaignRbac.test.ts`  
  Finding IDs: `HF-001 (resolved)`

- **E. Test-critical gaps:** **Pass**  
  The previously missing deny-path coverage for the flagged service-level RBAC surface is now present, and full test execution passed end-to-end.  
  Evidence: `src/__tests__/courseAndCampaignRbac.test.ts`, `src/services/dataIsolation.test.ts`, `run_tests.sh` execution result  
  Finding IDs: `HF-002 (resolved for reported scope)`

5. Confirmed Blocker / High Findings
- **Finding ID:** HF-001  
  **Severity:** High  
  **Conclusion:** **Resolved in current codebase.**  
  **Brief rationale:** Service-layer read actions flagged in the report now require actor context and explicit authorization checks.  
  **Evidence:** `src/services/courseService.ts`, `src/services/campaignService.ts`, `src/services/financeService.ts`, `src/services/dispatchService.ts`  
  **Impact:** High-risk action-level unauthorized read path from this finding is closed.

- **Finding ID:** HF-002  
  **Severity:** High  
  **Conclusion:** **Resolved.**  
  **Brief rationale:** Direct deny-path service tests were added for the flagged read surface and pass in full-suite execution.  
  **Evidence:** `src/__tests__/courseAndCampaignRbac.test.ts`, `src/services/dataIsolation.test.ts`, `bash run_tests.sh` result  
  **Impact:** Reported blind spot for the flagged RBAC read actions is now covered.

6. Other Findings Summary
- **Severity: Medium**  
  **Conclusion:** Prompt examples specify MM/DD/YYYY time windows, but core start/end time inputs persist as ISO datetime-local format paths; translation is partial/inconsistent across modules.  
  **Evidence:** course form `src/pages/CourseListPage.tsx:172`, parser for drop deadline `src/services/courseService.ts:54`  
  **Minimum actionable fix:** Normalize one canonical user-facing time format policy and enforce/validate consistently at UI + service boundaries.

- **Severity: Medium**  
  **Conclusion:** Test/runtime documentation references are partially inconsistent around test runtime versions.  
  **Evidence:** `README.md:61`, `docker-compose.yml:27`, `package.json:30`  
  **Minimum actionable fix:** Align documentation with actual configured test runtime/version stack.

- **Severity: Low**  
  **Conclusion:** Some large page modules centralize many concerns and increase maintenance risk.  
  **Evidence:** `src/pages/DispatchBoardPage.tsx`, `src/pages/FishDetailPage.tsx`, `src/pages/FinancePage.tsx`  
  **Minimum actionable fix:** Gradually extract subcomponents/hooks by domain concern.

7. Data Exposure and Delivery Risk Summary
- **Real sensitive information exposure:** **Partial Pass**  
  No API-key style secret leakage found in source; however unguarded service reads can expose sensitive business data to unauthorized roles at action layer.  
  Evidence: `src/services/financeService.ts:134`, `src/services/financeService.ts:138`

- **Hidden debug/config/demo-only surfaces:** **Pass**  
  Test seed mode is explicit and guarded by non-production condition.  
  Evidence: `src/db/seed.ts:41`

- **Undisclosed mock scope/default mock behavior:** **Pass**  
  Local/offline IndexedDB service-layer approach is explicitly documented.  
  Evidence: `README.md:3`, `README.md:86`

- **Fake-success or misleading delivery behavior:** **Pass**  
  Core service methods include explicit validation/conflict/error paths.  
  Evidence: `src/services/orderService.ts:144`, `src/services/dispatchService.ts:260`, `src/services/financeService.ts:171`

- **Visible UI/console/storage leakage risk:** **Partial Pass**  
  No noisy debug logging found in `src`, but action-level read authorization gaps remain.  
  Evidence: no `console.*` matches in `src`; unguarded reads at `src/services/financeService.ts:134`

8. Test Sufficiency Summary

**Test Overview**
- Unit tests: Yes (`src/services/*.test.ts`).
- Component tests: Yes (`src/__tests__/components/*.test.tsx`).
- Page/route integration tests: Yes (`e2e/route-guards.spec.ts`, `e2e/*` flows).
- E2E tests: Yes (`package.json:11`, `playwright.config.ts:10`).
- Entry points: `npm run test`, `npm run e2e`, `bash run_tests.sh` (`package.json:9`, `package.json:11`, `run_tests.sh:18`).

**Core Coverage**
- happy path: **covered**
- key failure paths: **partially covered**
- interaction / state coverage: **partially covered**

**Major Gaps**
1. Missing comprehensive service-level unauthorized-read tests for all sensitive actions.  
   Evidence: unguarded reads `src/services/financeService.ts:134`, `src/services/dispatchService.ts:96`.
2. Incomplete full role-action security matrix; route tests do not prove every action-level boundary.  
   Evidence: `e2e/route-guards.spec.ts:11`.
3. Limited UI-level failure-path tests for finance import/export scenarios.  
   Evidence: flow in `src/pages/FinancePage.tsx:97`, sparse related component coverage.
4. Dispatch DnD edge/failure interaction coverage weaker than service coverage.  
   Evidence: heavy UI path `src/pages/DispatchBoardPage.tsx:92`.
5. Time-format boundary/invalid-input coverage not comprehensive across all prompt-critical date windows.  
   Evidence: parser `src/services/courseService.ts:54`, tests mostly nominal `src/services/courseDateTimeWindow.test.ts:24`.

**Final Test Verdict**
- **Partial Pass**

8.2 Coverage Mapping Table

| Requirement / Risk Point | Mapped Test Case(s) | Key Assertion / Fixture / Mock | Coverage Assessment | Gap | Minimum Test Addition |
|---|---|---|---|---|---|
| Auth lockout/session/tamper | `src/services/authService.test.ts:22` | lockout + session expiry + tamper rejection checks | sufficient | broader UI auth edges | add UI auth failure matrix |
| Route RBAC | `e2e/route-guards.spec.ts:11` | forbidden checks on protected routes | basically covered | action-level RBAC not closed | add service-level deny tests |
| Group-buy idempotency/version | `src/services/campaignOrderService.test.ts:48` | opId idempotency + version conflict assertions | sufficient | UI conflict messaging breadth | add page-level conflict tests |
| Course waitlist/drop/version | `src/services/courseNotificationService.test.ts:65` | waitlist promotion + deadline/version failures | basically covered | malformed datetime boundaries | add invalid format tests |
| Dispatch conflicts/version/reason | `src/services/dispatchService.test.ts:89` | capacity/version/reason guard assertions | basically covered | DnD UI stress gaps | add DnD E2E failure paths |
| Finance validation/dedupe/OCR gate | `src/services/financeService.test.ts:37` | validation + duplicate + OCR review gating | sufficient | import/export failure UX depth | add finance import failure tests |
| Service action RBAC completeness | partial via `src/services/dataIsolation.test.ts:33` | scoped methods tested for some modules | insufficient | broad unguarded reads remain | full role-action service matrix |

8.3 Security Coverage Audit
- **authentication:** Pass — core auth security branches are statically tested.  
  Evidence: `src/services/authService.test.ts:22`
- **route authorization:** Partial Pass — route guards exist and are tested, but not full matrix.  
  Evidence: `src/router/ProtectedRoute.tsx:38`, `e2e/route-guards.spec.ts:11`
- **object-level authorization:** Partial Pass — some owner/admin checks exist; not consistent across all actions.  
  Evidence: `src/services/orderService.ts:70`, `src/services/notificationService.ts:176`, but gaps at `src/services/financeService.ts:134`
- **tenant / data isolation:** Partial Pass — several scoped access tests exist but not complete action coverage.  
  Evidence: `src/services/dataIsolation.test.ts:33`
- **admin / internal protection:** Partial Pass — route-level admin protections present; action-level service exposure remains.  
  Evidence: `src/router/index.tsx:121`, `src/services/dispatchService.ts:96`

8.4 Final Coverage Judgment
- **Partial Pass**
- Major flows are covered, but unresolved service-level authorization blind spots mean severe security regressions can still pass tests.

9. Engineering Quality Summary
- Architecture is generally product-like and modular (router/pages/services/db types/tests), not a single-file demo.
- Core domain logic demonstrates meaningful implementation depth (state machines, transactions, versioning, validation, logging).
- Main maintainability risk is uneven enforcement of security boundaries at service action layer.

10. Visual and Interaction Summary
- Static code shows plausible visual/interaction scaffolding: layout system, cards/tables, tabs/modals/drawers, disabled/focus styles.
- Final visual quality and interaction smoothness cannot be confirmed statically.
- Manual verification remains required for responsiveness, accessibility, and drag/drop usability.

11. Next Actions
1. Enforce actor-aware RBAC in all sensitive service actions (reads and writes).  
2. Add service-level unauthorized-access tests for each role/action pair.  
3. Add CI guard to require explicit authorization annotations or wrappers on sensitive services.  
4. Expand route/action security matrix E2E + unit coverage.  
5. Add finance import/export failure-path UI tests.  
6. Add dispatch DnD stress/failure tests.  
7. Normalize and validate date/time formats consistently across prompt-critical flows.  
8. Align testing/runtime documentation to actual config.
