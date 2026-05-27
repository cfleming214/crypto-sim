import { isAmplifyConfigured } from '../lib/amplify';
import type { Competition, CompetitionEntry } from '../store/types';

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
