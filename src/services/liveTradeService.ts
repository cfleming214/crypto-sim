import { isAmplifyConfigured } from '../lib/amplify';

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
const TTL_DAYS = 2;

// Broadcast one executed trade to the global feed. No-op for reward/cash sentinel
// trades and when the user is hidden from the leaderboard (privacy opt-out). Best
// effort — never blocks or throws into the trade flow.
export async function recordLiveTrade(
  trade: { symbol: string; side: string; amount: number; units: number; price: number; timestamp: number; kind?: string },
  user: { handle: string; avatarColor?: string; leaderboardVisible?: boolean },
): Promise<void> {
  if (trade.kind === 'reward' || trade.symbol === 'USD') return; // not a real coin trade
  if (user.leaderboardVisible === false) return;                  // respect the opt-out
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

// The latest `limit` trades across all users, newest first.
export async function fetchLiveTrades(limit = 25): Promise<LiveTradeRow[]> {
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
