/**
 * 1099-MISC export. Scans the AnnualWinnings table for a tax year and emits a CSV
 * of every payee whose cumulative cash winnings reached the $600 IRS reporting
 * threshold — the list you (or your accountant) file 1099-MISC forms for.
 *
 * Usage:
 *   node scripts/export-1099.mjs 2026            # print CSV to stdout
 *   node scripts/export-1099.mjs 2026 > 1099.csv # save to a file
 *
 * Requires AWS creds in env / ~/.aws. Reads region from amplify_outputs.json.
 * Read-only — never mutates data.
 */
import { readFileSync } from 'node:fs';
import { DynamoDBClient, ListTablesCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const THRESHOLD_CENTS = 60_000; // $600 IRS 1099-MISC reporting threshold

const year = Number(process.argv[2] ?? new Date().getUTCFullYear());
if (!Number.isInteger(year)) {
  console.error('Usage: node scripts/export-1099.mjs <taxYear>');
  process.exit(1);
}

const outputs = JSON.parse(readFileSync('./amplify_outputs.json', 'utf8'));
const REGION = outputs.auth?.aws_region ?? 'us-east-1';
const ddb = new DynamoDBClient({ region: REGION });

async function findTable(model) {
  let next;
  do {
    const res = await ddb.send(new ListTablesCommand({ ExclusiveStartTableName: next }));
    for (const name of res.TableNames ?? []) {
      if (name.startsWith(`${model}-`) && name.endsWith('-NONE')) return name;
    }
    next = res.LastEvaluatedTableName;
  } while (next);
  throw new Error(`table for ${model} not found — deploy the backend first`);
}

async function* scanAll(table) {
  let ExclusiveStartKey;
  do {
    const out = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey }));
    for (const it of out.Items ?? []) yield unmarshall(it);
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}

const table = await findTable('AnnualWinnings');
const rows = [];
for await (const r of scanAll(table)) {
  if (Number(r.taxYear) === year && Number(r.totalCents ?? 0) >= THRESHOLD_CENTS) {
    rows.push({ userId: r.userId, taxYear: r.taxYear, totalCents: Number(r.totalCents), w9Required: !!r.w9Required });
  }
}
rows.sort((a, b) => b.totalCents - a.totalCents);

// CSV to stdout. console.error keeps the human summary off the piped CSV.
console.log('userId,taxYear,totalUsd,w9Required');
for (const r of rows) {
  console.log(`${r.userId},${r.taxYear},${(r.totalCents / 100).toFixed(2)},${r.w9Required}`);
}
console.error(`\n${rows.length} payee(s) at or above $${(THRESHOLD_CENTS / 100).toFixed(0)} for ${year}.`);
