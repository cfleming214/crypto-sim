import { isAmplifyConfigured } from '../lib/amplify';
import type { AppState, Trade, CompetitionEntry, PortfolioSlice } from '../store/types';

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

// ---- Avatar S3 helpers ----

const AVATAR_FILENAME = 'profile.jpg';

async function resolveAvatarUrl(avatarKey: string): Promise<string | null> {
  if (!isAmplifyConfigured || !avatarKey) return null;
  try {
    const { getUrl } = await import('aws-amplify/storage');
    const { url } = await getUrl({
      path: ({ identityId }) => `avatars/${identityId}/${avatarKey}`,
      options: { validateObjectExistence: false },
    });
    return url.toString();
  } catch (e) {
    console.warn('resolveAvatarUrl failed:', e);
    return null;
  }
}

export async function uploadAvatarPhoto(localUri: string): Promise<{ key: string; url: string } | null> {
  if (!isAmplifyConfigured) return null;
  try {
    const { uploadData } = await import('aws-amplify/storage');
    const response = await fetch(localUri);
    const blob = await response.blob();
    await uploadData({
      path: ({ identityId }) => `avatars/${identityId}/${AVATAR_FILENAME}`,
      data: blob,
      options: { contentType: blob.type || 'image/jpeg' },
    }).result;
    const url = await resolveAvatarUrl(AVATAR_FILENAME);
    return url ? { key: AVATAR_FILENAME, url } : null;
  } catch (e) {
    console.warn('uploadAvatarPhoto failed:', e);
    return null;
  }
}

// ---- Profile ----

async function profileFromRecord(p: any): Promise<Partial<AppState>> {
  const avatarUri = p.avatarKey ? (await resolveAvatarUrl(p.avatarKey)) ?? undefined : undefined;
  return {
    user: {
      handle:      p.handle ?? 'you',
      xp:          p.xp ?? 0,
      league:      p.league ?? 'Bronze',
      division:    p.division ?? 1,
      streak:      p.streak ?? 0,
      avatarColor: p.avatarColor ?? '#6366F1',
      avatarKey:   p.avatarKey ?? undefined,
      avatarUri,
    },
    cash:      p.cash ?? 10000,
    bankroll:  p.bankroll ?? 10000,
    riskScore: p.riskScore ?? 0,
    holdings:  p.holdingsJson ? JSON.parse(p.holdingsJson) : [],
  };
}

async function loadUserTrades(client: any): Promise<import('../store/types').Trade[]> {
  try {
    const { data } = await client.models.Trade.list();
    return (data as any[]).map(t => ({
      id:        t.tradeId ?? t.id,
      symbol:    t.symbol,
      side:      t.side as 'buy' | 'sell',
      amount:    t.amount ?? 0,
      units:     t.units ?? 0,
      price:     t.price ?? 0,
      timestamp: t.createdAt ? new Date(t.createdAt).getTime() : Date.now(),
      xpEarned:  t.xpEarned ?? 0,
      slippage:  t.slippage ?? 0,
    })).sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

// CompetitionEntry has allow.authenticated().to(['read']) so list() returns
// rows from every user (needed for leaderboards). For this user's own joined
// competitions we have to filter by the owner field client-side.
async function getCurrentOwnerId(): Promise<string | null> {
  try {
    const { fetchAuthSession } = await import('aws-amplify/auth');
    const session = await fetchAuthSession();
    return (session.userSub as string | undefined) ?? null;
  } catch {
    return null;
  }
}

function ownedByMe(record: any, ownerId: string | null): boolean {
  if (!ownerId) return false;
  // Amplify Gen 2 stores owner as "{sub}::{username}" by default. Match by prefix.
  const owner: string | undefined = record.owner;
  return typeof owner === 'string' && owner.startsWith(ownerId);
}

async function loadJoinedCompetitions(client: any): Promise<string[]> {
  try {
    const ownerId = await getCurrentOwnerId();
    const { data } = await client.models.CompetitionEntry.list();
    return (data as any[])
      .filter(e => e.isActive !== false && ownedByMe(e, ownerId))
      .map(e => e.competitionId);
  } catch {
    return [];
  }
}

export async function loadContestPortfolios(): Promise<Record<string, PortfolioSlice>> {
  const client = await getClient();
  if (!client) return {};
  try {
    const ownerId = await getCurrentOwnerId();
    const { data } = await client.models.CompetitionEntry.list();
    const out: Record<string, PortfolioSlice> = {};
    for (const e of data as any[]) {
      if (e.isActive === false) continue;
      if (!ownedByMe(e, ownerId)) continue;
      out[e.competitionId] = {
        cash:     typeof e.cash === 'number' ? e.cash : 10000,
        holdings: e.holdingsJson ? JSON.parse(e.holdingsJson) : [],
        trades:   e.tradesJson   ? JSON.parse(e.tradesJson)   : [],
      };
    }
    return out;
  } catch {
    return {};
  }
}

export async function saveContestPortfolio(competitionId: string, slice: PortfolioSlice, bankroll: number, pnlPct: number): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    // Find THIS USER's CompetitionEntry for this contest. The list query with
    // a competitionId filter returns all users' entries (allow.authenticated
    // read), so we have to narrow by owner client-side.
    const ownerId = await getCurrentOwnerId();
    const { data: entries } = await client.models.CompetitionEntry.list({
      filter: { competitionId: { eq: competitionId } },
    });
    const own = (entries as any[]).find(e => e.competitionId === competitionId && ownedByMe(e, ownerId));
    if (!own) return; // user hasn't joined this contest — nothing to save against
    await client.models.CompetitionEntry.update({
      id: own.id,
      cash:         slice.cash,
      holdingsJson: JSON.stringify(slice.holdings),
      tradesJson:   JSON.stringify(slice.trades),
      bankroll,
      pnlPct,
    });
  } catch (e) {
    console.warn('saveContestPortfolio failed:', e);
  }
}

export async function loadProfile(): Promise<Partial<AppState> | null> {
  const client = await getClient();
  if (!client) return null;
  try {
    const { data: profiles } = await client.models.UserProfile.list();
    let profile: Partial<AppState>;
    if (!profiles.length) {
      // First sign-in — create a clean starter profile in DynamoDB so the
      // user lands on a fresh $10K / 0 holdings / Bronze I state instead of
      // the demo's pre-loaded INITIAL_STATE.
      const starter = {
        handle:       'newtrader',
        xp:           0,
        league:       'Bronze',
        division:     1,
        streak:       0,
        cash:         10000,
        bankroll:     10000,
        riskScore:    100,
        holdingsJson: '[]',
        avatarColor:  '#6366F1',
      };
      await client.models.UserProfile.create(starter);
      profile = await profileFromRecord(starter);
    } else {
      profile = await profileFromRecord(profiles[0]);
    }

    // Also restore trade history and joined-competition list so the user
    // sees their actual past activity, not whatever INITIAL_STATE has.
    const [trades, joinedTournamentIds] = await Promise.all([
      loadUserTrades(client),
      loadJoinedCompetitions(client),
    ]);
    return { ...profile, trades, joinedTournamentIds };
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
      avatarKey:    state.user.avatarKey,
      avatarColor:  state.user.avatarColor,
    };
    const { data: existing } = await client.models.UserProfile.list();
    if (existing.length) {
      await client.models.UserProfile.update({ id: existing[0].id, ...payload });
    } else {
      await client.models.UserProfile.create(payload);
    }

    // Mirror to PublicProfile so other authenticated users can discover this
    // trader. Computed fields (pnlPct, winRate) are derived from local state.
    const sellTrades = state.trades.filter(t => t.side === 'sell');
    const winningSells = sellTrades.filter(t => {
      const h = state.holdings.find(x => x.symbol === t.symbol);
      return h ? t.price > h.avgCost : false;
    }).length;
    const winRate    = sellTrades.length > 0 ? (winningSells / sellTrades.length) * 100 : 0;
    const pnlPct     = ((state.bankroll - 10000) / 10000) * 100;
    const { data: existingPublic } = await client.models.PublicProfile.list();
    // Build the rolling equity history. Append a new {t, v} point if we
    // haven't recorded one in the last hour, capped at the last 168 entries
    // (~1 week of hourly snapshots).
    let history: { t: number; v: number }[] = [];
    if (existingPublic.length && (existingPublic[0] as any).equityHistoryJson) {
      try { history = JSON.parse((existingPublic[0] as any).equityHistoryJson); }
      catch { history = []; }
    }
    const now = Date.now();
    const lastPoint = history[history.length - 1];
    const hourMs = 60 * 60 * 1000;
    if (!lastPoint || now - lastPoint.t >= hourMs) {
      history.push({ t: now, v: state.bankroll });
    } else {
      // Within the same hour — overwrite the last point so the chart reflects
      // the most recent value within the bucket.
      history[history.length - 1] = { t: now, v: state.bankroll };
    }
    history = history.slice(-168);

    // Snapshot of last 10 trades for the public profile feed.
    const recentTrades = state.trades.slice(0, 10).map(t => ({
      symbol: t.symbol,
      side:   t.side,
      amount: t.amount,
      units:  t.units,
      price:  t.price,
      t:      t.timestamp,
    }));

    const publicPayload = {
      handle:      state.user.handle,
      league:      state.user.league,
      bankroll:    state.bankroll,
      pnlPct,
      winRate,
      tradeCount:  state.trades.length,
      avatarKey:   state.user.avatarKey,
      avatarColor: state.user.avatarColor,
      equityHistoryJson: JSON.stringify(history),
      recentTradesJson:  JSON.stringify(recentTrades),
    };
    if (existingPublic.length) {
      await client.models.PublicProfile.update({ id: existingPublic[0].id, ...publicPayload });
    } else {
      await client.models.PublicProfile.create(publicPayload);
    }
  } catch (e) {
    console.warn('saveProfile failed:', e);
  }
}

export interface PublicTrader {
  id:          string;
  owner:       string;       // Cognito userId — used as Mirror.leaderId
  handle:      string;
  league:      string;
  bankroll:    number;
  pnlPct:      number;
  winRate:     number;
  tradeCount:  number;
  avatarKey?:  string;
  avatarColor?: string;
  avatarUrl?:  string;       // signed S3 URL resolved at fetch time
  equityHistory: number[];   // bankroll values over time (most recent last)
  recentTrades: { symbol: string; side: 'buy' | 'sell'; amount: number; units: number; price: number; t: number }[];
}

export async function fetchTopTraders(limit: number = 20): Promise<PublicTrader[]> {
  const client = await getClient();
  if (!client) return [];
  try {
    const { data } = await client.models.PublicProfile.list();
    const traders = await Promise.all((data as any[]).map(async (d) => {
      let avatarUrl: string | undefined;
      if (d.avatarKey && d.owner) {
        try {
          const { getUrl } = await import('aws-amplify/storage');
          // PublicProfile owner field is the Cognito userId/sub; identityId
          // for storage paths typically matches when using userPool auth.
          const { url } = await getUrl({
            path: `avatars/${d.owner}/${d.avatarKey}`,
            options: { validateObjectExistence: false },
          });
          avatarUrl = url.toString();
        } catch {
          // Avatar resolution is best-effort.
        }
      }
      let history: number[] = [];
      if (d.equityHistoryJson) {
        try {
          const parsed = JSON.parse(d.equityHistoryJson);
          history = (parsed as Array<{ t: number; v: number }>).map(p => p.v);
        } catch { history = []; }
      }
      let recentTrades: PublicTrader['recentTrades'] = [];
      if (d.recentTradesJson) {
        try { recentTrades = JSON.parse(d.recentTradesJson); }
        catch { recentTrades = []; }
      }
      return {
        id:          d.id,
        owner:       d.owner,
        handle:      d.handle ?? 'trader',
        league:      d.league ?? 'Bronze',
        bankroll:    d.bankroll ?? 10000,
        pnlPct:      d.pnlPct ?? 0,
        winRate:     d.winRate ?? 0,
        tradeCount:  d.tradeCount ?? 0,
        avatarKey:   d.avatarKey ?? undefined,
        avatarColor: d.avatarColor ?? undefined,
        avatarUrl,
        equityHistory: history,
        recentTrades,
      };
    }));
    return traders.sort((a, b) => b.pnlPct - a.pnlPct).slice(0, limit);
  } catch (e) {
    console.warn('fetchTopTraders failed:', e);
    return [];
  }
}

export async function fetchTrader(traderId: string): Promise<PublicTrader | null> {
  const client = await getClient();
  if (!client) return null;
  try {
    const { data } = await client.models.PublicProfile.get({ id: traderId });
    if (!data) return null;
    const d = data as any;
    let avatarUrl: string | undefined;
    if (d.avatarKey && d.owner) {
      try {
        const { getUrl } = await import('aws-amplify/storage');
        const { url } = await getUrl({
          path: `avatars/${d.owner}/${d.avatarKey}`,
          options: { validateObjectExistence: false },
        });
        avatarUrl = url.toString();
      } catch {
        // best-effort
      }
    }
    let history: number[] = [];
    if (d.equityHistoryJson) {
      try {
        const parsed = JSON.parse(d.equityHistoryJson);
        history = (parsed as Array<{ t: number; v: number }>).map(p => p.v);
      } catch { history = []; }
    }
    let recentTrades: PublicTrader['recentTrades'] = [];
    if (d.recentTradesJson) {
      try { recentTrades = JSON.parse(d.recentTradesJson); }
      catch { recentTrades = []; }
    }
    return {
      id:          d.id,
      owner:       d.owner,
      handle:      d.handle ?? 'trader',
      league:      d.league ?? 'Bronze',
      bankroll:    d.bankroll ?? 10000,
      pnlPct:      d.pnlPct ?? 0,
      winRate:     d.winRate ?? 0,
      tradeCount:  d.tradeCount ?? 0,
      avatarKey:   d.avatarKey ?? undefined,
      avatarColor: d.avatarColor ?? undefined,
      avatarUrl,
      equityHistory: history,
      recentTrades,
    };
  } catch (e) {
    console.warn('fetchTrader failed:', e);
    return null;
  }
}

export async function createOrUpdateMirror(
  leaderId: string,
  allocation: number,
  maxPositionPct: number = 0.2,
): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    const { data: existing } = await client.models.Mirror.list({
      filter: { leaderId: { eq: leaderId } },
    });
    const ownExisting = (existing as any[]).find(m => m.leaderId === leaderId);
    if (ownExisting) {
      await client.models.Mirror.update({
        id: ownExisting.id,
        allocation,
        maxPositionPct,
        active: true,
      });
    } else {
      // followerId is set server-side via owner field; we set it explicitly
      // here as the current user's owner for the Mirror table query path.
      const { fetchAuthSession } = await import('aws-amplify/auth');
      const session = await fetchAuthSession();
      const followerId = session.userSub ?? '';
      await client.models.Mirror.create({
        leaderId,
        followerId,
        allocation,
        maxPositionPct,
        active: true,
      });
    }
  } catch (e) {
    console.warn('createOrUpdateMirror failed:', e);
  }
}

export async function pauseMirror(leaderId: string): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    const { data: existing } = await client.models.Mirror.list({
      filter: { leaderId: { eq: leaderId } },
    });
    const own = (existing as any[]).find(m => m.leaderId === leaderId);
    if (own) {
      await client.models.Mirror.update({ id: own.id, active: false });
    }
  } catch (e) {
    console.warn('pauseMirror failed:', e);
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
  // Reset is handled client-side via RESET_DEMO action; cloud reset would invoke the resetDemo Lambda.
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

// ---- Real-time subscriptions ----

type Unsubscribe = () => void;

/**
 * Subscribe to the current user's UserProfile record. Fires whenever the record
 * changes server-side (e.g. after an executeTrade Lambda run, or a mirrored
 * trade hitting this user's follower profile).
 */
export async function subscribeToProfile(
  onUpdate: (profile: Partial<AppState>) => void,
): Promise<Unsubscribe> {
  const client = await getClient();
  if (!client) return () => {};
  try {
    const sub = client.models.UserProfile.observeQuery().subscribe({
      next: async ({ items }: { items: any[] }) => {
        if (!items.length) return;
        const profile = await profileFromRecord(items[0]);
        onUpdate(profile);
      },
      error: (err: unknown) => console.warn('UserProfile subscription error:', err),
    });
    return () => sub.unsubscribe();
  } catch (e) {
    console.warn('subscribeToProfile failed:', e);
    return () => {};
  }
}

/**
 * Subscribe to live leaderboard updates for a competition. Fires whenever any
 * CompetitionEntry for the given competitionId changes (the tickLeaderboard
 * EventBridge cron rewrites ranks every 5 min).
 */
export async function subscribeToLeaderboard(
  competitionId: string,
  onUpdate: (entries: CompetitionEntry[]) => void,
): Promise<Unsubscribe> {
  const client = await getClient();
  if (!client) return () => {};
  try {
    const sub = client.models.CompetitionEntry.observeQuery({
      filter: { competitionId: { eq: competitionId } },
    }).subscribe({
      next: ({ items }: { items: any[] }) => {
        const entries: CompetitionEntry[] = items
          .map(i => ({
            id: i.id,
            competitionId: i.competitionId,
            handle: i.handle,
            bankroll: i.bankroll ?? 0,
            pnlPct: i.pnlPct ?? 0,
            rank: i.rank ?? 999,
            joinedAt: i.joinedAt ? new Date(i.joinedAt).getTime() : 0,
            isActive: i.isActive ?? true,
          }))
          .sort((a, b) => a.rank - b.rank);
        onUpdate(entries);
      },
      error: (err: unknown) => console.warn('Leaderboard subscription error:', err),
    });
    return () => sub.unsubscribe();
  } catch (e) {
    console.warn('subscribeToLeaderboard failed:', e);
    return () => {};
  }
}

/**
 * Subscribe to coach nudges written by the evaluate-coach Lambda. Fires after
 * each server-side trade-risk evaluation.
 */
export async function subscribeToCoachNudges(
  onUpdate: (nudges: { id: string; message: string; severity: 'info'|'warn'|'tip'; createdAt: number }[]) => void,
): Promise<Unsubscribe> {
  const client = await getClient();
  if (!client) return () => {};
  try {
    const sub = client.models.CoachNudge.observeQuery({
      filter: { dismissed: { ne: true } },
    }).subscribe({
      next: ({ items }: { items: any[] }) => {
        const nudges = items.map(i => ({
          id: i.id,
          message: i.message,
          severity: (i.severity as 'info'|'warn'|'tip') ?? 'info',
          createdAt: i.createdAt ? new Date(i.createdAt).getTime() : Date.now(),
        }));
        onUpdate(nudges);
      },
      error: (err: unknown) => console.warn('CoachNudge subscription error:', err),
    });
    return () => sub.unsubscribe();
  } catch (e) {
    console.warn('subscribeToCoachNudges failed:', e);
    return () => {};
  }
}
