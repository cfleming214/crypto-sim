import {
  DynamoDBClient,
  ScanCommand,
  PutItemCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

const TOP_N = 100;
const STARTING_BANKROLL = 10000;

interface Holding { symbol: string; units: number; }

// Runs on EventBridge schedule every 5 minutes. Values every opted-in user's
// portfolio at current Token prices, ranks them, and rewrites the top-N
// GlobalLeaderboard rows (id = rank string). All portfolios start at $10k, so
// ranking by live value == ranking by P&L%.
export const handler = async (): Promise<void> => {
  const profileTable = process.env.USER_PROFILE_TABLE_NAME;
  const tokenTable = process.env.TOKEN_TABLE_NAME;
  const boardTable = process.env.GLOBAL_LEADERBOARD_TABLE_NAME;
  if (!profileTable || !tokenTable || !boardTable) throw new Error('Table env vars not set');

  // 1. Price map { SYMBOL -> lastPrice } from the Token catalog (no external calls).
  const priceMap: Record<string, number> = { USDC: 1 };
  for await (const row of scanAll(tokenTable)) {
    const t = unmarshall(row) as { symbol?: string; lastPrice?: number };
    if (t.symbol && typeof t.lastPrice === 'number') priceMap[t.symbol] = t.lastPrice;
  }

  // 2. Value every visible profile.
  type Ranked = {
    owner: string; handle: string; value: number; pnlPct: number;
    league?: string; avatarKey?: string; avatarColor?: string;
  };
  const ranked: Ranked[] = [];
  for await (const row of scanAll(profileTable)) {
    const p = unmarshall(row) as {
      owner?: string; handle?: string; cash?: number; holdingsJson?: string;
      league?: string; avatarKey?: string; avatarColor?: string; leaderboardVisible?: boolean;
    };
    if (p.leaderboardVisible === false) continue; // opted out (null/undefined = visible)
    if (!p.owner || !p.handle) continue;

    let holdings: Holding[] = [];
    try { holdings = JSON.parse(p.holdingsJson || '[]'); } catch { holdings = []; }
    const holdingsValue = holdings.reduce(
      (sum, h) => sum + (h.units || 0) * (priceMap[h.symbol] ?? 0), 0,
    );
    const value = (p.cash ?? 0) + holdingsValue;
    const pnlPct = ((value - STARTING_BANKROLL) / STARTING_BANKROLL) * 100;
    ranked.push({
      owner: p.owner, handle: p.handle, value, pnlPct,
      league: p.league, avatarKey: p.avatarKey, avatarColor: p.avatarColor,
    });
  }

  ranked.sort((a, b) => b.value - a.value);
  const top = ranked.slice(0, TOP_N);
  const now = new Date().toISOString();

  // 3. Write rows 1..N (id = rank string), overwriting in place.
  await Promise.all(top.map((r, i) =>
    ddb.send(new PutItemCommand({
      TableName: boardTable,
      Item: marshall({
        id: String(i + 1),
        __typename: 'GlobalLeaderboard',
        rank: i + 1,
        owner: r.owner,
        handle: r.handle,
        value: r.value,
        pnlPct: r.pnlPct,
        league: r.league ?? null,
        avatarKey: r.avatarKey ?? null,
        avatarColor: r.avatarColor ?? null,
        updatedAt: now,
      }, { removeUndefinedValues: true }),
    })),
  ));

  // 4. Delete stale rows beyond the current count (fewer visible users than last run).
  const stale: string[] = [];
  for await (const row of scanAll(boardTable)) {
    const id = (row.id as { S?: string })?.S;
    if (id && Number(id) > top.length) stale.push(id);
  }
  await Promise.all(stale.map(id =>
    ddb.send(new DeleteItemCommand({ TableName: boardTable, Key: marshall({ id }) })),
  ));
};

// Paginated full-table scan generator.
async function* scanAll(table: string) {
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const out = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey }));
    for (const item of out.Items ?? []) yield item;
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}
