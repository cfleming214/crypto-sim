import { DynamoDBClient, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

// Keep this in sync with src/services/gamification.ts (assignLeague). Duplicated
// here because the Lambda can't import app source through the bundler. Players
// climb a fixed 10-level ladder (5 tiers × 2 levels) off lifetime XP; division =
// level-within-tier (1 = entry, 2 = top).
const LEAGUES = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Platinum'];
const LEVELS_PER_TIER = 2;
const MAX_LEVEL = LEAGUES.length * LEVELS_PER_TIER;
const BASE_LEVEL_XP = 500;

const LEVEL_COSTS: number[] = (() => {
  const costs = [BASE_LEVEL_XP];
  for (let i = 1; i < MAX_LEVEL - 1; i++) {
    const crossesTier = (i + 1) % LEVELS_PER_TIER === 0;
    costs.push(Math.round(costs[i - 1] * (crossesTier ? 2 : 1.5)));
  }
  return costs;
})();

const LEVEL_THRESHOLDS: number[] = (() => {
  const t = [0];
  for (let i = 0; i < LEVEL_COSTS.length; i++) t.push(t[i] + LEVEL_COSTS[i]);
  return t;
})();

function assignLeague(totalXp: number): { league: string; division: number } {
  const xp = Math.max(0, totalXp);
  let index = 0;
  for (let i = MAX_LEVEL - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) { index = i; break; }
  }
  return { league: LEAGUES[Math.floor(index / LEVELS_PER_TIER)], division: (index % LEVELS_PER_TIER) + 1 };
}

// Runs weekly on an EventBridge schedule. Assigns each player's tier/level from
// their lifetime XP against the fixed ladder, and refreshes the seasonStartXp
// baseline. The ladder is cumulative (levels are never lost), and the client
// snaps to the same XP-derived level on load, so this just keeps the stored
// value fresh between sessions.
export const handler = async (): Promise<void> => {
  const table = process.env.USER_PROFILE_TABLE_NAME;
  if (!table) throw new Error('USER_PROFILE_TABLE_NAME not set');

  let lastKey: Record<string, any> | undefined;
  do {
    const { Items = [], LastEvaluatedKey } = await ddb.send(new ScanCommand({
      TableName: table,
      ExclusiveStartKey: lastKey,
    }));
    lastKey = LastEvaluatedKey;

    const profiles = Items.map(i => unmarshall(i) as { id: string; xp?: number; seasonStartXp?: number });

    await Promise.all(profiles.map(p => {
      const xp = p.xp ?? 0;
      const { league, division } = assignLeague(xp);
      return ddb.send(new UpdateItemCommand({
        TableName: table,
        Key: marshall({ id: p.id }),
        UpdateExpression: 'SET #lg = :l, #dv = :d, #ss = :s',
        ExpressionAttributeNames: { '#lg': 'league', '#dv': 'division', '#ss': 'seasonStartXp' },
        ExpressionAttributeValues: marshall({ ':l': league, ':d': division, ':s': xp }),
      }));
    }));
  } while (lastKey);
};
