import { isAmplifyConfigured } from '../lib/amplify';
import type { Competition, CompetitionEntry, Holding } from '../store/types';
import { DEFAULT_PRIZE_XP, STARTING_CASH, CONTEST_CASH_PRIZES } from '../constants/featureFlags';

// A payments-off build must never surface cash-prize contests. We filter at the
// QUERY (so those rows never even reach the device — cleaner than downloading +
// hiding) and keep a client-side guard as a safety net. `cashPrize: { ne: true }`
// keeps legacy rows that have no flag (null) visible everywhere — no migration.
const CASH_QUERY = CONTEST_CASH_PRIZES ? {} : { filter: { cashPrize: { ne: true } } };
function visibleHere(comps: Competition[]): Competition[] {
  return CONTEST_CASH_PRIZES ? comps : comps.filter(c => c.cashPrize !== true);
}

// A player's portfolio within a single contest, read from their CompetitionEntry
// row (holdings/cash are public-readable). Used by the leaderboard balance popup.
export interface ContestPortfolio {
  cash: number;
  holdings: Holding[];
  bankroll: number;
  pnlPct: number;
}

// Cloud Competition rows (DynamoDB) are the source of truth for real contests.
// We no longer inject a client-side placeholder — the weekly contest is now a real
// cloud row created by the create-weekly-contest Lambda (7-day EventBridge cron),
// so it actually starts, has a leaderboard, and settles. The old "Weekly Kickoff"
// seed was a rolling placeholder that never arrived.
export const SEED_COMPETITIONS: Competition[] = [];

// Kept as a thin pass-through so existing call sites don't change; the empty seed
// list above makes it a no-op.
function withSeeds(comps: Competition[]): Competition[] {
  if (SEED_COMPETITIONS.length === 0) return comps;
  const cloudIds = new Set(comps.map(c => c.id));
  return [...SEED_COMPETITIONS.filter(s => !cloudIds.has(s.id)), ...comps];
}

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

function mapCompetition(d: any): Competition {
  let prizes: number[] = [];
  if (d.prizesJson) {
    try { prizes = JSON.parse(d.prizesJson); }
    catch { prizes = []; }
  }
  const startAt = new Date(d.startAt).getTime();
  const endAt = new Date(d.endAt).getTime();
  // Derive status from the SCHEDULE, not the stored field: nothing server-side
  // flips a contest from 'open' -> 'live' when startAt arrives, so a scheduled
  // contest would otherwise show "open" forever and never appear started. Time is
  // the source of truth (close-competition still settles by endAt either way).
  const now = Date.now();
  const status: Competition['status'] =
    d.status === 'finished' || now >= endAt ? 'finished'
    : now >= startAt ? 'live'
    : 'open';
  return {
    id: d.id,
    name: d.name,
    type: d.type as Competition['type'],
    status,
    prizePool: d.prizePool ?? '',
    maxPlayers: d.maxPlayers ?? 0,
    stake: d.stake ?? 'Free',
    startAt,
    endAt,
    entryCount: d.entryCount ?? 0,
    numberOfPrizes: d.numberOfPrizes ?? prizes.length,
    prizes,
    prizeXp: d.prizeXp ?? DEFAULT_PRIZE_XP,
    inviteCode: d.inviteCode ?? undefined,
    challengerHandle: d.challengerHandle ?? undefined,
    lockAfterStart: d.lockAfterStart ?? false,
    joinCutoffPct: typeof d.joinCutoffPct === 'number' ? d.joinCutoffPct : undefined,
    cashPrize: d.cashPrize === true,
  };
}

// Whether NEW entries are currently blocked for a contest. True when either the
// contest locks at start and has started, OR enough of the duration has elapsed
// to pass its join cutoff (joinCutoffPct, e.g. 0.9 = "until 10% remains").
// Centralizes the gate used by the Join CTAs on Compete + the contest detail.
export function isJoinLocked(c: Competition, now: number = Date.now()): boolean {
  if (c.lockAfterStart && now >= c.startAt) return true;
  if (typeof c.joinCutoffPct === 'number' && c.endAt > c.startAt) {
    const elapsed = (now - c.startAt) / (c.endAt - c.startAt);
    if (elapsed >= c.joinCutoffPct) return true;
  }
  return false;
}

function mapEntry(d: any): CompetitionEntry {
  return {
    id: d.id,
    competitionId: d.competitionId,
    handle: d.handle,
    bankroll: d.bankroll ?? STARTING_CASH,
    pnlPct: d.pnlPct ?? 0,
    rank: d.rank ?? 999,
    joinedAt: new Date(d.joinedAt).getTime(),
    isActive: d.isActive ?? true,
  };
}

// Layers real entry counts (from CompetitionEntry rows) over a raw list of
// Competition rows. Used by both fetchCompetitions and subscribeToCompetitions
// so the resulting Competition[] shape is identical.
async function layerEntryCounts(client: any, comps: Competition[]): Promise<Competition[]> {
  try {
    const { data: entries } = await client.models.CompetitionEntry.list();
    const counts: Record<string, number> = {};
    for (const e of entries as any[]) {
      if (e.isActive !== false) counts[e.competitionId] = (counts[e.competitionId] ?? 0) + 1;
    }
    return comps.map(c => ({ ...c, entryCount: counts[c.id] ?? 0 }));
  } catch {
    return comps;
  }
}

export async function fetchCompetitions(): Promise<Competition[]> {
  const client = await getClient();
  if (!client) return withSeeds([]);
  try {
    const { data } = await client.models.Competition.list(CASH_QUERY);
    const remote = (data as any[]).map(mapCompetition);
    return visibleHere(withSeeds(await layerEntryCounts(client, remote)));
  } catch {
    return withSeeds([]);
  }
}

// Past contests live in their own table (the closeCompetition Lambda moves them
// there). Mapped to the same Competition shape (status 'finished'), newest first.
export async function fetchFinishedCompetitions(): Promise<Competition[]> {
  const client = await getClient();
  if (!client?.models?.FinishedCompetition) return [];
  try {
    const { data } = await client.models.FinishedCompetition.list(CASH_QUERY);
    return visibleHere((data as any[]).filter(Boolean).map(mapCompetition)).sort((a, b) => b.endAt - a.endAt);
  } catch {
    return [];
  }
}

/**
 * Subscribe to every Competition row change. Fires when a new contest is
 * created, status flips (open → live → finished), or any field is updated by
 * the closeCompetition / createCompetition Lambdas. Layers in live entry
 * counts on every event so the UI's "N players" stays current.
 */
export async function subscribeToCompetitions(
  onUpdate: (comps: Competition[]) => void,
): Promise<() => void> {
  const client = await getClient();
  if (!client) return () => {};
  try {
    const sub = client.models.Competition.observeQuery(CASH_QUERY).subscribe({
      next: async ({ items }: { items: any[] }) => {
        const comps = (items ?? []).map(mapCompetition);
        const layered = await layerEntryCounts(client, comps);
        onUpdate(visibleHere(withSeeds(layered)));
      },
      error: (err: unknown) => console.warn('Competition subscription error:', err),
    });
    return () => sub.unsubscribe();
  } catch (e) {
    console.warn('subscribeToCompetitions failed:', e);
    return () => {};
  }
}

export async function joinCompetition(
  competitionId: string,
  handle: string,
  bankroll: number,
): Promise<CompetitionEntry | null> {
  const client = await getClient();
  if (!client) return null;
  try {
    // Find-or-create: if this player already has an entry in this contest, reuse
    // it instead of creating a duplicate. Without this, re-joining (e.g. across
    // sessions, or before joinedTournamentIds has synced) created two rows and
    // the player showed up twice on the leaderboard.
    const existing = await client.models.CompetitionEntry.list({
      filter: { and: [{ competitionId: { eq: competitionId } }, { handle: { eq: handle } }] },
    });
    const mine = (existing?.data ?? []).find(Boolean);
    if (mine) {
      // Re-activate if a prior leave/settle had deactivated it.
      if (mine.isActive === false) {
        const { data } = await client.models.CompetitionEntry.update({ id: mine.id, isActive: true });
        return mapEntry(data ?? mine);
      }
      return mapEntry(mine);
    }
    const { data } = await client.models.CompetitionEntry.create({
      competitionId,
      handle,
      bankroll,
      pnlPct: 0,
      rank: 999,
      joinedAt: new Date().toISOString(),
      isActive: true,
    });
    return mapEntry(data);
  } catch (e) {
    console.warn('joinCompetition failed:', e);
    return null;
  }
}

// 1v1 duels. A duel is just a Competition (type '1v1', maxPlayers 2) that
// starts 'live' immediately, so no owner-only status flip is needed — each
// player simply creates their own CompetitionEntry, and the existing
// tickLeaderboard / closeCompetition crons rank + settle it like any contest.

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars

function makeInviteCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  return s;
}

export const DAY_MS = 24 * 60 * 60 * 1000;
// Selectable duel lengths surfaced in the challenge UI.
export const DUEL_DURATION_OPTIONS = [
  { label: '1 day', days: 1 },
  { label: '2 days', days: 2 },
  { label: '3 days', days: 3 },
  { label: '7 days', days: 7 },
] as const;
const DEFAULT_DUEL_DURATION_MS = DAY_MS;

// Create a duel (the challenger). `durationMs` sets the duel length (defaults to
// 1 day). Returns the Competition (with inviteCode) and the challenger's entry,
// or null on failure.
export async function createDuel(
  handle: string,
  bankroll: number,
  durationMs: number = DEFAULT_DUEL_DURATION_MS,
  duelNumber?: number,
): Promise<{ competition: Competition; entry: CompetitionEntry | null } | null> {
  const client = await getClient();
  if (!client) return null;
  try {
    const now = Date.now();
    const inviteCode = makeInviteCode();
    const days = Math.max(1, Math.round(durationMs / DAY_MS));
    const label = duelNumber ? `Duel #${duelNumber}` : `Duel · ${handle}`;
    const { data: comp } = await client.models.Competition.create({
      name: `${label} · ${days}d`,
      type: '1v1',
      status: 'live',
      prizePool: 'Bragging rights',
      maxPlayers: 2,
      stake: 'Free',
      startAt: new Date(now).toISOString(),
      endAt: new Date(now + durationMs).toISOString(),
      entryCount: 1,
      numberOfPrizes: 0,
      prizesJson: '[]',
      prizeXp: DEFAULT_PRIZE_XP,
      inviteCode,
      challengerHandle: handle,
    });
    const competition = mapCompetition(comp);
    const entry = await joinCompetition(competition.id, handle, bankroll);
    return { competition, entry };
  } catch (e) {
    console.warn('createDuel failed:', e);
    return null;
  }
}

// Accept a duel by invite code (the opponent). Finds the Competition, creates
// the opponent's entry, and returns the Competition (or null if code invalid /
// duel already full).
export async function acceptDuel(
  inviteCode: string,
  handle: string,
  bankroll: number,
): Promise<Competition | null> {
  const client = await getClient();
  if (!client) return null;
  try {
    const code = inviteCode.trim().toUpperCase();
    if (!code) return null;
    const { data } = await client.models.Competition.list({ filter: { inviteCode: { eq: code } } });
    const row = (data as any[])[0];
    if (!row) return null;
    const competition = mapCompetition(row);
    const filled = await layerEntryCounts(client, [competition]);
    if ((filled[0]?.entryCount ?? 0) >= (competition.maxPlayers || 2)) return null; // duel full
    await joinCompetition(competition.id, handle, bankroll);
    return competition;
  } catch (e) {
    console.warn('acceptDuel failed:', e);
    return null;
  }
}

export async function leaveCompetition(entryId: string): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    await client.models.CompetitionEntry.delete({ id: entryId });
  } catch (e) {
    console.warn('leaveCompetition failed:', e);
  }
}

// Delete ALL of this user's entries for a competition. Used when leaving from a
// screen that doesn't carry the entry id, and doubles as a cleanup for the
// duplicate-entry case (leaving used to leave the cloud row behind, so a
// rejoin stacked a second one). Owner-auth means only rows the user owns delete.
// Mark the user's entries for a contest INACTIVE (isActive=false) without deleting
// them — the row stays as a historical record (win-count, results, audit), and a
// finished/orphaned contest stops loading as an active "joined" portfolio. This
// is the client-side equivalent of what close-competition does on settlement, for
// contests whose Competition row was removed without deactivating their entries.
export async function deactivateCompetitionEntriesForUser(competitionId: string, handle: string): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    const mine: any[] = [];
    let nextToken: string | null | undefined;
    do {
      const res: any = await client.models.CompetitionEntry.list({
        filter: { competitionId: { eq: competitionId } },
        limit: 1000,
        nextToken,
      });
      for (const e of (res?.data ?? [])) if (e.handle === handle && e.isActive !== false) mine.push(e);
      nextToken = res?.nextToken;
    } while (nextToken);
    await Promise.all(mine.map(e => client.models.CompetitionEntry.update({ id: e.id, isActive: false }).catch(() => {})));
  } catch (e) {
    console.warn('deactivateCompetitionEntriesForUser failed:', e);
  }
}

export async function leaveCompetitionForUser(competitionId: string, handle: string): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    // Paginate — a popular contest can have more entries than one page, which
    // would otherwise leave this user's row(s) undeleted (and re-appearing).
    const mine: any[] = [];
    let nextToken: string | null | undefined;
    do {
      const res: any = await client.models.CompetitionEntry.list({
        filter: { competitionId: { eq: competitionId } },
        limit: 1000,
        nextToken,
      });
      for (const e of (res?.data ?? [])) if (e.handle === handle) mine.push(e);
      nextToken = res?.nextToken;
    } while (nextToken);
    await Promise.all(mine.map(e => client.models.CompetitionEntry.delete({ id: e.id }).catch(() => {})));
  } catch (e) {
    console.warn('leaveCompetitionForUser failed:', e);
  }
}

// Read one player's portfolio within a contest (their holdings + cash), keyed by
// handle since that's all a leaderboard row carries. Returns null if no entry.
export async function fetchEntryPortfolio(competitionId: string, handle: string): Promise<ContestPortfolio | null> {
  const client = await getClient();
  if (!client) return null;
  try {
    const { data } = await client.models.CompetitionEntry.list({
      filter: { competitionId: { eq: competitionId } },
    });
    const row = (data as any[]).find(e => e.handle === handle && e.isActive !== false);
    if (!row) return null;
    let holdings: Holding[] = [];
    try { holdings = row.holdingsJson ? JSON.parse(row.holdingsJson) : []; } catch {}
    return {
      cash: row.cash ?? STARTING_CASH,
      holdings: Array.isArray(holdings) ? holdings : [],
      bankroll: row.bankroll ?? STARTING_CASH,
      pnlPct: row.pnlPct ?? 0,
    };
  } catch (e) {
    console.warn('fetchEntryPortfolio failed:', e);
    return null;
  }
}

// Server-authoritative CONTEST trade (future-fixes 2.2). The executeContestTrade
// mutation validates the caller's own CompetitionEntry cash/holdings at the SERVER
// price and returns the new ledger — so contest holdings can't be forged from a
// modified client. Wire this into the trade flow for CASH contests when
// CONTEST_CASH_PRIZES is enabled; XP contests keep trading locally until then.
export async function executeContestTrade(
  competitionId: string,
  symbol: string,
  side: 'buy' | 'sell',
  amount: number,
): Promise<{ ok: boolean; cash?: number; holdings?: Holding[]; error?: string }> {
  const client = await getClient();
  if (!client) return { ok: false, error: 'Offline' };
  try {
    const { data, errors } = await client.mutations.executeContestTrade({ competitionId, symbol, side, amount });
    if (errors?.length) return { ok: false, error: errors[0].message };
    const res = typeof data === 'string' ? JSON.parse(data) : (data as any);
    return { ok: !!res?.ok, cash: res?.cash, holdings: res?.holdings, error: res?.error };
  } catch (e) {
    console.warn('executeContestTrade failed', e);
    return { ok: false, error: String(e) };
  }
}

export async function fetchCompetitionLeaderboard(
  competitionId: string,
): Promise<CompetitionEntry[]> {
  const client = await getClient();
  if (!client) return [];
  try {
    const { data } = await client.models.CompetitionEntry.list({
      filter: { competitionId: { eq: competitionId } },
    });
    return (data as any[]).map(mapEntry).sort((a, b) => a.rank - b.rank);
  } catch {
    return [];
  }
}
