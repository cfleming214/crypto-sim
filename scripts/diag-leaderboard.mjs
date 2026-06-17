#!/usr/bin/env node
// READ-ONLY diagnostic: why isn't the top-XP user on the global leaderboard?
// Scans UserProfile (top by XP) + GlobalLeaderboard and prints the fields the
// tick-global-leaderboard Lambda gates on (owner, handle, leaderboardVisible).
//   node scripts/diag-leaderboard.mjs
import { DynamoDBClient, ListTablesCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { readFileSync } from 'node:fs';

const outputs = JSON.parse(readFileSync('./amplify_outputs.json', 'utf8'));
const ddb = new DynamoDBClient({ region: outputs.auth?.aws_region ?? 'us-east-1' });

async function findTable(model) {
  let next;
  do {
    const res = await ddb.send(new ListTablesCommand({ ExclusiveStartTableName: next }));
    for (const n of res.TableNames ?? []) if (n.startsWith(`${model}-`) && n.endsWith('-NONE')) return n;
    next = res.LastEvaluatedTableName;
  } while (next);
  throw new Error(`table for ${model} not found`);
}
async function scanAll(table) {
  const out = []; let k;
  do { const r = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey: k })); for (const i of r.Items ?? []) out.push(unmarshall(i)); k = r.LastEvaluatedKey; } while (k);
  return out;
}

const profileTable = await findTable('UserProfile');
const boardTable = await findTable('GlobalLeaderboard');

const profiles = (await scanAll(profileTable)).sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0));
console.log(`\n=== Top 8 UserProfiles by XP (of ${profiles.length}) ===`);
for (const p of profiles.slice(0, 8)) {
  const onBoard = p.leaderboardVisible !== false && !!p.owner && !!p.handle;
  console.log([
    `xp=${(p.xp ?? 0).toLocaleString().padStart(8)}`,
    `won=${p.contestsWon ?? 0}`,
    `handle=${p.handle ?? '(none)'}`.padEnd(20),
    `owner=${p.owner ? 'yes' : 'MISSING'}`,
    `visible=${p.leaderboardVisible === false ? 'OFF ❌' : 'on'}`,
    onBoard ? '→ eligible' : '→ EXCLUDED ❌',
  ].join('  '));
}

const board = (await scanAll(boardTable)).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
console.log(`\n=== GlobalLeaderboard rows (${board.length}) ===`);
for (const b of board.slice(0, 10)) {
  console.log(`#${String(b.rank).padStart(3)}  xp=${(b.xp ?? 0).toLocaleString().padStart(8)}  won=${b.contestsWon ?? 0}  @${b.handle}`);
}

// Wins detail for the top-XP user (the Lambda counts rank===1 && isActive===false).
const me = profiles[0];
const myOwner = me?.owner;
const entryTable = await findTable('CompetitionEntry');
const myEntries = (await scanAll(entryTable)).filter(e => e.owner && myOwner && e.owner.split('::')[0] === myOwner.split('::')[0]);
console.log(`\n=== ${me?.handle}'s CompetitionEntry rows (${myEntries.length}) ===`);
for (const e of myEntries) {
  console.log(`comp=${(e.competitionId ?? '').slice(0, 8)}  rank=${e.rank}  active=${e.isActive}  bankroll=${Math.round(e.bankroll ?? 0)}  ${e.rank === 1 && e.isActive === false ? '← COUNTS AS WIN' : ''}`);
}
const myWins = myEntries.filter(e => e.rank === 1 && e.isActive === false).length;
console.log(`\n${me?.handle}: profile.contestsWon=${me?.contestsWon ?? 0}, finished-1st entries=${myWins} → Lambda would show ${Math.max(myWins, me?.contestsWon ?? 0)} wins`);
