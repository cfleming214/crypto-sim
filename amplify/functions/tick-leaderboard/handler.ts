import { DynamoDBClient, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

// Each contest portfolio is funded with this much (matches the app's
// STARTING_CASH and the seed script). Used to derive pnlPct from live value.
const STARTING_BANKROLL = 100000;

type Holding = { symbol: string; units: number };

// Runs on an EventBridge schedule every 5 minutes.
// Re-VALUES every active CompetitionEntry from its holdings at *current* Token
// prices (cash + Σ units·price), then re-ranks within each competition. This is
// what makes the leaderboard move on its own — including for seeded bots, whose
// holdings reprice as the market moves even though they never place a trade.
// (The previous version only re-sorted a frozen `bankroll`, so bot rows never
// changed.)
export const handler = async (): Promise<void> => {
  const entryTable = process.env.COMPETITION_ENTRY_TABLE_NAME;
  const tokenTable = process.env.TOKEN_TABLE_NAME;
  if (!entryTable) throw new Error('COMPETITION_ENTRY_TABLE_NAME not set');
  if (!tokenTable) throw new Error('TOKEN_TABLE_NAME not set');

  // 1. Current price for every token, keyed by uppercase symbol.
  const priceMap: Record<string, number> = {};
  let tStart: Record<string, any> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: tokenTable,
      ExclusiveStartKey: tStart,
      ProjectionExpression: '#s, lastPrice',
      ExpressionAttributeNames: { '#s': 'symbol' },
    }));
    for (const it of res.Items ?? []) {
      const sym = it.symbol?.S;
      const price = it.lastPrice?.N ? Number(it.lastPrice.N) : 0;
      if (sym && price > 0) priceMap[sym.toUpperCase()] = price;
    }
    tStart = res.LastEvaluatedKey;
  } while (tStart);

  // 2. All active entries (paginated).
  const entries: Array<{
    id: string; competitionId: string; bankroll?: number; cash?: number; holdingsJson?: string; pnlPct?: number;
  }> = [];
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

  // 3. Reprice each entry from its holdings at current prices. Entries with no
  //    holdingsJson (older rows) keep their stored bankroll so they aren't lost.
  const valued = entries.map(e => {
    let value = e.bankroll ?? STARTING_BANKROLL;
    if (e.holdingsJson != null) {
      let holdings: Holding[] = [];
      try { holdings = JSON.parse(e.holdingsJson || '[]'); } catch { holdings = []; }
      const held = holdings.reduce((sum, h) => sum + (h.units || 0) * (priceMap[(h.symbol || '').toUpperCase()] ?? 0), 0);
      value = (e.cash ?? 0) + held;
    }
    const pnlPct = ((value - STARTING_BANKROLL) / STARTING_BANKROLL) * 100;
    return { id: e.id, competitionId: e.competitionId, value, pnlPct };
  });

  // 4. Group by competition, rank by live value, and write back bankroll +
  //    pnlPct + rank so the app's leaderboard query/subscription reflects it.
  const byComp: Record<string, typeof valued> = {};
  for (const v of valued) (byComp[v.competitionId] ??= []).push(v);

  for (const compEntries of Object.values(byComp)) {
    compEntries.sort((a, b) => b.value - a.value);
    await Promise.all(compEntries.map((entry, i) =>
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
