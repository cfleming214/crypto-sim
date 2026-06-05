import { DynamoDBClient, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

// Keep these in sync with src/services/gamification.ts (assignLeague). Duplicated
// here because the Lambda can't import app source through the bundler.
const LEAGUES = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];
const LEAGUE_THRESHOLDS = [0, 500, 1500, 3500, 7000];

function assignLeague(seasonXp: number): { league: string; division: number } {
  let idx = 0;
  for (let i = LEAGUES.length - 1; i >= 0; i--) {
    if (seasonXp >= LEAGUE_THRESHOLDS[i]) { idx = i; break; }
  }
  const bandStart = LEAGUE_THRESHOLDS[idx];
  const bandEnd = idx < LEAGUES.length - 1 ? LEAGUE_THRESHOLDS[idx + 1] : bandStart + 7000;
  const frac = bandEnd > bandStart ? (seasonXp - bandStart) / (bandEnd - bandStart) : 1;
  const division = Math.min(3, Math.max(1, 3 - Math.floor(frac * 3)));
  return { league: LEAGUES[idx], division };
}

// Runs weekly on an EventBridge schedule. Assigns each player's league/division
// from the XP earned during the season (xp - seasonStartXp), then resets the
// baseline to the current xp for the next season.
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
      const seasonXp = Math.max(0, xp - (p.seasonStartXp ?? 0));
      const { league, division } = assignLeague(seasonXp);
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
