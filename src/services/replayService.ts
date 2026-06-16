import { isAmplifyConfigured } from '../lib/amplify';
import type { CompetitionEntry, PortfolioSlice, ReplayContestSummary, ReplayMeta } from '../store/types';
import { STARTING_CASH } from '../constants/featureFlags';

// Client + owner helpers (mirrors portfolioService/competitionService).
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
  const owner: string | undefined = record.owner;
  return typeof owner === 'string' && owner.startsWith(ownerId);
}

// ── Mappers ───────────────────────────────────────────────────────────────

function mapSummary(c: any): ReplayContestSummary {
  return {
    id: c.id,
    eventId: c.eventId,
    eventTitle: c.eventTitle,
    coin: c.coin,
    weekIndex: c.weekIndex ?? 0,
    histStartIso: c.histStartIso,
    startAt: c.startAt ? Date.parse(c.startAt) : 0,
    endAt: c.endAt ? Date.parse(c.endAt) : 0,
    status: (c.status ?? 'open') as ReplayContestSummary['status'],
    intervalMs: c.intervalMs ?? 60000,
    maxPlayers: c.maxPlayers ?? 1000,
    prizeXp: c.prizeXp ?? 5000,
    lockAfterStart: !!c.lockAfterStart,
    entryCount: 0,
  };
}

function metaFromContest(c: any): ReplayMeta {
  let prices: number[] = [];
  try { prices = JSON.parse(c.pricesJson || '[]'); } catch { prices = []; }
  return {
    coin: c.coin,
    histStartIso: c.histStartIso,
    startAt: c.startAt ? Date.parse(c.startAt) : Date.now(),
    endAt: c.endAt ? Date.parse(c.endAt) : Date.now(),
    intervalMs: c.intervalMs ?? 60000,
    prices,
  };
}

// ReplayEntry → CompetitionEntry shape so the existing leaderboard UI +
// SET_LEADERBOARD reducer work unchanged (replay ids never collide with contest ids).
function mapReplayEntry(d: any): CompetitionEntry {
  return {
    id: d.id,
    competitionId: d.replayContestId,
    handle: d.handle,
    bankroll: d.bankroll ?? STARTING_CASH,
    pnlPct: d.pnlPct ?? 0,
    rank: d.rank ?? 999,
    joinedAt: d.joinedAt ? new Date(d.joinedAt).getTime() : 0,
    isActive: d.isActive ?? true,
  };
}

async function layerEntryCounts(client: any, summaries: ReplayContestSummary[]): Promise<ReplayContestSummary[]> {
  try {
    const { data: entries } = await client.models.ReplayEntry.list();
    const counts: Record<string, number> = {};
    for (const e of entries as any[]) {
      if (e.isActive !== false) counts[e.replayContestId] = (counts[e.replayContestId] ?? 0) + 1;
    }
    return summaries.map(c => ({ ...c, entryCount: counts[c.id] ?? 0 }));
  } catch {
    return summaries;
  }
}

// ── Contests ──────────────────────────────────────────────────────────────

// Browse list — light (excludes the ~80KB pricesJson via selectionSet).
export async function fetchReplayContests(): Promise<ReplayContestSummary[]> {
  const client = await getClient();
  if (!client) return [];
  try {
    const { data } = await client.models.ReplayContest.list({
      selectionSet: ['id', 'eventId', 'eventTitle', 'coin', 'weekIndex', 'histStartIso', 'startAt', 'endAt', 'status', 'intervalMs', 'maxPlayers', 'prizeXp', 'lockAfterStart'],
    });
    return await layerEntryCounts(client, (data as any[]).map(mapSummary));
  } catch (e) {
    console.warn('fetchReplayContests failed:', e);
    return [];
  }
}

// The playable scenario for a replay contest (title + coin + price series), used
// by the Replay screen's contest mode.
export async function fetchReplayContestScenario(id: string): Promise<{ id: string; title: string; coin: string; prices: number[]; histStartIso: string } | null> {
  const client = await getClient();
  if (!client) return null;
  try {
    const { data } = await client.models.ReplayContest.get({ id });
    if (!data) return null;
    let prices: number[] = [];
    try { prices = JSON.parse((data as any).pricesJson || '[]'); } catch { prices = []; }
    return { id, title: (data as any).eventTitle, coin: (data as any).coin, prices, histStartIso: (data as any).histStartIso };
  } catch (e) {
    console.warn('fetchReplayContestScenario failed:', e);
    return null;
  }
}

// Full config incl. the minute series — fetched once on join / restore.
export async function fetchReplayContestMeta(id: string): Promise<ReplayMeta | null> {
  const client = await getClient();
  if (!client) return null;
  try {
    const { data } = await client.models.ReplayContest.get({ id });
    return data ? metaFromContest(data) : null;
  } catch (e) {
    console.warn('fetchReplayContestMeta failed:', e);
    return null;
  }
}

// ── Entries ───────────────────────────────────────────────────────────────

export async function joinReplayContest(replayContestId: string, handle: string, bankroll: number): Promise<boolean> {
  const client = await getClient();
  if (!client) return false;
  try {
    await client.models.ReplayEntry.create({
      replayContestId,
      handle,
      bankroll,
      pnlPct: 0,
      rank: 999,
      joinedAt: new Date().toISOString(),
      isActive: true,
      cash: bankroll,
      holdingsJson: '[]',
      tradesJson: '[]',
    });
    return true;
  } catch (e) {
    console.warn('joinReplayContest failed:', e);
    return false;
  }
}

// Submit a finished replay run as the user's contest entry. Stores the result
// as cash (holdings empty) so the tick-replay-leaderboard Lambda's reprice is a
// no-op (cash + 0 = score) and the submitted bankroll stands. Keeps the BEST run.
export async function submitReplayScore(replayContestId: string, handle: string, bankroll: number, pnlPct: number): Promise<boolean> {
  const client = await getClient();
  if (!client) return false;
  try {
    const ownerId = await getCurrentOwnerId();
    const { data } = await client.models.ReplayEntry.list({ filter: { replayContestId: { eq: replayContestId } } });
    const own = (data as any[]).find(e => ownedByMe(e, ownerId));
    const final = { bankroll, pnlPct, cash: bankroll, holdingsJson: '[]', tradesJson: '[]' };
    if (own) {
      if (bankroll <= (own.bankroll ?? 0)) return true; // didn't beat the prior best
      await client.models.ReplayEntry.update({ id: own.id, ...final });
    } else {
      await client.models.ReplayEntry.create({
        replayContestId, handle, rank: 999, joinedAt: new Date().toISOString(), isActive: true, ...final,
      });
    }
    return true;
  } catch (e) {
    console.warn('submitReplayScore failed:', e);
    return false;
  }
}

export async function fetchReplayLeaderboard(replayContestId: string): Promise<CompetitionEntry[]> {
  const client = await getClient();
  if (!client) return [];
  try {
    const { data } = await client.models.ReplayEntry.list({ filter: { replayContestId: { eq: replayContestId } } });
    return (data as any[]).map(mapReplayEntry).sort((a, b) => a.rank - b.rank);
  } catch {
    return [];
  }
}

export async function subscribeToReplayLeaderboard(
  replayContestId: string,
  onUpdate: (entries: CompetitionEntry[]) => void,
): Promise<() => void> {
  const client = await getClient();
  if (!client) return () => {};
  try {
    const sub = client.models.ReplayEntry.observeQuery({ filter: { replayContestId: { eq: replayContestId } } }).subscribe({
      next: ({ items }: { items: any[] }) => onUpdate((items ?? []).map(mapReplayEntry).sort((a, b) => a.rank - b.rank)),
      error: (err: unknown) => console.warn('Replay leaderboard subscription error:', err),
    });
    return () => sub.unsubscribe();
  } catch (e) {
    console.warn('subscribeToReplayLeaderboard failed:', e);
    return () => {};
  }
}

// Restore the user's joined replay portfolios on login: each ReplayEntry joined
// to its ReplayContest config (so the deterministic price can be computed locally).
export async function loadReplayEntries(): Promise<{ id: string; slice: PortfolioSlice; meta: ReplayMeta }[]> {
  const client = await getClient();
  if (!client) return [];
  try {
    const ownerId = await getCurrentOwnerId();
    const { data } = await client.models.ReplayEntry.list();
    const mine = (data as any[]).filter(e => e.isActive !== false && ownedByMe(e, ownerId));
    const out: { id: string; slice: PortfolioSlice; meta: ReplayMeta }[] = [];
    for (const e of mine) {
      const meta = await fetchReplayContestMeta(e.replayContestId);
      if (!meta) continue;
      let holdings = [], trades = [];
      try { holdings = e.holdingsJson ? JSON.parse(e.holdingsJson) : []; } catch {}
      try { trades = e.tradesJson ? JSON.parse(e.tradesJson) : []; } catch {}
      out.push({ id: e.replayContestId, slice: { cash: e.cash ?? STARTING_CASH, holdings, trades }, meta });
    }
    return out;
  } catch (e) {
    console.warn('loadReplayEntries failed:', e);
    return [];
  }
}

export async function saveReplayEntry(replayContestId: string, slice: PortfolioSlice, bankroll: number, pnlPct: number): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    const ownerId = await getCurrentOwnerId();
    const { data: entries } = await client.models.ReplayEntry.list({ filter: { replayContestId: { eq: replayContestId } } });
    const own = (entries as any[]).find(e => e.replayContestId === replayContestId && ownedByMe(e, ownerId));
    if (!own) return;
    await client.models.ReplayEntry.update({
      id: own.id,
      cash: slice.cash,
      holdingsJson: JSON.stringify(slice.holdings),
      tradesJson: JSON.stringify(slice.trades),
      bankroll,
      pnlPct,
    });
  } catch (e) {
    console.warn('saveReplayEntry failed:', e);
  }
}

// Delete all of this user's entries for a replay contest (leave).
export async function leaveReplayForUser(replayContestId: string, handle: string): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    const { data } = await client.models.ReplayEntry.list({ filter: { replayContestId: { eq: replayContestId } } });
    const mine = (data as any[]).filter(e => e.handle === handle);
    await Promise.all(mine.map(e => client.models.ReplayEntry.delete({ id: e.id }).catch(() => {})));
  } catch (e) {
    console.warn('leaveReplayForUser failed:', e);
  }
}
