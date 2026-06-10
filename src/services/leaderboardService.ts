import { isAmplifyConfigured } from '../lib/amplify';

// Reads the precomputed global leaderboard. The tick-global-leaderboard Lambda
// rebuilds the (bounded, ~top 100) GlobalLeaderboard table every ~5 min by
// valuing every opted-in user's holdings at current prices; phones just read
// that small table instead of subscribing to every profile change.

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

export interface LeaderboardRow {
  id: string;
  rank: number;
  owner: string;       // Cognito sub (may be "sub::username") — for self-highlight + block filter
  handle: string;
  value: number;       // live-priced portfolio value
  pnlPct: number;
  league?: string;
  avatarKey?: string;
  avatarColor?: string;
}

function mapRow(d: any): LeaderboardRow {
  return {
    id: d.id,
    rank: typeof d.rank === 'number' ? d.rank : 999,
    owner: d.owner ?? '',
    handle: d.handle ?? '',
    value: typeof d.value === 'number' ? d.value : 0,
    pnlPct: typeof d.pnlPct === 'number' ? d.pnlPct : 0,
    league: d.league ?? undefined,
    avatarKey: d.avatarKey ?? undefined,
    avatarColor: d.avatarColor ?? undefined,
  };
}

// Drop null/partial items (observeQuery can surface them mid-sync) and any row
// missing an id, then map. Keeps a stray null from throwing inside the
// subscription callback and red-screening the app.
function mapRows(items: any[]): LeaderboardRow[] {
  return (items ?? [])
    .filter(d => d && d.id)
    .map(mapRow)
    .sort((a, b) => a.rank - b.rank);
}

export async function fetchGlobalLeaderboard(): Promise<LeaderboardRow[]> {
  const client = await getClient();
  if (!client) return [];
  try {
    const { data } = await client.models.GlobalLeaderboard.list();
    return mapRows(data as any[]);
  } catch (e) {
    console.warn('fetchGlobalLeaderboard failed:', e);
    return [];
  }
}

// Live updates. The table is tiny and only the Lambda writes it (every ~5 min),
// so this observeQuery is cheap — a handful of events per refresh, not the
// per-trade fan-out of subscribing to every PublicProfile.
export async function subscribeToGlobalLeaderboard(
  onUpdate: (rows: LeaderboardRow[]) => void,
): Promise<() => void> {
  const client = await getClient();
  if (!client) return () => {};
  try {
    const sub = client.models.GlobalLeaderboard.observeQuery().subscribe({
      next: ({ items }: { items: any[] }) => {
        try {
          onUpdate(mapRows(items));
        } catch (err) {
          console.warn('GlobalLeaderboard map failed:', err);
        }
      },
      error: (err: unknown) => console.warn('GlobalLeaderboard subscription error:', err),
    });
    return () => sub.unsubscribe();
  } catch (e) {
    console.warn('subscribeToGlobalLeaderboard failed:', e);
    return () => {};
  }
}
