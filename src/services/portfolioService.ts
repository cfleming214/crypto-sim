import { isAmplifyConfigured } from '../lib/amplify';
import type { AppState, Trade } from '../store/types';

// Lazily initialised so it doesn't blow up before Amplify.configure() is called
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

export async function loadProfile(): Promise<Partial<AppState> | null> {
  const client = await getClient();
  if (!client) return null;
  try {
    const { data: profiles } = await client.models.UserProfile.list();
    if (!profiles.length) return null;
    const p = profiles[0];
    return {
      user: {
        handle:   p.handle ?? 'you',
        xp:       p.xp ?? 0,
        league:   p.league ?? 'Bronze',
        division: p.division ?? 1,
        streak:   p.streak ?? 0,
      },
      cash:      p.cash ?? 10000,
      bankroll:  p.bankroll ?? 10000,
      riskScore: p.riskScore ?? 0,
      holdings:  p.holdingsJson ? JSON.parse(p.holdingsJson) : [],
    };
  } catch {
    return null;
  }
}

export async function saveProfile(state: AppState): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    const payload = {
      handle:       state.user.handle,
      xp:           state.user.xp,
      league:       state.user.league,
      division:     state.user.division,
      streak:       state.user.streak,
      cash:         state.cash,
      bankroll:     state.bankroll,
      riskScore:    state.riskScore,
      holdingsJson: JSON.stringify(state.holdings),
    };
    const { data: existing } = await client.models.UserProfile.list();
    if (existing.length) {
      await client.models.UserProfile.update({ id: existing[0].id, ...payload });
    } else {
      await client.models.UserProfile.create(payload);
    }
  } catch (e) {
    console.warn('saveProfile failed:', e);
  }
}

export async function saveTrade(trade: Trade): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    await client.models.Trade.create({
      tradeId:  trade.id,
      symbol:   trade.symbol,
      side:     trade.side,
      amount:   trade.amount,
      units:    trade.units,
      price:    trade.price,
      xpEarned: trade.xpEarned,
      slippage: trade.slippage,
    });
  } catch (e) {
    console.warn('saveTrade failed:', e);
  }
}

export async function resetDemoCloud(): Promise<void> {
  if (!isAmplifyConfigured) return;
  try {
    const { post } = await import('aws-amplify/api');
    // Invoke reset-demo Lambda via REST. In production this would use a proper API Gateway endpoint.
    // For now this is a no-op shim — the client-side RESET_DEMO action handles the state reset.
  } catch (e) {
    console.warn('resetDemoCloud failed:', e);
  }
}

export async function fetchLeaderboard(tournamentId: string) {
  const client = await getClient();
  if (!client) return [];
  try {
    const { data } = await client.models.LeaderboardEntry.list({
      filter: { tournamentId: { eq: tournamentId } },
    });
    return (data as any[]).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  } catch {
    return [];
  }
}
