import axios from 'axios';
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL  = process.env.JIRA_BASE_URL!;
const EMAIL     = process.env.JIRA_EMAIL!;
const API_TOKEN = process.env.JIRA_API_TOKEN!;
const PROJECT   = process.env.JIRA_PROJECT_KEY!;

const auth    = { username: EMAIL, password: API_TOKEN };
const headers = { 'Content-Type': 'application/json' };

async function main() {
  const res = await axios.post(
    `${BASE_URL}/rest/api/3/issue`,
    {
      fields: {
        project:   { key: PROJECT },
        summary:   '[BUG][Login][Security] TC113 - SQL Injection Does Not Trigger Expected Error Assertion (WebKit)',
        issuetype: { name: 'Bug' },
        priority:  { name: 'Highest' },
        labels:    ['playwright-automation','regression','login-module','security-test','sql-injection','negative-test','TC113','webkit'],
        description: {
          version: 1,
          type: 'doc',
          content: [
            {
              type: 'heading', attrs: { level: 2 },
              content: [{ type: 'text', text: 'Bug Details' }],
            },
            {
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'Test Case ID : TC113\nBrowser      : WebKit (Desktop Safari)\nModule       : Login Module — Security Test\nEnvironment  : https://measurement-dashboard-dev.magicktech.com\nTest File    : tests/form.spec.ts : Line 85',
              }],
            },
            {
              type: 'heading', attrs: { level: 2 },
              content: [{ type: 'text', text: 'Preconditions' }],
            },
            {
              type: 'paragraph',
              content: [{
                type: 'text',
                text: '1. Application is reachable at https://measurement-dashboard-dev.magicktech.com\n2. Login page is accessible at /login\n3. No active session exists for the test user',
              }],
            },
            {
              type: 'heading', attrs: { level: 2 },
              content: [{ type: 'text', text: 'Steps to Reproduce' }],
            },
            {
              type: 'paragraph',
              content: [{
                type: 'text',
                text: "1. Open https://measurement-dashboard-dev.magicktech.com/login\n2. Enter Enterprise ID: 8253714198\n3. Enter Email:    ' OR '1'='1   (SQL injection payload)\n4. Enter Password: ' OR '1'='1   (SQL injection payload)\n5. Click the Login button\n6. Observe whether authentication is rejected and error is visible",
              }],
            },
            {
              type: 'heading', attrs: { level: 2 },
              content: [{ type: 'text', text: 'Expected Result' }],
            },
            {
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'Application must REJECT the SQL injection payload and display a visible error message confirming login was denied. Text matching /invalid|incorrect|error|required/i must be visible within 15 seconds.',
              }],
            },
            {
              type: 'heading', attrs: { level: 2 },
              content: [{ type: 'text', text: 'Actual Result' }],
            },
            {
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'Application displayed: "The Email field must be a valid email"\nEmail format validation fired BEFORE the authentication attempt.\nThe displayed text did NOT match the locator regex — test timed out after 15000ms.\nNOTE: No unauthorized access was granted — the payload was blocked.',
              }],
            },
            {
              type: 'heading', attrs: { level: 2 },
              content: [{ type: 'text', text: 'Playwright Error (Exact)' }],
            },
            {
              type: 'codeBlock', attrs: { language: 'text' },
              content: [{
                type: 'text',
                text: 'Error: expect(locator).toBeVisible() failed\nReceived:  <hidden>\n\nLocator:   getByText(/invalid|incorrect|error|required/i)\nTimeout:   15000ms exceeded\n\n  at LoginPage.expectLoginError (pages/LoginPage.ts:22)\n  at Object.<anonymous> (tests/form.spec.ts:93)',
              }],
            },
            {
              type: 'heading', attrs: { level: 2 },
              content: [{ type: 'text', text: 'Security Observation' }],
            },
            {
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'The application correctly rejected the SQL injection payload at the email format validation layer (client-side). However, frontend validation alone is NOT sufficient as a security control. RECOMMENDATION: Verify that the backend API also independently sanitizes and rejects this input — do not rely solely on frontend guards.',
              }],
            },
            {
              type: 'heading', attrs: { level: 2 },
              content: [{ type: 'text', text: 'Root Cause' }],
            },
            {
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'The word "valid" was missing from the Playwright locator regex in pages/LoginPage.ts:22\nBEFORE: /invalid|incorrect|error|required/i\nAFTER:  /invalid|incorrect|error|required|valid email|wrong|failed|denied/i\nConfirmed cross-browser: Chromium (KAN-12) + Firefox (KAN-13) + WebKit (this card).',
              }],
            },
            {
              type: 'heading', attrs: { level: 2 },
              content: [{ type: 'text', text: 'Screenshot' }],
            },
            {
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'test-results/form-TC113---SQL-injection-in-credentials-is-rejected-webkit/test-failed-1.png',
              }],
            },
          ],
        },
      },
    },
    { auth, headers }
  );

  console.log('\n✅ Created:', res.data.key);
  console.log('🔗 URL:', `${BASE_URL}/browse/${res.data.key}`);
}

main().catch(err => {
  console.error('Error:', err.response?.data?.errors ?? err.response?.data?.errorMessages ?? err.message);
});
