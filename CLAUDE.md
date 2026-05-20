# SnapMeasure QA Framework — CLAUDE.md

This file is read by Claude Code at the start of every session.
Follow everything written here without being asked.

---

## Project Identity

| Key | Value |
|-----|-------|
| Framework | Playwright + TypeScript end-to-end QA automation |
| App Under Test | SnapMeasure Dashboard |
| Base URL | `https://measurement-dashboard-dev.magicktech.com` (env: `BASE_URL`) |
| Login Path | `/login` |
| Git Branch (active) | `dev` |
| Git Branch (main) | `main` |
| Jira Project | `KAN` at `https://selva-ragavan.atlassian.net` |
| Jira API | REST v3 — always `POST /rest/api/3/search/jql` (GET `/search` is deprecated) |
| Last Full Run | 2026-05-20 — TC-L01 + TC-L02 PASSED, TC-L03 + TC-L04 FAILED by design |
| Last Framework Update | 2026-05-20 — Slim suite (4 tests), bug creation moved to jiraReporter.ts, retain-on-failure media |

---

## Strict Rules — Never Break These

1. **PASSED test → NO individual Jira bug card. Ever.**
   `fixtures.ts afterEach` only calls `closeResolvedBugs()` for passed tests (moves old cards to DONE).
   Bug cards are created exclusively by `jiraReporter.ts onTestEnd` — only on the last retry of a failed test.

2. **FAILED test → One Jira Bug card per test per browser.**
   TC-L03 chromium = one card. TC-L03 firefox = separate card. TC-L03 webkit = separate card.
   `cleanupDuplicateBugs()` runs first to close any older duplicates, then `createJiraBug()` creates or reuses one.

3. **No duplicates — always clean before creating.**
   `cleanupDuplicateBugs()` is called on every FAILED test before `createJiraBug()`.
   `findOpenBug()` is called inside `createJiraBug()` as the final guard.

4. **Never hardcode credentials.**
   All secrets live in `.env`, read via `process.env`. `.env` is gitignored and must never be committed.
   `.env.example` (committed, no secrets) is the onboarding template.

5. **Never use `waitForLoadState('networkidle')`.**
   The app has live API polling that keeps network active in Firefox — networkidle never resolves.
   Always use `waitForLoadState('load')`.

6. **Enterprise ID field uses `pressSequentially()`, never `fill()`.**
   The field is `input[type=number]`. Playwright's `fill()` rejects non-numeric strings.
   Use `getByPlaceholder('123456789').pressSequentially(value)`.

7. **`moduleResolution` must stay `"node16"`.**
   Never revert to `"node"` — deprecated in TypeScript 5+, causes import resolution warnings.

8. **Never duplicate Jira logic in spec files.**
   Only `utils/jiraHelper.ts` talks to Jira.
   `jiraReporter.ts onTestEnd` triggers bug creation for failed tests.
   `fixtures.ts afterEach` triggers `closeResolvedBugs` for passed tests.
   Spec files never call Jira APIs directly.

9. **Always import `test` from `'./fixtures'`, not `'@playwright/test'`.**
   The `afterEach` Jira hook only runs with the fixtures-extended `test`.
   Importing from `@playwright/test` bypasses it silently.

10. **Never commit `scripts/` output to the test suite.**
    Scripts in `scripts/` are one-time utilities. Do not import them from spec files or jiraHelper.

11. **Jira module summaries and test run task are CI-only.**
    `jiraReporter.ts` gates module summaries and run tasks behind `process.env.CI`.
    Bug cards ARE created on all runs (local and CI) when tests fail.
    Local runs print the terminal table and developer message but do NOT post summaries.
    To force full Jira posting locally: `CI=true npx playwright test`

12. **Only FAILED test cards should be active (TO DO) in Jira.**
    When a test passes, `closeResolvedBugs()` automatically moves ALL open cards for that
    test+browser to DONE via dual JQL search (by label AND by summary).

---

## Repository Structure

```
my-qa-framework/
│
├── tests/
│   ├── login.spec.ts             Login module — TC-L01, TC-L02 (pass), TC-L03, TC-L04 (intentional fail)
│   └── fixtures.ts               Extends base test — afterEach: pass→closeResolvedBugs, fail handled by reporter
│
├── pages/
│   ├── BasePage.ts               Parent class — goto(path), waitForPageLoad()
│   └── LoginPage.ts              navigate(), login(), submitForm(), expectLoginError(), expectLoginSuccess()
│
├── data/
│   └── testData.ts               validUser, invalidUser, negativeUsers — all values from .env
│
├── utils/
│   ├── jiraHelper.ts             Full Jira integration — bug creation, cleanup, module summaries,
│   │                             validateJiraConfig(), testJiraConnection()
│   └── jiraReporter.ts           Custom Playwright Reporter — onTestEnd bug creation + terminal table
│
├── scripts/
│   ├── createBugCards.ts         One-time: posted historical bug cards
│   └── createTC113Webkit.ts      One-time: posted TC113 WebKit card
│
├── playwright.config.ts          baseURL from env, fullyParallel, 3 browsers, timeouts, video
├── .env                          All secrets — gitignored, never commit
├── .env.example                  Template with all keys, no values — committed to git
├── tsconfig.json                 target ESNext, module Node16, strict, skipLibCheck
├── package.json                  deps: axios, form-data | devDeps: @playwright/test, typescript, dotenv, @types/node, @types/form-data
├── qa-framework-docs.html        Full framework documentation webpage (dark-themed, sidebar nav)
└── CLAUDE.md                     This file
```

---

## Playwright Config — Current State

```typescript
// playwright.config.ts
testDir:           './tests'
fullyParallel:     true
forbidOnly:        !!process.env.CI
retries:           CI ? 2 : 1                   // 1 local retry prevents single-flake Jira cards
workers:           CI ? 4 : undefined            // parallel in CI
baseURL:           process.env.BASE_URL ?? 'https://measurement-dashboard-dev.magicktech.com'
trace:             'retain-on-failure'           // captures for ALL failed tests (not just first retry)
screenshot:        'only-on-failure'
video:             'retain-on-failure'           // captures for ALL failed tests (not just first retry)
actionTimeout:     15_000
navigationTimeout: 30_000
reporters:         ['list', ['html', { open: 'on-failure' }], ['./utils/jiraReporter.ts']]
browsers:          chromium (Desktop Chrome), firefox (Desktop Firefox), webkit (Desktop Safari)
```

**Why `retain-on-failure` (not `on-first-retry`):** Bug creation moved to `jiraReporter.ts onTestEnd` which has access to all attachment paths. `retain-on-failure` ensures screenshot/video/trace files exist for every failed test regardless of retry count, so they can be uploaded to Jira.

---

## All Page Methods — Current State

### `pages/BasePage.ts`
```typescript
goto(path: string)      → this.page.goto(path)
waitForPageLoad()       → this.page.waitForLoadState('load')
```

### `pages/LoginPage.ts` — extends BasePage
```typescript
navigate()                                    → goto('/login') + waitForPageLoad()
login(enterpriseId, email, password)          → pressSequentially(id), fill(email), fill(pass), click(Login)
submitForm()                                  → click Login button only — no field fills
expectLoginError()                            → expect getByText(/invalid|incorrect|error|required|valid email|wrong|failed|denied/i).toBeVisible({ timeout: 15000 })
expectLoginSuccess()                          → expect(page).not.toHaveURL('/login')
```

---

## Test Case Registry

| TC ID | Spec File | Describe Block | Type | Expected Result | Description |
|-------|-----------|----------------|------|-----------------|-------------|
| TC-L01 | login.spec.ts | Login Module — Pass Scenarios | Positive | PASS | Valid credentials must redirect away from /login |
| TC-L02 | login.spec.ts | Login Module — Pass Scenarios | Negative | PASS | Wrong password must show error and stay on /login |
| TC-L03 | login.spec.ts | Login Module — Strict Failed Scenarios | Strict UX | **FAIL by design** | Login success must display authenticated user email on screen |
| TC-L04 | login.spec.ts | Login Module — Strict Failed Scenarios | Strict UX | **FAIL by design** | Login error must appear inside form, not as a global toast |

**Why TC-L03 and TC-L04 fail by design:**
- TC-L03: The app renders no visible user email on the dashboard after login. Production-grade apps show session identity in the navbar/avatar/profile area. Until the app exposes this, the test will fail.
- TC-L04: The app renders the error as a global toast notification that appears outside the `<form>` element. A scoped in-form error is required. Until the app fixes this, the test will fail.

**Next available TC IDs:**
- `TC-L05` — next Login test
- `TC-L06` — next Login test

---

## beforeEach Patterns Per Spec File

### `login.spec.ts`
No `beforeEach` in either describe block — every test navigates and acts independently.

```typescript
// Both describe blocks follow this pattern:
test('TC-L01 - ...', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();   // each test navigates itself
  ...
});
```

---

## Test Data — Exact Values

```typescript
// data/testData.ts — all values read from .env

validUser = {
  enterpriseId: process.env.TEST_ENTERPRISE_ID  // "8253714198"
  email:        process.env.TEST_EMAIL           // "superadmin@magicktech.com"
  password:     process.env.TEST_PASSWORD        // "12345678"
}

invalidUser = {
  enterpriseId: process.env.TEST_ENTERPRISE_ID   // same valid ID
  email:        process.env.TEST_INVALID_EMAIL   // "wrong@example.com"
  password:     process.env.TEST_INVALID_PASSWORD// "wrongpassword"
}

negativeUsers = {
  wrongPassword:      { id: valid, email: valid,              password: 'WrongPass@999' }
  invalidEmailFormat: { id: valid, email: 'not-a-valid-email',password: valid }
  wrongEnterpriseId:  { id: '0000000000', email: valid,       password: valid }
  emptyEmail:         { id: valid, email: '',                 password: valid }
  emptyPassword:      { id: valid, email: valid,              password: '' }
  sqlInjection:       { id: valid, email: "' OR '1'='1",      password: "' OR '1'='1" }
}
```

---

## Known Selectors — App UI (Verified Against Live App)

| Element | Selector | Method |
|---------|----------|--------|
| Enterprise ID input | `getByPlaceholder('123456789')` | `pressSequentially()` — NEVER `fill()` |
| Email input | `getByPlaceholder('johndoe@email.com')` | `fill()` |
| Password input | `getByLabel('Password')` | `fill()` |
| Login button | `getByRole('button', { name: 'Login' })` | `click()` |
| Login error/validation | `getByText(/invalid\|incorrect\|error\|required\|valid email\|wrong\|failed\|denied/i)` | `toBeVisible({ timeout: 15000 })` |
| App error message (exact) | `"The Email field must be a valid email"` | Actual text for invalid email / SQL injection |

---

## Jira Integration — Current Architecture

### Connection
```typescript
// utils/jiraHelper.ts — axios instance
baseURL:  process.env.JIRA_BASE_URL + '/rest/api/3'
auth:     Basic { username: JIRA_EMAIL, password: JIRA_API_TOKEN }
dotenv:   path.resolve(__dirname, '../.env')   // explicit path — safe regardless of cwd
```

### Bug Creation Lifecycle

Bug creation was moved from `fixtures.ts afterEach` to `jiraReporter.ts onTestEnd`.

**Why:** `testInfo.attachments` in `afterEach` is always empty — Playwright writes screenshot/video/trace files to disk only AFTER all afterEach hooks complete (browser context teardown). The Reporter's `onTestEnd` fires after full context teardown, so `result.attachments` contains real, finalized file paths.

**Flow:**
1. `jiraReporter.ts onTestEnd` fires after every attempt (including retries)
2. If `result.retry >= test.retries` (last attempt) AND status is `failed` → queue bug task
3. Attachment paths are captured at this point and logged with file size
4. `onEnd` runs: `validateJiraConfig()` → `testJiraConnection()` → all bug tasks (Promise.allSettled) → terminal table
5. `fixtures.ts afterEach` only handles passed tests: calls `closeResolvedBugs()`

### Exported Functions

| Function | Signature | What It Does |
|----------|-----------|-------------|
| `validateJiraConfig` | `() → boolean` | Prints ✅/❌ table for all required env vars, masks secrets |
| `testJiraConnection` | `() → Promise<boolean>` | GET /rest/api/3/myself — confirms auth works, explains 401/404 |
| `createJiraBug` | `(payload: BugPayload) → string\|null` | Deduplicate → create Bug in TO DO, attach screenshot/video/trace |
| `createModuleSummary` | `(module, passedTests[]) → string\|null` | One Task per module for all passed tests (CI only) |
| `createTestRunSummary` | `(results: TestResult[]) → void` | Full run Task with module breakdown + developer message (CI only) |
| `closeResolvedBugs` | `(testTitle, browser) → void` | Dual-search → move ALL open cards for this test+browser to DONE |
| `cleanupDuplicateBugs` | `(testTitle, browser) → void` | Find 2+ open cards → close oldest, keep newest |
| `findOpenBug` | `(summary) → string\|null` | JQL search — returns key of open bug or null |
| `deriveModule` | `(testTitle, describeName?) → string` | Derive module from TC ID prefix or describe block name |

### `BugPayload` Interface
```typescript
interface BugPayload {
  testTitle:    string;
  errorMessage: string;
  browser:      string;      // 'chromium' | 'firefox' | 'webkit'
  module:       string;      // derived from describe block or TC ID
  specFile:     string;      // relative path from cwd
  screenshot?:  string;      // path — uploaded as Jira attachment
  video?:       string;      // path — uploaded as Jira attachment
  trace?:       string;      // path — uploaded as Jira attachment
  retryCount:   number;
  duration:     number;      // milliseconds
  os:           string;      // e.g. "Darwin 24.4.0 (arm64)"
  buildNumber:  string;      // from BUILD_NUMBER or GITHUB_RUN_NUMBER or 'local'
  priority?:    string;      // optional override: 'Highest'|'High'|'Medium'|'Low'|'Lowest'
}
```

### Priority Override via Test Annotation
To set a custom Jira priority on a specific test:
```typescript
test('TC-L03 - login success must display user email',
  {
    annotation: [
      { type: 'jira-priority', description: 'High' },
      { type: 'jira-severity', description: 'High' },
      { type: 'failure-reason', description: 'UX gap — user identity not visible after login' },
    ],
  },
  async ({ page }) => { ... }
);
```
If no annotation is set, priority is auto-derived from the test title (security → Highest, login negative → High, UI → Medium).

### Bug Card Jira Fields
| Field | Value |
|-------|-------|
| issuetype | Bug |
| priority | Annotation override OR auto-derived |
| labels | `playwright-automation`, `regression`, `<browser>`, `tc###`, `<module>-module`, `<test-type>`, `severity-<level>`, `build-<N>`, `env-<name>` |
| description | ADF — Bug Summary, Test Details, Priority/Severity, Preconditions, Steps, Expected, Actual, Playwright Error, Root Cause Suggestion, Evidence, Reproducibility, Automation Details |
| attachments | Screenshot PNG + video WebM + trace zip — uploaded via `POST /issue/{key}/attachments` |
| assignee | from `JIRA_ASSIGNEE_ID` in .env (optional) |
| sprint | from `JIRA_SPRINT_ID` in .env → `customfield_10020` (optional) |

Note: The `environment` field is NOT set on card creation — it is not available on the create screen in all Jira Cloud projects and causes a 400 error. Environment info is included in the ADF description instead.

### Module Summary Card (Passed Tests — CI only)
| Field | Value |
|-------|-------|
| issuetype | Task |
| summary | `[QA PASSED] Login Module — Automation Summary (Build #42)` |
| priority | Low |
| labels | `playwright-automation`, `test-passed-summary`, `<module>-module`, `build-<N>` |
| description | ADF — all passed TCs listed in table with browser + duration |

### Jira Card State Rules
| Situation | Card State | Triggered By |
|-----------|-----------|-------------|
| Test fails on last retry | **TO DO** (new card) | `cleanupDuplicateBugs` + `createJiraBug` in `jiraReporter.ts onEnd` |
| Test fails (existing open card) | **TO DO** (reuses existing) | `findOpenBug` inside `createJiraBug` skips creation |
| Test passes (had open bug card) | **DONE** | `closeResolvedBugs` in `fixtures.ts afterEach` |
| Multiple open cards for same test+browser | Oldest → **DONE**, newest stays **TO DO** | `cleanupDuplicateBugs` before `createJiraBug` |
| Retried test (not last attempt) | No card created | `onTestEnd` defers until `result.retry >= test.retries` |

### Retry Deduplication
`jiraReporter.ts` uses `Map<string, TestResult>` keyed by `test.id::browser`. `map.set()` always overwrites with the latest attempt — retried tests appear exactly once in the terminal table, with the final attempt's result. Bug tasks are only queued on the last attempt (`result.retry >= test.retries`).

---

## npm Scripts

```bash
npm test                                                    # Run all tests (3 browsers)
npm run test:headed                                         # Run with visible browser window
npm run test:ui                                             # Open Playwright interactive UI
npm run test:report                                         # Open last HTML report in browser
npm run test:chromium                                       # Chromium only
npm run test:debug                                          # Step-through debugger

npx playwright test --grep "TC-L03"                         # Run one TC across all browsers
npx playwright test --grep "TC-L03" --project=chromium      # One TC, one browser
npx playwright test tests/login.spec.ts                     # Login spec only, all browsers

CI=true npx playwright test                                 # Force Jira module summaries + run task locally
npx tsx scripts/createBugCards.ts                           # Manually post historical bug cards
```

---

## How to Add a New Test Case

1. Assign the next available TC ID (see registry above — next is `TC-L05`)
2. Add test data to `data/testData.ts` if new inputs are needed
3. Add page methods to the correct `pages/` class if new UI actions are needed
4. Add the test to `tests/login.spec.ts` (or a new spec file if a new module):
   ```typescript
   import { test } from './fixtures';  // ← always fixtures, never @playwright/test

   // Basic test
   test('TC-L05 - description here', async ({ page }) => { ... });

   // Test with custom Jira priority and annotations
   test('TC-L05 - description here',
     {
       annotation: [
         { type: 'jira-priority', description: 'High' },
         { type: 'jira-severity', description: 'Medium' },
         { type: 'failure-reason', description: 'Why this fails if intentional' },
       ],
     },
     async ({ page }) => { ... }
   );
   ```
5. Update the TC registry table in this CLAUDE.md file
6. Update "Next available TC IDs" line in this file

---

## How to Add a New Page

1. Create `pages/NewPage.ts`:
   ```typescript
   import { Page, expect } from '@playwright/test';
   import { BasePage } from './BasePage';
   export class NewPage extends BasePage {
     constructor(page: Page) { super(page); }
   }
   ```
2. Add methods for navigation, actions, and assertions
3. Import and use in spec files
4. Add new selectors to the Known Selectors table above

---

## Known Issues & Historical Fixes

| Issue | Root Cause | Fix Applied | File | Status |
|-------|-----------|-------------|------|--------|
| Attachment paths empty in fixtures.ts | `testInfo.attachments` is populated AFTER afterEach runs (browser context teardown) | Moved bug creation to `jiraReporter.ts onTestEnd` where `result.attachments` are finalized | `utils/jiraReporter.ts` | ✅ Fixed |
| Duplicate results for retried tests | `onTestEnd` fires per attempt; `results[]` array accumulated one entry per retry | Replaced array with `Map<testId::browser>` — always overwrites with latest attempt | `utils/jiraReporter.ts` | ✅ Fixed |
| `extractTcId` didn't match TC-L01 format | Regex `/TC(\d+)/i` — only matched numeric IDs like TC101 | Updated to `/TC[-A-Za-z]*\d+/i` — matches TC-L01, TC-L02, TC201 etc. | `utils/jiraHelper.ts` | ✅ Fixed |
| `environment` field caused Jira 400 | Field not on create screen in all Jira Cloud projects | Removed from fields object; info now lives in ADF description | `utils/jiraHelper.ts` | ✅ Fixed |
| `dotenv.config()` path-dependent | No explicit path — relied on `process.cwd()` being project root | Changed to `path.resolve(__dirname, '../.env')` | `utils/jiraHelper.ts` | ✅ Fixed |
| No Jira pre-flight visibility | Silent failures — no way to tell if config/auth was wrong | Added `validateJiraConfig()` + `testJiraConnection()` called at start of `onEnd` | `utils/jiraHelper.ts`, `utils/jiraReporter.ts` | ✅ Fixed |
| Enterprise ID `fill()` type error | Field is `input[type=number]`, rejects non-numeric strings | Changed to `pressSequentially()` | `pages/LoginPage.ts` | ✅ Fixed |
| Firefox `networkidle` timeout | App has live API polling — Firefox never reaches networkidle | Changed to `waitForLoadState('load')` | `pages/BasePage.ts` | ✅ Fixed |
| Jira GET `/search` returns 404 | Jira deprecated GET endpoint | Migrated to `POST /rest/api/3/search/jql` | `utils/jiraHelper.ts` | ✅ Fixed |
| Duplicate Jira bug cards | No dedup check before creation | `findOpenBug()` JQL check + `cleanupDuplicateBugs()` before every create | `utils/jiraHelper.ts` | ✅ Fixed |
| Screenshots stored as text path in Jira | Old code wrote local path into description | Now uploads actual file via `POST /issue/{key}/attachments` using `form-data` | `utils/jiraHelper.ts` | ✅ Fixed |
| Old script cards not auto-closed | `closeResolvedBugs` searched only by label, not by summary | Now runs dual JQL search: labels + summary match | `utils/jiraHelper.ts` | ✅ Fixed |
| TC-L03 — no user email on dashboard | App renders no visible email after login (UX gap) | Intentional failing test — Jira card auto-created | `tests/login.spec.ts` | ❌ App bug (by design) |
| TC-L04 — error is global toast, not in-form | App renders login error outside the `<form>` element | Intentional failing test — Jira card auto-created | `tests/login.spec.ts` | ❌ App bug (by design) |

---

## Environment Variables — All Required

```bash
# App under test
BASE_URL=https://measurement-dashboard-dev.magicktech.com
TEST_ENV=dev

# Test credentials
TEST_ENTERPRISE_ID=8253714198
TEST_EMAIL=superadmin@magicktech.com
TEST_PASSWORD=12345678
TEST_INVALID_EMAIL=wrong@example.com
TEST_INVALID_PASSWORD=wrongpassword

# Jira
JIRA_BASE_URL=https://selva-ragavan.atlassian.net
JIRA_EMAIL=selvaragavan1706@gmail.com
JIRA_API_TOKEN=<api-token>
JIRA_PROJECT_KEY=KAN
JIRA_DEVELOPER_NAME=Developer
JIRA_ASSIGNEE_ID=           # optional — leave blank if not assigning

# Optional
JIRA_SPRINT_ID=             # Sprint ID number from Jira Software — assigns bugs to active sprint
BUILD_NUMBER=               # Set by CI. Falls back to GITHUB_RUN_NUMBER, then 'local'
```

`.env.example` (committed to git) contains all keys with empty values for onboarding.

---

## Code Style

- **No comments** unless the WHY is non-obvious (hidden constraint, workaround, surprise for reader)
- **No `any` types** unless unavoidable — Jira field payloads use `Record<string, unknown>`
- **All async must `await`** — no floating promises anywhere
- **Page methods return `void`** unless returning data
- **ADF builder helpers** (`h2`, `para`, `codeBlock`, `bulletList`, `orderedList`) stay local to the file using them
- **Scripts run via `npx tsx`** — no compilation step needed
- **Never use `--no-verify`** on git commits — fix the underlying issue instead

---

## Developer Message Format (Terminal Output)

```
Hi Developer, please find the QA automation report below.

❌ FAILED TESTS — ACTION REQUIRED:
  • [Module] <test name> (<browser>)
    Jira: KAN-XX → https://selva-ragavan.atlassian.net/browse/KAN-XX
    Error: <first line of Playwright error>

✅ PASSED TESTS — No action needed:
  • [Module] <test name> (<browser>) — Working fine

Please fix only the FAILED items and reply once done.
```

---

## QA Report Format (for manual reporting)

When asked to generate a QA report, always use this structure:
1. **Summary table** — Module | TC ID | Test Name | Browser | Status | Jira Card
2. **Jira Bug Cards** — FAILED tests only, one card per test per browser, grouped by module
3. **Passed Tests** — listed by module, marked "No individual card — covered in module summary"
4. **Developer Message** — professional message with failed vs passed separation

Rule: `PASSED = "No individual card"` in the table. Passed tests appear only in the module summary Task (CI only).
