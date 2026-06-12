import {
  DynamoDBClient,
  ScanCommand,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { randomUUID } from 'crypto';
import { pushToUser } from '../lib/expoPush';

const ddb = new DynamoDBClient({});

// Amplify owner fields are "<sub>::<username>" or just "<sub>".
const subFromOwner = (owner: string | undefined): string => (owner ? owner.split('::')[0] : '');

// Mirror of src/services/gamification.ts sell-XP math so server fills award the
// same XP the client would.
const SELL_XP_BASE = 10;
const SELL_XP_BONUS_CAP = 120;
function sellXp(pnl: number, proceeds: number): number {
  if (pnl <= 0) return SELL_XP_BASE;
  const cost = proceeds - pnl;
  const returnPct = cost > 0 ? (pnl / cost) * 100 : 0;
  const bonus = Math.min(SELL_XP_BONUS_CAP, Math.max(0, Math.round(returnPct)));
  return SELL_XP_BASE + bonus;
}
const BUY_XP = 25;

// Built-in symbol → CoinGecko id map (mirror of priceService DEFAULT_COINGECKO_IDS);
// merged with the dashboard Token catalog at runtime.
const DEFAULT_COINGECKO_IDS: Record<string, string> = {
  USDC: 'usd-coin', BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin',
  XRP: 'ripple', DOGE: 'dogecoin', ADA: 'cardano', AVAX: 'avalanche-2', LINK: 'chainlink',
  DOT: 'polkadot', TRX: 'tron', TON: 'the-open-network', SHIB: 'shiba-inu', LTC: 'litecoin',
  BCH: 'bitcoin-cash', UNI: 'uniswap', ATOM: 'cosmos', XLM: 'stellar', NEAR: 'near',
  APT: 'aptos', ARB: 'arbitrum', OP: 'optimism', FIL: 'filecoin', ICP: 'internet-computer', AAVE: 'aave',
};

interface Holding { symbol: string; units: number; avgCost: number; }
interface AlertRow { alertId: string; symbol: string; targetPrice: number; direction: string; owner?: string; active?: boolean; }
interface OrderRow { orderId: string; symbol: string; side: string; amount: number; limitPrice: number; owner?: string; active?: boolean; }

export const handler = async (): Promise<void> => {
  const alertTable   = process.env.PRICE_ALERT_TABLE_NAME;
  const orderTable   = process.env.LIMIT_ORDER_TABLE_NAME;
  const profileTable = process.env.USER_PROFILE_TABLE_NAME;
  const tradeTable   = process.env.TRADE_TABLE_NAME;
  const tokenTable   = process.env.TOKEN_TABLE_NAME;
  const pushTable    = process.env.PUSH_TOKEN_TABLE_NAME;
  if (!alertTable || !orderTable || !profileTable || !tradeTable) {
    throw new Error('price-watch table env vars not set');
  }

  // 1. Collect active alerts + orders. Bail before any CoinGecko call if empty.
  const alerts: AlertRow[] = [];
  for await (const row of scanActive(alertTable)) alerts.push(unmarshall(row) as AlertRow);
  const orders: OrderRow[] = [];
  for await (const row of scanActive(orderTable)) orders.push(unmarshall(row) as OrderRow);
  if (alerts.length === 0 && orders.length === 0) return;

  // 2. symbol → coingeckoId (defaults merged with the dashboard catalog).
  const geckoIds: Record<string, string> = { ...DEFAULT_COINGECKO_IDS };
  if (tokenTable) {
    for await (const row of scanAll(tokenTable)) {
      const t = unmarshall(row) as { symbol?: string; coingeckoId?: string };
      if (t.symbol && t.coingeckoId) geckoIds[t.symbol.toUpperCase()] = t.coingeckoId;
    }
  }

  // 3. Live prices for just the symbols we need.
  const symbols = new Set<string>([...alerts.map(a => a.symbol), ...orders.map(o => o.symbol)]);
  const price = await fetchPrices(symbols, geckoIds);

  // 4. Price alerts → claim (so we only fire once) then push.
  for (const a of alerts) {
    const p = price[a.symbol];
    if (typeof p !== 'number') continue;
    const fired = a.direction === 'above' ? p >= a.targetPrice : p <= a.targetPrice;
    if (!fired) continue;
    if (!(await claim(alertTable, 'alertId', a.alertId))) continue;
    const sub = subFromOwner(a.owner);
    if (pushTable && sub) {
      await pushToUser(pushTable, sub, {
        title: `${a.symbol} price alert`,
        body: `Price ${a.direction === 'above' ? 'rose above' : 'fell below'} your $${fmt(a.targetPrice)} target.`,
        data: { type: 'price_alert', symbol: a.symbol },
      }).catch(err => console.error('alert push failed', err));
    }
  }

  if (orders.length === 0) return;

  // 5. Limit orders are filled authoritatively. Load every profile once, keyed
  // by bare sub (UserProfile uses a random id, so we can't GetItem by sub).
  type Prof = { id: string; cash: number; xp: number; holdings: Holding[]; owner?: string };
  const profBySub: Record<string, Prof> = {};
  for await (const row of scanAll(profileTable)) {
    const p = unmarshall(row) as { id?: string; owner?: string; cash?: number; xp?: number; holdingsJson?: string };
    const sub = subFromOwner(p.owner);
    if (!p.id || !sub) continue;
    if (profBySub[sub] && profBySub[sub].xp >= (p.xp ?? 0)) continue; // keep highest-xp dupe
    let holdings: Holding[] = [];
    try { holdings = JSON.parse(p.holdingsJson || '[]'); } catch { holdings = []; }
    profBySub[sub] = { id: p.id, cash: p.cash ?? 0, xp: p.xp ?? 0, holdings, owner: p.owner };
  }

  // Group triggered orders by owner so each profile is written once.
  const ordersBySub: Record<string, OrderRow[]> = {};
  for (const o of orders) {
    const p = price[o.symbol];
    if (typeof p !== 'number') continue;
    const triggered = o.side === 'buy' ? p <= o.limitPrice : p >= o.limitPrice;
    if (!triggered) continue;
    const sub = subFromOwner(o.owner);
    if (!sub || !profBySub[sub]) continue;
    (ordersBySub[sub] ||= []).push(o);
  }

  const nowIso = new Date().toISOString();
  for (const [sub, subOrders] of Object.entries(ordersBySub)) {
    const prof = profBySub[sub];
    let dirty = false;
    for (const o of subOrders) {
      const p = price[o.symbol];
      // Claim the order row first — conditional on active=true. If the client
      // already filled it (deleted the row) or another run claimed it, skip.
      if (!(await claim(orderTable, 'orderId', o.orderId))) continue;

      const fill = applyFill(prof, o, p);
      if (!fill) continue; // couldn't afford / nothing to sell — order is consumed, no trade
      dirty = true;

      // Write the Trade row (id = order id, 'LMT-' prefix → client treats it as a
      // background fill). Mirrors portfolioService.saveTrade + AppSync fields.
      await ddb.send(new PutItemCommand({
        TableName: tradeTable,
        Item: marshall({
          id: randomUUID(),
          __typename: 'Trade',
          tradeId: o.orderId,
          owner: o.owner,
          symbol: o.symbol,
          side: o.side,
          amount: fill.amount,
          units: fill.units,
          price: p,
          xpEarned: fill.xpEarned,
          slippage: 0,
          timestamp: Date.now(),
          createdAt: nowIso,
          updatedAt: nowIso,
        }, { removeUndefinedValues: true }),
      }));

      if (pushTable) {
        const verb = o.side === 'buy' ? 'Bought' : 'Sold';
        await pushToUser(pushTable, sub, {
          title: 'Limit order filled',
          body: `${verb} ${fill.units.toFixed(4)} ${o.symbol} at $${fmt(p)}`,
          data: { type: 'limit_fill', symbol: o.symbol },
        }).catch(err => console.error('fill push failed', err));
      }
    }
    if (dirty) {
      await ddb.send(new UpdateItemCommand({
        TableName: profileTable,
        Key: marshall({ id: prof.id }),
        UpdateExpression: 'SET cash = :c, holdingsJson = :h, xp = :x, updatedAt = :u',
        ExpressionAttributeValues: marshall({
          ':c': prof.cash, ':h': JSON.stringify(prof.holdings), ':x': prof.xp, ':u': nowIso,
        }),
      }));
    }
  }
};

// Execute a fill against the in-memory profile copy, mutating it. Returns the
// trade economics, or null if it couldn't execute (consumes the order anyway,
// mirroring the client reducer which drops un-fillable triggered orders).
function applyFill(
  prof: { cash: number; xp: number; holdings: Holding[] },
  o: OrderRow,
  price: number,
): { amount: number; units: number; xpEarned: number } | null {
  if (o.side === 'buy') {
    if (o.symbol === 'USDC') return null;            // never strand cash in the anchor
    if (prof.cash < o.amount) return null;           // can't afford
    const units = o.amount / price;
    const existing = prof.holdings.find(h => h.symbol === o.symbol);
    if (existing) {
      existing.avgCost = (existing.avgCost * existing.units + o.amount) / (existing.units + units);
      existing.units += units;
    } else {
      prof.holdings.push({ symbol: o.symbol, units, avgCost: price });
    }
    prof.cash -= o.amount;
    prof.xp += BUY_XP;
    return { amount: o.amount, units, xpEarned: BUY_XP };
  }
  // sell
  const holding = prof.holdings.find(h => h.symbol === o.symbol);
  if (!holding) return null;
  const unitsToSell = Math.min(o.amount / price, holding.units);
  if (unitsToSell <= 0) return null;
  const proceeds = unitsToSell * price;
  const pnl = unitsToSell * (price - holding.avgCost);
  const xpEarned = sellXp(pnl, proceeds);
  if (unitsToSell >= holding.units - 1e-9) {
    prof.holdings = prof.holdings.filter(h => h.symbol !== o.symbol);
  } else {
    holding.units -= unitsToSell;
  }
  prof.cash += proceeds;
  prof.xp += xpEarned;
  return { amount: proceeds, units: unitsToSell, xpEarned };
}

// Claim a row by flipping active true→false, conditional on it still being
// active. Returns false if the condition failed (already claimed / deleted).
async function claim(table: string, idField: string, idValue: string): Promise<boolean> {
  try {
    await ddb.send(new UpdateItemCommand({
      TableName: table,
      Key: marshall({ [idField]: idValue }),
      UpdateExpression: 'SET active = :f',
      ConditionExpression: 'active = :t',
      ExpressionAttributeValues: marshall({ ':f': false, ':t': true }),
    }));
    return true;
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return false;
    console.error('claim failed', table, idValue, err);
    return false;
  }
}

async function fetchPrices(symbols: Set<string>, geckoIds: Record<string, string>): Promise<Record<string, number>> {
  const out: Record<string, number> = { USDC: 1 };
  const wanted = [...symbols].filter(s => s !== 'USDC' && geckoIds[s]);
  if (wanted.length === 0) return out;
  const ids = [...new Set(wanted.map(s => geckoIds[s]))].join(',');
  const headers: Record<string, string> = { accept: 'application/json' };
  if (process.env.COINGECKO_API_KEY) headers['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY;
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}`, { headers });
    if (!res.ok) { console.error('CoinGecko', res.status); return out; }
    const json = (await res.json()) as Array<{ id?: string; current_price?: number }>;
    const byGecko: Record<string, number> = {};
    for (const c of json) if (c?.id && typeof c.current_price === 'number') byGecko[c.id] = c.current_price;
    for (const s of wanted) {
      const p = byGecko[geckoIds[s]];
      if (typeof p === 'number' && p > 0) out[s] = p;
    }
  } catch (err) {
    console.error('fetchPrices failed', err);
  }
  return out;
}

function fmt(n: number): string {
  return n < 0.01 ? n.toFixed(6) : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function* scanActive(table: string) {
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const out = await ddb.send(new ScanCommand({
      TableName: table,
      FilterExpression: 'active = :a',
      ExpressionAttributeValues: marshall({ ':a': true }),
      ExclusiveStartKey,
    }));
    for (const item of out.Items ?? []) yield item;
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}

async function* scanAll(table: string) {
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const out = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey }));
    for (const item of out.Items ?? []) yield item;
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}
