import { DynamoDBClient, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

const SLIPPAGE = 0.001;   // 0.1%, matches the client sim
const MAX_TRADES = 50;    // cap the per-entry trade log we persist

// AppSync resolver event for the executeContestTrade mutation. identity is the
// authenticated Cognito user — the SERVER derives the owner from it, so a client
// can never trade on someone else's entry or spoof the identity.
interface ResolverEvent {
  arguments?: { competitionId?: string; symbol?: string; side?: 'buy' | 'sell'; amount?: number };
  identity?: { sub?: string; username?: string };
}

type Holding = { symbol: string; units: number; avgCost: number };

// Server-sourced price for a symbol from the Token catalog. Token is keyed by the
// default `id`, so we scan (the table is tiny, ~65 rows / one page) and match on
// the symbol attribute — the client-passed price is NEVER trusted.
async function serverPrice(tokenTable: string, symbol: string): Promise<number> {
  const want = symbol.toUpperCase();
  let start: Record<string, any> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: tokenTable,
      ExclusiveStartKey: start,
      ProjectionExpression: '#s, lastPrice',
      ExpressionAttributeNames: { '#s': 'symbol' },
    }));
    for (const it of res.Items ?? []) {
      if (it.symbol?.S?.toUpperCase() === want) return it.lastPrice?.N ? Number(it.lastPrice.N) : 0;
    }
    start = res.LastEvaluatedKey;
  } while (start);
  return 0;
}

// Server-authoritative CONTEST trade. Validates against the caller's own
// CompetitionEntry (cash for buys, held units for sells) at the SERVER price and
// writes back cash/holdingsJson/tradesJson. bankroll/rank are left to
// tick-leaderboard / settlement re-rank (PR4) — this only owns the ledger.
export const handler = async (event: ResolverEvent): Promise<Record<string, any>> => {
  const entryTable = process.env.COMPETITION_ENTRY_TABLE_NAME;
  const tokenTable = process.env.TOKEN_TABLE_NAME;
  if (!entryTable || !tokenTable) throw new Error('table env vars not set');

  const sub = event.identity?.sub;
  const { competitionId, symbol, side, amount } = event.arguments ?? {};
  if (!sub) return { ok: false, error: 'Unauthenticated' };
  if (!competitionId || !symbol || (side !== 'buy' && side !== 'sell')) return { ok: false, error: 'Bad request' };
  if (!amount || !Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'Invalid amount' };

  // Locate the caller's OWN active entry (owner is "sub::username").
  const { Items = [] } = await ddb.send(new ScanCommand({
    TableName: entryTable,
    FilterExpression: 'competitionId = :cid AND begins_with(#o, :sub)',
    ExpressionAttributeNames: { '#o': 'owner' },
    ExpressionAttributeValues: marshall({ ':cid': competitionId, ':sub': sub }),
  }));
  const raw = Items.find(i => (i.isActive?.BOOL ?? true) !== false);
  if (!raw) return { ok: false, error: 'Not joined' };
  const entry = unmarshall(raw) as { id: string; cash?: number; holdingsJson?: string; tradesJson?: string };

  const price = await serverPrice(tokenTable, symbol);
  if (price <= 0) return { ok: false, error: 'No price for symbol' };

  let cash = entry.cash ?? 0;
  let holdings: Holding[] = [];
  try { holdings = JSON.parse(entry.holdingsJson || '[]'); } catch { holdings = []; }

  const sym = symbol.toUpperCase();
  const effPrice = side === 'buy' ? price * (1 + SLIPPAGE) : price * (1 - SLIPPAGE);
  const units = amount / effPrice;

  if (side === 'buy') {
    if (cash < amount) return { ok: false, error: 'Insufficient cash' };
    cash -= amount;
    const existing = holdings.find(h => h.symbol === sym);
    holdings = existing
      ? holdings.map(h => h.symbol === sym
          ? { ...h, units: h.units + units, avgCost: (h.avgCost * h.units + amount) / (h.units + units) }
          : h)
      : [...holdings, { symbol: sym, units, avgCost: effPrice }];
  } else {
    const held = holdings.find(h => h.symbol === sym);
    if (!held || held.units < units - 1e-9) return { ok: false, error: 'Insufficient holdings' };
    cash += units * effPrice;
    holdings = held.units - units < 1e-6
      ? holdings.filter(h => h.symbol !== sym)
      : holdings.map(h => h.symbol === sym ? { ...h, units: h.units - units } : h);
  }

  let trades: any[] = [];
  try { trades = JSON.parse(entry.tradesJson || '[]'); } catch { trades = []; }
  const trade = { id: `SIM-${sub.slice(0, 6)}-${Date.now().toString(36).toUpperCase()}`, symbol: sym, side, amount, units, price: effPrice, timestamp: new Date().toISOString() };
  trades = [trade, ...trades].slice(0, MAX_TRADES);

  await ddb.send(new UpdateItemCommand({
    TableName: entryTable,
    Key: marshall({ id: entry.id }),
    UpdateExpression: 'SET cash = :c, holdingsJson = :h, tradesJson = :t',
    ExpressionAttributeValues: marshall({ ':c': Number(cash.toFixed(2)), ':h': JSON.stringify(holdings), ':t': JSON.stringify(trades) }),
  }));

  return { ok: true, cash: Number(cash.toFixed(2)), holdings, trade };
};
