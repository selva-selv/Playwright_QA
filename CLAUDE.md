# SnapMeasure QA Framework — CLAUDE.md

This file is read by Claude Code at the start of every session.
Follow everything written here without being asked.

---

## Project Identity

| Key | Value |
|-----|-------|
| Framework | Playwright + TypeScript end-to-end QA automation |
| App Under Test | SnapMeasure Dashboard |
| Base URL | `https://measurement-dashboard-dev.magicktech.com` |
| Login Path | `/login` |
| Git Branch (active) | `dev` |
| Git Branch (main) | `main` |
| Jira Project | `KAN` at `https://selva-ragavan.atlassian.net` |
| Jira API | REST v3 — always `POST /rest/api/3/search/jql` (GET `/search` is deprecated) |
| Last Full Run | 2026-05-20 — **54/54 PASSED** across Chromium, Firefox, WebKit |

---

## Strict Rules — Never Break These

1. **PASSED test → NO Jira card. Ever.**
   The `afterEach` in `tests/fixtures.ts` is gated strictly on `status === 'failed'`. Never call any Jira function outside that block.

2. **FAILED test → One Jira Bug card per test per browser.**
   TC109 chromium = KAN-9. TC109 firefox = KAN-10. TC109 webkit = KAN-11. Always separate cards.

3. **No duplicates — always check first.**
   Call `findOpenBug()` before every `createJiraBug()`. Skip creation if an open bug with matching summary already exists in Jira.

4. **Never hardcode credentials.**
   All secrets live in `.env`, read via `process.env`. The `.env` file is gitignored and must never be committed.

5. **Never use `waitForLoadState('networkidle')`.**
   The app has live API polling that keeps network activity alive in Firefox — networkidle never resolves. Always use `waitForLoadState('load')`.

6. **Enterprise ID field uses `pressSequentially()`, never `fill()`.**
   The field is `input[type=number]`. Playwright's `fill()` rejects non-numeric strings on number inputs. Use `getByPlaceholder('123456789').pressSequentially(value)`.

7. **`moduleResolution` must stay `"node16"`.**
   Never revert to `"node"` — it is deprecated in TypeScript 5+ and causes import resolution warnings.

8. **Never duplicate Jira logic in spec files.**
   Only `utils/jiraHelper.ts` talks to Jira. Only `tests/fixtures.ts` triggers it. Spec files never call Jira APIs directly.

9. **Always import `test` from `'./fixtures'`, not `'@playwright/test'`.**
   The `afterEach` Jira hook only runs when using the fixtures-extended `test`. Importing from `@playwright/test` bypasses it silently.

10. **Never commit `scripts/createBugCards.ts` output to the test suite.**
    Scripts in `scripts/` are one-time utilities. Do not import or call them from spec files or jiraHelper.

---

## Repository Structure

```
my-qa-framework/
│
├── tests/
│   ├── form.spec.ts           Login module — TC101–TC103 (positive), TC108–TC113 (negative/security)
│   ├── dashboard.spec.ts      Dashboard module — TC104–TC107, uses beforeEach login
│   ├── e2e.spec.ts            End-to-end journeys — TC120–TC124, uses beforeEach login + URL assert
│   └── fixtures.ts            Extends base test — afterEach creates Jira bug on FAILED only
│
├── pages/
│   ├── BasePage.ts            Parent class — goto(path), waitForPageLoad()
│   ├── LoginPage.ts           navigate(), login(), submitForm(), expectLoginError(), expectLoginSuccess()
│   └── DashboardPage.ts       expectDashboardVisible(), expectNavbarVisible(), expectSidebarVisible(),
│                              clickSidebarItem(), getSidebarItems(), navigateToSection(), expectSectionLoaded()
│
├── data/
│   └── testData.ts            validUser, invalidUser, negativeUsers — all values from .env
│
├── utils/
│   ├── jiraHelper.ts          createJiraBug(), createTestRunSummary(), findOpenBug() — Jira REST v3
│   └── jiraReporter.ts        Custom Playwright Reporter — terminal table + Jira Task after all tests
│
├── scripts/
│   ├── createBugCards.ts      One-time: posts 5 historical bug cards (TC109 ×3, TC113 ×2) to Jira
│   └── createTC113Webkit.ts   One-time: posts TC113 WebKit card (KAN-14) — duplicate check workaround
│
├── playwright.config.ts       baseURL, fullyParallel, 3 browsers, reporters, screenshot on failure
├── .env                       All secrets — gitignored
├── tsconfig.json              target ESNext, module Node16, strict, skipLibCheck, types:["node"]
├── package.json               devDeps: @playwright/test, typescript, dotenv, @types/node | dep: axios
├── qa-framework-docs.html     Full framework documentation webpage (dark-themed, sidebar nav)
└── CLAUDE.md                  This file
```

---

## Playwright Config Summary

```typescript
// playwright.config.ts
testDir:        './tests'
fullyParallel:  true
retries:        CI ? 2 : 0
workers:        CI ? 1 : undefined
baseURL:        'https://measurement-dashboard-dev.magicktech.com'
trace:          'on-first-retry'
screenshot:     'only-on-failure'             // saved to test-results/<name>/test-failed-1.png
reporters:      ['list', ['html', { open: 'on-failure' }], ['./utils/jiraReporter.ts']]
browsers:       chromium (Desktop Chrome), firefox (Desktop Firefox), webkit (Desktop Safari)
```

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

### `pages/DashboardPage.ts` — extends BasePage
```typescript
expectDashboardVisible()                      → expect(page).not.toHaveURL('/login') + waitForPageLoad()
expectNavbarVisible()                         → expect(locator('.v-avatar').first()).toBeVisible()
expectSidebarVisible()                        → expect(getByText('Enterprise').first()).toBeVisible()
clickSidebarItem(itemName: string)            → getByText(itemName, {exact:true}).first().click() + waitForPageLoad()
getSidebarItems(): Promise<string[]>          → checks all 8 known items, returns found ones
navigateToSection(sectionName: string)        → getByText(sectionName, {exact:true}).first().click() + waitForPageLoad()
expectSectionLoaded(sectionName: string)      → expect getByText(sectionName).first() visible + not.toHaveURL('/login')
```

Known sidebar items list (from `getSidebarItems()`):
```
['Enterprise', 'User', 'Project', 'Customer', 'Plan', 'App Settings', 'Access Control', 'Account Settings']
```

---

## Test Case Registry

| TC ID | Spec File | Module | Type | Description |
|-------|-----------|--------|------|-------------|
| TC101 | form.spec.ts | Login | Positive | Valid credentials → redirect away from /login |
| TC102 | form.spec.ts | Login | Positive | Invalid credentials → error message shown |
| TC103 | form.spec.ts | Login | Positive | Empty form submit → validation message shown |
| TC104 | dashboard.spec.ts | Dashboard | UI | Dashboard page loads after login |
| TC105 | dashboard.spec.ts | Dashboard | UI | Navbar (.v-avatar) visible on dashboard |
| TC106 | dashboard.spec.ts | Dashboard | UI | Sidebar ("Enterprise" text) visible |
| TC107 | dashboard.spec.ts | Dashboard | UI | Sidebar contains at least one navigation item |
| TC108 | form.spec.ts | Login | Negative | Wrong password (WrongPass@999) with valid ID + email → error |
| TC109 | form.spec.ts | Login | Negative | Invalid email format ("not-a-valid-email") → validation shown |
| TC110 | form.spec.ts | Login | Negative | Wrong enterprise ID ("0000000000") → error |
| TC111 | form.spec.ts | Login | Negative | Empty email field → validation shown |
| TC112 | form.spec.ts | Login | Negative | Empty password field → validation shown |
| TC113 | form.spec.ts | Login | Security | SQL injection payload rejected, no unauthorized access |
| TC120 | e2e.spec.ts | E2E | Journey | Full login → dashboard with sidebar + navbar both visible |
| TC121 | e2e.spec.ts | E2E | Journey | Login → navigate to Enterprise section via sidebar |
| TC122 | e2e.spec.ts | E2E | Journey | Login → navigate to User section via sidebar |
| TC123 | e2e.spec.ts | E2E | Journey | Login → navigate to Project section via sidebar |
| TC124 | e2e.spec.ts | E2E | Journey | Login → navigate to Customer section via sidebar |

**Next available TC IDs:**
- `TC114` — next Login/Negative test
- `TC108` series — all used (TC108–TC113)
- `TC125` — next E2E test
- `TC201+` — new module (e.g. Settings, Reports)

---

## beforeEach Patterns Per Spec File

### `form.spec.ts`
No `beforeEach` — each test navigates and acts independently.
```typescript
// Each test does its own:
await loginPage.navigate();
await loginPage.login(...);
```

### `dashboard.spec.ts`
Has `beforeEach` that logs in but does **not** assert the URL:
```typescript
test.beforeEach(async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login(validUser.enterpriseId, validUser.email, validUser.password);
  // no URL assertion here
});
```

### `e2e.spec.ts`
Has `beforeEach` that logs in **and** asserts URL changed:
```typescript
test.beforeEach(async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login(validUser.enterpriseId, validUser.email, validUser.password);
  await expect(page).not.toHaveURL('/login');  // ← extra assertion
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
| App error message (exact) | `"The Email field must be a valid email"` | Actual text shown by app for invalid email / SQL injection |
| Navbar | `.v-avatar` (first) | Framework: Vuetify v-avatar in top bar |
| Sidebar detection | `getByText('Enterprise').first()` | First sidebar menu item always visible after login |
| Sidebar item click | `getByText(name, { exact: true }).first()` | Use exact match to avoid partial matches |

---

## Jira Integration

### Connection
```typescript
// utils/jiraHelper.ts
baseURL:  process.env.JIRA_BASE_URL + '/rest/api/3'
auth:     Basic — Buffer.from(`${email}:${apiToken}`).toString('base64')
```

### Functions
| Function | What It Does |
|----------|-------------|
| `createJiraBug(title, error, browser, screenshot?)` | Checks duplicate → creates Bug card in KAN |
| `findOpenBug(summary)` | POST `/search/jql` — returns key if open bug found, null if not |
| `createTestRunSummary(results)` | Creates one Jira Task after all tests with full results table + developer message |

### Bug Card Fields
| Field | Value |
|-------|-------|
| issuetype | Bug |
| priority | High (default) / Highest (security tests) |
| labels | `playwright-automation`, `regression`, `<browser>`, `TC###`, `<module>-module` |
| description | ADF — Environment, Steps, Expected, Actual, Playwright Error, Screenshot |
| assignee | from `JIRA_ASSIGNEE_ID` in .env (optional) |

### Test Run Summary Card Fields
| Field | Value |
|-------|-------|
| issuetype | Task |
| priority | Low (all passed) / High (any failed) |
| labels | `test-run`, `playwright-automation` |
| description | ADF — results table, pass/fail count, developer message |
| summary | `[QA Test Run] <date> — ✅ ALL PASSED (54/54)` |

### Current Jira Cards in KAN

| Card | Type | TC | Browser | Description | Status |
|------|------|----|---------|-------------|--------|
| KAN-8 | Task | — | All | Test Run Summary — 54/54 passed (2026-05-20) | Open |
| KAN-9 | Bug | TC109 | Chromium | Invalid Email — regex mismatch (fixed in code) | Open |
| KAN-10 | Bug | TC109 | Firefox | Invalid Email — regex mismatch (fixed in code) | Open |
| KAN-11 | Bug | TC109 | WebKit | Invalid Email — regex mismatch (fixed in code) | Open |
| KAN-12 | Bug | TC113 | Chromium | SQL Injection — regex mismatch + security note | Open |
| KAN-13 | Bug | TC113 | Firefox | SQL Injection — regex mismatch + security note | Open |
| KAN-14 | Bug | TC113 | WebKit | SQL Injection — regex mismatch + security note | Open |

**Next card: KAN-15**

> Note on KAN-9 to KAN-14: The app behaved correctly for both TC109 and TC113. The bug was in the test code's locator regex missing "valid email". Fixed in `LoginPage.ts:22`. No app code change is needed for these cards.

---

## npm Scripts

```bash
npm test                                        # Run all 54 tests (3 browsers)
npm run test:headed                             # Run with visible browser window
npm run test:ui                                 # Open Playwright interactive UI
npm run test:report                             # Open last HTML report in browser
npm run test:chromium                           # Chromium only (18 tests)
npm run test:debug                              # Step-through debugger

npx playwright test --grep "TC109"              # Run one TC across all browsers
npx playwright test --grep "TC109" --project=chromium  # One TC, one browser
npx playwright test tests/form.spec.ts          # One spec file, all browsers
npx playwright test tests/form.spec.ts --headed # One file, visible browser

npx tsx scripts/createBugCards.ts               # Manually post historical bug cards to Jira
npx tsx scripts/createTC113Webkit.ts            # Manually post TC113 WebKit card to Jira
```

---

## How to Add a New Test Case

1. Assign the next available TC ID (see registry above)
2. Add test data to `data/testData.ts` if new inputs are needed
3. Add page methods to the correct `pages/` class if new UI actions are needed
4. Add the test to the correct spec file:
   ```typescript
   import { test } from './fixtures';  // ← always fixtures, never @playwright/test
   test('TC125 - description here', async ({ page }) => { ... });
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
     // add methods here
   }
   ```
2. Add methods for navigation, actions, and assertions
3. Import and use in spec files
4. Add new selectors to the Known Selectors table above

---

## How to Create a Jira Bug Card Manually

Use `scripts/createBugCards.ts` as the template. Key steps:
1. Define the bug card object implementing `BugCard` interface
2. Call `findExisting(summary)` to check for duplicate
3. Call `axios.post('/rest/api/3/issue', { fields: { ... } })` with ADF description
4. Run with: `npx tsx scripts/createBugCards.ts`

### Required ADF Sections for Every Bug Card
1. **Bug Details** — TC ID, Browser, Module, Environment URL, Test File path
2. **Preconditions** — app reachable, page accessible, no active session
3. **Steps to Reproduce** — numbered list with exact input values
4. **Expected Result** — what should have happened
5. **Actual Result** — what the app actually did
6. **Playwright Error (Exact)** — full stack trace in `codeBlock` ADF node
7. **Root Cause** — why it failed
8. **Security Observation** — only for TC113 and future security tests
9. **Fix Applied** — if already fixed, describe the fix
10. **Screenshot** — path to `test-results/<test-name>/test-failed-1.png`

---

## Known Issues & Historical Fixes

| Issue | Root Cause | Fix Applied | File | Status |
|-------|-----------|-------------|------|--------|
| TC109 + TC113 failed all 3 browsers | `expectLoginError()` regex missing `valid email` — app returns "The Email field must be a valid email" | Added `valid email\|wrong\|failed\|denied` to regex | `pages/LoginPage.ts:22` | ✅ Fixed |
| Enterprise ID `fill()` type error | Field is `input[type=number]`, rejects non-numeric strings from `fill()` | Changed to `pressSequentially()` | `pages/LoginPage.ts:15` | ✅ Fixed |
| Firefox `networkidle` timeout on dashboard | App has live API polling — Firefox never reaches networkidle | Changed to `waitForLoadState('load')` | `pages/BasePage.ts:11` | ✅ Fixed |
| Sidebar `.v-navigation-drawer` hidden | Selector resolved to Vuetify theme wrapper (hidden), not the actual sidebar content | Use `getByText('Enterprise').first()` instead | `pages/DashboardPage.ts:21` | ✅ Fixed |
| Navbar `.v-app-bar` not found | Element not present at that selector in current app version | Use `.v-avatar` which is always in the top bar | `pages/DashboardPage.ts:16` | ✅ Fixed |
| Jira GET `/search` returns 404 | Jira deprecated GET `/rest/api/3/search` | Migrated to `POST /rest/api/3/search/jql` | `utils/jiraHelper.ts:60` | ✅ Fixed |
| Duplicate Jira bug cards created | No duplicate check before bug creation | Added `findOpenBug()` JQL check before every `POST /issue` | `utils/jiraHelper.ts:58` | ✅ Fixed |
| TC113 WebKit card created as duplicate of Chromium | `findExisting()` matched first 55 chars — both share same prefix | Created WebKit card separately via `scripts/createTC113Webkit.ts` with a different summary | `scripts/` | ✅ Fixed |

---

## Environment Variables — All Required

```bash
# Jira
JIRA_BASE_URL=https://selva-ragavan.atlassian.net
JIRA_EMAIL=selvaragavan1706@gmail.com
JIRA_API_TOKEN=<api-token>
JIRA_PROJECT_KEY=KAN
JIRA_DEVELOPER_NAME=Developer
JIRA_ASSIGNEE_ID=                    # optional — leave blank if not assigning

# Test credentials
TEST_ENTERPRISE_ID=8253714198
TEST_EMAIL=superadmin@magicktech.com
TEST_PASSWORD=12345678
TEST_INVALID_EMAIL=wrong@example.com
TEST_INVALID_PASSWORD=wrongpassword
```

---

## Code Style

- **No comments** unless the WHY is non-obvious (hidden constraint, workaround, surprise for reader)
- **No `any` types** unless unavoidable — Jira field payloads use `Record<string, any>`
- **All async must `await`** — no floating promises anywhere
- **Page methods return `void`** unless returning data (`getSidebarItems()` returns `string[]`)
- **ADF builder helpers** (`h2`, `para`, `code`, `bulletList`, `orderedList`) stay local to the file using them
- **Scripts run via `npx tsx`** — no compilation step needed
- **Never use `--no-verify`** on git commits — fix the underlying issue instead

---

## Developer Message Format (Jira Task)

```
Hi Developer, please find the QA automation report below.

❌ FAILED TESTS — ACTION REQUIRED:
  • <test name> [<KAN-XX>] (<browser>)
    Error: <first line of Playwright error>

✅ PASSED TESTS — No action needed:
  • <test name> (<browser>) — Working fine

Please fix only the FAILED items and reply once done.
```

---

## QA Report Format (for manual reporting)

When asked to generate a QA report, always use this structure:
1. **Summary table** — Module | TC ID | Test Name | Browser | Status | Jira Card
2. **Jira Bug Cards** — FAILED tests only, one card per test per browser, grouped by module
3. **Passed Tests** — listed by module, explicitly marked "No Jira card — no action needed"
4. **Developer Message** — professional message with failed vs passed separation

Rule: `PASSED = "No card created"` in the table. Never write a Jira card entry for a passing test.
