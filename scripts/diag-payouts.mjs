#!/usr/bin/env node
// READ-ONLY diagnostic: watch a user's Stripe payout state flip pending → paid.
// Prints their StripeAccount row + every Payout row, flagging MOCK transfers
// (a `mock_tr_` id means settlement ran before STRIPE_SECRET_KEY was wired).
//   node scripts/diag-payouts.mjs --handle chrisf
//   node scripts/diag-payouts.mjs --email you@email.com
//   node scripts/diag-payouts.mjs --owner <cognito-sub>
import { DynamoDBClient, ListTablesCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { readFileSync } from 'node:fs';

const argVal = (flag, dflt) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : dflt; };
const HANDLE = argVal('--handle', 'chrisf');
const EMAIL = argVal('--email', null);
const OWNER_ARG = argVal('--owner', null);

const outputs = JSON.parse(readFileSync('./amplify_outputs.json', 'utf8'));
const REGION = outputs.auth?.aws_region ?? 'us-east-1';
const ddb = new DynamoDBClient({ region: REGION });

async function findTable(model) {
  let next;
  do {
    const res = await ddb.send(new ListTablesCommand({ ExclusiveStartTableName: next }));
    for (const n of res.TableNames ?? []) if (n.startsWith(`${model}-`) && n.endsWith('-NONE')) return n;
    next = res.LastEvaluatedTableName;
  } while (next);
  throw new Error(`table for ${model} not found — deploy the backend first`);
}
async function scanAll(table) {
  const out = []; let k;
  do { const r = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey: k })); for (const i of r.Items ?? []) out.push(unmarshall(i)); k = r.LastEvaluatedKey; } while (k);
  return out;
}

// Resolve the target user's bare Cognito sub (StripeAccount.id / Payout.userId).
async function resolveSub() {
  if (OWNER_ARG) return OWNER_ARG.split('::')[0];
  if (EMAIL) {
    const { CognitoIdentityProviderClient, AdminGetUserCommand } = await import('@aws-sdk/client-cognito-identity-provider');
    const pool = outputs.auth?.user_pool_id;
    if (!pool) throw new Error('user_pool_id missing from amplify_outputs.json');
    const cog = new CognitoIdentityProviderClient({ region: REGION });
    const got = await cog.send(new AdminGetUserCommand({ UserPoolId: pool, Username: EMAIL }));
    const sub = got.UserAttributes?.find(a => a.Name === 'sub')?.Value;
    if (!sub) throw new Error(`no sub for ${EMAIL}`);
    return sub;
  }
  const target = HANDLE.replace(/^@/, '').toLowerCase();
  for (const p of await scanAll(await findTable('UserProfile'))) {
    if ((p.handle ?? '').replace(/^@/, '').toLowerCase() === target && p.owner) return p.owner.split('::')[0];
  }
  throw new Error(`No UserProfile found with handle "${HANDLE}". Pass --handle, --email, or --owner.`);
}

const sub = await resolveSub();
console.log(`\nRegion: ${REGION}   user sub: ${sub.slice(0, 12)}…`);

// StripeAccount (keyed by the bare sub; close-competition reads payoutsEnabled to auto-pay).
const acctTable = await findTable('StripeAccount');
const acct = (await scanAll(acctTable)).find(a => (a.id ?? '').split('::')[0] === sub || a.userId === sub);
console.log('\n=== StripeAccount ===');
if (!acct) {
  console.log('  (no row) → user has not claimed a prize or onboarded yet');
  console.log('  balance=$0.00');
} else {
  console.log([
    `acct=${acct.stripeAccountId ?? '(none)'}`,
    `payoutsEnabled=${acct.payoutsEnabled === true ? 'YES ✅' : 'no ❌'}`,
    `detailsSubmitted=${acct.detailsSubmitted === true ? 'yes' : 'no'}`,
    `status=${acct.status ?? '?'}`,
  ].join('  '));
  console.log([
    `balance=$${((acct.balanceCents ?? 0) / 100).toFixed(2)}`,
    `method=${acct.preferredMethodLabel ?? '(none)'}`,
  ].join('  '));
}

// Payout rows for this user (id = "<competitionId>#<userId>").
const payoutTable = await findTable('Payout');
const payouts = (await scanAll(payoutTable))
  .filter(p => p.userId === sub || (p.id ?? '').endsWith(`#${sub}`))
  .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
console.log(`\n=== Payout rows (${payouts.length}) ===`);
for (const p of payouts) {
  const isMock = String(p.stripeTransferId ?? '').startsWith('mock_tr_');
  const flags = [p.claimed ? '✓claimed' : '·', p.withdrawn ? '✓withdrawn' : '·'].join(' ');
  console.log([
    `$${((p.amountCents ?? 0) / 100).toFixed(2)}`.padStart(9),
    `rank=#${p.rank ?? '?'}`,
    `status=${(p.status ?? '?').toUpperCase()}`.padEnd(12),
    flags.padEnd(20),
    `tx=${p.stripeTransferId ?? '(none)'}`.padEnd(24),
    isMock ? '← MOCK ⚠️' : '',
    `· ${p.competitionName ?? p.competitionId?.slice(0, 8) ?? ''}`,
  ].join('  '));
}
if (!payouts.length) console.log('  (none yet) → seed a win + wait ≤10 min for close-competition');

// WithdrawalRequest rows for this user.
const wTable = await findTable('WithdrawalRequest');
const withdrawals = (await scanAll(wTable))
  .filter(w => w.userId === sub)
  .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
console.log(`\n=== WithdrawalRequest rows (${withdrawals.length}) ===`);
for (const w of withdrawals) {
  const isMock = String(w.stripeTransferId ?? '').startsWith('mock_tr_');
  let nContests = 0;
  try { nContests = JSON.parse(w.payoutsJson || '[]').length; } catch {}
  console.log([
    `$${((w.amountCents ?? 0) / 100).toFixed(2)}`.padStart(9),
    `status=${(w.status ?? '?').toUpperCase()}`.padEnd(12),
    `contests=${nContests}`,
    `tx=${w.stripeTransferId ?? '(none)'}`.padEnd(36),
    isMock ? '← MOCK ⚠️' : '',
    w.failureReason ? `· ${w.failureReason}` : '',
  ].join('  '));
}
if (!withdrawals.length) console.log('  (none yet) → claim a prize, then request a withdrawal in-app');
console.log();
