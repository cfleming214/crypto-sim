#!/usr/bin/env node
/**
 * Wipes E2E test data from the live Amplify sandbox.
 *
 * Scope of deletion (everything keyed by an email starting with `test-`):
 *   1. Cognito users whose email matches `test-*`
 *   2. DynamoDB rows owned by those users across:
 *        UserProfile, Trade, PublicProfile, CompetitionEntry, Mirror,
 *        CoachNudge
 *   3. S3 avatars under `avatars/{sub}/`
 *
 * Usage:
 *   node scripts/cleanup-test-data.mjs                 # interactive (prompts to confirm)
 *   node scripts/cleanup-test-data.mjs --dry-run       # lists what would be deleted, deletes nothing
 *   node scripts/cleanup-test-data.mjs --yes           # skip prompt (CI)
 *
 * Requires AWS credentials in env (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
 * AWS_REGION) or a configured ~/.aws/credentials. The script reads table
 * names + the Cognito user pool id from `amplify_outputs.json`.
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
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const DRY = process.argv.includes('--dry-run');
const YES = process.argv.includes('--yes');

const outputs = JSON.parse(readFileSync('./amplify_outputs.json', 'utf8'));
const REGION    = outputs.auth?.aws_region ?? 'us-east-1';
const USER_POOL = outputs.auth?.user_pool_id;
const BUCKET    = outputs.storage?.bucket_name;
if (!USER_POOL) throw new Error('Could not read user_pool_id from amplify_outputs.json');

const cog = new CognitoIdentityProviderClient({ region: REGION });
const ddb = new DynamoDBClient({ region: REGION });
const s3  = BUCKET ? new S3Client({ region: REGION }) : null;

// Tables to clean — discovered dynamically so the schema can evolve.
const TARGET_MODELS = [
  'UserProfile', 'Trade', 'PublicProfile',
  'CompetitionEntry', 'Mirror', 'CoachNudge',
];

async function findTables() {
  const out = {};
  const res = await ddb.send(new ListTablesCommand({}));
  for (const name of res.TableNames ?? []) {
    for (const m of TARGET_MODELS) {
      if (name.startsWith(`${m}-`) && name.endsWith('-NONE')) out[m] = name;
    }
  }
  return out;
}

async function listTestUsers() {
  const users = [];
  let nextToken;
  do {
    const res = await cog.send(new ListUsersCommand({
      UserPoolId: USER_POOL,
      Filter: 'email ^= "test-"',
      Limit: 60,
      PaginationToken: nextToken,
    }));
    for (const u of res.Users ?? []) {
      const email = u.Attributes?.find(a => a.Name === 'email')?.Value;
      const sub   = u.Attributes?.find(a => a.Name === 'sub')?.Value;
      if (email && sub) users.push({ username: u.Username, email, sub });
    }
    nextToken = res.PaginationToken;
  } while (nextToken);
  return users;
}

function ownerMatches(record, subs) {
  // Amplify Gen 2 stores owner as "{sub}::{username}" — match by sub prefix.
  const owner = record.owner?.S ?? '';
  return subs.some(s => owner.startsWith(s));
}

async function wipeTableRows(tableName, ownerSubs) {
  const toDelete = [];
  let exclusiveStartKey;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: exclusiveStartKey,
      ProjectionExpression: '#id, #owner',
      ExpressionAttributeNames: { '#id': 'id', '#owner': 'owner' },
    }));
    for (const item of res.Items ?? []) {
      if (ownerMatches(item, ownerSubs)) toDelete.push(item.id.S);
    }
    exclusiveStartKey = res.LastEvaluatedKey;
  } while (exclusiveStartKey);

  console.log(`  ${tableName}: ${toDelete.length} matching rows`);
  if (DRY || toDelete.length === 0) return toDelete.length;
  for (const id of toDelete) {
    await ddb.send(new DeleteItemCommand({
      TableName: tableName,
      Key: marshall({ id }),
    }));
  }
  return toDelete.length;
}

async function wipeS3Avatars(subs) {
  if (!s3 || !BUCKET) return 0;
  let total = 0;
  for (const sub of subs) {
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: `avatars/${sub}/`,
    }));
    const keys = (list.Contents ?? []).map(o => ({ Key: o.Key }));
    if (keys.length === 0) continue;
    console.log(`  s3://${BUCKET}/avatars/${sub}/: ${keys.length} object${keys.length === 1 ? '' : 's'}`);
    if (!DRY) {
      await s3.send(new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: keys },
      }));
    }
    total += keys.length;
  }
  return total;
}

async function main() {
  console.log(`Region: ${REGION}`);
  console.log(`User pool: ${USER_POOL}`);
  if (BUCKET) console.log(`S3 bucket: ${BUCKET}`);

  const users = await listTestUsers();
  console.log(`\nFound ${users.length} test-* Cognito user${users.length === 1 ? '' : 's'}:`);
  for (const u of users) console.log(`  ${u.email}  (sub=${u.sub.slice(0, 8)}…)`);
  if (users.length === 0) { console.log('Nothing to clean up.'); return; }

  const tables = await findTables();
  console.log('\nDiscovered tables:');
  for (const [m, t] of Object.entries(tables)) console.log(`  ${m} → ${t}`);

  if (!DRY && !YES) {
    const rl = createInterface({ input: stdin, output: stdout });
    const ok = (await rl.question(`\nDelete the above? type "yes" to confirm: `)).trim();
    rl.close();
    if (ok.toLowerCase() !== 'yes') { console.log('Aborted.'); return; }
  }

  console.log('\nDynamoDB cleanup:');
  const subs = users.map(u => u.sub);
  let ddbTotal = 0;
  for (const [, table] of Object.entries(tables)) {
    ddbTotal += await wipeTableRows(table, subs);
  }

  console.log('\nS3 cleanup:');
  const s3Total = await wipeS3Avatars(subs);

  if (!DRY) {
    console.log('\nCognito cleanup:');
    for (const u of users) {
      console.log(`  delete ${u.email}`);
      await cog.send(new AdminDeleteUserCommand({
        UserPoolId: USER_POOL,
        Username: u.username,
      }));
    }
  }

  console.log(`\n${DRY ? '[dry-run] would delete' : 'Deleted'}: ${users.length} users · ${ddbTotal} DDB rows · ${s3Total} S3 objects`);
}

main().catch(e => { console.error(e); process.exit(1); });
