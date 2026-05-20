import axios from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ── Configuration ─────────────────────────────────────────────────────────────

const BASE_URL  = process.env.JIRA_BASE_URL   ?? '';
const EMAIL     = process.env.JIRA_EMAIL       ?? '';
const API_TOKEN = process.env.JIRA_API_TOKEN   ?? '';
const PROJECT   = process.env.JIRA_PROJECT_KEY ?? 'KAN';
const ASSIGNEE  = process.env.JIRA_ASSIGNEE_ID;
const ENV_URL   = process.env.BASE_URL         ?? 'https://measurement-dashboard-dev.magicktech.com';
const ENV_NAME  = process.env.TEST_ENV         ?? 'dev';
const BUILD_NO  = process.env.BUILD_NUMBER ?? process.env.GITHUB_RUN_NUMBER ?? 'local';
const SPRINT_ID = process.env.JIRA_SPRINT_ID ? Number(process.env.JIRA_SPRINT_ID) : undefined;
const BRANCH    = process.env.GITHUB_REF_NAME ?? 'dev';

const jira = axios.create({
  baseURL: `${BASE_URL}/rest/api/3`,
  auth:    { username: EMAIL, password: API_TOKEN },
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

// ── Public interfaces ──────────────────────────────────────────────────────────

export interface BugPayload {
  testTitle:    string;
  errorMessage: string;
  browser:      string;
  module:       string;
  specFile:     string;
  screenshot?:  string;
  video?:       string;
  trace?:       string;
  retryCount:   number;
  duration:     number;
  os:           string;
  buildNumber:  string;
  priority?:    string;
}

export interface PassedTest {
  title:    string;
  browser:  string;
  duration: number;
  module:   string;
}

export interface TestResult {
  title:    string;
  status:   'passed' | 'failed' | 'skipped';
  browser:  string;
  duration: number;
  module:   string;
  error?:   string;
  jiraKey?: string;
}

// ── Config validation ──────────────────────────────────────────────────────────

export function validateJiraConfig(): boolean {
  const W = 58;
  console.log('\n[Jira] ' + '─'.repeat(W));
  console.log('[Jira]  JIRA INTEGRATION — CONFIGURATION CHECK');
  console.log('[Jira] ' + '─'.repeat(W));

  const maskedEmail = EMAIL
    ? EMAIL.replace(/^(.{2})(.*)(@.+)$/, (_, a, _b, c) => `${a}***${c}`)
    : '';

  const items: Array<[string, string, boolean]> = [
    ['JIRA_BASE_URL',    BASE_URL  || '(not set)', !!BASE_URL],
    ['JIRA_EMAIL',       maskedEmail || '(not set)', !!EMAIL],
    ['JIRA_API_TOKEN',   API_TOKEN ? '(set — hidden)' : '(not set)', !!API_TOKEN],
    ['JIRA_PROJECT_KEY', PROJECT,   !!PROJECT],
  ];

  let allOk = true;
  for (const [key, value, ok] of items) {
    const icon = ok ? '✅' : '❌';
    console.log(`[Jira]   ${icon}  ${key.padEnd(22)} : ${value}`);
    if (!ok) allOk = false;
  }

  const optional: Array<[string, string]> = [
    ['JIRA_ASSIGNEE_ID',  ASSIGNEE  ? '(set)' : '(not set — skipped)'],
    ['JIRA_SPRINT_ID',    SPRINT_ID ? String(SPRINT_ID) : '(not set — skipped)'],
    ['JIRA_DEVELOPER_NAME', process.env.JIRA_DEVELOPER_NAME ?? '(not set — default: Developer)'],
  ];
  for (const [key, value] of optional) {
    console.log(`[Jira]   ℹ️   ${key.padEnd(22)} : ${value}`);
  }

  if (!allOk) {
    console.error('[Jira]');
    console.error('[Jira]  ❌ One or more required Jira credentials are missing.');
    console.error('[Jira]     Copy .env.example to .env and fill in all values.');
    console.error('[Jira]     Jira bug cards will NOT be created until this is fixed.');
  } else {
    console.log('[Jira]');
    console.log('[Jira]  ✅ All required credentials present.');
  }
  console.log('[Jira] ' + '─'.repeat(W));
  return allOk;
}

// ── Jira connectivity test ─────────────────────────────────────────────────────

export async function testJiraConnection(): Promise<boolean> {
  if (!BASE_URL || !EMAIL || !API_TOKEN) return false;
  try {
    console.log(`[Jira] Testing connection → GET ${BASE_URL}/rest/api/3/myself`);
    const res = await jira.get('/myself');
    const display = res.data.displayName ?? res.data.emailAddress ?? 'unknown';
    console.log(`[Jira] ✅ Connected as: ${display}`);
    return true;
  } catch (err: any) {
    const status = err.response?.status ?? 'N/A';
    const msg    = err.response?.data?.message ?? err.message ?? 'unknown error';
    console.error(`[Jira] ❌ Connection FAILED (HTTP ${status}): ${msg}`);
    if (status === 401) {
      console.error('[Jira]    → Check JIRA_EMAIL and JIRA_API_TOKEN in .env');
      console.error('[Jira]    → API token must be a Jira Cloud API token, not your account password');
      console.error('[Jira]    → Generate one at: https://id.atlassian.com/manage-profile/security/api-tokens');
    }
    if (status === 404) {
      console.error('[Jira]    → Check JIRA_BASE_URL — it must be your Atlassian domain (e.g. https://yourname.atlassian.net)');
    }
    return false;
  }
}

// ── Module detection ───────────────────────────────────────────────────────────

export function deriveModule(testTitle: string, describeName?: string): string {
  if (describeName && describeName.trim()) return describeName;
  const m = testTitle.match(/TC(\d+)/i);
  if (m) {
    const n = parseInt(m[1]);
    if (n >= 101 && n <= 103) return 'Login';
    if (n >= 104 && n <= 107) return 'Dashboard';
    if (n >= 108 && n <= 113) return 'Login';
    if (n >= 120 && n <= 124) return 'E2E';
    if (n >= 200)             return 'Strict Negative';
  }
  const t = testTitle.toLowerCase();
  if (t.includes('login') || t.includes('credential') || t.includes('password')) return 'Login';
  if (t.includes('dashboard') || t.includes('navbar') || t.includes('sidebar')) return 'Dashboard';
  if (t.includes('security') || t.includes('injection') || t.includes('xss'))   return 'Security';
  return 'General';
}

// ── Priority / severity / test-type ───────────────────────────────────────────

function derivePriority(testTitle: string): string {
  const t = testTitle.toLowerCase();
  if (t.includes('security') || t.includes('injection') || t.includes('xss') || t.includes('unauthorized')) return 'Highest';
  if (t.includes('login') && (t.includes('invalid') || t.includes('wrong') || t.includes('empty')))         return 'High';
  if (t.includes('dashboard') || t.includes('navigation'))                                                   return 'Medium';
  return 'High';
}

function deriveSeverityLabel(testTitle: string): string {
  const t = testTitle.toLowerCase();
  if (t.includes('security') || t.includes('injection') || t.includes('xss') || t.includes('unauthorized')) return 'severity-critical';
  if (t.includes('login') || t.includes('auth'))                                                             return 'severity-high';
  if (t.includes('dashboard') || t.includes('navigation'))                                                   return 'severity-medium';
  return 'severity-high';
}

function deriveTestType(testTitle: string): string {
  const t = testTitle.toLowerCase();
  if (t.includes('security') || t.includes('injection') || t.includes('xss')) return 'security-test';
  if (t.includes('invalid') || t.includes('wrong') || t.includes('empty') || t.includes('negative')) return 'negative-test';
  if (t.includes('e2e') || t.includes('flow') || t.includes('journey') || t.includes('navigate')) return 'e2e-test';
  return 'functional-test';
}

// Matches TC101, TC-L01, TC-L02, TC201 etc.
function extractTcId(testTitle: string): string {
  const m = testTitle.match(/TC[-A-Za-z]*\d+/i);
  return m ? m[0].toUpperCase() : 'N/A';
}

// ── Root cause intelligence ────────────────────────────────────────────────────

function suggestRootCause(errorMessage: string, testTitle: string): string {
  const e = errorMessage.toLowerCase();
  const t = testTitle.toLowerCase();

  if (e.includes('tobevisible') && e.includes('timeout')) {
    return (
      'LOCATOR MISMATCH or TIMING ISSUE\n' +
      '1. The selector or text does not match what the app actually renders — compare the regex against the live error text\n' +
      '2. The element renders after the timeout window — check for slow API calls delaying render\n' +
      '3. The expected text pattern does not cover all app message variants\n' +
      'Suggested action: Open the app, reproduce the flow manually, and read the exact text shown. Update the locator pattern to match.'
    );
  }
  if (e.includes('tohaveurl') || (e.includes('url') && t.includes('redirect'))) {
    return (
      'NAVIGATION FAILURE — URL DID NOT MATCH EXPECTED PATTERN\n' +
      '1. Login failed silently — verify TEST_EMAIL / TEST_PASSWORD / TEST_ENTERPRISE_ID in .env are correct\n' +
      '2. The app redirected to an error page (/500, /error) instead of the dashboard\n' +
      '3. The frontend route guard may not be redirecting unauthenticated users (CRITICAL: check auth middleware)\n' +
      'Suggested action: Check the network tab for the auth API response. Ensure the /login API returns 200 on valid credentials.'
    );
  }
  if (e.includes('not clickable') || e.includes('locator.click') || e.includes('intercepted by')) {
    return (
      'ELEMENT NOT INTERACTABLE\n' +
      '1. A modal, toast, or overlay is covering the element\n' +
      '2. The element is disabled or hidden behind a CSS animation that has not completed\n' +
      '3. The element is outside the visible viewport\n' +
      'Suggested action: Add expect(element).toBeVisible() before click. Check for overlapping elements in the screenshot.'
    );
  }
  if (e.includes('timeout') && t.includes('login')) {
    return (
      'LOGIN FLOW TIMEOUT\n' +
      '1. The backend auth API is slow or unreachable in CI\n' +
      '2. The application may be showing a CAPTCHA or rate-limiting this IP\n' +
      '3. Network connectivity issue between the CI runner and the app server\n' +
      'Suggested action: Manually verify the app is reachable at ' + ENV_URL + '. Check if auth API returns 200.'
    );
  }
  if (e.includes('strict mode violation') || e.includes('multiple elements')) {
    return (
      'MULTIPLE ELEMENTS MATCHED — SELECTOR IS AMBIGUOUS\n' +
      'The locator matches more than one element on the page. Make the selector more specific by:\n' +
      '1. Scoping to a parent container: page.locator(".form").getByText("Login")\n' +
      '2. Using .first() to target the first match\n' +
      '3. Using a more unique attribute: data-testid, aria-label, or role + name combination'
    );
  }
  if (t.includes('without login') || t.includes('unauthorized') || t.includes('redirect')) {
    return (
      'MISSING AUTHENTICATION GUARD — CRITICAL SECURITY ISSUE\n' +
      'The application allowed access to a protected route without an active session.\n' +
      '1. The frontend Vue Router is missing a navigation guard on this route\n' +
      '2. Add a beforeEach guard that checks session state and redirects to /login\n' +
      '3. Verify the backend also rejects unauthenticated API calls (frontend-only guards are insufficient)\n' +
      'PRIORITY: This must be fixed before any production release.'
    );
  }
  return (
    'ASSERTION FAILED\n' +
    'The Playwright assertion did not pass within the timeout window.\n' +
    '1. Review the Expected Result vs Actual Result above\n' +
    '2. Check the attached screenshot to see the exact app state at the point of failure\n' +
    '3. If the app behavior changed, update the assertion to match the new expected behavior\n' +
    '4. If this is a real bug, do not update the assertion — fix the app'
  );
}

// ── Steps derivation ───────────────────────────────────────────────────────────

function deriveSteps(testTitle: string, module: string): string[] {
  const t    = testTitle.toLowerCase();
  const id   = process.env.TEST_ENTERPRISE_ID ?? '8253714198';
  const base = [`Open browser and navigate to ${ENV_URL}/login`];

  if (module === 'Login' || t.includes('login') || t.includes('credential') || t.includes('password') || t.includes('email')) {
    if (t.includes('empty email'))
      return [...base, 'Leave the Email field blank', 'Enter a valid password', 'Click the "Login" button', 'Observe validation message on the Email field'];
    if (t.includes('empty password'))
      return [...base, 'Enter valid Enterprise ID and Email', 'Leave the Password field blank', 'Click the "Login" button', 'Observe validation message on the Password field'];
    if (t.includes('empty form') || t.includes('empty'))
      return [...base, 'Do NOT fill any fields — leave all inputs blank', 'Click the "Login" button directly', 'Observe field-level validation messages on Email and Password'];
    if (t.includes('invalid email'))
      return [...base, `Enter Enterprise ID: ${id}`, 'Enter Email: not-a-valid-email (intentionally invalid format)', 'Enter a valid password', 'Click the "Login" button', 'Observe the validation/error message displayed'];
    if (t.includes('wrong enterprise'))
      return [...base, 'Enter Enterprise ID: 0000000000 (wrong/non-existent ID)', 'Enter valid email and password', 'Click the "Login" button', 'Observe the error message'];
    if (t.includes('sql') || t.includes('injection'))
      return [...base, `Enter Enterprise ID: ${id}`, "Enter Email: ' OR '1'='1  (SQL injection payload)", "Enter Password: ' OR '1'='1  (SQL injection payload)", 'Click the "Login" button', 'Verify: access is rejected and error is visible', 'Verify: URL remains /login'];
    if (t.includes('xss'))
      return [...base, `Enter Enterprise ID: ${id}`, 'Enter Email: <script>alert("xss")</script>@test.com  (XSS payload)', 'Enter any password', 'Click the "Login" button', 'Observe: no JavaScript alert dialog appears', 'Observe: page remains on /login'];
    if (t.includes('wrong password') || t.includes('invalid credential'))
      return [...base, 'Enter valid Enterprise ID and Email', 'Enter wrong password: WrongPass@999', 'Click the "Login" button', 'Observe the error message'];
    return [...base, `Enter Enterprise ID: ${id}`, 'Enter valid email and password', 'Click the "Login" button', 'Observe the result'];
  }

  if (module === 'Dashboard' || t.includes('dashboard')) {
    const target = t.includes('navbar') ? 'the top navigation bar (.v-avatar)' : t.includes('sidebar') ? 'the left sidebar navigation items' : 'the dashboard page content';
    return [...base, 'Enter valid credentials and click "Login"', 'Wait for redirect away from /login', `Observe ${target}`];
  }

  return [...base, `Execute test scenario: ${testTitle}`, 'Observe the result and compare against expected behavior'];
}

function deriveExpected(testTitle: string, _module: string): string {
  const t = testTitle.toLowerCase();
  if (t.includes('valid credential') || (t.includes('success') && t.includes('login')))
    return `User should be redirected to the dashboard. URL must not be /login. Dashboard content must be visible.`;
  if (t.includes('invalid credential') || t.includes('wrong password') || t.includes('wrong enterprise'))
    return `An error message must appear matching: /invalid|incorrect|error|required|valid email|wrong|failed|denied/i. User must remain on /login.`;
  if (t.includes('empty') || t.includes('validation'))
    return `Field-level validation messages must appear for each empty required field. User must remain on /login.`;
  if (t.includes('sql') || t.includes('injection'))
    return `Application must REJECT the payload. A visible error must appear. User must remain on /login.`;
  if (t.includes('xss'))
    return `No JavaScript alert() dialog should appear. The XSS payload must be sanitized. User must remain on /login.`;
  if (t.includes('without login') || t.includes('unauthorized') || t.includes('redirect'))
    return `Application must redirect the unauthenticated user to /login immediately.`;
  if (t.includes('dashboard'))
    return `Dashboard must load completely: navbar, sidebar, and main content visible. URL must not be /login.`;
  return `All assertions must pass within the configured timeout.`;
}

// ── Evidence file info ─────────────────────────────────────────────────────────

function getFileInfo(filePath?: string, label?: string): string {
  if (!filePath) return `Not captured${label ? ` — ${label}` : ''}`;
  if (!fs.existsSync(filePath)) return `File not found: ${path.basename(filePath)}`;
  const kb = (fs.statSync(filePath).size / 1024).toFixed(0);
  return `Attached to this card (${kb} KB) — ${path.basename(filePath)}`;
}

// ── ADF helpers ────────────────────────────────────────────────────────────────

function h2(text: string) {
  return { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] };
}
function para(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}
function codeBlock(text: string) {
  return { type: 'codeBlock', attrs: { language: 'text' }, content: [{ type: 'text', text }] };
}
function bulletList(items: string[]) {
  return {
    type: 'bulletList',
    content: items.map(item => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: item }] }],
    })),
  };
}
function orderedList(items: string[]) {
  return {
    type: 'orderedList',
    content: items.map(item => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: item }] }],
    })),
  };
}

// ── JQL escaping ───────────────────────────────────────────────────────────────

function escapeJql(value: string): string {
  return value.substring(0, 55).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'");
}

// ── Duplicate check ────────────────────────────────────────────────────────────

export async function findOpenBug(summary: string): Promise<string | null> {
  console.log(`[Jira]   Searching for existing open bug: "${summary.substring(0, 60)}..."`);
  try {
    const res = await jira.post('/search/jql', {
      jql:        `project = "${PROJECT}" AND summary ~ "${escapeJql(summary)}" AND issuetype = Bug AND statusCategory != Done`,
      maxResults: 1,
      fields:     ['summary', 'key'],
    });
    const found = res.data.issues?.[0]?.key ?? null;
    if (found) {
      console.log(`[Jira]   Found existing open bug: ${found} — skipping duplicate creation`);
    } else {
      console.log(`[Jira]   No existing open bug found — will create new card`);
    }
    return found;
  } catch (err: any) {
    const status = err.response?.status ?? 'N/A';
    const msg    = err.response?.data?.message ?? err.message;
    console.error(`[Jira]   ⚠️  findOpenBug search failed (HTTP ${status}): ${msg}`);
    return null;
  }
}

// ── Jira transition helper ─────────────────────────────────────────────────────

async function getTransitionId(issueKey: string, targetName: string): Promise<string | null> {
  try {
    const res = await jira.get(`/issue/${issueKey}/transitions`);
    const transitions: Array<{ id: string; name: string }> = res.data.transitions;
    const match = transitions.find(t => t.name.toLowerCase().includes(targetName.toLowerCase()));
    return match?.id ?? null;
  } catch (err: any) {
    const status = err.response?.status ?? 'N/A';
    console.error(`[Jira]   ⚠️  getTransitionId failed for ${issueKey} (HTTP ${status}): ${err.response?.data?.message ?? err.message}`);
    return null;
  }
}

// ── Shared closer ──────────────────────────────────────────────────────────────

async function closeBugCard(key: string, commentText: string): Promise<void> {
  const transitionId = await getTransitionId(key, 'Done');
  if (!transitionId) {
    console.warn(`[Jira]   ⚠️  No "Done" transition found for ${key} — cannot close`);
    return;
  }
  await jira.post(`/issue/${key}/transitions`, { transition: { id: transitionId } });
  await jira.post(`/issue/${key}/comment`, {
    body: { type: 'doc', version: 1, content: [h2('🔄 AUTO-CLOSED'), para(commentText)] },
  });
}

// ── Close open bugs when a test passes ────────────────────────────────────────

export async function closeResolvedBugs(testTitle: string, browser: string): Promise<void> {
  const tcId = extractTcId(testTitle);
  if (tcId === 'N/A') return;

  const tcLower    = tcId.toLowerCase();
  const browserLow = browser.toLowerCase();
  const browserCap = browser.charAt(0).toUpperCase() + browser.slice(1);

  try {
    const [byLabel, bySummary] = await Promise.all([
      jira.post('/search/jql', {
        jql:        `project = "${PROJECT}" AND labels = "${tcLower}" AND labels = "${browserLow}" AND issuetype = Bug AND statusCategory != Done`,
        maxResults: 20, fields: ['key'],
      }),
      jira.post('/search/jql', {
        jql:        `project = "${PROJECT}" AND summary ~ "${tcId}" AND summary ~ "${browserCap}" AND issuetype = Bug AND statusCategory != Done`,
        maxResults: 20, fields: ['key'],
      }),
    ]);

    const allKeys = new Set<string>([
      ...(byLabel.data.issues   ?? []).map((i: { key: string }) => i.key),
      ...(bySummary.data.issues ?? []).map((i: { key: string }) => i.key),
    ]);

    if (allKeys.size === 0) {
      console.log(`[Jira] ℹ️  No open bug cards found for "${testTitle}" (${browserCap}) — nothing to close`);
      return;
    }

    console.log(`[Jira] Closing ${allKeys.size} open card(s) for "${testTitle}" (${browserCap}) — test now passing`);
    for (const key of allKeys) {
      const comment =
        `✅ TEST NOW PASSING\n` +
        `Test: "${testTitle}" (${browserCap})\n` +
        `Build: #${BUILD_NO} | Date: ${new Date().toLocaleString()} | Env: ${ENV_NAME.toUpperCase()}\n` +
        `This bug is automatically closed because the test is now passing.`;
      await closeBugCard(key, comment);
      console.log(`[Jira] ✅ Auto-closed ${key}`);
    }
  } catch (err: any) {
    const status = err.response?.status ?? 'N/A';
    console.error(`[Jira] ⚠️  closeResolvedBugs failed (HTTP ${status}): ${err.response?.data?.message ?? err.message}`);
  }
}

// ── Cleanup duplicate open cards ──────────────────────────────────────────────

export async function cleanupDuplicateBugs(testTitle: string, browser: string): Promise<void> {
  const tcId = extractTcId(testTitle);
  if (tcId === 'N/A') return;

  const tcLower    = tcId.toLowerCase();
  const browserLow = browser.toLowerCase();
  const browserCap = browser.charAt(0).toUpperCase() + browser.slice(1);

  try {
    const [byLabel, bySummary] = await Promise.all([
      jira.post('/search/jql', {
        jql:        `project = "${PROJECT}" AND labels = "${tcLower}" AND labels = "${browserLow}" AND issuetype = Bug AND statusCategory != Done ORDER BY created DESC`,
        maxResults: 20, fields: ['key', 'created'],
      }),
      jira.post('/search/jql', {
        jql:        `project = "${PROJECT}" AND summary ~ "${tcId}" AND summary ~ "${browserCap}" AND issuetype = Bug AND statusCategory != Done ORDER BY created DESC`,
        maxResults: 20, fields: ['key', 'created'],
      }),
    ]);

    const seen   = new Set<string>();
    const merged: string[] = [];
    for (const i of [...(byLabel.data.issues ?? []), ...(bySummary.data.issues ?? [])]) {
      if (!seen.has(i.key)) { seen.add(i.key); merged.push(i.key); }
    }

    if (merged.length <= 1) return;

    const keeper   = merged[0];
    const dupeKeys = merged.slice(1);
    console.log(`[Jira] Found ${merged.length} open cards — closing ${dupeKeys.length} duplicate(s), keeping ${keeper}`);

    for (const key of dupeKeys) {
      const comment =
        `🔄 DUPLICATE CLOSED\n` +
        `This card is a duplicate of ${keeper} (most recent open card for the same test).\n` +
        `Test: "${testTitle}" (${browserCap}) | Build: #${BUILD_NO} | Date: ${new Date().toLocaleString()}\n` +
        `Only one open Bug per test per browser is maintained.`;
      await closeBugCard(key, comment);
      console.log(`[Jira] 🗑️  Closed duplicate ${key} → keeping ${keeper}`);
    }
  } catch (err: any) {
    const status = err.response?.status ?? 'N/A';
    console.error(`[Jira] ⚠️  cleanupDuplicateBugs failed (HTTP ${status}): ${err.response?.data?.message ?? err.message}`);
  }
}

// ── File attachment upload ─────────────────────────────────────────────────────

async function attachFileToIssue(issueKey: string, filePath: string): Promise<void> {
  if (!filePath) {
    console.warn(`[Jira]   ⚠️  Attachment skipped — no path provided`);
    return;
  }
  if (!fs.existsSync(filePath)) {
    console.warn(`[Jira]   ⚠️  Attachment skipped — file not found on disk: ${filePath}`);
    return;
  }

  const filename = path.basename(filePath);
  const sizeKb   = (fs.statSync(filePath).size / 1024).toFixed(0);
  console.log(`[Jira]   📎 Uploading: ${filename} (${sizeKb} KB) → ${issueKey}`);
  console.log(`[Jira]      POST ${BASE_URL}/rest/api/3/issue/${issueKey}/attachments`);

  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), { filename });
    await axios.post(
      `${BASE_URL}/rest/api/3/issue/${issueKey}/attachments`,
      form,
      {
        auth:    { username: EMAIL, password: API_TOKEN },
        headers: { 'X-Atlassian-Token': 'no-check', ...form.getHeaders() },
      }
    );
    console.log(`[Jira]   ✅ Attached: ${filename}`);
  } catch (err: any) {
    const status  = err.response?.status ?? 'N/A';
    const message = err.response?.data?.message
      ?? (Array.isArray(err.response?.data?.errorMessages) ? err.response.data.errorMessages.join(', ') : null)
      ?? err.message;
    console.error(`[Jira]   ❌ Attachment FAILED: ${filename} (HTTP ${status}): ${message}`);
    if (status === 403) {
      console.error(`[Jira]      → Check that the API token has permission to add attachments to project ${PROJECT}`);
    }
  }
}

// ── Bug card ADF content ───────────────────────────────────────────────────────

function buildBugAdf(payload: BugPayload) {
  const tcId         = extractTcId(payload.testTitle);
  const browserLabel = payload.browser.charAt(0).toUpperCase() + payload.browser.slice(1);
  const steps        = deriveSteps(payload.testTitle, payload.module);
  const expected     = deriveExpected(payload.testTitle, payload.module);
  const rootCause    = suggestRootCause(payload.errorMessage, payload.testTitle);
  const firstErrLine = payload.errorMessage.split('\n')[0] ?? payload.errorMessage;

  const screenshotNote = getFileInfo(payload.screenshot, 'screenshot: "only-on-failure" in playwright.config.ts');
  const videoNote      = getFileInfo(payload.video,      'enable video: "retain-on-failure" in playwright.config.ts');
  const traceNote      = getFileInfo(payload.trace,      'enable trace: "retain-on-failure" in playwright.config.ts');

  return {
    type: 'doc', version: 1,
    content: [
      h2('🐛 Bug Summary'),
      para(
        `Automated test "${payload.testTitle}" failed on ${browserLabel} in the ${payload.module} module.\n` +
        `First error line: ${firstErrLine}`
      ),

      h2('📋 Test Details'),
      bulletList([
        `Test Case ID    : ${tcId}`,
        `Test Name       : ${payload.testTitle}`,
        `Module          : ${payload.module}`,
        `Spec File       : ${payload.specFile}`,
        `Browser         : ${browserLabel}`,
        `OS              : ${payload.os}`,
        `Environment     : ${ENV_NAME.toUpperCase()} — ${ENV_URL}`,
        `Build / Run     : #${payload.buildNumber}`,
        `Run Date        : ${new Date().toLocaleString()}`,
        `Test Duration   : ${(payload.duration / 1000).toFixed(1)}s`,
        `Retry Count     : ${payload.retryCount} (test ran ${payload.retryCount + 1} time(s))`,
        `Automation Tool : Playwright + TypeScript`,
        `Git Branch      : ${BRANCH}`,
      ]),

      h2('⚠️ Priority & Severity'),
      bulletList([
        `Priority  : ${payload.priority ?? derivePriority(payload.testTitle)}${payload.priority ? ' (set via test annotation)' : ' (auto-derived)'}`,
        `Severity  : ${deriveSeverityLabel(payload.testTitle).replace('severity-', '').toUpperCase()}`,
        `Test Type : ${deriveTestType(payload.testTitle).replace(/-/g, ' ')}`,
      ]),

      h2('🔁 Preconditions'),
      orderedList([
        `Application is reachable at ${ENV_URL}`,
        'Login page is accessible at /login',
        'No active session exists for the test user (fresh browser context)',
        '.env file contains valid TEST_ENTERPRISE_ID, TEST_EMAIL, and TEST_PASSWORD',
      ]),

      h2('📝 Steps to Reproduce'),
      orderedList(steps),

      h2('✅ Expected Result'),
      para(expected),

      h2('❌ Actual Result'),
      para(firstErrLine),

      h2('🔍 Playwright Error (Exact)'),
      codeBlock(payload.errorMessage),

      h2('💡 Root Cause Suggestion'),
      para(rootCause),

      h2('📎 Evidence'),
      bulletList([
        `Screenshot : ${screenshotNote}`,
        `Video      : ${videoNote}`,
        `Trace      : ${traceNote}`,
      ]),

      h2('🔁 Reproducibility'),
      para(
        `Consistent failure — automated tests are deterministic.\n` +
        `Retry count: ${payload.retryCount}. ` +
        (payload.retryCount > 0
          ? 'Test failed even after retries — this is NOT a flaky test.'
          : 'Test ran once. Enable retries in CI (retries: 2) to confirm reproducibility.')
      ),

      h2('🏷️ Automation Framework Details'),
      bulletList([
        `Framework  : Playwright + TypeScript`,
        `Project    : SnapMeasure Dashboard QA`,
        `Repository : github.com/selva-selv/my-qa-framework`,
        `Branch     : ${BRANCH}`,
        `Browsers   : Chromium, Firefox, WebKit`,
      ]),
    ],
  };
}

// ── Bug card creator ───────────────────────────────────────────────────────────

export async function createJiraBug(payload: BugPayload): Promise<string | null> {
  const tcId         = extractTcId(payload.testTitle);
  const browserLabel = payload.browser.charAt(0).toUpperCase() + payload.browser.slice(1);
  const summary      = `[BUG][${payload.module}][${tcId}] ${payload.testTitle} (${browserLabel})`;

  console.log(`\n[Jira] ${'─'.repeat(60)}`);
  console.log(`[Jira] Creating bug card`);
  console.log(`[Jira]   Title   : ${summary.substring(0, 80)}`);
  console.log(`[Jira]   Browser : ${browserLabel}  |  Build: #${payload.buildNumber}`);

  if (!BASE_URL || !EMAIL || !API_TOKEN) {
    console.error('[Jira] ❌ ABORTED — Jira credentials missing. Check .env file.');
    console.error('[Jira]    Required: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN');
    return null;
  }

  try {
    const existing = await findOpenBug(summary);
    if (existing) return existing;

    const fields: Record<string, unknown> = {
      project:   { key: PROJECT },
      summary,
      issuetype: { name: 'Bug' },
      priority:  { name: payload.priority ?? derivePriority(payload.testTitle) },
      labels: [
        'playwright-automation',
        'regression',
        payload.browser.toLowerCase(),
        tcId.toLowerCase(),
        `${payload.module.toLowerCase().replace(/\s+/g, '-')}-module`,
        deriveTestType(payload.testTitle),
        deriveSeverityLabel(payload.testTitle),
        `build-${payload.buildNumber}`,
        `env-${ENV_NAME.toLowerCase()}`,
      ],
      description: buildBugAdf(payload),
    };

    if (ASSIGNEE)  fields.assignee            = { id: ASSIGNEE };
    if (SPRINT_ID) fields['customfield_10020'] = SPRINT_ID;

    console.log(`[Jira]   POST ${BASE_URL}/rest/api/3/issue`);
    const res = await jira.post('/issue', { fields });
    const key: string = res.data.key;

    console.log(`[Jira] ✅ Bug created: ${key}`);
    console.log(`[Jira]    Link: ${BASE_URL}/browse/${key}`);

    // Attach evidence files
    console.log(`[Jira]   Attaching evidence to ${key}:`);
    if (payload.screenshot) await attachFileToIssue(key, payload.screenshot);
    else                    console.log(`[Jira]   ℹ️  Screenshot: not available`);

    if (payload.video)      await attachFileToIssue(key, payload.video);
    else                    console.log(`[Jira]   ℹ️  Video: not available`);

    if (payload.trace)      await attachFileToIssue(key, payload.trace);
    else                    console.log(`[Jira]   ℹ️  Trace: not available`);

    console.log(`[Jira] ${'─'.repeat(60)}`);
    return key;

  } catch (err: any) {
    const status  = err.response?.status ?? 'N/A';
    const errors  = err.response?.data?.errors ?? err.response?.data?.errorMessages ?? err.message;
    console.error(`[Jira] ❌ Bug creation FAILED (HTTP ${status})`);
    console.error(`[Jira]    Endpoint : POST ${BASE_URL}/rest/api/3/issue`);
    console.error(`[Jira]    Summary  : ${summary.substring(0, 70)}`);
    console.error(`[Jira]    Error    : ${JSON.stringify(errors, null, 2)}`);
    if (status === 400) {
      console.error('[Jira]    → HTTP 400 often means a required field is missing or a field name is invalid.');
      console.error('[Jira]      Check that the Bug issue type exists in the KAN project.');
    }
    if (status === 401) {
      console.error('[Jira]    → HTTP 401: authentication failed. Verify JIRA_EMAIL and JIRA_API_TOKEN in .env.');
    }
    if (status === 403) {
      console.error('[Jira]    → HTTP 403: permission denied. Ensure the token account has "Create Issues" permission in project KAN.');
    }
    console.log(`[Jira] ${'─'.repeat(60)}`);
    return null;
  }
}

// ── Module passed summary (CI only) ───────────────────────────────────────────

export async function createModuleSummary(module: string, passedTests: PassedTest[]): Promise<string | null> {
  if (passedTests.length === 0) return null;

  const browsers      = [...new Set(passedTests.map(t => t.browser))].join(', ');
  const totalDuration = passedTests.reduce((s, t) => s + t.duration, 0);
  const summary       = `[QA PASSED] ${module} Module — Automation Summary (Build #${BUILD_NO})`;

  try {
    const dup = await jira.post('/search/jql', {
      jql:        `project = "${PROJECT}" AND summary ~ "${escapeJql(summary)}" AND issuetype = Task AND statusCategory != Done`,
      maxResults: 1, fields: ['key'],
    });
    if (dup.data.issues?.length > 0) {
      console.log(`[Jira] ✅ Module summary already exists: ${dup.data.issues[0].key} — ${module}`);
      return dup.data.issues[0].key;
    }

    const res = await jira.post('/issue', {
      fields: {
        project:   { key: PROJECT },
        summary,
        issuetype: { name: 'Task' },
        priority:  { name: 'Low' },
        labels:    ['playwright-automation', 'test-passed-summary', `${module.toLowerCase().replace(/\s+/g, '-')}-module`, `build-${BUILD_NO}`],
        description: {
          type: 'doc', version: 1,
          content: [
            h2(`✅ ${module} Module — All Tests Passed`),
            para(`All ${passedTests.length} test(s) in the ${module} module passed.`),
            h2('📊 Run Summary'),
            bulletList([
              `Module         : ${module}`,
              `Tests Passed   : ${passedTests.length}`,
              `Browsers       : ${browsers}`,
              `Total Duration : ${(totalDuration / 1000).toFixed(1)}s`,
              `Build          : #${BUILD_NO}`,
              `Run Date       : ${new Date().toLocaleString()}`,
              `Environment    : ${ENV_NAME.toUpperCase()} — ${ENV_URL}`,
            ]),
            h2('📋 Passed Test Cases'),
            ...passedTests.map(t =>
              para(`✅  ${extractTcId(t.title).padEnd(8)}  ${t.title.substring(0, 55).padEnd(55)}  ${t.browser.padEnd(10)}  ${(t.duration / 1000).toFixed(1)}s`)
            ),
          ],
        },
      },
    });
    console.log(`[Jira] ✅ Module summary created: ${res.data.key} — ${module} (${passedTests.length} passed)`);
    return res.data.key;
  } catch (err: any) {
    const status = err.response?.status ?? 'N/A';
    console.error(`[Jira] ❌ Module summary failed for ${module} (HTTP ${status}):`, err.response?.data ?? err.message);
    return null;
  }
}

// ── Full test run task (CI only) ───────────────────────────────────────────────

export async function createTestRunSummary(results: TestResult[]): Promise<void> {
  const passed  = results.filter(r => r.status === 'passed');
  const failed  = results.filter(r => r.status === 'failed');
  const total   = results.length;
  const runDate = new Date().toLocaleString();
  const status  = failed.length === 0 ? '✅ ALL PASSED' : `❌ ${failed.length} FAILED`;
  const summary = `[QA Test Run] ${runDate} — ${status} (${passed.length}/${total}) Build #${BUILD_NO}`;

  const byModule = results.reduce((acc, r) => {
    (acc[r.module] ??= []).push(r);
    return acc;
  }, {} as Record<string, TestResult[]>);

  try {
    await jira.post('/issue', {
      fields: {
        project:   { key: PROJECT },
        summary,
        issuetype: { name: 'Task' },
        priority:  { name: failed.length > 0 ? 'High' : 'Low' },
        labels:    ['test-run', 'playwright-automation', `build-${BUILD_NO}`, `env-${ENV_NAME.toLowerCase()}`],
        description: {
          type: 'doc', version: 1,
          content: [
            h2('📊 Test Run Overview'),
            bulletList([
              `Run Date    : ${runDate}`,
              `Total Tests : ${total}`,
              `Passed      : ${passed.length}`,
              `Failed      : ${failed.length}`,
              `Build       : #${BUILD_NO}`,
              `Environment : ${ENV_NAME.toUpperCase()} — ${ENV_URL}`,
              `Browsers    : Chromium, Firefox, WebKit`,
              `Branch      : ${BRANCH}`,
            ]),
            ...Object.entries(byModule).flatMap(([mod, tests]) => {
              const p = tests.filter(t => t.status === 'passed').length;
              const f = tests.filter(t => t.status === 'failed').length;
              return [h2(`📦 ${mod}`), para(`✅ ${p} passed   ❌ ${f} failed   Total: ${tests.length}`)];
            }),
            h2('💬 Developer Message'),
            para(buildDeveloperMessage(passed, failed)),
          ],
        },
      },
    });
    console.log(`\n[Jira] ✅ Test Run Summary → Jira — Build #${BUILD_NO} (${status})`);
  } catch (err: any) {
    const status = err.response?.status ?? 'N/A';
    console.error(`[Jira] ❌ Test run summary failed (HTTP ${status}):`, err.response?.data ?? err.message);
  }
}

// ── Developer message ──────────────────────────────────────────────────────────

function buildDeveloperMessage(passed: TestResult[], failed: TestResult[]): string {
  const name  = process.env.JIRA_DEVELOPER_NAME ?? 'Developer';
  const lines = [`Hi ${name}, please find the QA automation report below.\n`];

  if (failed.length > 0) {
    lines.push('❌ FAILED TESTS — ACTION REQUIRED:');
    failed.forEach(r => {
      lines.push(`  • [${r.module}] ${r.title} [${r.jiraKey ?? 'card pending'}] (${r.browser})`);
      if (r.error) lines.push(`    └─ ${r.error.split('\n')[0]}`);
    });
    lines.push('');
  }

  if (passed.length > 0) {
    lines.push('✅ PASSED TESTS — No action needed:');
    passed.forEach(r => lines.push(`  • [${r.module}] ${r.title} (${r.browser}) — Working fine`));
    lines.push('');
  }

  lines.push('Please fix only the FAILED items and reply once done.');
  return lines.join('\n');
}
