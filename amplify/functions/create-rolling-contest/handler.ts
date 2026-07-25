import { DynamoDBClient, PutItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

const HOUR = 60 * 60 * 1000;
const PRIZE_XP = 5000;        // headline XP for every rolling contest (podium splits 100/50/25%)
const NUMBER_OF_PRIZES = 3;
const MAX_PLAYERS = 20;

// Safety cap on overflow rooms per window. A miscounted entry table can't spawn
// contests without bound — at worst it stops here and players wait for the next
// window, which is the pre-overflow behaviour anyway.
const MAX_ROOMS_PER_WINDOW = 20;

// Rolling-contest cadences. Each size runs back-to-back fixed windows aligned to
// the epoch (so every device/cron agrees on the boundaries). Add/remove a row to
// change which cadences exist. All are XP-only (no cash) → Lane A.
const WINDOWS = [
  { hours: 2, label: '2-Hour Sprint', prefix: 'rolling-2h' },
  { hours: 3, label: '3-Hour Sprint', prefix: 'rolling-3h' },
  { hours: 6, label: '6-Hour Sprint', prefix: 'rolling-6h' },
];

// Room 1 keeps the bare window id so every contest created before overflow
// existed keeps working untouched. Overflow rooms suffix `-r2`, `-r3`, …
function roomId(prefix: string, idx: number, room: number): string {
  return room === 1 ? `${prefix}-${idx}` : `${prefix}-${idx}-r${room}`;
}

function roomName(label: string, room: number): string {
  return room === 1 ? label : `${label} (Room ${room})`;
}

// Active entries per competition, keyed by competitionId. Scans the entry table
// once per invocation — the same approach tick-leaderboard takes against this
// table, rather than a Query per contest.
// `isActive` missing counts as active, matching how the client tallies entries
// (`.filter(e => e.isActive !== false)`); older rows predate the flag.
async function activeEntryCounts(table: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  let start: Record<string, any> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: table,
      ExclusiveStartKey: start,
      ProjectionExpression: 'competitionId, isActive',
    }));
    for (const it of res.Items ?? []) {
      if (it.isActive?.BOOL === false) continue;
      const id = it.competitionId?.S;
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    }
    start = res.LastEvaluatedKey;
  } while (start);
  return counts;
}

// Create (idempotently) one room of one window of one cadence. Conditional put
// on the room id makes re-runs / overlapping crons a no-op.
async function ensureContest(
  table: string,
  w: { hours: number; label: string; prefix: string },
  idx: number,
  room: number,
  now: number,
): Promise<{ id: string; created: boolean }> {
  const windowMs = w.hours * HOUR;
  const id = roomId(w.prefix, idx, room);
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
        name: roomName(w.label, room),
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

// Ensure one window has a room players can actually join: always room 1, plus a
// fresh room for every room already at MAX_PLAYERS. Walking from room 1 rather
// than tracking a pointer keeps this stateless and idempotent — re-running is a
// no-op once the tail room has space.
async function ensureWindowRooms(
  table: string,
  w: { hours: number; label: string; prefix: string },
  idx: number,
  now: number,
  counts: Record<string, number>,
  ensured: { id: string; created: boolean }[],
): Promise<void> {
  for (let room = 1; room <= MAX_ROOMS_PER_WINDOW; room++) {
    ensured.push(await ensureContest(table, w, idx, room, now));
    // Stop at the first room with space. A room created just now has no entries,
    // so this always terminates on a joinable contest.
    if ((counts[roomId(w.prefix, idx, room)] ?? 0) < MAX_PLAYERS) break;
  }
}

// Scheduled (EventBridge, see backend.ts). For EACH cadence (2h/3h/6h) it ensures
// the current window's contest (live) + the next window's (open) exist — so every
// cadence always has one running and one queued, gap-free, regardless of exact
// cron timing.
//
// Windows are also kept JOINABLE: when a room reaches its 20-player cap, the next
// run opens an overflow room for that same window (`-r2`, `-r3`, …) instead of
// leaving players to wait out the window with nothing to enter.
export const handler = async (): Promise<{ ensured: { id: string; created: boolean }[] }> => {
  const compTable = process.env.COMPETITION_TABLE_NAME;
  if (!compTable) throw new Error('COMPETITION_TABLE_NAME not set');
  const entryTable = process.env.COMPETITION_ENTRY_TABLE_NAME;
  if (!entryTable) throw new Error('COMPETITION_ENTRY_TABLE_NAME not set');

  const now = Date.now();
  const counts = await activeEntryCounts(entryTable);
  const ensured: { id: string; created: boolean }[] = [];
  for (const w of WINDOWS) {
    const idx = Math.floor(now / (w.hours * HOUR));
    await ensureWindowRooms(compTable, w, idx, now, counts, ensured);      // running now
    await ensureWindowRooms(compTable, w, idx + 1, now, counts, ensured);  // scheduled next
  }
  return { ensured };
};
