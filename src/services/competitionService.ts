import { isAmplifyConfigured } from '../lib/amplify';
import type { Competition, CompetitionEntry } from '../store/types';

const NOW = Date.now();

export const SEED_COMPETITIONS: Competition[] = [
  {
    id: 'ww-1',
    name: 'Weekend Warriors',
    type: 'featured',
    status: 'live',
    prizePool: '$5,000',
    maxPlayers: 2000,
    stake: 'Free',
    startAt: NOW - 24 * 60 * 60 * 1000,
    endAt: NOW + 2 * 60 * 60 * 1000 + 14 * 60 * 1000,
    entryCount: 1284,
  },
  {
    id: 'qs-1',
    name: 'Quick Sprint',
    type: 'daily',
    status: 'open',
    prizePool: '500 XP',
    maxPlayers: 500,
    stake: 'Free',
    startAt: NOW,
    endAt: NOW + 5 * 60 * 60 * 1000,
    entryCount: 89,
  },
  {
    id: 'mm-1',
    name: 'Memecoin Mania',
    type: 'featured',
    status: 'open',
    prizePool: '$500',
    maxPlayers: 1000,
    stake: '100 XP',
    startAt: NOW + 2 * 60 * 60 * 1000,
    endAt: NOW + 2 * 24 * 60 * 60 * 1000,
    entryCount: 412,
  },
  {
    id: 'br-1',
    name: "Bull Run '21",
    type: 'replay',
    status: 'open',
    prizePool: '$2,000',
    maxPlayers: 500,
    stake: '500 XP',
    startAt: NOW,
    endAt: NOW + 7 * 24 * 60 * 60 * 1000,
    entryCount: 63,
  },
  {
    id: '1v1-1',
    name: 'Quick Match',
    type: '1v1',
    status: 'open',
    prizePool: 'XP',
    maxPlayers: 2,
    stake: 'Free',
    startAt: NOW,
    endAt: NOW + 30 * 60 * 1000,
    entryCount: 0,
  },
];

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
    const remote = (data as any[]).map(mapCompetition);
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
