import {
  DynamoDBClient,
  ScanCommand,
  PutItemCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { pushToUser } from '../lib/expoPush';

const ddb = new DynamoDBClient({});

const TOP_N = 100;
// Milestone bands (best first). A user is notified when they cross INTO a band
// they weren't in last run — only on improvement, and at most one push per run
// (the best band crossed) — so the 5-minute cron can't spam rank churn.
const RANK_BANDS = [1, 3, 10, 25, 50, 100];

function rankBandMessage(rank: number, band: number): { title: string; body: string } {
  if (band === 1)  return { title: 'You\'re #1! 👑', body: 'You just took the top spot on the global leaderboard.' };
  if (band === 3)  return { title: 'Top 3! 🥉', body: `You climbed to #${rank} on the global leaderboard.` };
  if (band === 10) return { title: 'Top 10! 🔥', body: `You broke into the top 10 — now #${rank} globally.` };
  if (band === 25) return { title: 'Top 25', body: `You moved up to #${rank} on the global leaderboard.` };
  if (band === 50) return { title: 'Top 50', body: `You climbed to #${rank} on the global leaderboard.` };
  return { title: 'Top 100', body: `You broke into the top 100 — now #${rank} globally.` };
}
// Must match the app's STARTING_CASH (src/constants/featureFlags.ts). Was 10000
// from an earlier starting balance, which made every pnlPct ~10× too high.
const STARTING_BANKROLL = 100000;

interface Holding { symbol: string; units: number; }

// Runs on EventBridge schedule every 5 minutes. Ranks every opted-in user by
// lifetime XP and rewrites the top-N GlobalLeaderboard rows (id = rank string).
// Each user's live-priced portfolio value + P&L% is also computed and stored as
// a secondary stat shown under the handle.
export const handler = async (): Promise<void> => {
  const profileTable = process.env.USER_PROFILE_TABLE_NAME;
  const tokenTable = process.env.TOKEN_TABLE_NAME;
  const boardTable = process.env.GLOBAL_LEADERBOARD_TABLE_NAME;
  const entryTable = process.env.COMPETITION_ENTRY_TABLE_NAME;
  if (!profileTable || !tokenTable || !boardTable) throw new Error('Table env vars not set');

  // 1. Price map { SYMBOL -> lastPrice } from the Token catalog (no external calls).
  const priceMap: Record<string, number> = { USDC: 1 };
  for await (const row of scanAll(tokenTable)) {
    const t = unmarshall(row) as { symbol?: string; lastPrice?: number };
    if (t.symbol && typeof t.lastPrice === 'number') priceMap[t.symbol] = t.lastPrice;
  }

  // 1b. Contests won per owner, derived from finished entries: an entry that
  // ended in 1st place (rank === 1, isActive === false). close-competition sets
  // every entry inactive when a contest ends, so this counts real wins as they
  // happen. Merged with the stored UserProfile.contestsWon (which the seed sets
  // for bots) via max(), so both demo bots and real winners show counts.
  const winsByOwner: Record<string, number> = {};
  if (entryTable) {
    for await (const row of scanAll(entryTable)) {
      const e = unmarshall(row) as { owner?: string; rank?: number; isActive?: boolean };
      if (e.owner && e.rank === 1 && e.isActive === false) {
        winsByOwner[e.owner] = (winsByOwner[e.owner] ?? 0) + 1;
      }
    }
  }

  // 2. Value every visible profile and read its lifetime XP + contests won.
  type Ranked = {
    owner: string; handle: string; xp: number; contestsWon: number; value: number; pnlPct: number;
    league?: string; avatarKey?: string; avatarColor?: string;
  };
  const ranked: Ranked[] = [];
  for await (const row of scanAll(profileTable)) {
    const p = unmarshall(row) as {
      owner?: string; handle?: string; xp?: number; contestsWon?: number; cash?: number; holdingsJson?: string;
      league?: string; avatarKey?: string; avatarColor?: string; leaderboardVisible?: boolean;
    };
    if (p.leaderboardVisible === false) continue; // opted out (null/undefined = visible)
    if (!p.owner || !p.handle) continue;

    let holdings: Holding[] = [];
    try { holdings = JSON.parse(p.holdingsJson || '[]'); } catch { holdings = []; }
    const holdingsValue = holdings.reduce(
      (sum, h) => sum + (h.units || 0) * (priceMap[h.symbol] ?? 0), 0,
    );
    const value = (p.cash ?? 0) + holdingsValue;
    const pnlPct = ((value - STARTING_BANKROLL) / STARTING_BANKROLL) * 100;
    const contestsWon = Math.max(winsByOwner[p.owner] ?? 0, p.contestsWon ?? 0);
    ranked.push({
      owner: p.owner, handle: p.handle, xp: p.xp ?? 0, contestsWon, value, pnlPct,
      league: p.league, avatarKey: p.avatarKey, avatarColor: p.avatarColor,
    });
  }

  // Collapse duplicate profiles for the same owner — an account (e.g. a seeded
  // bot reseeded across runs) can have more than one UserProfile row, which
  // otherwise shows up as duplicate leaderboard entries with different XP. Keep
  // the highest-XP row per owner (tie-break on live value).
  const byOwner = new Map<string, Ranked>();
  for (const r of ranked) {
    const prev = byOwner.get(r.owner);
    if (!prev || r.xp > prev.xp || (r.xp === prev.xp && r.value > prev.value)) byOwner.set(r.owner, r);
  }
  const deduped = [...byOwner.values()];

  // Wins rank: position by contests won across ALL users (ties keep insertion
  // order). Computed over the full population so a user's wins rank is global,
  // even though the board itself only shows the top-N by XP.
  const winsRankByOwner: Record<string, number> = {};
  [...deduped].sort((a, b) => b.contestsWon - a.contestsWon)
    .forEach((r, i) => { winsRankByOwner[r.owner] = i + 1; });

  // Rank by lifetime XP (tie-break on live value) — the board's primary order.
  deduped.sort((a, b) => b.xp - a.xp || b.value - a.value);
  const top = deduped.slice(0, TOP_N);
  const now = new Date().toISOString();

  // 2b. Snapshot each owner's PRIOR rank from the existing board BEFORE we
  // overwrite it, so we can detect rank-band crossings. The board is rank-keyed
  // (id = "1".."100"), so prior rank lives on whichever row currently holds it.
  // boardHadRows guards the first run after deploy (empty board) from pushing a
  // "you broke into the top 100" to everyone at once.
  const prevRankByOwner: Record<string, number> = {};
  let boardHadRows = false;
  for await (const row of scanAll(boardTable)) {
    const b = unmarshall(row) as { owner?: string; rank?: number };
    boardHadRows = true;
    if (b.owner && typeof b.rank === 'number') prevRankByOwner[b.owner] = b.rank;
  }

  // 3. Write rows 1..N (id = rank string), overwriting in place.
  await Promise.all(top.map((r, i) =>
    ddb.send(new PutItemCommand({
      TableName: boardTable,
      Item: marshall({
        id: String(i + 1),
        __typename: 'GlobalLeaderboard',
        rank: i + 1,
        owner: r.owner,
        handle: r.handle,
        xp: r.xp,
        contestsWon: r.contestsWon,
        winsRank: winsRankByOwner[r.owner] ?? (i + 1),
        value: r.value,
        pnlPct: r.pnlPct,
        league: r.league ?? null,
        avatarKey: r.avatarKey ?? null,
        avatarColor: r.avatarColor ?? null,
        // createdAt is an Amplify-managed AWSDateTime! (non-null) field. Without
        // it the AppSync list resolver nullifies every row and the client gets
        // an empty/errored list — so always write it.
        createdAt: now,
        updatedAt: now,
      }, { removeUndefinedValues: true }),
    })),
  ));

  // 4. Delete stale rows beyond the current count (fewer visible users than last run).
  const stale: string[] = [];
  for await (const row of scanAll(boardTable)) {
    const id = (row.id as { S?: string })?.S;
    if (id && Number(id) > top.length) stale.push(id);
  }
  await Promise.all(stale.map(id =>
    ddb.send(new DeleteItemCommand({ TableName: boardTable, Key: marshall({ id }) })),
  ));

  // 5. Notify users who crossed UP into a new rank band since last run. Skipped
  // on a cold board (first run) to avoid a mass push. Off-board last run counts
  // as oldRank = Infinity, so a debut into the top 100 still notifies.
  const pushTable = process.env.PUSH_TOKEN_TABLE_NAME;
  if (pushTable && boardHadRows) {
    const crossings = top.flatMap((r, i) => {
      const newRank = i + 1;
      const oldRank = prevRankByOwner[r.owner] ?? Infinity;
      if (newRank >= oldRank) return []; // no improvement
      // Best (smallest) band the user is now in but wasn't last run.
      const band = RANK_BANDS.find(b => newRank <= b && oldRank > b);
      if (!band) return [];
      return [{ owner: r.owner, newRank, band }];
    });
    await Promise.all(crossings.map(c => {
      const { title, body } = rankBandMessage(c.newRank, c.band);
      return pushToUser(pushTable, c.owner, { title, body, data: { type: 'rank_change', rank: c.newRank } })
        .catch(err => console.error('Rank-change push failed for', c.owner, err));
    }));
  }
};

// Paginated full-table scan generator.
async function* scanAll(table: string) {
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const out = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey }));
    for (const item of out.Items ?? []) yield item;
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}
