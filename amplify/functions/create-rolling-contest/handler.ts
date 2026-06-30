import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

const HOUR = 60 * 60 * 1000;
const PRIZE_XP = 5000;        // headline XP for every rolling contest (podium splits 100/50/25%)
const NUMBER_OF_PRIZES = 3;
const MAX_PLAYERS = 20;

// Rolling-contest cadences. Each size runs back-to-back fixed windows aligned to
// the epoch (so every device/cron agrees on the boundaries). Add/remove a row to
// change which cadences exist. All are XP-only (no cash) → Lane A.
const WINDOWS = [
  { hours: 2, label: '2-Hour Sprint', prefix: 'rolling-2h' },
  { hours: 3, label: '3-Hour Sprint', prefix: 'rolling-3h' },
  { hours: 6, label: '6-Hour Sprint', prefix: 'rolling-6h' },
];

// Create (idempotently) the XP contest for one window of one cadence. Conditional
// put on the window-derived id makes re-runs / overlapping crons a no-op.
async function ensureContest(table: string, w: { hours: number; label: string; prefix: string }, idx: number, now: number): Promise<{ id: string; created: boolean }> {
  const windowMs = w.hours * HOUR;
  const id = `${w.prefix}-${idx}`;
  const windowStart = idx * windowMs;
  const startIso = new Date(windowStart).toISOString();
  const endIso = new Date(windowStart + windowMs).toISOString();
  const nowIso = new Date(now).toISOString();
  const status = windowStart <= now ? 'live' : 'open';
  try {
    await ddb.send(new PutItemCommand({
      TableName: table,
      Item: marshall({
        id,
        name: w.label,
        type: 'featured',
        status,
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
        createdBy: 'rolling-cron',
        createdAt: nowIso,
        updatedAt: nowIso,
      }),
      ConditionExpression: 'attribute_not_exists(id)',
    }));
    return { id, created: true };
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return { id, created: false };
    throw err;
  }
}

// Scheduled hourly (EventBridge, see backend.ts). For EACH cadence (2h/3h/6h) it
// ensures the current window's contest (live) + the next window's (open) exist —
// so every cadence always has one running and one queued, gap-free, regardless of
// exact cron timing. Hourly is more frequent than the smallest (2h) window, so the
// next window is always pre-created well before the current one ends.
export const handler = async (): Promise<{ ensured: { id: string; created: boolean }[] }> => {
  const compTable = process.env.COMPETITION_TABLE_NAME;
  if (!compTable) throw new Error('COMPETITION_TABLE_NAME not set');

  const now = Date.now();
  const ensured: { id: string; created: boolean }[] = [];
  for (const w of WINDOWS) {
    const idx = Math.floor(now / (w.hours * HOUR));
    ensured.push(await ensureContest(compTable, w, idx, now));      // running now
    ensured.push(await ensureContest(compTable, w, idx + 1, now));  // scheduled next
  }
  return { ensured };
};
