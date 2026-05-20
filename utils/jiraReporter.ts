import type {
  Reporter,
  TestCase,
  TestResult as PlaywrightResult,
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  createJiraBug,
  createTestRunSummary,
  createModuleSummary,
  cleanupDuplicateBugs,
  validateJiraConfig,
  testJiraConnection,
  deriveModule,
  BugPayload,
  TestResult,
  PassedTest,
} from './jiraHelper';

const BUILD_NO = process.env.BUILD_NUMBER ?? process.env.GITHUB_RUN_NUMBER ?? 'local';
const OS_INFO  = `${os.type()} ${os.release()} (${os.arch()})`;

class JiraReporter implements Reporter {
  // Map key: `${test.id}::${browser}` — always overwrites with the latest attempt so
  // retried tests appear exactly once (not once per attempt).
  private resultMap = new Map<string, TestResult>();
  private bugTasks: Array<() => Promise<void>> = [];

  onTestEnd(test: TestCase, result: PlaywrightResult) {
    const status: TestResult['status'] =
      result.status === 'passed'                                  ? 'passed'  :
      result.status === 'failed' || result.status === 'timedOut' ? 'failed'  :
      'skipped';

    const titlePath = test.titlePath();
    const descName  = titlePath.length >= 2 ? titlePath[titlePath.length - 2] : '';
    const module    = deriveModule(test.title, descName);
    const browser   = test.parent?.project()?.name ?? 'unknown';
    const attempt   = `attempt ${result.retry + 1}/${test.retries + 1}`;

    const entry: TestResult = {
      title:    test.title,
      status,
      browser,
      duration: result.duration,
      error:    result.error?.message,
      module,
    };
    // Always overwrite — final attempt's result is what matters
    this.resultMap.set(`${test.id}::${browser}`, entry);

    const icon =
      status === 'passed'  ? '✅' :
      status === 'failed'  ? '❌' : '⏭️';

    if (status === 'passed') {
      console.log(`[Jira] ${icon} PASSED  ${test.title.substring(0, 55)} (${browser}) — no bug card`);
      return;
    }

    if (status === 'skipped') {
      console.log(`[Jira] ${icon} SKIPPED ${test.title.substring(0, 55)} (${browser}) — no bug card`);
      return;
    }

    // Failed test — decide whether to queue bug creation
    const isLastAttempt = result.retry >= test.retries;
    if (!isLastAttempt) {
      console.log(`[Jira] ❌ FAILED  ${test.title.substring(0, 55)} (${browser}, ${attempt}) — retrying, bug card deferred`);
      return;
    }

    // Last attempt and still failing — queue bug card creation
    console.log(`[Jira] ❌ FAILED  ${test.title.substring(0, 55)} (${browser}, ${attempt}) — queuing Jira bug card`);

    const screenshot = result.attachments.find(a => a.name === 'screenshot')?.path;
    const video      = result.attachments.find(a => a.name === 'video')?.path;
    const trace      = result.attachments.find(a => a.name === 'trace')?.path;
    const priority   = test.annotations.find(a => a.type === 'jira-priority')?.description;
    const specFile   = path.relative(process.cwd(), test.location.file ?? '');

    // Log attachment availability right now (files exist at this point)
    console.log(`[Jira]   Screenshot : ${screenshot && fs.existsSync(screenshot) ? `✅ ${path.basename(screenshot)} (${(fs.statSync(screenshot).size / 1024).toFixed(0)}KB)` : '⚠️  not found'}`);
    console.log(`[Jira]   Video      : ${video      && fs.existsSync(video)      ? `✅ ${path.basename(video)}      (${(fs.statSync(video).size      / 1024).toFixed(0)}KB)` : '⚠️  not found'}`);
    console.log(`[Jira]   Trace      : ${trace      && fs.existsSync(trace)      ? `✅ ${path.basename(trace)}      (${(fs.statSync(trace).size      / 1024).toFixed(0)}KB)` : '⚠️  not found'}`);

    const payload: BugPayload = {
      testTitle:    test.title,
      errorMessage: result.error?.message ?? 'Test failed without an error message',
      browser,
      module,
      specFile,
      screenshot,
      video,
      trace,
      retryCount:  result.retry,
      duration:    result.duration,
      os:          OS_INFO,
      buildNumber: BUILD_NO,
      priority,
    };

    // entry is captured by reference — setting entry.jiraKey here updates the same
    // object that will appear in the terminal table when onEnd runs.
    this.bugTasks.push(async () => {
      await cleanupDuplicateBugs(test.title, browser);
      const key = await createJiraBug(payload);
      if (key) entry.jiraKey = key;
    });
  }

  async onEnd() {
    if (this.resultMap.size === 0) return;

    // ── Pre-flight: validate config + test connection ──────────────────────────
    const configOk = validateJiraConfig();
    if (configOk) {
      await testJiraConnection();
    }

    // ── Create all Jira bug cards (awaited before terminal table prints) ────────
    if (this.bugTasks.length === 0) {
      console.log('\n[Jira] ℹ️  No bug cards to create — all tests passed (or no failures reached the last retry).');
      console.log('[Jira]    This is CORRECT behavior. Jira bug cards are only created for FAILED tests.');
      console.log('[Jira]    To see a Jira card created, introduce a test that actually fails.\n');
    } else {
      console.log(`\n[Jira] Processing ${this.bugTasks.length} bug card task(s)...`);
      await Promise.allSettled(this.bugTasks.map(fn => fn()));
    }

    const results = [...this.resultMap.values()];
    const passed  = results.filter(r => r.status === 'passed');
    const failed  = results.filter(r => r.status === 'failed');
    const skipped = results.filter(r => r.status === 'skipped');

    const byModule: Record<string, TestResult[]> = {};
    for (const r of results) {
      (byModule[r.module] ??= []).push(r);
    }

    // ── Terminal table ─────────────────────────────────────────────────────────

    const W = 95;
    console.log('\n' + '═'.repeat(W));
    console.log('  QA TEST RUN SUMMARY — SnapMeasure Dashboard');
    console.log('═'.repeat(W));

    for (const [module, tests] of Object.entries(byModule)) {
      const mp = tests.filter(t => t.status === 'passed').length;
      const mf = tests.filter(t => t.status === 'failed').length;
      console.log(`\n  ▶ ${module}  (${mp} passed / ${mf} failed)`);
      console.log(`  ${'─'.repeat(W - 2)}`);

      for (const r of tests) {
        const icon  = r.status === 'passed' ? '✅' : r.status === 'failed' ? '❌' : '⏭️';
        const label = r.status === 'passed' ? 'PASSED ' : r.status === 'failed' ? 'FAILED ' : 'SKIPPED';
        const card  = r.jiraKey ?? '—';
        const name  = r.title.length > 52 ? r.title.substring(0, 51) + '…' : r.title;
        console.log(`  ${icon} ${label}  ${name.padEnd(53)}  ${r.browser.padEnd(10)}  ${card}`);
      }
    }

    console.log('\n' + '─'.repeat(W));
    console.log(
      `  ✅ Passed: ${passed.length}` +
      `   ❌ Failed: ${failed.length}` +
      `   ⏭️  Skipped: ${skipped.length}` +
      `   Total: ${results.length}`
    );
    console.log('═'.repeat(W));

    // ── Developer message ──────────────────────────────────────────────────────

    const devName = process.env.JIRA_DEVELOPER_NAME ?? 'Developer';
    console.log('\n💬 DEVELOPER MESSAGE:');
    console.log('─'.repeat(W));
    console.log(`Hi ${devName}, please find the QA automation report below.\n`);

    if (failed.length > 0) {
      console.log('❌ FAILED TESTS — ACTION REQUIRED:');
      for (const r of failed) {
        const jiraLink = r.jiraKey
          ? `${r.jiraKey} → ${process.env.JIRA_BASE_URL}/browse/${r.jiraKey}`
          : 'card not created (check [Jira] log above)';
        console.log(`  • [${r.module}] ${r.title} (${r.browser})`);
        console.log(`    Jira: ${jiraLink}`);
        if (r.error) console.log(`    Error: ${r.error.split('\n')[0]}`);
      }
      console.log('');
    }

    if (passed.length > 0) {
      console.log('✅ PASSED TESTS — No action needed:');
      for (const r of passed) {
        console.log(`  • [${r.module}] ${r.title} (${r.browser}) — Working fine`);
      }
    }

    console.log('\nPlease fix only the FAILED items and reply once done.');
    console.log('─'.repeat(W) + '\n');

    // ── Jira module summaries + run task — CI only ─────────────────────────────

    if (!process.env.CI) {
      console.log(
        '[Jira] ℹ️  Module summaries and test-run task are CI-only.\n' +
        '       Run with CI=true to post them: CI=true npx playwright test\n'
      );
      return;
    }

    for (const [module, tests] of Object.entries(byModule)) {
      const passedInModule = tests.filter(t => t.status === 'passed');
      if (passedInModule.length === 0) continue;
      const passedTests: PassedTest[] = passedInModule.map(t => ({
        title: t.title, browser: t.browser, duration: t.duration, module,
      }));
      await createModuleSummary(module, passedTests);
    }

    await createTestRunSummary(results);
  }
}

export default JiraReporter;
