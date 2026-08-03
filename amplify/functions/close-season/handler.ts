import { DynamoDBClient, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

// Keep in sync with src/services/gamification.ts. A season is derived purely from
// the clock, so the server and the client agree without coordinating.
const DAY_MS = 24 * 60 * 60 * 1000;
const SEASON_LENGTH_DAYS = 28;
const SEASON_MS = SEASON_LENGTH_DAYS * DAY_MS;
const SEASON_ANCHOR = Date.UTC(2026, 0, 5); // Mon 2026-01-05 00:00 UTC
const seasonId = (now: number): number => Math.floor((now - SEASON_ANCHOR) / SEASON_MS);

// Keep in sync with src/data/season.ts — only the XP thresholds matter here.
// Used solely to decide whether a user has rewards OWED; the grant itself stays
// on the client, because tier rewards write cash/cosmetics into local state the
// server has no business reconstructing.
const TIER_XP = [200, 500, 1000, 1800, 3000, 4500, 6500, 9000, 12000, 16000, 21000, 28000];
const tierReached = (seasonXp: number): number =>
  TIER_XP.reduce((n, need, i) => (seasonXp >= need ? i + 1 : n), 0);

interface SeasonBlob {
  id: number | null;
  baselineXp: number;
  claimedTiers: number[];
  lastClosed?: unknown;
}

// Advance every account whose season pointer is behind the wall clock.
//
// Deliberately does NOT advance a user who still has earned-but-unclaimed tiers.
// Rolling those forward here would destroy them: the reward grant lives in the
// client reducer (CRYP-25), so the server can only reset the pointer, and doing
// that first means the client never sees the old season and never settles. Those
// accounts are left for the client to close out on next open, which grants
// correctly. Everyone else — the overwhelming majority, who have nothing owed —
// is reset here and no longer depends on opening the app.
export const handler = async (): Promise<void> => {
  const table = process.env.USER_PROFILE_TABLE_NAME;
  if (!table) throw new Error('USER_PROFILE_TABLE_NAME not set');

  const now = Date.now();
  const current = seasonId(now);
  let advanced = 0, deferred = 0, scanned = 0;

  let lastKey: Record<string, any> | undefined;
  do {
    const { Items = [], LastEvaluatedKey } = await ddb.send(new ScanCommand({
      TableName: table, ExclusiveStartKey: lastKey,
    }));
    lastKey = LastEvaluatedKey;

    for (const raw of Items) {
      const p = unmarshall(raw) as { id: string; xp?: number; gamificationJson?: string };
      scanned++;

      let gami: Record<string, any>;
      try { gami = p.gamificationJson ? JSON.parse(p.gamificationJson) : {}; } catch { continue; }
      const season = gami.season as SeasonBlob | undefined;
      // No season blob yet (never opened the app / pre-dates the feature) — the
      // client seeds it on first run. Nothing to close.
      if (!season || typeof season !== 'object' || season.id == null) continue;
      if (season.id >= current) continue;                    // already current

      const xp = typeof p.xp === 'number' ? p.xp : 0;
      const seasonXp = Math.max(0, xp - (season.baselineXp ?? 0));
      const claimed = Array.isArray(season.claimedTiers) ? season.claimedTiers : [];
      const owed = tierReached(seasonXp) > 0
        && TIER_XP.some((need, i) => seasonXp >= need && !claimed.includes(i + 1));
      if (owed) { deferred++; continue; }                    // client settles this one

      gami.season = {
        id: current,
        baselineXp: xp,
        claimedTiers: [],
        lastClosed: {
          seasonId: season.id,
          seasonXp,
          tierReached: tierReached(seasonXp),
          settled: [],                                        // nothing was owed
          closedAt: now,
        },
      };

      // Write ONLY gamificationJson, read-modify-write, so concurrent updates to
      // other columns (xp, bankroll, league) aren't clobbered.
      await ddb.send(new UpdateItemCommand({
        TableName: table,
        Key: marshall({ id: p.id }),
        UpdateExpression: 'SET gamificationJson = :g',
        ExpressionAttributeValues: marshall({ ':g': JSON.stringify(gami) }),
      }));
      advanced++;
    }
  } while (lastKey);

  console.log(`[close-season] season ${current}: scanned ${scanned}, advanced ${advanced}, deferred ${deferred} (rewards owed)`);
};
