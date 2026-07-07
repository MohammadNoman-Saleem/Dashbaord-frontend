// Behavior check for the cockpit SLA governing clock and its follow-up override
// (docs/superpowers/specs/2026-07-06-cockpit-sla-freshness-audit.md follow-up).
//
// The status-based SLA clock is the default "when to act next" indicator. When a
// Next_Follow_up date is set, that follow-up REPLACES the status due for the
// case and drives the same clock, so it flows through the label, the due-now /
// due-today tiles, and the queue sort. The follow-up time of day is taken from
// the record's Modified_Time (the moment the follow-up was saved), read in
// Asia/Bahrain. Label format: passed -> "Due now"; under 24h -> hours ("In 7h");
// else date and month ("Jul 12"). Parked cases never take the follow-up.
//
// sla.ts is pure and imports nothing, so this compiles it standalone and calls
// the REAL governingClock (no re-implementation). Run: node scripts/verify-followup-sla.mjs
// Exits 0 when every assertion passes, 1 otherwise.
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = mkdtempSync(join(tmpdir(), 'sla-'));
// Run the local TypeScript compiler through node directly (portable; avoids the
// Windows .cmd spawn issue and does not depend on a global tsc).
execFileSync(
  process.execPath,
  [
    'node_modules/typescript/bin/tsc',
    'lib/server/services/sla.ts',
    '--outDir', out,
    '--rootDir', 'lib/server/services',
    '--module', 'es2022',
    '--target', 'es2022',
    '--moduleResolution', 'bundler',
    '--skipLibCheck',
  ],
  { stdio: 'inherit' },
);

const { governingClock } = await import(pathToFileURL(join(out, 'sla.js')).href);

const NOW = new Date('2026-07-07T08:00:00Z'); // Bahrain 11:00
const failures = [];

function check(label, actual, wanted) {
  const ok = actual === wanted;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got "${actual}", wanted "${wanted}"`);
  if (!ok) failures.push(label);
}

// A case whose status clock is already overdue (first_contact, entered 3 days
// ago). No follow-up: the status clock governs, so it is due now. (Regression
// guard: the default path is unchanged.)
const overdueNoFollowUp = governingClock(
  { step: 'first_contact', statusChange: '2026-07-04T08:00:00Z', createdTime: '2026-07-04T08:00:00Z', nextFollowUp: null, modifiedTime: '2026-07-04T08:00:00Z' },
  NOW,
);
check('no follow-up keeps the status clock (due now)', overdueNoFollowUp.due_label, 'Due now');
check('no follow-up keeps the status kind', overdueNoFollowUp.kind, 'due_now');

// Same overdue case, now with a follow-up five days out. The follow-up governs:
// label is the date and month, and it drops off the due-now list (on_track).
const followUpFuture = governingClock(
  { step: 'first_contact', statusChange: '2026-07-04T08:00:00Z', createdTime: '2026-07-04T08:00:00Z', nextFollowUp: '2026-07-12', modifiedTime: '2026-07-07T08:00:00Z' },
  NOW,
);
check('future follow-up shows date and month', followUpFuture.due_label, 'Jul 12');
check('future follow-up is on track (off due-now)', followUpFuture.kind, 'on_track');

// Follow-up later today, within 24h: shows hours. modifiedTime Bahrain 15:00, so
// the follow-up instant is 2026-07-07 15:00 Bahrain = 12:00Z, four hours out.
const followUpHours = governingClock(
  { step: 'first_contact', statusChange: '2026-07-04T08:00:00Z', createdTime: '2026-07-04T08:00:00Z', nextFollowUp: '2026-07-07', modifiedTime: '2026-07-07T12:00:00Z' },
  NOW,
);
check('follow-up within 24h shows hours', followUpHours.due_label, 'In 4h');
check('follow-up within 24h is due today', followUpHours.kind, 'due_today');

// Follow-up overrides even when the status clock is fine. Status just entered
// (not due for ~24 business hours), but a follow-up two hours out governs.
const followUpBeatsFreshStatus = governingClock(
  { step: 'first_contact', statusChange: '2026-07-07T08:00:00Z', createdTime: '2026-07-07T08:00:00Z', nextFollowUp: '2026-07-07', modifiedTime: '2026-07-07T10:00:00Z' },
  NOW,
);
check('follow-up overrides a fresh status clock', followUpBeatsFreshStatus.due_label, 'In 2h');

// Follow-up already in the past: due now.
const followUpPast = governingClock(
  { step: 'first_contact', statusChange: '2026-07-07T08:00:00Z', createdTime: '2026-07-07T08:00:00Z', nextFollowUp: '2026-07-05', modifiedTime: '2026-07-05T08:00:00Z' },
  NOW,
);
check('past follow-up is due now', followUpPast.due_label, 'Due now');
check('past follow-up kind is due now', followUpPast.kind, 'due_now');

// A parked case never takes the follow-up: it stays parked.
const parkedWithFollowUp = governingClock(
  { step: 'parked', statusChange: '2026-07-04T08:00:00Z', createdTime: '2026-07-04T08:00:00Z', nextFollowUp: '2026-07-12', modifiedTime: '2026-07-07T08:00:00Z' },
  NOW,
);
check('parked ignores the follow-up', parkedWithFollowUp.due_label, 'Parked');

console.log('');
if (failures.length === 0) {
  console.log('All follow-up SLA assertions passed.');
  process.exit(0);
} else {
  console.log(`${failures.length} assertion(s) failed.`);
  process.exit(1);
}
