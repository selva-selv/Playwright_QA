import { test as base } from '@playwright/test';
import { closeResolvedBugs } from '../utils/jiraHelper';

export const test = base.extend({});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status === 'passed') {
    // Test passed — close any open Bug cards for this test+browser combination.
    // STRICT RULE: No Jira card is ever created for a passing test.
    await closeResolvedBugs(testInfo.title, testInfo.project.name);
  }
  // Failed tests: bug creation is handled by jiraReporter.ts onTestEnd,
  // where result.attachments are real, finalized file paths (screenshot/video/trace).
  // Creating bugs in afterEach would always yield undefined attachment paths because
  // Playwright finalizes those files AFTER all afterEach hooks complete.
});

export { expect } from '@playwright/test';
