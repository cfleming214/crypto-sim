#!/usr/bin/env node
// One-off backfill: set cashPrize=true on existing contests whose prizesJson is a
// non-empty dollar array (so payments-off builds correctly hide them). Idempotent
// — skips rows already flagged. Covers Competition + FinishedCompetition.
//   node scripts/flag-cash-contests.mjs [--dry-run]
import { DynamoDBClient, ListTablesCommand, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { readFileSync } from 'node:fs';

const DRY = process.argv.includes('--dry-run');
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
  return null;
}
async function* scanAll(table) {
  let k;
  do { const o = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey: k })); for (const it of o.Items ?? []) yield it; k = o.LastEvaluatedKey; } while (k);
}
const isCash = (c) => {
  let prizes = [];
  try { prizes = JSON.parse(c.prizesJson || '[]'); } catch { prizes = []; }
  return Array.isArray(prizes) && prizes.length > 0 && prizes.reduce((s, v) => s + Number(v || 0), 0) > 0;
};

let flagged = 0, already = 0;
for (const model of ['Competition', 'FinishedCompetition']) {
  const table = await findTable(model);
  if (!table) { console.log(`(${model} table not found — skipping)`); continue; }
  for await (const raw of scanAll(table)) {
    const c = unmarshall(raw);
    if (!isCash(c)) continue;
    if (c.cashPrize === true) { already++; continue; }
    if (!DRY) await ddb.send(new UpdateItemCommand({
      TableName: table, Key: marshall({ id: c.id }),
      UpdateExpression: 'SET cashPrize = :t, updatedAt = :u',
      ExpressionAttributeValues: marshall({ ':t': true, ':u': new Date().toISOString() }),
    }));
    flagged++;
    console.log(`  ${DRY ? 'would flag' : 'flagged'} [${model}] ${c.name ?? c.id}`);
  }
}
console.log(`\n${DRY ? 'Would flag' : 'Flagged'} ${flagged} cash contest(s); ${already} already flagged.`);
