import { test as base } from '@playwright/test';
import { createJiraBug } from '../utils/jiraHelper';

export const test = base.extend({});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status === 'failed') {
    const screenshot = testInfo.attachments.find(a => a.name === 'screenshot')?.path;
    await createJiraBug(
      testInfo.title,
      testInfo.error?.message ?? 'Test failed without error message',
      testInfo.project.name,   // browser: chromium | firefox | webkit
      screenshot
    );
  }
  // PASSED → STRICT RULE: DO NOT create any Jira card
});

export { expect } from '@playwright/test';
