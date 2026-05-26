import { isAmplifyConfigured } from '../lib/amplify';
import type { Competition, CompetitionEntry } from '../store/types';

// Templates seeded into the cloud the first time the table is empty.
// entryCount is 0 here because real entry counts are computed from the
// CompetitionEntry table at fetch time — see fetchCompetitions.
function seedTemplates(): Competition[] {
  const now = Date.now();
  return [
    { id: 'ww-1',  name: 'Weekend Warriors', type: 'featured', status: 'live',
      prizePool: '$5,000', maxPlayers: 2000, stake: 'Free',
      startAt: now - 24 * 60 * 60 * 1000,
      endAt:   now +  2 * 60 * 60 * 1000 + 14 * 60 * 1000,
      entryCount: 0 },
    { id: 'qs-1',  name: 'Quick Sprint',     type: 'daily',    status: 'open',
      prizePool: '500 XP', maxPlayers: 500, stake: 'Free',
      startAt: now,
      endAt:   now + 5 * 60 * 60 * 1000,
      entryCount: 0 },
    { id: 'mm-1',  name: 'Memecoin Mania',   type: 'featured', status: 'open',
      prizePool: '$500', maxPlayers: 1000, stake: '100 XP',
      startAt: now + 2 * 60 * 60 * 1000,
      endAt:   now + 2 * 24 * 60 * 60 * 1000,
      entryCount: 0 },
    { id: 'br-1',  name: "Bull Run '21",     type: 'replay',   status: 'open',
      prizePool: '$2,000', maxPlayers: 500, stake: '500 XP',
      startAt: now,
      endAt:   now + 7 * 24 * 60 * 60 * 1000,
      entryCount: 0 },
    { id: '1v1-1', name: 'Quick Match',      type: '1v1',      status: 'open',
      prizePool: 'XP', maxPlayers: 2, stake: 'Free',
      startAt: now,
      endAt:   now + 30 * 60 * 1000,
      entryCount: 0 },
  ];
}

export const SEED_COMPETITIONS: Competition[] = seedTemplates();

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

export async function fetchCompetitions(): Promise<Competition[]> {
  const client = await getClient();
  if (!client) return SEED_COMPETITIONS;
  try {
    const { data } = await client.models.Competition.list();
    let remote = (data as any[]).map(mapCompetition);

    if (remote.length === 0) {
      // Cloud table is empty — auto-seed canonical templates with entryCount: 0.
      // Real counts are layered in below from the CompetitionEntry table.
      const templates = seedTemplates();
      await Promise.all(templates.map(c => client.models.Competition.create({
        name:       c.name,
        type:       c.type,
        status:     c.status,
        prizePool:  c.prizePool,
        maxPlayers: c.maxPlayers,
        stake:      c.stake,
        startAt:    new Date(c.startAt).toISOString(),
        endAt:      new Date(c.endAt).toISOString(),
        entryCount: 0,
      }).catch(() => null)));
      const { data: seeded } = await client.models.Competition.list();
      remote = (seeded as any[]).map(mapCompetition);
    }

    // Layer in real entry counts from CompetitionEntry — the cloud row's
    // entryCount field is just a starting hint; actual joins are reflected
    // here so the UI shows truthful numbers.
    try {
      const { data: entries } = await client.models.CompetitionEntry.list();
      const counts: Record<string, number> = {};
      for (const e of entries as any[]) {
        if (e.isActive !== false) counts[e.competitionId] = (counts[e.competitionId] ?? 0) + 1;
      }
      remote = remote.map(c => ({ ...c, entryCount: counts[c.id] ?? 0 }));
    } catch {
      // CompetitionEntry list can fail under owner-scoped read for some
      // setups; fall back to stored entryCount silently.
    }

    return remote.length > 0 ? remote : SEED_COMPETITIONS;
  } catch {
    return SEED_COMPETITIONS;
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
