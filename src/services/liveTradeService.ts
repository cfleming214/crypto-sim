import { isAmplifyConfigured } from '../lib/amplify';
import { hasAuthSession } from '../lib/authState';

// Global "live trades" ticker. Each user writes their own LiveTrade rows
// (owner-auth); everyone reads the latest 25 via the `liveTradesByFeed` index.
// Mirrors the lazy generateClient() pattern used across the other services.

let clientPromise: Promise<any> | null = null;
async function getClient() {
  if (!isAmplifyConfigured) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      const { generateClient } = await import('aws-amplify/data');
      return generateClient();
    })();
  }
  return clientPromise;
}

export interface LiveTradeRow {
  id: string;
  handle: string;
  symbol: string;
  side: 'buy' | 'sell' | string;
  amountUsd: number;
  units: number;
  price: number;
  avatarColor?: string;
  tradedAt: string;
}

const FEED = 'global';
const TTL_DAYS = 30; // keep the feed populated on low-traffic days (was 2)

// Broadcast one executed trade to the global feed. No-op for reward/cash sentinel
// trades and when the user is hidden from the leaderboard (privacy opt-out). Best
// effort — never blocks or throws into the trade flow.
export async function recordLiveTrade(
  trade: { symbol: string; side: string; amount: number; units: number; price: number; timestamp: number; kind?: string },
  user: { handle: string; avatarColor?: string; leaderboardVisible?: boolean },
): Promise<void> {
  if (trade.kind === 'reward' || trade.symbol === 'USD') return; // not a real coin trade
  if (user.leaderboardVisible === false) return;                  // respect the opt-out
  if (!(await hasAuthSession())) return;                          // guests can't write LiveTrade
  const client = await getClient();
  if (!client) return;
  try {
    await client.models.LiveTrade.create({
      feed: FEED,
      handle: user.handle,
      symbol: trade.symbol,
      side: trade.side,
      amountUsd: trade.amount,
      units: trade.units,
      price: trade.price,
      avatarColor: user.avatarColor,
      tradedAt: new Date(trade.timestamp || Date.now()).toISOString(),
      expiresAt: Math.floor(Date.now() / 1000) + TTL_DAYS * 86400,
    });
  } catch (e) {
    console.warn('recordLiveTrade failed', e);
  }
}

export interface TradeMixSlice { symbol: string; count: number; pct: number }

// Top coins by trade count over the last 24h across the global feed, with each
// coin's share of all 24h trades. Samples up to `sampleLimit` recent rows (newest
// first) and aggregates client-side — enough for the "what's being traded" widget
// without a dedicated aggregate table. Returns the top `top` slices (default 5).
export async function fetchTradeMix24h(sampleLimit = 500, top = 5): Promise<TradeMixSlice[]> {
  if (!(await hasAuthSession())) return [];
  const client = await getClient();
  if (!client) return [];
  try {
    const { data } = await client.models.LiveTrade.liveTradesByFeed(
      { feed: FEED },
      { sortDirection: 'DESC', limit: sampleLimit },
    );
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const counts: Record<string, number> = {};
    let total = 0;
    for (const t of data as any[]) {
      const at = t.tradedAt ? Date.parse(t.tradedAt) : NaN;
      if (!Number.isFinite(at) || at < cutoff) continue;
      const sym = String(t.symbol || '').toUpperCase();
      if (!sym) continue;
      counts[sym] = (counts[sym] ?? 0) + 1;
      total += 1;
    }
    if (total === 0) return [];
    return Object.entries(counts)
      .map(([symbol, count]) => ({ symbol, count, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, top);
  } catch (e) {
    console.warn('fetchTradeMix24h failed', e);
    return [];
  }
}

// The latest `limit` trades across all users, newest first.
export async function fetchLiveTrades(limit = 25): Promise<LiveTradeRow[]> {
  if (!(await hasAuthSession())) return [];                        // userPool-only read
  const client = await getClient();
  if (!client) return [];
  try {
    const { data } = await client.models.LiveTrade.liveTradesByFeed(
      { feed: FEED },
      { sortDirection: 'DESC', limit },
    );
    return (data as any[]).map((t) => ({
      id: t.id,
      handle: t.handle,
      symbol: t.symbol,
      side: t.side,
      amountUsd: t.amountUsd ?? 0,
      units: t.units ?? 0,
      price: t.price ?? 0,
      avatarColor: t.avatarColor ?? undefined,
      tradedAt: t.tradedAt,
    }));
  } catch (e) {
    console.warn('fetchLiveTrades failed', e);
    return [];
  }
}
