import { DynamoDBClient, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

// Each replay portfolio starts at this much (matches STARTING_CASH).
const STARTING_BANKROLL = 100000;

type Holding = { symbol: string; units: number };

// Deterministic replay price: the close at the current historical minute, where
// elapsed real time maps 1:1 to historical time. IDENTICAL formula to the client
// (src/services/replayPricing.ts) so the server agrees with every device.
function replayPriceNow(prices: number[], startAtMs: number, intervalMs: number, now: number): number {
  if (!prices.length) return 0;
  const i = Math.max(0, Math.min(prices.length - 1, Math.floor((now - startAtMs) / (intervalMs || 60000))));
  return prices[i];
}

// EventBridge, every 5 minutes. Re-values every active ReplayEntry against its
// contest's deterministic current price and re-ranks within each contest.
// Completely separate from the live tick-leaderboard — it never reads the Token
// table, so it cannot influence live contest/global ranking.
export const handler = async (): Promise<void> => {
  const contestTable = process.env.REPLAY_CONTEST_TABLE_NAME;
  const entryTable = process.env.REPLAY_ENTRY_TABLE_NAME;
  if (!contestTable) throw new Error('REPLAY_CONTEST_TABLE_NAME not set');
  if (!entryTable) throw new Error('REPLAY_ENTRY_TABLE_NAME not set');

  const now = Date.now();

  // 1. Live contests → current price + coin, keyed by contest id.
  const contests: Record<string, { coin: string; price: number }> = {};
  let cStart: Record<string, any> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({ TableName: contestTable, ExclusiveStartKey: cStart }));
    for (const raw of res.Items ?? []) {
      const c = unmarshall(raw) as {
        id: string; coin?: string; status?: string; startAt?: string; intervalMs?: number; pricesJson?: string;
      };
      if (c.status === 'finished') continue;
      let prices: number[] = [];
      try { prices = JSON.parse(c.pricesJson || '[]'); } catch { prices = []; }
      if (!prices.length) continue;
      const startAtMs = c.startAt ? Date.parse(c.startAt) : now;
      contests[c.id] = {
        coin: (c.coin || '').toUpperCase(),
        price: replayPriceNow(prices, startAtMs, c.intervalMs ?? 60000, now),
      };
    }
    cStart = res.LastEvaluatedKey;
  } while (cStart);

  // 2. All active entries (paginated).
  const entries: Array<{ id: string; replayContestId: string; cash?: number; holdingsJson?: string; bankroll?: number }> = [];
  let eStart: Record<string, any> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: entryTable,
      ExclusiveStartKey: eStart,
      FilterExpression: 'isActive = :t',
      ExpressionAttributeValues: { ':t': { BOOL: true } },
    }));
    for (const i of res.Items ?? []) entries.push(unmarshall(i) as any);
    eStart = res.LastEvaluatedKey;
  } while (eStart);

  // 3. Value each entry: cash + units of the contest coin × its current price.
  const valued = entries.map(e => {
    const contest = contests[e.replayContestId];
    let value = e.bankroll ?? STARTING_BANKROLL;
    if (contest && e.holdingsJson != null) {
      let holdings: Holding[] = [];
      try { holdings = JSON.parse(e.holdingsJson || '[]'); } catch { holdings = []; }
      const held = holdings.reduce(
        (sum, h) => sum + ((h.symbol || '').toUpperCase() === contest.coin ? (h.units || 0) * contest.price : 0),
        0,
      );
      value = (e.cash ?? 0) + held;
    }
    const pnlPct = ((value - STARTING_BANKROLL) / STARTING_BANKROLL) * 100;
    return { id: e.id, replayContestId: e.replayContestId, value, pnlPct };
  });

  // 4. Group by contest, rank by value, write back rank/bankroll/pnlPct.
  const byContest: Record<string, typeof valued> = {};
  for (const v of valued) (byContest[v.replayContestId] ??= []).push(v);

  for (const list of Object.values(byContest)) {
    list.sort((a, b) => b.value - a.value);
    await Promise.all(list.map((entry, i) =>
      ddb.send(new UpdateItemCommand({
        TableName: entryTable,
        Key: marshall({ id: entry.id }),
        UpdateExpression: 'SET #rnk = :rnk, #bk = :bk, #pp = :pp',
        ExpressionAttributeNames: { '#rnk': 'rank', '#bk': 'bankroll', '#pp': 'pnlPct' },
        ExpressionAttributeValues: marshall({
          ':rnk': i + 1,
          ':bk': Number(entry.value.toFixed(2)),
          ':pp': Number(entry.pnlPct.toFixed(2)),
        }),
      })),
    ));
  }
};
