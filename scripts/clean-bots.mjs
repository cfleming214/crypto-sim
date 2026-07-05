// One-off comprehensive bot cleanup: deletes bot Cognito users + their DynamoDB
// rows (UserProfile, PublicProfile, GlobalLeaderboard, LiveTrade), plus orphaned
// LoadBot/StressBot/SeedBot profiles. HARD-PRESERVES real accounts.
//
//   node scripts/clean-bots.mjs            # DRY RUN — prints what it would delete
//   node scripts/clean-bots.mjs --execute  # actually delete
//
// Reads region/pool from amplify_outputs.json. Needs admin AWS creds.
import { CognitoIdentityProviderClient, ListUsersCommand, AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient, ListTablesCommand, ScanCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { readFileSync } from 'node:fs';

const EXECUTE = process.argv.includes('--execute');
const out = JSON.parse(readFileSync(new URL('../amplify_outputs.json', import.meta.url)));
const REGION = out.auth.aws_region;
const POOL = out.auth.user_pool_id;

// ── the ONLY things treated as bots ──────────────────────────────────────────
const BOT_DOMAINS = new Set(['sim.cryptocomp.app', 'example.com']); // phantom + test/e2e/stress cohorts
const BOT_HANDLE_RE = /^(LoadBot|StressBot|SeedBot)\d*$/i;
// ── HARD preserve — never delete these, no matter what ───────────────────────
const PRESERVE_DOMAINS = new Set(['gmail.com', 'icloud.com', '126.com', 'cryptocomp.app', 'admin.com']);
const PRESERVE_HANDLES = new Set(['chef', 'chrisf']);

const cog = new CognitoIdentityProviderClient({ region: REGION });
const ddb = new DynamoDBClient({ region: REGION });
const emailOf = (u) => (u.Attributes.find(a => a.Name === 'email')?.Value ?? '').toLowerCase();
const subOf = (u) => u.Attributes.find(a => a.Name === 'sub')?.Value ?? u.Username;

async function findTable(needle) {
  let ExclusiveStartTableName, hit;
  do {
    const r = await ddb.send(new ListTablesCommand({ ExclusiveStartTableName }));
    hit = (r.TableNames ?? []).find(t => t.includes(needle));
    ExclusiveStartTableName = r.LastEvaluatedTableName;
  } while (!hit && ExclusiveStartTableName);
  return hit;
}
async function* scanAll(table) {
  let k; do { const o = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey: k })); for (const it of o.Items ?? []) yield unmarshall(it); k = o.LastEvaluatedKey; } while (k);
}

(async () => {
  console.log(`Region ${REGION} · Pool ${POOL} · ${EXECUTE ? '*** EXECUTE ***' : 'DRY RUN'}\n`);

  // 1. Cognito: classify.
  const users = [];
  let tok; do { const r = await cog.send(new ListUsersCommand({ UserPoolId: POOL, PaginationToken: tok, Limit: 60 })); users.push(...(r.Users ?? [])); tok = r.PaginationToken; } while (tok);
  const botUsers = [], keepUsers = [];
  for (const u of users) {
    const dom = emailOf(u).split('@')[1] ?? '';
    if (BOT_DOMAINS.has(dom) && !PRESERVE_DOMAINS.has(dom)) botUsers.push(u);
    else keepUsers.push(u);
  }
  const botSubs = new Set(botUsers.map(subOf));
  console.log(`Cognito: ${users.length} total → DELETE ${botUsers.length} bots · KEEP ${keepUsers.length}`);
  console.log(`  keeping: ${keepUsers.map(emailOf).join(', ')}\n`);

  const isBotRow = (r) => {
    if (PRESERVE_HANDLES.has(r.handle)) return false;
    const sub = (r.owner || '').split('::')[0];
    return botSubs.has(sub) || BOT_HANDLE_RE.test(r.handle || '');
  };

  // 2. DynamoDB rows across the bot-facing tables.
  const plan = {};
  for (const needle of ['UserProfile', 'PublicProfile', 'GlobalLeaderboard']) {
    const table = await findTable(needle);
    const del = [];
    for await (const r of scanAll(table)) if (isBotRow(r)) del.push(r);
    plan[needle] = { table, del };
    console.log(`${needle}: DELETE ${del.length}`);
  }
  // LiveTrade: bot trades in the feed, matched by handle.
  const botHandles = new Set(plan.UserProfile.del.map(r => r.handle).filter(Boolean));
  const ltTable = await findTable('LiveTrade');
  const ltDel = [];
  for await (const r of scanAll(ltTable)) if (botHandles.has(r.handle)) ltDel.push(r);
  plan.LiveTrade = { table: ltTable, del: ltDel };
  console.log(`LiveTrade: DELETE ${ltDel.length}`);

  if (!EXECUTE) { console.log('\nDRY RUN — re-run with --execute to delete.'); return; }

  // 3. Execute — DynamoDB rows first, then Cognito users.
  console.log('\nDeleting…');
  for (const { table, del } of Object.values(plan)) {
    await Promise.all(del.map(r => ddb.send(new DeleteItemCommand({ TableName: table, Key: marshall({ id: r.id }) })).catch(() => {})));
  }
  let du = 0;
  for (const u of botUsers) { try { await cog.send(new AdminDeleteUserCommand({ UserPoolId: POOL, Username: u.Username })); du++; } catch { /* ignore */ } }
  console.log(`Done. Deleted ${du}/${botUsers.length} Cognito users + their rows.`);
})().catch(e => { console.error(e); process.exit(1); });
