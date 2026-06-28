import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PRIZE_XP = 5000;        // headline XP (podium splits 100/50/25%)
const NUMBER_OF_PRIZES = 3;
const MAX_PLAYERS = 1000;

// UTC week index since the epoch — a deterministic id per week so re-runs (or an
// overlapping cron) can't create duplicate contests for the same week.
const weekIndex = (now: number) => Math.floor(now / WEEK_MS);

// Scheduled weekly (EventBridge, see backend.ts). Creates one LIVE 7-day XP
// contest for the current week. Idempotent via a conditional put on the
// week-derived id. XP-only (no cash) so it stays Lane A / no real-money compliance.
export const handler = async (): Promise<{ id: string; created: boolean }> => {
  const compTable = process.env.COMPETITION_TABLE_NAME;
  if (!compTable) throw new Error('COMPETITION_TABLE_NAME not set');

  const now = Date.now();
  const id = `weekly-${weekIndex(now)}`;
  const nowIso = new Date(now).toISOString();
  const endIso = new Date(now + WEEK_MS).toISOString();

  try {
    await ddb.send(new PutItemCommand({
      TableName: compTable,
      Item: marshall({
        id,
        name: 'Weekly Challenge',
        type: 'featured',
        status: 'live',          // starts immediately; the client also derives live from startAt
        prizePool: '',
        maxPlayers: MAX_PLAYERS,
        stake: 'Free',
        startAt: nowIso,
        endAt: endIso,
        entryCount: 0,
        prizeXp: PRIZE_XP,
        numberOfPrizes: NUMBER_OF_PRIZES,
        prizesJson: '[]',
        cashPrize: false,
        lockAfterStart: false,
        createdBy: 'weekly-cron',
        createdAt: nowIso,
        updatedAt: nowIso,
      }),
      ConditionExpression: 'attribute_not_exists(id)',
    }));
    return { id, created: true };
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return { id, created: false }; // already created this week
    throw err;
  }
};
