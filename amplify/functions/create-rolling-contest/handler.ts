import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

const WINDOW_MS = 6 * 60 * 60 * 1000; // 6-hour contest window
const PRIZE_XP = 5000;                // headline XP (podium splits 100/50/25%)
const NUMBER_OF_PRIZES = 3;
const MAX_PLAYERS = 20;

// UTC 6-hour window index since the epoch — a deterministic id per window so
// re-runs (or an overlapping cron) can't create duplicate contests for the same
// window.
const windowIndex = (now: number) => Math.floor(now / WINDOW_MS);

// Create (idempotently) the XP contest for one 6-hour window. Conditional put on
// the window-derived id makes re-runs a no-op. XP-only (no cash) so it stays
// Lane A / no real-money compliance. Returns whether a row was actually written.
async function ensureContest(table: string, idx: number, now: number): Promise<{ id: string; created: boolean }> {
  const id = `rolling-6h-${idx}`;
  const windowStart = idx * WINDOW_MS;
  const startIso = new Date(windowStart).toISOString();
  const endIso = new Date(windowStart + WINDOW_MS).toISOString();
  const nowIso = new Date(now).toISOString();
  // The current window has already started (live); a future window is open.
  const status = windowStart <= now ? 'live' : 'open';

  try {
    await ddb.send(new PutItemCommand({
      TableName: table,
      Item: marshall({
        id,
        name: '6-Hour Sprint',
        type: 'featured',
        status,                  // the client also derives status from startAt/endAt
        prizePool: '',
        maxPlayers: MAX_PLAYERS,
        stake: 'Free',
        startAt: startIso,
        endAt: endIso,
        entryCount: 0,
        prizeXp: PRIZE_XP,
        numberOfPrizes: NUMBER_OF_PRIZES,
        prizesJson: '[]',
        cashPrize: false,
        lockAfterStart: false,
        createdBy: 'rolling-6h-cron',
        createdAt: nowIso,
        updatedAt: nowIso,
      }),
      ConditionExpression: 'attribute_not_exists(id)',
    }));
    return { id, created: true };
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return { id, created: false }; // already exists
    throw err;
  }
}

// Scheduled every 6 hours (EventBridge, see backend.ts). To guarantee there is
// always ONE running contest and ONE scheduled, each run ensures BOTH the
// current 6-hour window's contest (live) and the next window's (open) exist —
// so the upcoming one is always pre-created regardless of exact cron timing.
export const handler = async (): Promise<{ current: { id: string; created: boolean }; next: { id: string; created: boolean } }> => {
  const compTable = process.env.COMPETITION_TABLE_NAME;
  if (!compTable) throw new Error('COMPETITION_TABLE_NAME not set');

  const now = Date.now();
  const idx = windowIndex(now);
  const current = await ensureContest(compTable, idx, now);      // running now
  const next = await ensureContest(compTable, idx + 1, now);     // scheduled
  return { current, next };
};
