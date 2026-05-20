/**
 * Jira Cleanup Script — Close ALL open cards in KAN project
 *
 * Run BEFORE executing the focused login suite to reset the Jira board.
 * After this script, only the focused test run's cards will exist.
 *
 * Usage:
 *   npx tsx scripts/cleanupAllCards.ts
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL  = process.env.JIRA_BASE_URL!;
const EMAIL     = process.env.JIRA_EMAIL!;
const API_TOKEN = process.env.JIRA_API_TOKEN!;
const PROJECT   = process.env.JIRA_PROJECT_KEY!;

const jira = axios.create({
  baseURL: `${BASE_URL}/rest/api/3`,
  auth:    { username: EMAIL, password: API_TOKEN },
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function h2(text: string) {
  return { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] };
}
function para(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

async function getDoneTransitionId(issueKey: string): Promise<string | null> {
  try {
    const res = await jira.get(`/issue/${issueKey}/transitions`);
    const match = res.data.transitions.find(
      (t: { name: string }) => t.name.toLowerCase().includes('done')
    );
    return match?.id ?? null;
  } catch {
    return null;
  }
}

async function closeCard(key: string, type: string, summary: string): Promise<boolean> {
  const transitionId = await getDoneTransitionId(key);
  if (!transitionId) {
    console.warn(`  ⚠️  No "Done" transition found for ${key} — skipping`);
    return false;
  }
  await jira.post(`/issue/${key}/transitions`, { transition: { id: transitionId } });
  await jira.post(`/issue/${key}/comment`, {
    body: {
      type: 'doc', version: 1,
      content: [
        h2('🧹 AUTO-CLOSED — Jira Cleanup'),
        para(
          `This card was closed automatically by the cleanupAllCards.ts script.\n` +
          `Reason : Resetting KAN board for focused Login Module test run.\n` +
          `Date   : ${new Date().toLocaleString()}\n` +
          `Card   : ${key} | Type: ${type}`
        ),
      ],
    },
  });
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const W = 70;
  console.log('\n' + '═'.repeat(W));
  console.log('  JIRA CLEANUP — KAN Project');
  console.log('  Closing ALL open cards to reset for focused login suite');
  console.log('═'.repeat(W) + '\n');

  let startAt  = 0;
  const limit  = 50;
  let total    = 0;
  let closed   = 0;
  let skipped  = 0;

  const allCards: Array<{ key: string; fields: { issuetype: { name: string }; summary: string; status: { name: string } } }> = [];

  // Paginate through all open cards
  while (true) {
    const res = await jira.post('/search/jql', {
      jql:        `project = "${PROJECT}" AND statusCategory != Done ORDER BY created DESC`,
      maxResults: limit,
      startAt,
      fields:     ['summary', 'issuetype', 'status', 'priority'],
    });

    const issues = res.data.issues ?? [];
    total = res.data.total;
    allCards.push(...issues);

    if (allCards.length >= total || issues.length === 0) break;
    startAt += limit;
  }

  if (allCards.length === 0) {
    console.log('  ✅ No open cards found — board is already clean.\n');
    return;
  }

  console.log(`  Found ${allCards.length} open card(s) to close:\n`);
  console.log(`  ${'KEY'.padEnd(10)} ${'TYPE'.padEnd(10)} ${'SUMMARY'}`);
  console.log('  ' + '─'.repeat(W - 2));

  for (const card of allCards) {
    const key     = card.key;
    const type    = card.fields.issuetype.name;
    const summary = card.fields.summary.substring(0, 55);

    console.log(`  ${key.padEnd(10)} ${type.padEnd(10)} ${summary}`);

    try {
      const success = await closeCard(key, type, card.fields.summary);
      if (success) closed++; else skipped++;
    } catch (err: any) {
      console.error(`  ❌ Failed to close ${key}: ${err.response?.data?.errorMessages ?? err.message}`);
      skipped++;
    }
  }

  console.log('\n' + '─'.repeat(W));
  console.log(`  ✅ Closed : ${closed}`);
  console.log(`  ⚠️  Skipped: ${skipped}`);
  console.log(`  Total    : ${allCards.length}`);
  console.log('═'.repeat(W));

  console.log('\n  ▶ Board is clean. Ready to run focused login suite:');
  console.log('    npx playwright test tests/login-focused.spec.ts --project=chromium');
  console.log('');
}

main().catch(err => {
  console.error('\n❌ Cleanup failed:', err.response?.data ?? err.message);
  process.exit(1);
});
