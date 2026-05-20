import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const auth = Buffer.from(
  `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
).toString('base64');

const jira = axios.create({
  baseURL: `${process.env.JIRA_BASE_URL}/rest/api/3`,
  headers: {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/json',
  },
});

export interface TestResult {
  title: string;
  status: 'passed' | 'failed' | 'skipped';
  browser: string;
  duration: number;
  error?: string;
  jiraKey?: string;
}

// ── ADF helpers ─────────────────────────────────────────────────────────────

function para(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function heading(text: string, level: 2 | 3 = 3) {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] };
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

// ── Duplicate check ──────────────────────────────────────────────────────────

async function findOpenBug(summary: string): Promise<string | null> {
  const jql = `project = "${process.env.JIRA_PROJECT_KEY}" AND summary ~ "${summary}" AND issuetype = Bug AND statusCategory != Done`;
  const response = await jira.post('/search/jql', {
    jql, maxResults: 1, fields: ['summary'],
  });
  const issues = response.data.issues;
  return issues.length > 0 ? issues[0].key : null;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function createJiraBug(
  testName: string,
  errorMessage: string,
  browser: string,
  screenshotPath?: string
): Promise<string | null> {
  const summary = `[BUG] ${testName}`;
  const browserLabel = browser.charAt(0).toUpperCase() + browser.slice(1);
  const baseURL = 'https://measurement-dashboard-dev.magicktech.com';

  try {
    const existingKey = await findOpenBug(summary);
    if (existingKey) {
      console.log(`  Jira Bug already exists: ${existingKey} — skipping duplicate`);
      return existingKey;
    }

    const stepsFromTitle = deriveSteps(testName);
    const expectedResult = deriveExpected(testName);

    const content = [
      heading('🌐 Environment'),
      bulletList([
        `URL: ${baseURL}`,
        `Browser: ${browserLabel}`,
        `Run Date: ${new Date().toLocaleString()}`,
        `Automation Tool: Playwright`,
      ]),
      heading('📋 Steps to Reproduce'),
      orderedList(stepsFromTitle),
      heading('✅ Expected Result'),
      para(expectedResult),
      heading('❌ Actual Result'),
      para(errorMessage.split('\n')[0]),
      heading('📎 Severity'),
      para('High — Automated test failure blocking QA sign-off'),
      ...(screenshotPath ? [heading('🖼 Screenshot'), para(`Path: ${screenshotPath}`)] : []),
    ];

    const fields: Record<string, any> = {
      project: { key: process.env.JIRA_PROJECT_KEY },
      summary,
      description: { type: 'doc', version: 1, content },
      issuetype: { name: 'Bug' },
      priority: { name: 'High' },
      labels: ['playwright-automation', 'regression', browser],
    };

    if (process.env.JIRA_ASSIGNEE_ID) {
      fields.assignee = { id: process.env.JIRA_ASSIGNEE_ID };
    }

    const response = await jira.post('/issue', { fields });
    const key = response.data.key;
    console.log(`  ❌ Jira Bug created: ${process.env.JIRA_BASE_URL}/browse/${key}`);
    return key;
  } catch (error: any) {
    console.error('  Failed to create Jira bug:', error?.response?.data ?? error.message);
    return null;
  }
}

export async function createTestRunSummary(results: TestResult[]): Promise<void> {
  const passed = results.filter(r => r.status === 'passed');
  const failed = results.filter(r => r.status === 'failed');
  const total = results.length;
  const runDate = new Date().toLocaleString();
  const overallStatus = failed.length === 0 ? '✅ ALL PASSED' : `❌ ${failed.length} FAILED`;

  const summaryTitle = `[QA Test Run] ${runDate} — ${overallStatus} (${passed.length}/${total})`;

  const tableRows = results.map(r => {
    const icon = r.status === 'passed' ? '✅ PASSED' : '❌ FAILED';
    const card = r.jiraKey ? r.jiraKey : r.status === 'passed' ? 'No card created' : 'See error';
    return para(`${icon} | ${r.title} | ${r.browser} | ${(r.duration / 1000).toFixed(1)}s | ${card}`);
  });

  const devMessage = buildDeveloperMessage(passed, failed);
  const content = [
    heading('📊 Test Run Summary', 2),
    para(`Date: ${runDate}`),
    para(`Total: ${total}  |  ✅ Passed: ${passed.length}  |  ❌ Failed: ${failed.length}`),
    para('─'.repeat(60)),
    heading('📋 Results Table'),
    para('STATUS | TEST NAME | BROWSER | DURATION | JIRA CARD'),
    ...tableRows,
    para('─'.repeat(60)),
    heading('💬 Developer Message'),
    para(devMessage),
  ];

  try {
    const fields: Record<string, any> = {
      project: { key: process.env.JIRA_PROJECT_KEY },
      summary: summaryTitle,
      description: { type: 'doc', version: 1, content },
      issuetype: { name: 'Task' },
      priority: { name: failed.length > 0 ? 'High' : 'Low' },
      labels: ['test-run', 'playwright-automation'],
    };

    const response = await jira.post('/issue', { fields });
    console.log(`\n📋 Jira Test Run Summary: ${process.env.JIRA_BASE_URL}/browse/${response.data.key}`);
  } catch (error: any) {
    console.error('Failed to create test run summary:', error?.response?.data ?? error.message);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function deriveSteps(testName: string): string[] {
  const name = testName.toLowerCase();
  if (name.includes('login') || name.includes('credential')) {
    return [
      'Navigate to https://measurement-dashboard-dev.magicktech.com/login',
      'Enter Enterprise Id, Email and Password',
      'Click the Login button',
      'Observe the result',
    ];
  }
  if (name.includes('dashboard')) {
    return [
      'Navigate to https://measurement-dashboard-dev.magicktech.com/login',
      'Log in with valid credentials',
      'Observe the dashboard page',
    ];
  }
  if (name.includes('sidebar')) {
    return [
      'Navigate to https://measurement-dashboard-dev.magicktech.com/login',
      'Log in with valid credentials',
      'Look for the sidebar navigation on the left',
      'Observe the sidebar items',
    ];
  }
  if (name.includes('navbar')) {
    return [
      'Navigate to https://measurement-dashboard-dev.magicktech.com/login',
      'Log in with valid credentials',
      'Look for the top navigation bar',
    ];
  }
  return [
    'Navigate to https://measurement-dashboard-dev.magicktech.com',
    `Execute test: ${testName}`,
    'Observe the result',
  ];
}

function deriveExpected(testName: string): string {
  const name = testName.toLowerCase();
  if (name.includes('valid credential')) return 'User should be redirected away from /login to the dashboard.';
  if (name.includes('invalid credential')) return 'An error message should appear indicating invalid credentials.';
  if (name.includes('empty form')) return '"This field is required" validation message should appear.';
  if (name.includes('dashboard loads')) return 'The dashboard page should load successfully after login.';
  if (name.includes('navbar')) return 'The top navigation bar with user avatar should be visible.';
  if (name.includes('sidebar') && name.includes('items')) return 'Sidebar should contain navigation items: Enterprise, User, Project, Customer, Plan, etc.';
  if (name.includes('sidebar')) return 'The sidebar navigation should be visible on the left side.';
  return `Test "${testName}" should complete successfully without errors.`;
}

function buildDeveloperMessage(passed: TestResult[], failed: TestResult[]): string {
  const developerName = process.env.JIRA_DEVELOPER_NAME ?? 'Developer';
  const lines: string[] = [
    `Hi ${developerName}, please find the QA automation report below.`,
    '',
  ];

  if (failed.length > 0) {
    lines.push('❌ FAILED TESTS — ACTION REQUIRED:');
    failed.forEach(r => {
      lines.push(`  • ${r.title} [${r.jiraKey ?? 'No card'}] (${r.browser})`);
      if (r.error) lines.push(`    Error: ${r.error.split('\n')[0]}`);
    });
    lines.push('');
  }

  if (passed.length > 0) {
    lines.push('✅ PASSED TESTS — No action needed:');
    passed.forEach(r => {
      lines.push(`  • ${r.title} (${r.browser}) — Working fine`);
    });
    lines.push('');
  }

  lines.push('Please fix only the FAILED items and reply once done.');
  return lines.join('\n');
}
