import {
  DynamoDBClient,
  DeleteItemCommand,
  PutItemCommand,
  ScanCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { pushToUser } from '../lib/expoPush';

const ddb = new DynamoDBClient({});

// Each contest funds a fresh $100K (matches STARTING_CASH + tick-leaderboard).
const STARTING_BANKROLL = 100000;
type Holding = { symbol: string; units: number };

// Current price for every token, keyed by uppercase symbol — used to revalue
// entries at settlement so payouts don't trust client-written bankroll/rank.
async function buildPriceMap(tokenTable: string): Promise<Record<string, number>> {
  const priceMap: Record<string, number> = {};
  let start: Record<string, any> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: tokenTable,
      ExclusiveStartKey: start,
      ProjectionExpression: '#s, lastPrice',
      ExpressionAttributeNames: { '#s': 'symbol' },
    }));
    for (const it of res.Items ?? []) {
      const sym = it.symbol?.S;
      const price = it.lastPrice?.N ? Number(it.lastPrice.N) : 0;
      if (sym && price > 0) priceMap[sym.toUpperCase()] = price;
    }
    start = res.LastEvaluatedKey;
  } while (start);
  return priceMap;
}

// Amplify owner fields can be stored as "<sub>::<username>" or just "<sub>".
// Payout rows are keyed by the bare sub, so normalize before use.
const subFromOwner = (owner: string | undefined): string =>
  owner ? owner.split('::')[0] : '';

// IRS 1099-MISC reporting threshold: $600 in winnings per payee per calendar year.
const W9_THRESHOLD_CENTS = 60_000;

// Add a prize to the winner's per-tax-year rollup (AnnualWinnings, id
// "<userId>#<taxYear>"). Called once per winner at settlement (guarded by the
// conditional Payout put), so totals never double-count. Flips `w9Required` once
// the year crosses $600 — the payout Lambdas then require a W-9 before transfer.
async function bumpAnnualWinnings(userId: string, owner: string | undefined, amountCents: number) {
  const table = process.env.ANNUAL_WINNINGS_TABLE_NAME;
  if (!table || !userId || !(amountCents > 0)) return;
  const taxYear = new Date().getUTCFullYear();
  const id = `${userId}#${taxYear}`;
  const now = new Date().toISOString();
  try {
    const res = await ddb.send(new UpdateItemCommand({
      TableName: table,
      Key: marshall({ id }),
      UpdateExpression:
        'SET userId = :u, taxYear = :y, updatedAt = :n, #tn = :tn, #o = if_not_exists(#o, :o), createdAt = if_not_exists(createdAt, :n) ADD totalCents :c',
      ExpressionAttributeNames: { '#tn': '__typename', '#o': 'owner' },
      ExpressionAttributeValues: marshall({
        ':u': userId, ':y': taxYear, ':n': now, ':tn': 'AnnualWinnings', ':o': owner ?? userId, ':c': amountCents,
      }),
      ReturnValues: 'UPDATED_NEW',
    }));
    const total = res.Attributes ? Number(unmarshall(res.Attributes).totalCents ?? 0) : 0;
    if (total >= W9_THRESHOLD_CENTS) {
      await ddb.send(new UpdateItemCommand({
        TableName: table,
        Key: marshall({ id }),
        UpdateExpression: 'SET w9Required = :t',
        ExpressionAttributeValues: marshall({ ':t': true }),
      }));
    }
  } catch (err) {
    console.error('annual-winnings rollup failed for', id, err); // never block settlement
  }
}

// Create the UNCLAIMED Payout row for one winning entry. No transfer happens
// here anymore — the winner claims the prize into their in-app balance, then
// withdraws it (the daily process-withdrawals Lambda does the Stripe transfer).
// Idempotent: the row id is "<competitionId>#<userId>" and the PutItem is
// conditional, so the 10-minute cron re-settling a contest never duplicates a
// prize or re-notifies.
async function settleWinner(
  payoutTable: string,
  comp: { id: string; name?: string },
  entry: { owner?: string; rank?: number },
  amountCents: number,
) {
  const userId = subFromOwner(entry.owner);
  if (!userId) return;

  const payoutId = `${comp.id}#${userId}`;
  const now = new Date().toISOString();

  // Create the prize row once (conditional) in its initial unclaimed state.
  try {
    await ddb.send(new PutItemCommand({
      TableName: payoutTable,
      Item: marshall({
        id: payoutId,
        __typename: 'Payout',
        owner: entry.owner,
        userId,
        competitionId: comp.id,
        competitionName: comp.name ?? '',
        rank: entry.rank ?? null,
        amountCents,
        status: 'unclaimed',
        claimed: false,
        withdrawn: false,
        createdAt: now,
        updatedAt: now,
      }, { removeUndefinedValues: true }),
      ConditionExpression: 'attribute_not_exists(id)',
    }));
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return; // already settled
    throw err;
  }

  // Roll this prize into the winner's annual 1099 total (once per winner — we're
  // inside the conditional-put branch, so a re-settle never double-counts).
  await bumpAnnualWinnings(userId, entry.owner, amountCents);

  // Notify the winner — fired inside the once-per-winner conditional-put branch,
  // so the 10-minute cron re-settling a contest never re-notifies.
  const pushTable = process.env.PUSH_TOKEN_TABLE_NAME;
  if (pushTable) {
    const dollars = (amountCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const place = entry.rank === 1 ? '1st place' : entry.rank === 2 ? '2nd place' : entry.rank === 3 ? '3rd place' : `Rank #${entry.rank}`;
    try {
      await pushToUser(pushTable, userId, {
        title: 'You won! 🏆',
        body: `${place} in ${comp.name || 'your contest'} — $${dollars} prize to claim`,
        data: { type: 'contest_result', competitionId: comp.id },
      });
    } catch (err) {
      console.error('Winner push failed for', payoutId, err); // never block settlement on a push
    }
  }
}

async function settleCompetition(entryTable: string, comp: any, priceMap: Record<string, number>) {
  const payoutTable = process.env.PAYOUT_TABLE_NAME;
  if (!payoutTable) throw new Error('PAYOUT_TABLE_NAME not set');

  let prizes: number[] = [];
  try { prizes = JSON.parse(comp.prizesJson || '[]'); } catch { prizes = []; }
  const numberOfPrizes = comp.numberOfPrizes ?? prizes.length;
  if (numberOfPrizes <= 0 || prizes.length === 0) return; // free contest, nothing to pay

  const { Items: entryItems = [] } = await ddb.send(new ScanCommand({
    TableName: entryTable,
    FilterExpression: 'competitionId = :cid',
    ExpressionAttributeValues: marshall({ ':cid': comp.id }),
  }));

  // Recompute standings HERE from holdings × current price — do NOT trust the
  // client-written bankroll or the stored rank at settlement (future-fixes 2.1).
  // This is money-critical: it makes the payout independent of tick-leaderboard
  // timing and of a forged bankroll number. (Forged HOLDINGS are addressed by
  // PR5 — routing contest trades through execute-trade.)
  const valued = entryItems.map(raw => {
    const e = unmarshall(raw) as { owner?: string; bankroll?: number; cash?: number; holdingsJson?: string };
    let value = e.bankroll ?? STARTING_BANKROLL;
    if (e.holdingsJson != null) {
      let holdings: Holding[] = [];
      try { holdings = JSON.parse(e.holdingsJson || '[]'); } catch { holdings = []; }
      const held = holdings.reduce((s, h) => s + (h.units || 0) * (priceMap[(h.symbol || '').toUpperCase()] ?? 0), 0);
      value = (e.cash ?? 0) + held;
    }
    return { owner: e.owner, value };
  });
  valued.sort((a, b) => b.value - a.value);

  for (let i = 0; i < valued.length && i < numberOfPrizes; i++) {
    const dollars = prizes[i];
    if (!dollars || dollars <= 0) continue;
    await settleWinner(payoutTable, comp, { owner: valued[i].owner, rank: i + 1 }, Math.round(dollars * 100));
  }
}

// Runs on EventBridge schedule every 10 minutes.
// Closes any non-finished competition whose endAt has passed, paying out prizes.
// We settle 'open' as well as 'live': a contest created with a future start is
// 'open' until something flips it to 'live', and if nothing does before it ends,
// it would otherwise be stranded 'open' forever (ended on screen, never settled,
// XP/prizes never awarded). endAt <= now means it has definitely ended either way.
export const handler = async (): Promise<void> => {
  const compTable = process.env.COMPETITION_TABLE_NAME;
  const entryTable = process.env.COMPETITION_ENTRY_TABLE_NAME;
  if (!compTable || !entryTable) throw new Error('Table env vars not set');

  const now = new Date().toISOString();

  const { Items = [] } = await ddb.send(new ScanCommand({
    TableName: compTable,
    FilterExpression: '(#s = :live OR #s = :open) AND endAt <= :now',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: marshall({ ':live': 'live', ':open': 'open', ':now': now }),
  }));

  // Snapshot prices ONCE per run (only if something is due) to revalue entries at
  // settlement. Missing table/prices → empty map; settleCompetition then falls
  // back to stored bankroll per-entry so nothing is stranded.
  const tokenTable = process.env.TOKEN_TABLE_NAME;
  const priceMap = (Items.length && tokenTable) ? await buildPriceMap(tokenTable) : {};

  const finishedTable = process.env.FINISHED_COMPETITION_TABLE_NAME;

  for (const raw of Items) {
    const fullComp = unmarshall(raw);
    const comp = fullComp as { id: string; name?: string; prizesJson?: string; numberOfPrizes?: number };

    // Settle prizes BEFORE archiving, so a crash mid-settle leaves the contest
    // 'live' and the next run re-settles (idempotently) what's missing.
    await settleCompetition(entryTable, comp, priceMap);

    // Mark all entries inactive while the contest still exists.
    const { Items: entryItems = [] } = await ddb.send(new ScanCommand({
      TableName: entryTable,
      FilterExpression: 'competitionId = :cid',
      ExpressionAttributeValues: marshall({ ':cid': comp.id }),
    }));
    await Promise.all(entryItems.map(rawEntry => {
      const entry = unmarshall(rawEntry) as { id: string };
      return ddb.send(new UpdateItemCommand({
        TableName: entryTable,
        Key: marshall({ id: entry.id }),
        UpdateExpression: 'SET isActive = :f',
        ExpressionAttributeValues: marshall({ ':f': false }),
      }));
    }));

    // Archive: MOVE the finished contest into FinishedCompetition (copy + delete
    // from Competition) so the live table only ever holds open/live contests and
    // the app reads this table for its "Past" list. If the archive table env var
    // isn't set (pre-deploy), fall back to flipping status in place.
    const nowIso = new Date().toISOString();
    if (finishedTable) {
      await ddb.send(new PutItemCommand({
        TableName: finishedTable,
        Item: marshall({ ...fullComp, __typename: 'FinishedCompetition', status: 'finished', finishedAt: nowIso, updatedAt: nowIso }, { removeUndefinedValues: true }),
      }));
      await ddb.send(new DeleteItemCommand({
        TableName: compTable,
        Key: marshall({ id: comp.id }),
      }));
    } else {
      await ddb.send(new UpdateItemCommand({
        TableName: compTable,
        Key: marshall({ id: comp.id }),
        UpdateExpression: 'SET #s = :finished',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: marshall({ ':finished': 'finished' }),
      }));
    }
  }
};
