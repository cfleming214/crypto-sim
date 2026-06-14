import { DynamoDBClient, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

// Keep LEAGUES in sync with src/services/gamification.ts. Weekly Leagues use the
// tier as the competitive cohort: you race everyone in your tier on XP earned
// THIS WEEK; the top promote, the bottom relegate.
const LEAGUES = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Platinum'];
const PROMOTE = 5;   // top N of a tier promote up
const RELEGATE = 5;  // bottom N of a tier relegate down (kept equal to PROMOTE)

// Runs weekly on an EventBridge schedule. For each league tier, rank players by
// XP earned since last settle (weeklyXp = xp − seasonStartXp); promote the top
// PROMOTE to the next tier and relegate the bottom RELEGATE to the previous one.
// Then reset seasonStartXp = xp so the next week starts from zero. `division`
// becomes the within-tier standing after moves (2 = top half, 1 = bottom half).
export const handler = async (): Promise<void> => {
  const table = process.env.USER_PROFILE_TABLE_NAME;
  if (!table) throw new Error('USER_PROFILE_TABLE_NAME not set');

  // 1. Collect every profile + its weekly XP.
  type P = { id: string; xp: number; league: string; weeklyXp: number };
  const all: P[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const { Items = [], LastEvaluatedKey } = await ddb.send(new ScanCommand({
      TableName: table, ExclusiveStartKey: lastKey,
    }));
    lastKey = LastEvaluatedKey;
    for (const it of Items) {
      const p = unmarshall(it) as { id: string; xp?: number; seasonStartXp?: number; league?: string };
      const xp = p.xp ?? 0;
      const league = LEAGUES.includes(p.league ?? '') ? (p.league as string) : 'Bronze';
      all.push({ id: p.id, xp, league, weeklyXp: Math.max(0, xp - (p.seasonStartXp ?? xp)) });
    }
  } while (lastKey);

  // 2. Promotion / relegation within each tier, ranked by weekly XP.
  const newLeague = new Map<string, string>();
  for (let ti = 0; ti < LEAGUES.length; ti++) {
    const group = all.filter(p => p.league === LEAGUES[ti]).sort((a, b) => b.weeklyXp - a.weeklyXp);
    // Cap moves so a small tier never promotes and relegates the same player.
    const promote = Math.min(PROMOTE, Math.floor(group.length / 3));
    const relegate = Math.min(RELEGATE, Math.floor(group.length / 3));
    group.forEach((p, i) => {
      let lg = LEAGUES[ti];
      if (ti < LEAGUES.length - 1 && i < promote) lg = LEAGUES[ti + 1];                    // top → up
      else if (ti > 0 && i >= group.length - relegate) lg = LEAGUES[ti - 1];               // bottom → down
      newLeague.set(p.id, lg);
    });
  }

  // 3. division = top half of the (new) tier by weekly XP → 2, else 1.
  const division = new Map<string, number>();
  for (const tier of LEAGUES) {
    const group = all.filter(p => newLeague.get(p.id) === tier).sort((a, b) => b.weeklyXp - a.weeklyXp);
    group.forEach((p, i) => division.set(p.id, i < Math.ceil(group.length / 2) ? 2 : 1));
  }

  // 4. Persist league + division and reset the weekly baseline.
  await Promise.all(all.map(p => ddb.send(new UpdateItemCommand({
    TableName: table,
    Key: marshall({ id: p.id }),
    UpdateExpression: 'SET #lg = :l, #dv = :d, #ss = :s',
    ExpressionAttributeNames: { '#lg': 'league', '#dv': 'division', '#ss': 'seasonStartXp' },
    ExpressionAttributeValues: marshall({ ':l': newLeague.get(p.id) ?? p.league, ':d': division.get(p.id) ?? 1, ':s': p.xp }),
  }))));
};
