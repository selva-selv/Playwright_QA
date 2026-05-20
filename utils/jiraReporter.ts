import type {
  Reporter,
  TestCase,
  TestResult as PlaywrightResult,
} from '@playwright/test/reporter';
import { createTestRunSummary, TestResult } from './jiraHelper';

class JiraReporter implements Reporter {
  private results: TestResult[] = [];

  onTestEnd(test: TestCase, result: PlaywrightResult) {
    const status: TestResult['status'] =
      result.status === 'passed' ? 'passed'
      : result.status === 'failed' || result.status === 'timedOut' ? 'failed'
      : 'skipped';

    this.results.push({
      title: test.title,
      status,
      browser: test.parent?.project()?.name ?? 'unknown',
      duration: result.duration,
      error: result.error?.message,
    });
  }

  async onEnd() {
    if (this.results.length === 0) return;

    const passed = this.results.filter(r => r.status === 'passed');
    const failed = this.results.filter(r => r.status === 'failed');

    // Print summary table to terminal
    console.log('\n' + '═'.repeat(80));
    console.log('  QA TEST RUN SUMMARY');
    console.log('═'.repeat(80));
    console.log(`  ${'TEST NAME'.padEnd(50)} ${'STATUS'.padEnd(10)} ${'BROWSER'.padEnd(12)} JIRA CARD`);
    console.log('─'.repeat(80));

    this.results.forEach(r => {
      const status = r.status === 'passed' ? '✅ PASSED' : '❌ FAILED';
      const card = r.jiraKey ?? (r.status === 'passed' ? 'No card created' : '—');
      console.log(`  ${r.title.padEnd(50)} ${status.padEnd(10)} ${r.browser.padEnd(12)} ${card}`);
    });

    console.log('─'.repeat(80));
    console.log(`  ✅ Passed: ${passed.length}   ❌ Failed: ${failed.length}   Total: ${this.results.length}`);
    console.log('═'.repeat(80));

    // Print developer message
    const developerName = process.env.JIRA_DEVELOPER_NAME ?? 'Developer';
    console.log('\n💬 DEVELOPER MESSAGE:');
    console.log('─'.repeat(80));
    console.log(`Hi ${developerName}, please find the QA automation report below.\n`);

    if (failed.length > 0) {
      console.log('❌ FAILED TESTS — ACTION REQUIRED:');
      failed.forEach(r => {
        console.log(`  • ${r.title} [${r.jiraKey ?? 'No card'}] (${r.browser})`);
        if (r.error) console.log(`    Error: ${r.error.split('\n')[0]}`);
      });
      console.log('');
    }

    console.log('✅ PASSED TESTS — No action needed:');
    passed.forEach(r => {
      console.log(`  • ${r.title} (${r.browser}) — Working fine`);
    });

    console.log('\nPlease fix only the FAILED items and reply once done.');
    console.log('─'.repeat(80) + '\n');

    // Post Test Run Summary to Jira
    await createTestRunSummary(this.results);
  }
}

export default JiraReporter;
