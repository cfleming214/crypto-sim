import { isAmplifyConfigured } from '../lib/amplify';
import type { AppState, Trade, CompetitionEntry, PortfolioSlice } from '../store/types';
import type { EquityPoint } from './equitySnapshots';
import { STARTING_CASH } from '../constants/featureFlags';

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
  // Cross-device gamification blob (daily-claim, achievements, predictions).
  // Only merged when present + valid, so an older row without it leaves the
  // locally-hydrated values (gamification.v1) intact.
  let gami: any = null;
  if (p.gamificationJson) { try { gami = JSON.parse(p.gamificationJson); } catch { gami = null; } }
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
      createdAt:   p.createdAt ? new Date(p.createdAt).getTime() : undefined,
      leaderboardVisible: p.leaderboardVisible ?? true, // null/undefined = opted in
    },
    cash:      p.cash ?? STARTING_CASH,
    bankroll:  p.bankroll ?? STARTING_CASH,
    riskScore: p.riskScore ?? 0,
    holdings:  p.holdingsJson ? JSON.parse(p.holdingsJson) : [],
    ...(gami ? {
      lastClaimDay:     typeof gami.lastClaimDay === 'string' ? gami.lastClaimDay : null,
      achievements:     gami.achievements && typeof gami.achievements === 'object' ? gami.achievements : {},
      predictionWins:   typeof gami.predictionWins === 'number' ? gami.predictionWins : 0,
      predictionLosses: typeof gami.predictionLosses === 'number' ? gami.predictionLosses : 0,
      predictionStreak: typeof gami.predictionStreak === 'number' ? gami.predictionStreak : 0,
      ...(gami.quests && typeof gami.quests === 'object' ? { quests: gami.quests } : {}),
      ...(gami.season && typeof gami.season === 'object' ? { season: gami.season } : {}),
      ...(gami.cosmetics && typeof gami.cosmetics === 'object' ? { cosmetics: gami.cosmetics } : {}),
    } : {}),
  };
}

async function loadUserTrades(client: any): Promise<import('../store/types').Trade[]> {
  try {
    // Page through ALL trades. Without this, Amplify's default page (~100 rows)
    // silently truncates long histories — which would corrupt the reconstructed
    // portfolio-value curve (missing buys → wrong holdings for the whole period
    // before the cutoff). See src/services/portfolioHistory.ts.
    const data: any[] = [];
    let nextToken: string | null | undefined = undefined;
    do {
      const page: any = await client.models.Trade.list({ limit: 1000, nextToken });
      if (page?.data?.length) data.push(...page.data);
      nextToken = page?.nextToken;
    } while (nextToken);
    const mapped = (data as any[]).map(t => ({
      id:        t.tradeId ?? t.id,
      symbol:    t.symbol,
      side:      t.side as 'buy' | 'sell',
      amount:    t.amount ?? 0,
      units:     t.units ?? 0,
      price:     t.price ?? 0,
      // Prefer the original client trade time; fall back to the row's cloud
      // write time for rows written before the `timestamp` field existed.
      timestamp: typeof t.timestamp === 'number'
        ? t.timestamp
        : (t.createdAt ? new Date(t.createdAt).getTime() : Date.now()),
      xpEarned:  t.xpEarned ?? 0,
      slippage:  t.slippage ?? 0,
    }));
    // Collapse duplicate starter-seed trades. A historical race (seeding before
    // the cloud profile loaded) could write one 'SEED-' trade per login; they're
    // identical 0.01-BTC $0 grants and each one over-subtracts the equity
    // reconstruction baseline (units go negative), dragging the early curve down.
    // Keep only the earliest seed.
    const seedIds = mapped.filter(t => t.id.startsWith('SEED-'))
      .sort((a, b) => a.timestamp - b.timestamp);
    const keepSeedId = seedIds[0]?.id;
    const deduped = mapped.filter(t => !t.id.startsWith('SEED-') || t.id === keepSeedId);
    return deduped.sort((a, b) => b.timestamp - a.timestamp);
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
        cash:     typeof e.cash === 'number' ? e.cash : STARTING_CASH,
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

// Load the user's cloud profile IF one already exists. Unlike a plain load,
// this never creates a starter — the caller decides between seeding a fresh
// starter (createStarterProfile) and adopting the guest's local portfolio
// (adoptGuestProfile). 'error' is kept distinct from 'new' so a transient list
// failure is never mistaken for a brand-new account (which would trigger a
// write and risk clobbering a returning user's real data).
export type ProfileLoadResult =
  | { status: 'exists'; profile: Partial<AppState> }
  | { status: 'new' }
  | { status: 'error' };

// One account should own exactly one UserProfile row. A historical
// bootstrap race could write two (an adopted-guest "you" row plus a
// "newtrader" starter), so pick a single canonical row: richest first (most
// xp, then most holdings), tie-broken by earliest creation.
function holdingsCount(p: { holdingsJson?: string | null }): number {
  try { return JSON.parse(p.holdingsJson ?? '[]').length; } catch { return 0; }
}
function pickCanonicalProfile<T extends { id: string; xp?: number | null; holdingsJson?: string | null; createdAt?: string | null }>(profiles: T[]): T {
  return [...profiles].sort((a, b) =>
    (b.xp ?? 0) - (a.xp ?? 0) ||
    holdingsCount(b) - holdingsCount(a) ||
    String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')),
  )[0];
}

export async function loadProfileIfExists(): Promise<ProfileLoadResult> {
  const client = await getClient();
  if (!client) return { status: 'error' };
  try {
    const { data: profiles } = await client.models.UserProfile.list();
    if (!profiles.length) return { status: 'new' };
    // Self-heal: if a past race left duplicate rows for this owner, keep the
    // canonical one and delete the extras so the account converges to a single
    // profile on next login.
    const canonical = pickCanonicalProfile(profiles);
    if (profiles.length > 1) {
      await Promise.all(
        profiles
          .filter((p: { id: string }) => p.id !== canonical.id)
          .map((p: { id: string }) => client.models.UserProfile.delete({ id: p.id }).catch(() => {})),
      );
    }
    const profile = await profileFromRecord(canonical);
    // Also restore trade history and joined-competition list so the user sees
    // their actual past activity, not whatever INITIAL_STATE has.
    const [trades, joinedTournamentIds] = await Promise.all([
      loadUserTrades(client),
      loadJoinedCompetitions(client),
    ]);
    return { status: 'exists', profile: { ...profile, trades, joinedTournamentIds } };
  } catch {
    return { status: 'error' };
  }
}

// Create a fresh $100K / Bronze I starter row for a brand-new account that has
// nothing worth keeping. The portfolio opens with cash only — no starter coin
// position.
export async function createStarterProfile(): Promise<Partial<AppState> | null> {
  const client = await getClient();
  if (!client) return null;
  try {
    let handle = 'newtrader';
    try {
      const { getCurrentUser } = await import('aws-amplify/auth');
      const u = await getCurrentUser();
      // Pool uses email as the username; prefer the email local-part as a
      // friendly default handle, falling back to the raw username.
      const loginId = u.signInDetails?.loginId ?? u.username ?? '';
      handle = loginId.includes('@') ? loginId.split('@')[0] : (loginId || 'newtrader');
    } catch {
      // No session yet → keep the default handle.
    }
    const starter = {
      handle,
      xp:           0,
      league:       'Bronze',
      division:     1,
      streak:       0,
      cash:         STARTING_CASH,
      bankroll:     STARTING_CASH,
      riskScore:    100,
      holdingsJson: '[]',
      avatarColor:  '#6366F1',
    };
    // Guard against a double-bootstrap: if a row already exists (a concurrent
    // adoptGuestProfile/saveProfile beat us, or this ran twice), adopt it
    // instead of writing a second profile for this owner.
    const { data: existing } = await client.models.UserProfile.list();
    if (existing.length) {
      const profile = await profileFromRecord(pickCanonicalProfile(existing));
      return { ...profile, trades: [], joinedTournamentIds: [] };
    }
    // Use the created record (it carries the server createdAt) so the new
    // account's equity graph can anchor its first point at account-creation time.
    const { data: created } = await client.models.UserProfile.create(starter);
    const profile = await profileFromRecord(created ?? starter);
    return { ...profile, trades: [], joinedTournamentIds: [] };
  } catch {
    return null;
  }
}

// Adopt the guest's local portfolio as a brand-new account's cloud profile:
// write the UserProfile/PublicProfile from current state and persist the guest
// trade ledger so history + equity reconstruction survive the sign-up. Used on
// first sign-up when the guest has real activity (see hasMeaningfulGuestPortfolio
// in AppContext); local state is kept as-is, so no LOAD_PROFILE overwrite.
export async function adoptGuestProfile(guest: AppState): Promise<void> {
  // saveProfile create-vs-updates the UserProfile row from `guest`.
  await saveProfile(guest);
  // Persist each guest trade. saveTrade now writes the original client
  // `timestamp`, so the adopted ledger keeps its real ordering/spacing for the
  // equity reconstruction (not the cloud write time).
  await Promise.all(guest.trades.map(saveTrade));
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
      // Public-leaderboard opt-in (default true). The tick-global-leaderboard
      // Lambda excludes users whose flag is false.
      leaderboardVisible: state.user.leaderboardVisible ?? true,
      // A save is also a sign of life — refresh the presence heartbeat.
      lastActiveAt: new Date().toISOString(),
      // Cross-device gamification blob. seasonStartXp is intentionally NOT
      // written here — it's owned by the settle-season Lambda.
      gamificationJson: JSON.stringify({
        lastClaimDay:     state.lastClaimDay,
        achievements:     state.achievements,
        predictionWins:   state.predictionWins,
        predictionLosses: state.predictionLosses,
        predictionStreak: state.predictionStreak,
        quests:           state.quests,
        season:           state.season,
        cosmetics:        state.cosmetics,
      }),
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
    const pnlPct     = ((state.bankroll - STARTING_CASH) / STARTING_CASH) * 100;
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

    // Allocation weights (% of equity per coin) so others can copy the mix.
    const allocation = state.bankroll > 0
      ? state.holdings
          .filter(h => h.symbol !== 'USDC')
          .map(h => {
            const price = state.coins.find(c => c.symbol === h.symbol)?.price ?? 0;
            return { symbol: h.symbol, pct: (h.units * price / state.bankroll) * 100 };
          })
          .filter(a => a.pct > 0.1)
      : [];

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
      allocationJson:    JSON.stringify(allocation),
      lastActiveAt:      new Date(now).toISOString(),
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

// Lightweight presence heartbeat — patch ONLY lastActiveAt on the user's
// UserProfile (and PublicProfile mirror) so other viewers see an up-to-date
// online dot, without the cost of a full saveProfile. Called on app foreground
// and on a ~1/min timer while foregrounded (see AppContext). No-op when signed
// out or before a profile row exists (the first saveProfile creates it).
export async function touchPresence(): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    const nowIso = new Date().toISOString();
    const { data: existing } = await client.models.UserProfile.list();
    if (!existing.length) return; // no profile yet — saveProfile seeds presence
    await client.models.UserProfile.update({ id: existing[0].id, lastActiveAt: nowIso });
    const { data: existingPublic } = await client.models.PublicProfile.list();
    if (existingPublic.length) {
      await client.models.PublicProfile.update({ id: existingPublic[0].id, lastActiveAt: nowIso });
    }
  } catch (e) {
    console.warn('touchPresence failed:', e);
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
  lastActiveAt?: string;     // ISO of last heartbeat — drives the presence dot
  equityHistory: number[];   // bankroll values over time (most recent last)
  recentTrades: { symbol: string; side: 'buy' | 'sell'; amount: number; units: number; price: number; t: number }[];
  allocation: { symbol: string; pct: number }[];   // portfolio weights, for "copy portfolio"
}

// Cache resolved avatar URLs so subscription events don't re-fetch them on
// every push. Keyed by `${owner}:${avatarKey}`.
const avatarUrlCache = new Map<string, string>();

async function resolveTraderAvatarUrl(owner?: string, avatarKey?: string): Promise<string | undefined> {
  if (!owner || !avatarKey) return undefined;
  const key = `${owner}:${avatarKey}`;
  const cached = avatarUrlCache.get(key);
  if (cached) return cached;
  try {
    const { getUrl } = await import('aws-amplify/storage');
    const { url } = await getUrl({
      path: `avatars/${owner}/${avatarKey}`,
      options: { validateObjectExistence: false },
    });
    const str = url.toString();
    avatarUrlCache.set(key, str);
    return str;
  } catch {
    return undefined;
  }
}

async function publicTraderFromRecord(d: any): Promise<PublicTrader> {
  const avatarUrl = await resolveTraderAvatarUrl(d.owner, d.avatarKey);
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
  let allocation: PublicTrader['allocation'] = [];
  if (d.allocationJson) {
    try {
      const parsed = JSON.parse(d.allocationJson);
      if (Array.isArray(parsed)) allocation = parsed.filter((a: any) => a && typeof a.symbol === 'string' && typeof a.pct === 'number');
    } catch { allocation = []; }
  }
  return {
    id:          d.id,
    owner:       d.owner,
    handle:      d.handle ?? 'trader',
    league:      d.league ?? 'Bronze',
    bankroll:    d.bankroll ?? STARTING_CASH,
    pnlPct:      d.pnlPct ?? 0,
    winRate:     d.winRate ?? 0,
    tradeCount:  d.tradeCount ?? 0,
    avatarKey:   d.avatarKey ?? undefined,
    avatarColor: d.avatarColor ?? undefined,
    avatarUrl,
    lastActiveAt: d.lastActiveAt ?? undefined,
    equityHistory: history,
    recentTrades,
    allocation,
  };
}

export async function fetchTopTraders(limit: number = 20): Promise<PublicTrader[]> {
  const client = await getClient();
  if (!client) return [];
  try {
    const { data } = await client.models.PublicProfile.list();
    const traders = await Promise.all((data as any[]).map(publicTraderFromRecord));
    return traders.sort((a, b) => b.pnlPct - a.pnlPct).slice(0, limit);
  } catch (e) {
    console.warn('fetchTopTraders failed:', e);
    return [];
  }
}

/**
 * Subscribe to every PublicProfile change in real time. Fires whenever ANY
 * trader's row updates (their saveProfile -> PublicProfile mirror). The
 * Top Traders screen uses this to re-rank live as traders make trades.
 */
export async function subscribeToTopTraders(
  onUpdate: (traders: PublicTrader[]) => void,
  limit: number = 20,
): Promise<() => void> {
  const client = await getClient();
  if (!client) return () => {};
  try {
    const sub = client.models.PublicProfile.observeQuery().subscribe({
      next: async ({ items }: { items: any[] }) => {
        const traders = await Promise.all((items ?? []).map(publicTraderFromRecord));
        onUpdate(traders.sort((a, b) => b.pnlPct - a.pnlPct).slice(0, limit));
      },
      error: (err: unknown) => console.warn('PublicProfile subscription error:', err),
    });
    return () => sub.unsubscribe();
  } catch (e) {
    console.warn('subscribeToTopTraders failed:', e);
    return () => {};
  }
}

export async function fetchTrader(traderId: string): Promise<PublicTrader | null> {
  const client = await getClient();
  if (!client) return null;
  try {
    const { data } = await client.models.PublicProfile.get({ id: traderId });
    if (!data) return null;
    return await publicTraderFromRecord(data);
  } catch (e) {
    console.warn('fetchTrader failed:', e);
    return null;
  }
}

// Resolve a trader by their Cognito owner (sub). The global leaderboard rows
// carry `owner` (from UserProfile), not the PublicProfile id, so this bridges a
// leaderboard tap to the copy-trade / trader-detail screen.
export async function fetchTraderByOwner(owner: string): Promise<PublicTrader | null> {
  const client = await getClient();
  if (!client || !owner) return null;
  try {
    const { data } = await client.models.PublicProfile.list({ filter: { owner: { eq: owner } } });
    const row = (data as any[])[0];
    return row ? await publicTraderFromRecord(row) : null;
  } catch (e) {
    console.warn('fetchTraderByOwner failed:', e);
    return null;
  }
}

// Subscribe to a single trader's PublicProfile row so the CopyTrade screen
// updates live as that trader trades.
export async function subscribeToTrader(
  traderId: string,
  onUpdate: (trader: PublicTrader) => void,
): Promise<() => void> {
  const client = await getClient();
  if (!client) return () => {};
  try {
    const sub = client.models.PublicProfile.observeQuery({
      filter: { id: { eq: traderId } },
    }).subscribe({
      next: async ({ items }: { items: any[] }) => {
        const row = (items ?? [])[0];
        if (!row) return;
        const trader = await publicTraderFromRecord(row);
        onUpdate(trader);
      },
      error: (err: unknown) => console.warn('Trader subscription error:', err),
    });
    return () => sub.unsubscribe();
  } catch (e) {
    console.warn('subscribeToTrader failed:', e);
    return () => {};
  }
}

/**
 * Count active Mirror rows owned by the current user — used by the Profile
 * "Copycat" achievement to detect whether the user is currently copy-trading
 * anyone.
 */
export async function fetchActiveMirrorCount(): Promise<number> {
  const client = await getClient();
  if (!client) return 0;
  try {
    const { data } = await client.models.Mirror.list();
    return (data as any[]).filter(m => m.active !== false).length;
  } catch {
    return 0;
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

// Backup of the recorded equity-snapshot series to the user's private
// UserProfile row. Partial update — only equityHistoryJson is written, so it
// never clobbers cash/holdings/xp written by saveProfile (and vice-versa). The
// client throttles how often this fires (see equitySnapshots flush wiring);
// `points` should already be downsampled via downsampleForCloud.
export async function saveEquityHistory(points: EquityPoint[]): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    const { data: existing } = await client.models.UserProfile.list();
    if (!existing.length) return;   // no profile yet — saveProfile creates it first
    await client.models.UserProfile.update({
      id: existing[0].id,
      equityHistoryJson: JSON.stringify(points),
    });
  } catch (e) {
    console.warn('saveEquityHistory failed:', e);
  }
}

export async function loadEquityHistory(): Promise<EquityPoint[]> {
  const client = await getClient();
  if (!client) return [];
  try {
    const { data } = await client.models.UserProfile.list();
    const raw = (data?.[0] as any)?.equityHistoryJson;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveTrade(trade: Trade): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    await client.models.Trade.create({
      tradeId:   trade.id,
      symbol:    trade.symbol,
      side:      trade.side,
      amount:    trade.amount,
      units:     trade.units,
      price:     trade.price,
      xpEarned:  trade.xpEarned,
      slippage:  trade.slippage,
      timestamp: trade.timestamp,
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
