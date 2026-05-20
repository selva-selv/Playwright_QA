import axios from 'axios';
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL  = process.env.JIRA_BASE_URL!;
const EMAIL     = process.env.JIRA_EMAIL!;
const API_TOKEN = process.env.JIRA_API_TOKEN!;
const PROJECT   = process.env.JIRA_PROJECT_KEY!;
const ENV_URL   = 'https://measurement-dashboard-dev.magicktech.com';

const auth    = { username: EMAIL, password: API_TOKEN };
const headers = { 'Content-Type': 'application/json' };

// ── Duplicate check ────────────────────────────────────────────────────────────
async function findExisting(summary: string): Promise<string | null> {
  try {
    const res = await axios.post(
      `${BASE_URL}/rest/api/3/search/jql`,
      {
        jql: `project = ${PROJECT} AND summary ~ "${summary.substring(0, 55).replace(/"/g, '\\"')}" AND issuetype = Bug AND statusCategory != Done`,
        fields: ['summary', 'key'],
        maxResults: 5,
      },
      { auth, headers }
    );
    return res.data.issues?.length > 0 ? res.data.issues[0].key : null;
  } catch {
    return null;
  }
}

// ── ADF builder ────────────────────────────────────────────────────────────────
function h2(text: string) {
  return { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] };
}

function para(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function code(text: string) {
  return { type: 'codeBlock', attrs: { language: 'text' }, content: [{ type: 'text', text }] };
}

function buildAdf(card: BugCard) {
  const stepsText = card.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return {
    version: 1,
    type: 'doc',
    content: [
      h2('Bug Details'),
      para(`Test Case ID : ${card.tcId}\nBrowser      : ${card.browser}\nModule       : Login Module\nEnvironment  : ${ENV_URL}\nTest File    : tests/form.spec.ts`),

      h2('Preconditions'),
      para(
        '1. Application is reachable at: ' + ENV_URL + '\n' +
        '2. Login page is accessible at /login\n' +
        '3. No active session exists for the test user'
      ),

      h2('Steps to Reproduce'),
      para(stepsText),

      h2('Expected Result'),
      para(card.expected),

      h2('Actual Result'),
      para(card.actual),

      h2('Playwright Error (Exact)'),
      code(card.error),

      h2('Root Cause'),
      para(
        'The application displays: "The Email field must be a valid email"\n' +
        'The word "valid" was missing from the Playwright locator regex:\n' +
        '  BEFORE: /invalid|incorrect|error|required/i\n' +
        '  AFTER:  /invalid|incorrect|error|required|valid email|wrong|failed|denied/i\n\n' +
        'This caused a locator mismatch and a 15-second timeout on all 3 browsers.'
      ),

      ...(card.securityNote
        ? [h2('Security Observation'), para(card.securityNote)]
        : []),

      h2('Fix Applied'),
      para('Updated regex in pages/LoginPage.ts line 22.\nAll 3 browsers now pass after the fix.'),

      h2('Screenshot'),
      para(card.screenshotPath),
    ],
  };
}

// ── Card creator ───────────────────────────────────────────────────────────────
interface BugCard {
  summary:       string;
  browser:       string;
  tcId:          string;
  priority:      string;
  labels:        string[];
  steps:         string[];
  expected:      string;
  actual:        string;
  error:         string;
  screenshotPath:string;
  securityNote?: string;
}

async function createCard(card: BugCard): Promise<string> {
  const existing = await findExisting(card.summary);
  if (existing) {
    console.log(`⚠️  Already exists: ${existing} — skipping "${card.summary.substring(0, 65)}"`);
    return existing;
  }

  const res = await axios.post(
    `${BASE_URL}/rest/api/3/issue`,
    {
      fields: {
        project:     { key: PROJECT },
        summary:     card.summary,
        issuetype:   { name: 'Bug' },
        priority:    { name: card.priority },
        labels:      card.labels,
        description: buildAdf(card),
      },
    },
    { auth, headers }
  );

  console.log(`✅ Created ${res.data.key} — ${card.summary.substring(0, 65)}`);
  return res.data.key as string;
}

// ── Shared data ────────────────────────────────────────────────────────────────
const TC109_ERROR = `Error: expect(locator).toBeVisible() failed
Received:  <hidden>

Locator:   getByText(/invalid|incorrect|error|required/i)
Timeout:   15000ms exceeded

  at LoginPage.expectLoginError (pages/LoginPage.ts:22)
  at Object.<anonymous> (tests/form.spec.ts:49)`;

const TC113_ERROR = `Error: expect(locator).toBeVisible() failed
Received:  <hidden>

Locator:   getByText(/invalid|incorrect|error|required/i)
Timeout:   15000ms exceeded

  at LoginPage.expectLoginError (pages/LoginPage.ts:22)
  at Object.<anonymous> (tests/form.spec.ts:93)`;

const TC109_STEPS = [
  'Open ' + ENV_URL + '/login',
  'Enter Enterprise ID: 8253714198',
  'Enter Email: not-a-valid-email  ← intentionally invalid format',
  'Enter Password: (valid password from .env)',
  'Click the "Login" button',
  'Observe the UI — check for visible validation error message',
];

const TC113_STEPS = [
  'Open ' + ENV_URL + '/login',
  'Enter Enterprise ID: 8253714198',
  "Enter Email:    ' OR '1'='1   ← SQL injection payload",
  "Enter Password: ' OR '1'='1   ← SQL injection payload",
  'Click the "Login" button',
  'Observe whether authentication is rejected and an error message is visible',
];

const TC109_EXPECTED =
  'Application should display a visible validation error message containing one of: ' +
  '"invalid", "incorrect", "error", or "required" — indicating the email format is rejected.';

const TC109_ACTUAL =
  'Application displayed: "The Email field must be a valid email"\n' +
  'This text was NOT matched by the locator regex /invalid|incorrect|error|required/i\n' +
  'Test timed out after 15000ms waiting for the error element to appear.';

const TC113_EXPECTED =
  'Application must REJECT the SQL injection payload and display a visible error message ' +
  'confirming login was denied. Text matching /invalid|incorrect|error|required/i must be ' +
  'visible within 15 seconds.';

const TC113_ACTUAL =
  'Application displayed: "The Email field must be a valid email"\n' +
  'Email format validation fired BEFORE the authentication attempt.\n' +
  'The displayed text did NOT match the locator regex — test timed out after 15000ms.\n' +
  'NOTE: No unauthorized access was granted — the payload was blocked.';

const TC113_SECURITY =
  'The application correctly rejected the SQL injection payload at the email format ' +
  'validation layer (client-side / frontend). However, frontend validation alone is NOT ' +
  'sufficient as a security control. RECOMMENDATION: Verify that the backend API also ' +
  'independently sanitizes and rejects this input — do not rely solely on frontend guards.';

// ── All 6 bug cards ────────────────────────────────────────────────────────────
const CARDS: BugCard[] = [
  {
    summary:       '[BUG][Login] TC109 - Invalid Email Format Does Not Show Expected Validation Error (Chromium)',
    browser:       'Chromium (Chrome 136)',
    tcId:          'TC109',
    priority:      'High',
    labels:        ['playwright-automation','regression','login-module','negative-test','email-validation','TC109','chromium'],
    steps:         TC109_STEPS,
    expected:      TC109_EXPECTED,
    actual:        TC109_ACTUAL,
    error:         TC109_ERROR,
    screenshotPath:'test-results/form-TC109---invalid-email-format-shows-error-chromium/test-failed-1.png',
  },
  {
    summary:       '[BUG][Login] TC109 - Invalid Email Format Does Not Show Expected Validation Error (Firefox)',
    browser:       'Firefox',
    tcId:          'TC109',
    priority:      'High',
    labels:        ['playwright-automation','regression','login-module','negative-test','email-validation','TC109','firefox'],
    steps:         TC109_STEPS,
    expected:      TC109_EXPECTED,
    actual:        TC109_ACTUAL,
    error:         TC109_ERROR,
    screenshotPath:'test-results/form-TC109---invalid-email-format-shows-error-firefox/test-failed-1.png',
  },
  {
    summary:       '[BUG][Login] TC109 - Invalid Email Format Does Not Show Expected Validation Error (WebKit)',
    browser:       'WebKit (Desktop Safari)',
    tcId:          'TC109',
    priority:      'High',
    labels:        ['playwright-automation','regression','login-module','negative-test','email-validation','TC109','webkit'],
    steps:         TC109_STEPS,
    expected:      TC109_EXPECTED,
    actual:        TC109_ACTUAL,
    error:         TC109_ERROR,
    screenshotPath:'test-results/form-TC109---invalid-email-format-shows-error-webkit/test-failed-1.png',
  },
  {
    summary:       '[BUG][Login][Security] TC113 - SQL Injection Input Does Not Trigger Expected Error Assertion (Chromium)',
    browser:       'Chromium (Chrome 136)',
    tcId:          'TC113',
    priority:      'Highest',
    labels:        ['playwright-automation','regression','login-module','security-test','sql-injection','negative-test','TC113','chromium'],
    steps:         TC113_STEPS,
    expected:      TC113_EXPECTED,
    actual:        TC113_ACTUAL,
    error:         TC113_ERROR,
    screenshotPath:'test-results/form-TC113---SQL-injection-in-credentials-is-rejected-chromium/test-failed-1.png',
    securityNote:  TC113_SECURITY,
  },
  {
    summary:       '[BUG][Login][Security] TC113 - SQL Injection Input Does Not Trigger Expected Error Assertion (Firefox)',
    browser:       'Firefox',
    tcId:          'TC113',
    priority:      'Highest',
    labels:        ['playwright-automation','regression','login-module','security-test','sql-injection','negative-test','TC113','firefox'],
    steps:         TC113_STEPS,
    expected:      TC113_EXPECTED,
    actual:        TC113_ACTUAL,
    error:         TC113_ERROR,
    screenshotPath:'test-results/form-TC113---SQL-injection-in-credentials-is-rejected-firefox/test-failed-1.png',
    securityNote:  TC113_SECURITY,
  },
  {
    summary:       '[BUG][Login][Security] TC113 - SQL Injection Input Does Not Trigger Expected Error Assertion (WebKit)',
    browser:       'WebKit (Desktop Safari)',
    tcId:          'TC113',
    priority:      'Highest',
    labels:        ['playwright-automation','regression','login-module','security-test','sql-injection','negative-test','TC113','webkit'],
    steps:         TC113_STEPS,
    expected:      TC113_EXPECTED,
    actual:        TC113_ACTUAL,
    error:         TC113_ERROR,
    screenshotPath:'testingpath/test-results/form-TC113---SQL-injection-in-credentials-is-rejected-webkit/test-failed-1.png',
    securityNote:  TC113_SECURITY,
  },
];

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('  JIRA BUG CARD CREATOR — SnapMeasure QA');
  console.log('  Project: ' + PROJECT + ' | Cards to create: ' + CARDS.length);
  console.log('═'.repeat(70) + '\n');

  const created: string[] = [];

  for (const card of CARDS) {
    try {
      const key = await createCard(card);
      created.push(key);
    } catch (err: any) {
      const msg = err.response?.data?.errors ?? err.response?.data?.errorMessages ?? err.message;
      console.error(`❌ FAILED: "${card.summary.substring(0, 55)}"`);
      console.error('   Reason:', JSON.stringify(msg));
    }
  }

  console.log('\n' + '═'.repeat(70));
  console.log('  CREATED JIRA CARDS');
  console.log('─'.repeat(70));
  created.forEach(k => console.log(`  → ${k}  :  ${BASE_URL}/browse/${k}`));
  console.log('─'.repeat(70));
  console.log(`  Total: ${created.length} / ${CARDS.length} cards processed`);
  console.log('═'.repeat(70) + '\n');
}

main().catch(console.error);
