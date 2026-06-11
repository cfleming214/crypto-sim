#!/usr/bin/env node
/**
 * Tears down everything scripts/seed-live-contest.mjs creates:
 *   1. Seed contests (Competition rows where createdBy = "seed-script") and all
 *      their CompetitionEntry rows.
 *   2. The bots' CompetitionEntry + UserProfile rows (matched by owner sub, so
 *      it also clears bot entries in any non-seed contest you tested with).
 *   3. The bot Cognito accounts (seedbot01–50, unless --keep-users is passed).
 *
 * It does NOT touch the precomputed GlobalLeaderboard table — the
 * tick-global-leaderboard Lambda drops the bots on its next run once their
 * UserProfiles are gone.
 *
 * Requires AWS credentials in env (same as seed-live-contest.mjs). Reads table
 * names + the user pool id from amplify_outputs.json.
 *
 * Usage:
 *   node scripts/seed-contests-clean.mjs                 # full teardown (incl. bot accounts)
 *   node scripts/seed-contests-clean.mjs --keep-users    # wipe data, keep the accounts
 *   node scripts/seed-contests-clean.mjs --dry-run       # show what it would delete
 */
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  DynamoDBClient,
  ListTablesCommand,
  ScanCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { readFileSync } from 'node:fs';

const DRY        = process.argv.includes('--dry-run');
const KEEP_USERS = process.argv.includes('--keep-users');

const outputs = JSON.parse(readFileSync('./amplify_outputs.json', 'utf8'));
const REGION    = outputs.auth?.aws_region ?? 'us-east-1';
const USER_POOL = outputs.auth?.user_pool_id;
if (!USER_POOL) throw new Error('Could not read user_pool_id from amplify_outputs.json');

const cog = new CognitoIdentityProviderClient({ region: REGION });
const ddb = new DynamoDBClient({ region: REGION });

const CREATED_BY = 'seed-script'; // must match seed-live-contest.mjs

// seed-live-contest.mjs names every bot seedbotNN@cryptocomp.app (NN = 1…1000).
// We find them by email prefix so teardown catches whatever a run created at any
// pool size, without probing 1000 individual emails.
const BOT_EMAIL_RE = /^seedbot\d+@cryptocomp\.app$/i;

async function findTables() {
  const want = ['Competition', 'CompetitionEntry', 'UserProfile'];
  const out = {};
  let next;
  do {
    const res = await ddb.send(new ListTablesCommand({ ExclusiveStartTableName: next }));
    for (const name of res.TableNames ?? []) {
      for (const m of want) {
        if (name.startsWith(`${m}-`) && name.endsWith('-NONE')) out[m] = name;
      }
    }
    next = res.LastEvaluatedTableName;
  } while (next);
  return out;
}

// List every seedbot* account in the pool (paginated email-prefix scan), with
// its username + sub. Scales to any pool size — no per-email probing.
async function botSubs() {
  const subs = [];
  let token;
  do {
    const res = await cog.send(new ListUsersCommand({
      UserPoolId: USER_POOL,
      Filter: 'email ^= "seedbot"',
      Limit: 60,
      PaginationToken: token,
    }));
    for (const u of res.Users ?? []) {
      const email = u.Attributes?.find(a => a.Name === 'email')?.Value ?? u.Username;
      const sub = u.Attributes?.find(a => a.Name === 'sub')?.Value;
      // Guard against any non-seed user the prefix filter happens to match.
      if (sub && BOT_EMAIL_RE.test(email)) subs.push({ email, username: u.Username, sub });
    }
    token = res.PaginationToken;
  } while (token);
  return subs;
}

const ownerStartsWithAny = (owner, subs) => subs.some(s => (owner ?? '').startsWith(s));

async function del(table, id) {
  if (DRY) return;
  await ddb.send(new DeleteItemCommand({ TableName: table, Key: marshall({ id }) }));
}

// Delete every row in `table` matching a predicate over the scanned item.
async function wipe(table, predicate, label) {
  if (!table) return 0;
  let count = 0, start;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: table, ExclusiveStartKey: start,
      ProjectionExpression: '#id, #owner, createdBy, competitionId',
      ExpressionAttributeNames: { '#id': 'id', '#owner': 'owner' },
    }));
    for (const it of res.Items ?? []) {
      if (predicate(it)) { await del(table, it.id.S); count++; }
    }
    start = res.LastEvaluatedKey;
  } while (start);
  console.log(`  ${label}: ${DRY ? 'would delete' : 'deleted'} ${count}`);
  return count;
}

async function main() {
  console.log(`Region: ${REGION}`);
  console.log(`User pool: ${USER_POOL}`);
  if (DRY) console.log('** DRY RUN — no deletes **');

  const tables = await findTables();
  console.log('\nTables:');
  for (const [m, t] of Object.entries(tables)) console.log(`  ${m} → ${t}`);

  const bots = await botSubs();
  const subs = bots.map(b => b.sub);
  console.log(`\nFound ${bots.length} seedbot account(s) in the pool.`);

  // 1. seed contests + their entries
  console.log('\nSeed contests:');
  const seedCompIds = new Set();
  let start;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: tables.Competition, ExclusiveStartKey: start,
      ProjectionExpression: '#id, createdBy',
      ExpressionAttributeNames: { '#id': 'id' },
    }));
    for (const it of res.Items ?? []) if (it.createdBy?.S === CREATED_BY) seedCompIds.add(it.id.S);
    start = res.LastEvaluatedKey;
  } while (start);
  await wipe(tables.CompetitionEntry, it => seedCompIds.has(it.competitionId?.S), 'seed-contest entries');
  for (const id of seedCompIds) await del(tables.Competition, id);
  console.log(`  contests: ${DRY ? 'would delete' : 'deleted'} ${seedCompIds.size}`);

  // 2. any remaining bot-owned rows (entries in other contests + profiles)
  if (subs.length) {
    console.log('\nBot-owned rows:');
    await wipe(tables.CompetitionEntry, it => ownerStartsWithAny(it.owner?.S, subs), 'bot entries (all contests)');
    await wipe(tables.UserProfile,      it => ownerStartsWithAny(it.owner?.S, subs), 'bot profiles');
  }

  // 3. bot Cognito accounts
  if (!KEEP_USERS && bots.length) {
    console.log('\nBot accounts:');
    for (const b of bots) {
      console.log(`  ${DRY ? 'would delete' : 'delete'} ${b.email}`);
      if (!DRY) await cog.send(new AdminDeleteUserCommand({ UserPoolId: USER_POOL, Username: b.username }));
    }
  } else if (KEEP_USERS) {
    console.log('\nBot accounts: kept (--keep-users)');
  }

  console.log(`\n✅ ${DRY ? 'Dry run complete.' : 'Teardown complete.'}`);
}

main().catch(e => { console.error(e); process.exit(1); });
