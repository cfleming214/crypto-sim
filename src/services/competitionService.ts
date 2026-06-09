import { isAmplifyConfigured } from '../lib/amplify';
import type { Competition, CompetitionEntry } from '../store/types';
import { DEFAULT_PRIZE_XP } from '../constants/featureFlags';

// No hardcoded seed — the Competition table in DynamoDB is the single source
// of truth. Contests are inserted via the createCompetition Lambda or
// directly via AWS CLI / console.

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
  return {
    id: d.id,
    name: d.name,
    type: d.type as Competition['type'],
    status: d.status as Competition['status'],
    prizePool: d.prizePool ?? '',
    maxPlayers: d.maxPlayers ?? 0,
    stake: d.stake ?? 'Free',
    startAt: new Date(d.startAt).getTime(),
    endAt: new Date(d.endAt).getTime(),
    entryCount: d.entryCount ?? 0,
    numberOfPrizes: d.numberOfPrizes ?? prizes.length,
    prizes,
    prizeXp: d.prizeXp ?? DEFAULT_PRIZE_XP,
    inviteCode: d.inviteCode ?? undefined,
    challengerHandle: d.challengerHandle ?? undefined,
  };
}

function mapEntry(d: any): CompetitionEntry {
  return {
    id: d.id,
    competitionId: d.competitionId,
    handle: d.handle,
    bankroll: d.bankroll ?? 10000,
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
  if (!client) return [];
  try {
    const { data } = await client.models.Competition.list();
    const remote = (data as any[]).map(mapCompetition);
    return await layerEntryCounts(client, remote);
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
    const sub = client.models.Competition.observeQuery().subscribe({
      next: async ({ items }: { items: any[] }) => {
        const comps = (items ?? []).map(mapCompetition);
        const layered = await layerEntryCounts(client, comps);
        onUpdate(layered);
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
): Promise<{ competition: Competition; entry: CompetitionEntry | null } | null> {
  const client = await getClient();
  if (!client) return null;
  try {
    const now = Date.now();
    const inviteCode = makeInviteCode();
    const days = Math.max(1, Math.round(durationMs / DAY_MS));
    const { data: comp } = await client.models.Competition.create({
      name: `Duel · ${handle} · ${days}d`,
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
