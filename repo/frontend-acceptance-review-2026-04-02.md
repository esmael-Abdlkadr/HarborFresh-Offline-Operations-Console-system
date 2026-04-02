# HarborFresh Frontend Acceptance Review

Scope: `TASK-120/repo`

Overall determination: `Partial Pass.

Reviewer verification executed:
- `npm run build` -> passed
- `npm run test` -> passed (`21` test files, `130` tests)
- `npm run lint` -> passed
- `npm run e2e` -> could not complete because Playwright browser binaries were not installed; this matches the project documentation that requires a one-time `npx playwright install` step before local E2E execution (`README.md:63-75`, `playwright.config.ts:23-30`)

## Severity-Ranked Issues

### High

1. The required service-layer plus optimistic-locking architecture is only partially implemented.
   - Evidence:
     - The README claims all business reads and writes are routed through services (`README.md:84-93`).
     - In practice, pages read Dexie tables directly from UI code: `src/pages/DashboardPage.tsx:29-34`, `src/pages/FishListPage.tsx:32-35`, `src/pages/CampaignListPage.tsx:27-31`, `src/pages/CampaignDetailPage.tsx:32-50`, `src/pages/CourseListPage.tsx:10-12`, `src/pages/CourseDetailPage.tsx:13-24`, `src/pages/FinancePage.tsx:11-13`, `src/pages/NotificationsPage.tsx:11-13`.
     - Optimistic version checks are implemented in some critical services, for example `src/services/orderService.ts:120-130`, `src/services/courseService.ts:222-249`, and `src/services/dispatchService.ts:224-231`.
     - Equivalent protection is missing from other write paths such as `src/services/fishService.ts:142-177` and `src/services/financeService.ts:216-307`, which increment versions but do not accept expected-version inputs or enforce them inside IndexedDB transactions.
   - Impact: this weakens the prompt's requirement that data processing live in a frontend service layer and that updates enforce optimistic locking with version fields inside IndexedDB transactions. Multi-tab or stale-state edits can still overwrite each other in fish and finance flows.
   - Smallest executable improvement:
     - Introduce read-side service selectors so pages stop importing `db` directly.
     - Add expected-version parameters and Dexie transactions to fish and finance mutations.
     - Add concurrency tests for stale fish revisions and stale finance mutations.

### Low

3. `CampaignDetailPage` defaults administrators to a non-visible tab.
   - Evidence: `src/pages/CampaignDetailPage.tsx:52`, `src/pages/CampaignDetailPage.tsx:130-146`, `src/pages/CampaignDetailPage.tsx:202-216`
   - Impact: administrators open the page with `tab = 'mine'`, but only members render the `My Order` tab content. The admin must click `Orders` before seeing the relevant operational data.
   - Smallest executable improvement: initialize the tab from the current role, for example default to `orders` for administrators and `mine` for members.

4. `CourseDetailPage` shows raw ISO datetimes instead of the MM/DD/YYYY format used elsewhere.
   - Evidence: `src/pages/CourseDetailPage.tsx:107-110`, compared with the formatted list rendering in `src/pages/CourseListPage.tsx:63-68` and `src/pages/CourseListPage.tsx:212`
   - Impact: the detail screen is inconsistent with the prompt's MM/DD/YYYY training-window presentation and with the list page's own formatting.
   - Smallest executable improvement: move the date formatter into a shared utility and reuse it in both course list and course detail.

## 1. Mandatory Gate Checks

### 1.1 Can the delivered project actually be run and verified?

- Criterion: clear explanation of how to start, run, build, or preview the project.
  - Conclusion: `Pass`
  - Reasoning: the README documents local dev, Docker startup, local tests, and E2E prerequisites; the scripts are present in `package.json`.
  - Evidence: `README.md:19-75`, `package.json:6-13`
  - Reproducible verification steps:
    1. Run `npm install`.
    2. Run `npm run dev`.
    3. Run `npm run build`.
    4. Run `npm run test`.
    5. Run `npm run lint`.
    6. Run `npx playwright install` once, then `npm run e2e`.

- Criterion: can it be started, built, or verified locally without modifying core code?
  - Conclusion: `Pass`
  - Reasoning: the reviewer was able to execute build, test, and lint successfully without code changes. E2E requires browser binaries, but the README already documents that one-time dependency step.
  - Evidence: `README.md:63-75`, `package.json:6-13`, `playwright.config.ts:23-30`
  - Reproducible verification steps:
    1. `npm run build`
    2. `npm run test`
    3. `npm run lint`
    4. If Playwright browsers are missing, run `npx playwright install`.
    5. Re-run `npm run e2e`.

- Criterion: do actual results generally match the delivery documentation?
  - Conclusion: `Pass`
  - Reasoning: build, unit/component/service tests, and lint matched the documented commands; the E2E failure mode also matched the README note about requiring `npx playwright install`.
  - Evidence: `README.md:63-75`, `playwright.config.ts:23-30`
  - Reproducible verification steps:
    1. Compare the documented commands in `README.md`.
    2. Run the commands in the same order.
    3. Expect build/test/lint to pass and E2E to require browser binaries if not yet installed.

### 1.2 Does the deliverable materially deviate from the Prompt?

- Criterion: alignment with the business goal, page scenarios, and user flows.
  - Conclusion: `Partial Pass`
  - Reasoning: the project implements the requested offline SPA modules and local service/database stack, including fish workflow, group-buy campaigns, dispatch, courses, finance, notifications, bootstrap auth, and route protection. The main deviation is not missing pages, but incomplete enforcement of action-level RBAC and inconsistent service-layer boundaries.
  - Evidence: `src/router/index.tsx:43-140`, `src/App.tsx:12-30`, `src/pages/FishDetailPage.tsx:223-391`, `src/pages/CampaignDetailPage.tsx:105-274`, `src/pages/DispatchBoardPage.tsx:223-418`, `src/pages/CourseDetailPage.tsx:102-220`, `src/pages/FinancePage.tsx:137-317`, `src/pages/NotificationsPage.tsx:44-175`
  - Reproducible verification steps:
    1. Start the app with `npm run dev`.
    2. Navigate through `/fish`, `/campaigns`, `/dispatch`, `/courses`, `/finance`, `/notifications`, and `/admin`.
    3. Verify the corresponding flows against the prompt.

- Criterion: unrelated functionality present?
  - Conclusion: `Pass`
  - Reasoning: the navigation and service modules stay within the HarborFresh domain; no weakly related showcase/demo modules were found.
  - Evidence: `src/components/Layout/Sidebar.tsx:11-24`, `src/router/index.tsx:7-20`, `src/types/index.ts:29-255`
  - Reproducible verification steps:
    1. Inspect the sidebar and router definitions.
    2. Compare the modules to the prompt's requested business areas.

- Criterion: core problem definition replaced, weakened, or ignored without explanation?
  - Conclusion: `Fail`
  - Reasoning: the prompt explicitly requires RBAC on every route and action, plus service-layer data handling with optimistic locking. The delivered project enforces those constraints only partially.
  - Evidence: `src/router/ProtectedRoute.tsx:20-40`, `src/services/courseService.ts:343-413`, `src/services/userService.ts:45-63`, `src/services/fishService.ts:142-177`, `src/services/financeService.ts:216-307`
  - Reproducible verification steps:
    1. Review the route guards.
    2. Review the listed service methods.
    3. Confirm that authorization and expected-version checks are missing from those actions.

## 2. Completeness of Delivery

### 2.1 Does the deliverable fully cover the core requirements explicitly stated in the Prompt?

- Criterion: required pages, core features, core interactions, and key UI states implemented.
  - Conclusion: `Partial Pass`
  - Reasoning: the requested modules exist and are connected: fish knowledge workflow with media/version history, campaign list/detail with checkout drawer, dispatch board with drag-and-drop and reason logging, course registration with waitlist/history, finance with OCR/export-import, notifications with filters/logs, admin bootstrap and user management. The main shortfall is not missing pages but incomplete enforcement of prompt-mandated architecture/security rules.
  - Evidence: `src/router/index.tsx:53-140`, `src/pages/FishListPage.tsx:58-157`, `src/pages/FishDetailPage.tsx:230-391`, `src/pages/CampaignListPage.tsx:105-214`, `src/pages/CampaignDetailPage.tsx:130-274`, `src/components/CheckoutDrawer.tsx:150-279`, `src/pages/DispatchBoardPage.tsx:223-418`, `src/pages/CourseListPage.tsx:124-230`, `src/pages/CourseDetailPage.tsx:121-220`, `src/pages/FinancePage.tsx:155-317`, `src/pages/NotificationsPage.tsx:57-175`, `src/pages/AdminPage.tsx:107-232`, `src/pages/BootstrapSetupPage.tsx:54-103`
  - Reproducible verification steps:
    1. Launch the app.
    2. Authenticate with test-seeded credentials in E2E mode or bootstrap locally.
    3. Walk each module and verify the matching prompt flow.

- Criterion: main user flows covered rather than only static UI fragments.
  - Conclusion: `Pass`
  - Reasoning: the service layer and tests show real local business logic rather than decorative screens, including idempotent joins, status transitions, retry queues, scheduled publish, OCR approval, waitlist promotion, and dispatch planning.
  - Evidence: `src/services/orderService.ts:55-239`, `src/services/courseService.ts:152-497`, `src/services/dispatchService.ts:85-504`, `src/services/financeService.ts:133-472`, `src/services/fishService.ts:180-391`, `src/services/notificationService.ts:65-184`
  - Reproducible verification steps:
    1. Run `npm run test`.
    2. Inspect the service tests listed in the Test Coverage Evaluation section.

### 2.2 Does the deliverable have the shape of a real end-to-end project rather than a partial sample, demo fragment, or illustrative code snippet?

- Criterion: mock / hardcoded behavior used in place of real logic without disclosure?
  - Conclusion: `Pass`
  - Reasoning: the app is intentionally offline and uses IndexedDB as its local persistence model. Test seeding is disclosed and scoped to Playwright/dev test flows, with a production guard preventing test users from being seeded in production mode.
  - Evidence: `README.md:3`, `README.md:73-75`, `src/db/seed.ts:37-58`, `src/db/seed.ts:60-76`, `playwright.config.ts:23-30`, `src/__tests__/bootstrap.test.ts:65-97`
  - Reproducible verification steps:
    1. Inspect `src/db/seed.ts` and `playwright.config.ts`.
    2. Confirm `VITE_TEST_SEED` is only used for test/dev flows.
    3. Run the bootstrap tests.

- Criterion: complete project structure rather than scattered code or a single-file example?
  - Conclusion: `Pass`
  - Reasoning: the project includes routing, pages, shared components, hooks, services, DB schema, tests, E2E specs, and documentation.
  - Evidence: `src/router/index.tsx:39-144`, `src/components/Layout/Sidebar.tsx:11-48`, `src/db/db.ts:21-92`, `src/services/orderService.ts:55-239`, `README.md:1-94`
  - Reproducible verification steps:
    1. Inspect the `src`, `e2e`, and root docs/config structure.
    2. Confirm module separation and routing entry points.

- Criterion: basic documentation such as a README or equivalent?
  - Conclusion: `Pass`
  - Reasoning: the README includes startup, Docker, bootstrap, local tests, export/import, and architecture notes.
  - Evidence: `README.md:19-94`
  - Reproducible verification steps:
    1. Open `README.md`.
    2. Compare the instructions to the available scripts and files.

- Criterion: basic organization for pages, routing, state, or data flow?
  - Conclusion: `Partial Pass`
  - Reasoning: the app is organized as a real SPA with auth context, lazy routes, shared shell, Dexie schema, and service modules. The main architectural weakness is that read-side data flow still bypasses the service layer in many pages.
  - Evidence: `src/hooks/useAuth.ts:25-89`, `src/router/index.tsx:39-144`, `src/db/schema.ts:1-18`, `src/pages/CampaignListPage.tsx:27-31`, `src/pages/CourseListPage.tsx:10-12`, `src/pages/FinancePage.tsx:11-13`
  - Reproducible verification steps:
    1. Trace app startup from `src/App.tsx`.
    2. Trace routing from `src/router/index.tsx`.
    3. Compare service imports against page-level `db` access.

## 3. Engineering and Architecture Quality

### 3.1 Does the deliverable use a reasonable structure and module split for the scope of the problem?

- Criterion: clear project structure with separated responsibilities.
  - Conclusion: `Partial Pass`
  - Reasoning: the macro-structure is sound, with separate pages/components/services/db/types. However, some key pages and services are very large, and DB reads are mixed into UI components instead of staying behind service boundaries.
  - Evidence: `src/components/Layout/AppShell.tsx:7-38`, `src/services/dispatchService.ts:85-504`, `src/services/courseService.ts:152-497`, `src/pages/DispatchBoardPage.tsx:32-420`, `src/pages/FishDetailPage.tsx:51-394`
  - Reproducible verification steps:
    1. Review the file structure.
    2. Inspect the page/service file sizes and responsibilities.

- Criterion: separation across pages, components, state, service calls, and utility functions.
  - Conclusion: `Pass`
  - Reasoning: the project uses shared UI primitives, layout components, an auth hook, service modules, DB schema/types, and specialized components such as the checkout drawer and dispatch reason modal.
  - Evidence: `src/components/Layout/Sidebar.tsx:26-48`, `src/components/CheckoutDrawer.tsx:25-283`, `src/components/dispatch/ReasonModal.tsx:11-44`, `src/hooks/useAuth.ts:14-97`, `src/services/cryptoService.ts:38-144`
  - Reproducible verification steps:
    1. Trace a feature such as campaign join from page -> component -> service.
    2. Trace auth from provider -> route guard -> login page.

- Criterion: unnecessary or redundant files?
  - Conclusion: `Cannot Confirm`
  - Reasoning: no acceptance-significant redundant source modules were identified from the code review, but this review did not audit every generated artifact or packaging decision as a submission-composition check.
  - Evidence: `src/router/index.tsx:7-20`, `src/db/db.ts:21-92`, `README.md:84-94`; judgment boundary limited to source architecture rather than archive cleanliness.
  - Reproducible verification steps:
    1. Review source directories for duplicated feature implementations.
    2. Ignore generated artifacts unless performing a packaging audit.

- Criterion: too much logic stacked into a single file?
  - Conclusion: `Partial Pass`
  - Reasoning: several files are workable but oversized for the project scope, especially `DispatchBoardPage`, `FishDetailPage`, `dispatchService`, and `courseService`.
  - Evidence: `src/pages/DispatchBoardPage.tsx:32-420`, `src/pages/FishDetailPage.tsx:51-394`, `src/services/dispatchService.ts:85-504`, `src/services/courseService.ts:152-497`
  - Reproducible verification steps:
    1. Open the listed files.
    2. Evaluate how many concerns each file owns.

### 3.2 Does the deliverable show basic maintainability and extensibility rather than being a temporary or piled-up implementation?

- Criterion: obvious confusion or tight coupling?
  - Conclusion: `Partial Pass`
  - Reasoning: the business logic itself is generally coherent, but UI components are tightly coupled to Dexie reads and some security rules depend on page structure instead of service contracts.
  - Evidence: `src/pages/DashboardPage.tsx:29-34`, `src/pages/NotificationsPage.tsx:11-13`, `src/services/courseService.ts:343-413`, `src/services/userService.ts:45-63`
  - Reproducible verification steps:
    1. Compare the prompt's service-layer requirement to current page/db imports.
    2. Compare action-level security expectations to current service implementations.

- Criterion: core logic leaves room for extension rather than being hardcoded.
  - Conclusion: `Pass`
  - Reasoning: types, status enums, retry/backoff handling, notification templates, and data tables are structured to support extension without rewriting the app shell.
  - Evidence: `src/types/index.ts:1-255`, `src/services/notificationService.ts:4-34`, `src/db/schema.ts:1-18`
  - Reproducible verification steps:
    1. Review the typed entities and service helper structure.
    2. Inspect the notification template system and Dexie schema.

- Criterion: component reuse, state management, abstraction, and config organization handled maintainably?
  - Conclusion: `Partial Pass`
  - Reasoning: there is useful reuse at the component and hook level, but read-side service abstraction is missing and several features duplicate formatting/state logic locally.
  - Evidence: `src/components/Layout/AppShell.tsx:7-38`, `src/components/dispatch/ReasonModal.tsx:11-44`, `src/components/finance/LedgerEntryForm.tsx:11-135`, `src/pages/CourseListPage.tsx:50-68`, `src/pages/CourseDetailPage.tsx:107-110`
  - Reproducible verification steps:
    1. Trace shared components.
    2. Compare repeated date-formatting logic between course pages.

## 4. Engineering Detail and Professionalism

### 4.1 Does the deliverable reflect sound frontend engineering practice?

- Criterion: error handling is basically reliable and user-friendly.
  - Conclusion: `Pass`
  - Reasoning: major pages surface explicit loading/error/success feedback, and the services use typed/custom errors in the highest-risk domains.
  - Evidence: `src/pages/LoginPage.tsx:20-47`, `src/pages/FishDetailPage.tsx:105-195`, `src/pages/CampaignListPage.tsx:66-103`, `src/pages/CourseDetailPage.tsx:46-83`, `src/pages/FinancePage.tsx:39-116`, `src/services/authService.ts:15-30`, `src/services/dispatchService.ts:9-25`, `src/services/financeService.ts:29-50`
  - Reproducible verification steps:
    1. Review the listed page handlers.
    2. Trigger invalid login, invalid finance input, or invalid dispatch reason.

- Criterion: necessary validation is present for important inputs and boundaries.
  - Conclusion: `Pass`
  - Reasoning: the implementation validates password length, login lockout, fish taxonomy, campaign cutoff/min participants, order quantity and payment semantics, dispatch reasons and constraints, course times and deadlines, finance amount/tax/date/account code, attachment type/size, and OCR approval before posting.
  - Evidence: `src/pages/BootstrapSetupPage.tsx:24-32`, `src/services/authService.ts:11-13`, `src/services/fishService.ts:130-139`, `src/services/campaignService.ts:34-44`, `src/services/orderService.ts:72-79`, `src/services/orderService.ts:162-167`, `src/services/dispatchService.ts:125-129`, `src/services/courseService.ts:158-168`, `src/services/courseService.ts:374-379`, `src/services/financeService.ts:160-174`, `src/services/financeService.ts:243-257`
  - Reproducible verification steps:
    1. Run `npm run test`.
    2. Inspect the service tests that target validation failures.

- Criterion: essential UI states handled (loading, empty, error, submitting, success/failure feedback).
  - Conclusion: `Partial Pass`
  - Reasoning: most core pages include loading/empty/error states and some success states, but coverage is uneven and not all list/filter combinations are directly tested.
  - Evidence: `src/pages/CampaignListPage.tsx:170-210`, `src/pages/CampaignDetailPage.tsx:70-84`, `src/pages/CourseListPage.tsx:192-229`, `src/pages/FishListPage.tsx:116-155`, `src/pages/FinancePage.tsx:174-215`, `src/pages/NotificationsPage.tsx:71-110`, `src/components/CheckoutDrawer.tsx:195-279`, `src/__tests__/components/LoginPage.test.tsx:51-71`, `src/__tests__/components/CheckoutDrawer.test.tsx:53-128`
  - Reproducible verification steps:
    1. Open the list pages with empty IndexedDB.
    2. Exercise invalid form submissions and successful joins/posts.

- Criterion: logging supports troubleshooting rather than being random, excessive, or absent.
  - Conclusion: `Pass`
  - Reasoning: instead of ad hoc console logging, the project uses categorized local logs: audit logs, dispatch logs, notification send/failure state, and admin-visible send panels.
  - Evidence: `src/db/schema.ts:11-17`, `src/pages/DispatchBoardPage.tsx:308-338`, `src/pages/NotificationsPage.tsx:127-174`, `src/services/dispatchService.ts:58-71`, `src/services/orderService.ts:45-53`, `src/services/financeService.ts:103-111`
  - Reproducible verification steps:
    1. Generate a dispatch action and inspect the dispatch log panel.
    2. Trigger or inspect notifications and open the send log.

- Criterion: risk of sensitive data exposure through logs/storage/UI surfaces.
  - Conclusion: `Partial Pass`
  - Reasoning: the project does a good job on password hashing, AES-GCM field encryption, bootstrap password scoping to `sessionStorage`, and localStorage hygiene. The remaining risk is primarily authorization-related: some actions are not protected in the service layer itself.
  - Evidence: `src/services/cryptoService.ts:38-144`, `src/services/authService.ts:43-45`, `src/services/authService.ts:127-130`, `src/services/financeService.ts:140-152`, `src/db/seed.ts:60-76`, `src/services/localStorageSecrets.test.ts:34-68`, `src/services/authService.test.ts:111-131`
  - Reproducible verification steps:
    1. Log in and inspect localStorage/sessionStorage.
    2. Confirm only session metadata is stored locally.
    3. Review the service-layer authorization gaps in the High issues above.

### 4.2 Does the deliverable resemble a real product rather than a demo or tutorial artifact?

- Criterion: looks like a real application rather than a teaching sample.
  - Conclusion: `Partial Pass`
  - Reasoning: architecturally, yes: the app has auth, routing, persistent local data, domain workflows, and meaningful tests. Live visual/product polish could not be fully confirmed because browser-based runtime inspection was not available in this review environment.
  - Evidence: `src/App.tsx:12-39`, `src/router/index.tsx:39-144`, `README.md:84-94`
  - Reproducible verification steps:
    1. Run the app locally.
    2. Inspect the main shell, navigation, and at least one detail workflow per module.

- Criterion: pages are meaningfully connected to each other.
  - Conclusion: `Pass`
  - Reasoning: the sidebar and route tree connect the operational modules, while flows such as campaign -> checkout -> order -> dispatch and course -> fee change -> notifications are linked through shared local state and services.
  - Evidence: `src/components/Layout/Sidebar.tsx:11-45`, `src/pages/CampaignDetailPage.tsx:123-274`, `src/services/dispatchService.ts:86-123`, `src/services/courseService.ts:463-495`
  - Reproducible verification steps:
    1. Navigate across the modules in the sidebar.
    2. Confirm downstream effects in IndexedDB-backed views.

- Criterion: interaction flows are complete rather than only static outcomes.
  - Conclusion: `Partial Pass`
  - Reasoning: the implementation supports real local state transitions, but browser-level completion of E2E flows could not be re-run in this environment because Playwright browsers were missing.
  - Evidence: `README.md:63-75`, `playwright.config.ts:23-30`, `e2e/auth.spec.ts:3-17`, `e2e/campaign-order.spec.ts:12-63`, `e2e/dispatch.spec.ts:12-99`
  - Reproducible verification steps:
    1. Run `npx playwright install`.
    2. Run `npm run e2e`.

## 5. Prompt Understanding and Fit

### 5.1 Does the deliverable correctly understand and respond to the business goal, usage scenario, and implied constraints?

- Criterion: fulfills the prompt's core business objective.
  - Conclusion: `Partial Pass`
  - Reasoning: the delivered frontend clearly understands the offline seafood co-op operations scenario and implements the requested domains. The remaining gaps are engineering-constraint gaps, not a misunderstanding of the business modules themselves.
  - Evidence: `README.md:1-4`, `src/types/index.ts:29-255`, `src/router/index.tsx:53-140`
  - Reproducible verification steps:
    1. Compare the prompt to the module list and typed domain model.
    2. Walk the app routes.

- Criterion: any clear misunderstanding or deviation from the real problem?
  - Conclusion: `Partial Pass`
  - Reasoning: the project does not misread the domain, but it under-implements two explicit non-visual constraints: action-level RBAC and service-layer/transactional optimistic locking.
  - Evidence: `src/services/courseService.ts:343-413`, `src/services/userService.ts:45-63`, `src/services/fishService.ts:142-177`, `src/services/financeService.ts:216-307`
  - Reproducible verification steps:
    1. Review the cited methods.
    2. Compare them to the prompt's security and transaction requirements.

- Criterion: key constraints changed or ignored without explanation?
  - Conclusion: `Fail`
  - Reasoning: yes, partially. The code changes the enforcement boundary from "every route and action" to mostly route/UI protection, and it changes "service layer" into a mixed service-plus-direct-Dexie page model.
  - Evidence: `README.md:84-93`, `src/pages/CampaignListPage.tsx:27-31`, `src/pages/CourseListPage.tsx:10-12`, `src/router/ProtectedRoute.tsx:20-40`, `src/services/userService.ts:45-63`
  - Reproducible verification steps:
    1. Compare the README/prompt claims to the page imports and service implementations.

- Criterion: does it only look right while failing actual closure/state transitions?
  - Conclusion: `Partial Pass`
  - Reasoning: service logic and tests show that most major workflows close correctly, so this is not merely visual scaffolding. The remaining concern is that some unauthorized or stale actions are not prevented where the prompt explicitly required them to be.
  - Evidence: `src/services/campaignOrderService.test.ts:47-244`, `src/services/courseNotificationService.test.ts:39-279`, `src/services/dispatchBatchGen.test.ts:28-260`, `src/services/financeService.test.ts:36-287`
  - Reproducible verification steps:
    1. Run the test suite.
    2. Inspect the uncovered risks in the Test Coverage Evaluation section.

## 6. Visual and Interaction Quality

### 6.1 Are the visuals and interactions appropriate to the scenario, and is the design reasonably polished?

- Criterion: functional areas visually distinguishable and layout coherent.
  - Conclusion: `Cannot Confirm`
  - Reasoning: the code suggests a coherent shell with cards, tabs, split panes, and highlighted states, but this review environment could not perform a live browser inspection of the running localhost app.
  - Evidence: `src/components/Layout/AppShell.tsx:12-36`, `src/components/Layout/Sidebar.tsx:29-45`, `src/pages/DispatchBoardPage.tsx:223-338`, `src/pages/NotificationsPage.tsx:57-125`
  - Reproducible verification steps:
    1. Start the app locally.
    2. Open `/dashboard`, `/dispatch`, `/notifications`, and `/finance`.
    3. Inspect spacing, hierarchy, and responsive behavior in a browser.

- Criterion: UI elements render correctly and match the theme/content.
  - Conclusion: `Cannot Confirm`
  - Reasoning: media rendering, typography, and responsive behavior require a real browser session. Static code alone is insufficient for an acceptance-grade visual judgment.
  - Evidence: `src/pages/FishDetailPage.tsx:270-296`, `src/components/CheckoutDrawer.tsx:164-280`
  - Reproducible verification steps:
    1. Open the app in a browser.
    2. Verify image/audio/video previews, drawer layout, and table rendering.

- Criterion: basic interaction feedback exists (hover/current state/disabled/loading/transitions).
  - Conclusion: `Pass`
  - Reasoning: the code includes active/inactive button states, modal/drawer open states, disabled submit states, drag-over highlighting, success and error messages, and timed drawer transitions.
  - Evidence: `src/components/CheckoutDrawer.tsx:152-180`, `src/components/CheckoutDrawer.tsx:273-279`, `src/components/dispatch/ReasonModal.tsx:27-40`, `src/pages/DispatchBoardPage.tsx:18-29`, `src/pages/CampaignListPage.tsx:109-118`, `src/pages/CourseDetailPage.tsx:201-202`
  - Reproducible verification steps:
    1. Open the drawer and dispatch modal.
    2. Try invalid inputs and observe disabled/error/success states.

- Criterion: fonts, colors, icons, and general visual language are consistent.
  - Conclusion: `Cannot Confirm`
  - Reasoning: code hints at a consistent card/button system, but final visual consistency still requires runtime viewing.
  - Evidence: `src/pages/FishListPage.tsx:8-14`, `src/components/Layout/Sidebar.tsx:36-43`
  - Reproducible verification steps:
    1. Review the app in-browser across at least 3 modules.

- Conditional checks outside scope.
  - Conclusion: `Not Applicable`
  - Reasoning: charts, maps, and third-party SDK integrations are not part of the prompt and were not implemented, so their absence is not a defect.
  - Evidence: prompt scope boundary plus no corresponding routes/components in `src/router/index.tsx:53-140`
  - Reproducible verification steps:
    1. Inspect the route list and module tree.

## Test and Logging Review

- Unit/service tests
  - Conclusion: `Pass`
  - Reasoning: service coverage is broad across auth, fish, campaigns/orders, courses, dispatch, finance, notifications, crypto, and acceptance fixes.
  - Evidence: `package.json:9-10`, `src/services/authService.test.ts:21-131`, `src/services/fishService.test.ts:25-158`, `src/services/campaignOrderService.test.ts:47-244`, `src/services/courseNotificationService.test.ts:39-279`, `src/services/dispatchBatchGen.test.ts:28-260`, `src/services/financeService.test.ts:36-287`
  - Reproducible verification steps:
    1. Run `npm run test`.

- Component tests
  - Conclusion: `Partial Pass`
  - Reasoning: important interaction components are covered, but component coverage is narrower than the service-layer coverage.
  - Evidence: `src/__tests__/components/LoginPage.test.tsx:18-72`, `src/__tests__/components/CheckoutDrawer.test.tsx:18-129`, `src/__tests__/components/FinancePage.test.tsx:38-91`, `src/__tests__/components/NotificationsFilters.test.tsx:78-121`, `src/__tests__/components/ReasonModal.test.tsx:8-21`
  - Reproducible verification steps:
    1. Run `npm run test`.

- Page/route integration tests
  - Conclusion: `Pass`
  - Reasoning: route guard, bootstrap gate, finance gate, and some page behavior are covered in both jsdom and Playwright layers.
  - Evidence: `src/__tests__/ProtectedRoute.test.tsx:53-96`, `src/__tests__/bootstrap.test.ts:25-97`, `e2e/bootstrap-gate.spec.ts:36-135`, `e2e/route-guards.spec.ts:11-38`
  - Reproducible verification steps:
    1. Run `npm run test`.
    2. Run `npx playwright install && npm run e2e`.

- E2E tests
  - Conclusion: `Cannot Confirm`
  - Reasoning: the suite exists and targets key workflows, but reviewer-side execution was blocked by missing Playwright browser binaries. This is an environment-prep limitation rather than a project defect because the README already documents the required install step.
  - Evidence: `README.md:69-75`, `playwright.config.ts:23-30`, `e2e/auth.spec.ts:3-17`, `e2e/campaign-order.spec.ts:12-63`, `e2e/dispatch.spec.ts:12-99`, `e2e/fish-workflow.spec.ts:3-38`, `e2e/course-waitlist-drop.spec.ts:10-98`, `e2e/user-switch-stale-state.spec.ts:3-59`
  - Reproducible verification steps:
    1. Run `npx playwright install`.
    2. Run `npm run e2e`.

- Log categorization
  - Conclusion: `Pass`
  - Reasoning: logs are domain-specific and queryable rather than noisy console output.
  - Evidence: `src/db/schema.ts:11-17`, `src/pages/DispatchBoardPage.tsx:308-338`, `src/pages/NotificationsPage.tsx:127-174`
  - Reproducible verification steps:
    1. Perform a dispatch action and inspect the log panel.
    2. Inspect notification send/failure state in the Notification Center.

## Test Coverage Evaluation (Static Audit)

### 1) Test Overview

- Test frameworks and entry points
  - `Vitest` via `package.json:9-10`
  - `Playwright` via `package.json:11` and `playwright.config.ts:5-31`
  - `Testing Library` via `package.json:27-28`

- Test types present
  - Unit/service tests: `src/services/*.test.ts`
  - Component tests: `src/__tests__/components/*.test.tsx`
  - Page/route integration tests: `src/__tests__/ProtectedRoute.test.tsx`, `src/__tests__/bootstrap.test.ts`
  - E2E tests: `e2e/*.spec.ts`

- README command coverage
  - Local build/test/lint/E2E commands are documented in `README.md:63-75`
  - E2E browser prerequisite is documented in `README.md:69-75`

- Mock/stub/fake data usage
  - `fake-indexeddb` is used in Vitest service/component tests (`src/services/*.test.ts`, `src/__tests__/*.test.tsx`)
  - Playwright uses `VITE_TEST_SEED=true` when it starts its own dev server (`playwright.config.ts:23-30`)
  - Production bootstrap is protected from accidental test-seed usage in `src/db/seed.ts:37-58` and `src/__tests__/bootstrap.test.ts:82-97`
  - Judgment: mock/fake usage is acceptable here because the prompt explicitly describes a frontend-only offline app. The remaining risk of shipping with mock behavior enabled is low because the seed code explicitly disables test seeding when `import.meta.env.PROD` is true.

### 2) Coverage Mapping Table

| Requirement / risk item | Code under test | Corresponding test case | Key assertion / fixture / mock | Coverage judgment | Gap | Smallest test addition recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| Authentication happy path, invalid login, logout | `src/pages/LoginPage.tsx:20-47`, `src/services/authService.ts:84-130` | `src/__tests__/components/LoginPage.test.tsx:35-71`, `e2e/auth.spec.ts:3-17` | `src/__tests__/components/LoginPage.test.tsx:36-48`, `e2e/auth.spec.ts:7-17` | `Basically covered` | E2E not executed in this review; no browser-level assertion for lockout countdown text | Add one executed Playwright case for wrong password -> success login -> logout after `npx playwright install` |
| Account lockout, session restore, tamper detection | `src/services/authService.ts:66-80`, `src/services/authService.ts:132-171` | `src/services/authService.test.ts:22-54`, `src/services/authService.test.ts:111-131` | `src/services/authService.test.ts:24-29`, `src/services/authService.test.ts:117-126` | `Fully covered` | No browser-level UX test for expired session redirect | Add one small integration test that seeds an expired session and verifies redirect to `/login` |
| Bootstrap admin gate and first-run password change | `src/router/ProtectedRoute.tsx:32-40`, `src/pages/BootstrapSetupPage.tsx:15-42`, `src/db/seed.ts:60-76` | `src/__tests__/bootstrap.test.ts:25-97`, `src/__tests__/ProtectedRoute.test.tsx:53-96`, `e2e/bootstrap-gate.spec.ts:36-135` | `src/__tests__/ProtectedRoute.test.tsx:54-95`, `e2e/bootstrap-gate.spec.ts:45-135` | `Fully covered` | E2E execution blocked in reviewer env | Re-run existing Playwright coverage after installing browsers |
| Fish draft -> review -> approve/publish, scheduled publish, rollback, revision cap | `src/services/fishService.ts:180-391`, `src/pages/FishDetailPage.tsx:299-391` | `src/services/fishService.test.ts:26-157`, `e2e/fish-workflow.spec.ts:3-38` | `src/services/fishService.test.ts:55-96`, `src/services/fishService.test.ts:123-156`, `e2e/fish-workflow.spec.ts:22-37` | `Basically covered` | No test for reviewer rejection comment appearing in UI/history | Add one component/E2E test for reject comment visibility and member-view restrictions after rejection |
| Fish route RBAC and editorial-tab hiding | `src/pages/FishListPage.tsx:23-45`, `src/pages/FishDetailPage.tsx:213-246` | `e2e/fish-rbac.spec.ts:48-106` | `e2e/fish-rbac.spec.ts:69-97`, `e2e/fish-rbac.spec.ts:102-105` | `Basically covered` | E2E not executed in this review | Re-run current E2E suite once browsers are installed |
| Campaign creation and member join flow | `src/services/campaignService.ts:29-64`, `src/services/orderService.ts:55-112`, `src/pages/CampaignListPage.tsx:122-166`, `src/components/CheckoutDrawer.tsx:94-147` | `src/services/campaignOrderService.test.ts:48-71`, `e2e/campaign-order.spec.ts:12-63`, `e2e/member-campaign.spec.ts:12-58`, `src/__tests__/components/CheckoutDrawer.test.tsx:53-128` | `src/services/campaignOrderService.test.ts:67-70`, `e2e/campaign-order.spec.ts:57-62`, `src/__tests__/components/CheckoutDrawer.test.tsx:86-95` | `Basically covered` | No executed browser validation in this review; no test for stale campaign cutoff race at UI level | Add a Playwright case for join blocked after cutoff is reached |
| Order status machine, offline payment semantics, unpaid auto-close | `src/services/orderService.ts:114-239`, `src/pages/CampaignDetailPage.tsx:86-103`, `src/pages/CampaignDetailPage.tsx:219-261` | `src/services/campaignOrderService.test.ts:97-214`, `src/services/acceptanceFixes.test.ts:201-263` | `src/services/campaignOrderService.test.ts:119-153`, `src/services/acceptanceFixes.test.ts:228-235`, `src/services/campaignOrderService.test.ts:203-214` | `Fully covered` | No component/E2E test for invalid transition feedback in campaign detail UI | Add one UI test for confirming without payment method and for unauthorized transition attempts |
| Dispatch generation, manual assignment, recalculation, conflict detection, reason logging | `src/services/dispatchService.ts:85-504`, `src/pages/DispatchBoardPage.tsx:97-205`, `src/components/dispatch/ReasonModal.tsx:11-44` | `src/services/dispatchBatchGen.test.ts:28-260`, `src/services/dispatchService.test.ts:27-259`, `src/services/dispatchPickupWindow.test.ts:27-139`, `src/__tests__/components/ReasonModal.test.tsx:8-21`, `e2e/dispatch.spec.ts:12-99` | `src/services/dispatchBatchGen.test.ts:246-259`, `src/services/dispatchService.test.ts:121-130`, `src/services/dispatchPickupWindow.test.ts:28-62`, `src/__tests__/components/ReasonModal.test.tsx:13-19` | `Fully covered` | E2E not executed here; drag-and-drop interaction itself is not directly tested in browser | Add one Playwright drag-and-drop case for manual reassignment with reason entry |
| Course creation, open, enroll, waitlist, drop deadline, prerequisites, history, fee change | `src/services/courseService.ts:152-497`, `src/pages/CourseListPage.tsx:70-122`, `src/pages/CourseDetailPage.tsx:31-203` | `src/services/courseNotificationService.test.ts:40-245`, `src/services/courseDateTimeWindow.test.ts:23-114`, `src/services/acceptanceFixes.test.ts:65-156`, `e2e/course-waitlist-drop.spec.ts:10-98` | `src/services/courseNotificationService.test.ts:84-147`, `src/services/courseDateTimeWindow.test.ts:63-114`, `e2e/course-waitlist-drop.spec.ts:47-64` | `Basically covered` | No direct test that unauthorized actors cannot call course mutations; no browser test for history tab | Add tests for non-owner/non-admin drop attempts and a UI assertion for change-history rendering |
| Notification filters, ownership, retry queue, send/failure logs | `src/services/notificationService.ts:65-184`, `src/pages/NotificationsPage.tsx:19-174` | `src/services/notificationRetry.test.ts:27-206`, `src/services/courseNotificationService.test.ts:247-277`, `src/__tests__/components/NotificationsFilters.test.tsx:78-121` | `src/services/notificationRetry.test.ts:61-91`, `src/services/notificationRetry.test.ts:166-206`, `src/__tests__/components/NotificationsFilters.test.tsx:85-121` | `Fully covered` | No executed browser verification of admin send-log view in this review | Add one Playwright test for admin send-log visibility and retry-now flow |
| Finance validation, encryption, duplicate vouchers, attachment checks, OCR review, export/import | `src/services/financeService.ts:154-472`, `src/pages/FinancePage.tsx:39-317`, `src/components/finance/LedgerEntryForm.tsx:39-132` | `src/services/financeService.test.ts:36-287`, `src/__tests__/components/FinancePage.test.tsx:38-91`, `e2e/finance-admin.spec.ts:3-34` | `src/services/financeService.test.ts:41-75`, `src/services/financeService.test.ts:124-130`, `src/services/financeService.test.ts:155-168`, `src/services/financeService.test.ts:190-199`, `src/services/financeService.test.ts:275-281` | `Basically covered` | No test for admin-only void action at UI/service authorization boundary; no test for failed import password path | Add tests for non-admin void rejection and wrong-password import failure messaging |
| Sensitive storage, localStorage secrecy, logout cleanup, cross-user stale state | `src/services/authService.ts:43-45`, `src/services/authService.ts:127-130`, `src/hooks/useAuth.ts:55-59`, `src/pages/FinancePage.tsx:118-135` | `src/services/localStorageSecrets.test.ts:34-68`, `e2e/user-switch-stale-state.spec.ts:3-59`, `src/services/acceptanceFixes.test.ts:383-399` | `src/services/localStorageSecrets.test.ts:35-66`, `e2e/user-switch-stale-state.spec.ts:32-58` | `Basically covered` | Browser test execution blocked here; no test that IndexedDB data views are re-scoped across user change beyond finance example | Add one E2E for switching from editorial user to member and verifying draft fish data is no longer visible |
| Read/search/filter/sort edge cases | `src/pages/FishListPage.tsx:37-56`, `src/pages/CampaignListPage.tsx:58-64`, `src/pages/CourseListPage.tsx:31-48`, `src/pages/NotificationsPage.tsx:19-29` | `src/__tests__/components/NotificationsFilters.test.tsx:78-121`, `e2e/fish-rbac.spec.ts:48-64` | `src/__tests__/components/NotificationsFilters.test.tsx:85-121`, `e2e/fish-rbac.spec.ts:48-64` | `Insufficient` | Notifications filtering is tested, and fish status-filter visibility is tested, but fish search, campaign filters, and course filters/date windows are largely untested at the UI level. Pagination is `Not Applicable` because no paginated UI exists in code or prompt. | Add 3 small UI tests: fish search, campaign status filter, course date/instructor filter |
| Service-layer action authorization and multi-tab concurrency in non-order/non-course flows | `src/services/courseService.ts:343-413`, `src/services/userService.ts:45-63`, `src/services/fishService.ts:142-177`, `src/services/financeService.ts:216-307` | No direct negative test found | Existing tests emphasize happy-path and version checks in orders/courses/dispatch, for example `src/services/courseNotificationService.test.ts:208-244` and `src/services/campaignOrderService.test.ts:184-214` | `Missing` | This is the biggest blind spot in the current suite and aligns with the highest-severity review findings. | Add service tests for unauthorized actor rejection and stale-version rejection in fish and finance mutations |

### 3) Security Coverage Audit

- Authentication (login / token / session handling)
  - Coverage conclusion: `Basically covered`
  - Evidence: `src/services/authService.test.ts:22-54`, `src/services/authService.test.ts:111-131`, `src/__tests__/components/LoginPage.test.tsx:35-71`, `e2e/auth.spec.ts:3-17`
  - Reproduction idea:
    1. Run `npm run test` for the service/component cases.
    2. Install Playwright browsers and run `npm run e2e`.
    3. Validate wrong password, lockout, login success, logout, and session tamper rejection.

- Frontend route protection / route guards
  - Coverage conclusion: `Basically covered`
  - Evidence: `src/__tests__/ProtectedRoute.test.tsx:53-96`, `e2e/route-guards.spec.ts:11-38`, `e2e/bootstrap-gate.spec.ts:36-135`
  - Reproduction idea:
    1. Run the route-guard tests.
    2. Manually open `/admin`, `/finance`, `/courses/999`, and `/dashboard` under different roles.

- Page-level / feature-level access control
  - Coverage conclusion: `Partial Pass`
  - Evidence: page-level restrictions are covered by `e2e/fish-rbac.spec.ts:69-106` and `e2e/route-guards.spec.ts:11-38`; however service-level action authorization is missing in `src/services/courseService.ts:343-413` and `src/services/userService.ts:45-63`
  - Reproduction idea:
    1. Verify direct URL access returns Forbidden for protected pages.
    2. Add a scratch test that calls `courseService.drop` with a non-owner actor and observe that no authorization branch currently rejects it.

- Sensitive information exposure
  - Coverage conclusion: `Basically covered`
  - Evidence: `src/services/localStorageSecrets.test.ts:34-68`, `src/services/financeService.test.ts:104-130`, `src/services/authService.test.ts:78-108`
  - Reproduction idea:
    1. Log in as admin and finance user.
    2. Inspect localStorage/sessionStorage and decrypted finance reads.

- Cache / state isolation after switching users
  - Coverage conclusion: `Basically covered`
  - Evidence: `e2e/user-switch-stale-state.spec.ts:3-59`, `src/services/localStorageSecrets.test.ts:54-58`, `src/hooks/useAuth.ts:55-59`
  - Reproduction idea:
    1. Log in as finance, visit `/finance`, log out, log in as member.
    2. Confirm the finance link disappears and `/finance` becomes forbidden.

### 4) Overall Judgment: Are the tests sufficient to uncover most issues?

Conclusion: `Partial Pass`

Judgment boundary:
- What is already well covered:
  - Core domain logic in auth, fish workflow, campaign join/order lifecycle, dispatch planning/conflicts, course enrollment/waitlist/drop, finance validation/encryption/export-import, notification retry/ownership.
  - Route guards and bootstrap redirect behavior.
  - Local storage secrecy and cross-user logout hygiene.
- What remains insufficiently covered:
  - Service-layer authorization for actions that should be RBAC-protected.
  - Optimistic-locking/concurrency behavior in fish and finance mutations.
  - UI coverage for filtering/search edge cases across fish, campaigns, and courses.
  - Executed browser-level confirmation of the Playwright suite in this review environment.
  - Visual polish and responsive rendering quality.

Resulting risk statement:
- The current tests are strong enough to uncover many business-logic defects.
- They are not sufficient to guarantee acceptance against the full prompt because the highest-risk uncovered area is security/authorization enforcement inside service actions, and that exact gap is visible in the code today.

## Final Acceptance Determination

Frontend acceptance result: `Partial Pass / Hold`

Why:
- The delivered project is a substantial, runnable offline React SPA with real local business logic, documentation, route structure, and a strong service/test foundation.
- It materially satisfies most core functional scenarios in the prompt.
- It should not be fully accepted yet because two explicit prompt constraints are only partially met:
  - role-based access control is not enforced on every action
  - service-layer plus optimistic-locking discipline is inconsistent across modules

## Minimal Next Steps Before Acceptance

1. Enforce actor/role/ownership checks in all sensitive service actions and add negative tests for them.
2. Add expected-version transactional guards to fish and finance mutations.
3. Re-run Playwright after `npx playwright install` and capture the results.
4. Clean up the two low-risk UX issues if aiming for a polished acceptance outcome.
