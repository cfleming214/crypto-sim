import { DynamoDBClient, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

// EventBridge, every 10 minutes. Finalizes replay contests whose 7-day clock has
// run out: flips status → 'finished' (in place, no archive table) and marks all
// their entries inactive so they stop being re-ranked. XP prizes are claimed
// client-side via CLAIM_CONTEST_XP (gated by claimedContestIds), like live
// contests, so no server XP write is needed.
export const handler = async (): Promise<void> => {
  const contestTable = process.env.REPLAY_CONTEST_TABLE_NAME;
  const entryTable = process.env.REPLAY_ENTRY_TABLE_NAME;
  if (!contestTable) throw new Error('REPLAY_CONTEST_TABLE_NAME not set');
  if (!entryTable) throw new Error('REPLAY_ENTRY_TABLE_NAME not set');

  const now = Date.now();

  // 1. Contests past endAt that aren't finished yet.
  const toClose: string[] = [];
  let cStart: Record<string, any> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({ TableName: contestTable, ExclusiveStartKey: cStart }));
    for (const raw of res.Items ?? []) {
      const c = unmarshall(raw) as { id: string; status?: string; endAt?: string };
      if (c.status !== 'finished' && c.endAt && Date.parse(c.endAt) <= now) toClose.push(c.id);
    }
    cStart = res.LastEvaluatedKey;
  } while (cStart);

  if (!toClose.length) return;
  const closing = new Set(toClose);

  // 2. Deactivate every entry belonging to a closing contest.
  let eStart: Record<string, any> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: entryTable,
      ExclusiveStartKey: eStart,
      FilterExpression: 'isActive = :t',
      ExpressionAttributeValues: { ':t': { BOOL: true } },
    }));
    const updates: Promise<unknown>[] = [];
    for (const raw of res.Items ?? []) {
      const e = unmarshall(raw) as { id: string; replayContestId?: string };
      if (e.replayContestId && closing.has(e.replayContestId)) {
        updates.push(ddb.send(new UpdateItemCommand({
          TableName: entryTable,
          Key: marshall({ id: e.id }),
          UpdateExpression: 'SET isActive = :f',
          ExpressionAttributeValues: marshall({ ':f': false }),
        })));
      }
    }
    await Promise.all(updates);
    eStart = res.LastEvaluatedKey;
  } while (eStart);

  // 3. Flip each contest to finished.
  await Promise.all(toClose.map(id =>
    ddb.send(new UpdateItemCommand({
      TableName: contestTable,
      Key: marshall({ id }),
      UpdateExpression: 'SET #st = :f, updatedAt = :u',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: marshall({ ':f': 'finished', ':u': new Date(now).toISOString() }),
    })),
  ));
};
