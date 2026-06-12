import {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import {
  getAllActiveTokens,
  getActiveTokensForUsers,
  sendExpoPush,
  type PushMessage,
} from '../lib/expoPush';

const ddb = new DynamoDBClient({});

const subFromOwner = (owner: string | undefined): string => (owner ? owner.split('::')[0] : '');

// Audience selector saved on the campaign as criteriaJson. Composable by a single
// `type`; the dashboard form maps onto this.
//   { type: 'everyone' }
//   { type: 'league',  league: 'Gold', division?: 1 }
//   { type: 'xp',      minXp?: 1000, maxXp?: 50000 }
//   { type: 'contest', competitionId: '...' }
interface Criteria {
  type: 'everyone' | 'league' | 'xp' | 'contest';
  league?: string;
  division?: number;
  minXp?: number;
  maxXp?: number;
  competitionId?: string;
}

export const handler = async (): Promise<void> => {
  const campaignTable = process.env.NOTIFICATION_CAMPAIGN_TABLE_NAME;
  const pushTable     = process.env.PUSH_TOKEN_TABLE_NAME;
  const profileTable  = process.env.USER_PROFILE_TABLE_NAME;
  const entryTable    = process.env.COMPETITION_ENTRY_TABLE_NAME;
  if (!campaignTable || !pushTable) throw new Error('notification-dispatcher env vars not set');

  const nowIso = new Date().toISOString();

  // 1. Find due, scheduled campaigns.
  const due: any[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const out = await ddb.send(new ScanCommand({
      TableName: campaignTable,
      FilterExpression: '#s = :scheduled AND scheduledAt <= :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: marshall({ ':scheduled': 'scheduled', ':now': nowIso }),
      ExclusiveStartKey: lastKey,
    }));
    for (const it of out.Items ?? []) due.push(unmarshall(it));
    lastKey = out.LastEvaluatedKey;
  } while (lastKey);

  for (const c of due) {
    // 2. Claim it (scheduled → sending) so two overlapping runs can't double-send.
    if (!(await claim(campaignTable, c.id))) continue;

    let criteria: Criteria;
    try { criteria = JSON.parse(c.criteriaJson || '{}'); } catch { criteria = { type: 'everyone' }; }

    // 3. Resolve audience → tokens. On a transient failure, revert the claim
    // (sending → scheduled) so the next run retries instead of finalizing the
    // campaign as sent-to-nobody (which would permanently lose it).
    let tokens: string[];
    try {
      tokens = await resolveTokens(criteria, { pushTable, profileTable, entryTable });
    } catch (err) {
      console.error('audience resolution failed for campaign', c.id, err);
      await revertClaim(campaignTable, c.id);
      continue;
    }

    // 4. Build + send messages.
    let data: Record<string, unknown> = { type: 'announcement' };
    try { if (c.dataJson) data = JSON.parse(c.dataJson); } catch { /* keep default */ }
    const messages: PushMessage[] = tokens.map(to => ({ to, title: c.title, body: c.body, data }));
    const result = messages.length
      ? await sendExpoPush(pushTable, messages)
      : { sent: 0, delivered: 0, failed: 0 };

    // 5. Write back stats + mark sent.
    await ddb.send(new UpdateItemCommand({
      TableName: campaignTable,
      Key: marshall({ id: c.id }),
      UpdateExpression: 'SET #s = :sent, audienceSize = :a, sentCount = :sc, deliveredCount = :dc, failedCount = :fc, sentAt = :now, updatedAt = :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: marshall({
        ':sent': 'sent', ':a': tokens.length,
        ':sc': result.sent, ':dc': result.delivered, ':fc': result.failed, ':now': nowIso,
      }),
    }));
  }
};

async function resolveTokens(
  criteria: Criteria,
  tables: { pushTable: string; profileTable?: string; entryTable?: string },
): Promise<string[]> {
  if (criteria.type === 'everyone') {
    return getAllActiveTokens(tables.pushTable);
  }

  const subs = new Set<string>();
  if (criteria.type === 'contest') {
    if (!tables.entryTable || !criteria.competitionId) return [];
    for await (const row of scanAll(tables.entryTable)) {
      const e = unmarshall(row) as { owner?: string; competitionId?: string };
      if (e.competitionId === criteria.competitionId) {
        const sub = subFromOwner(e.owner);
        if (sub) subs.add(sub);
      }
    }
  } else {
    // league / xp → scan profiles
    if (!tables.profileTable) return [];
    for await (const row of scanAll(tables.profileTable)) {
      const p = unmarshall(row) as { owner?: string; league?: string; division?: number; xp?: number; leaderboardVisible?: boolean };
      const sub = subFromOwner(p.owner);
      if (!sub) continue;
      if (criteria.type === 'league') {
        if (criteria.league && p.league !== criteria.league) continue;
        if (typeof criteria.division === 'number' && p.division !== criteria.division) continue;
      } else if (criteria.type === 'xp') {
        const xp = p.xp ?? 0;
        if (typeof criteria.minXp === 'number' && xp < criteria.minXp) continue;
        if (typeof criteria.maxXp === 'number' && xp > criteria.maxXp) continue;
      }
      subs.add(sub);
    }
  }
  return getActiveTokensForUsers(tables.pushTable, subs);
}

async function claim(table: string, id: string): Promise<boolean> {
  try {
    await ddb.send(new UpdateItemCommand({
      TableName: table,
      Key: marshall({ id }),
      UpdateExpression: 'SET #s = :sending, updatedAt = :now',
      ConditionExpression: '#s = :scheduled',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: marshall({ ':sending': 'sending', ':scheduled': 'scheduled', ':now': new Date().toISOString() }),
    }));
    return true;
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return false;
    console.error('campaign claim failed', id, err);
    return false;
  }
}

// Revert a claimed-but-unsent campaign back to scheduled so a later run retries.
async function revertClaim(table: string, id: string): Promise<void> {
  try {
    await ddb.send(new UpdateItemCommand({
      TableName: table,
      Key: marshall({ id }),
      UpdateExpression: 'SET #s = :scheduled, updatedAt = :now',
      ConditionExpression: '#s = :sending',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: marshall({ ':scheduled': 'scheduled', ':sending': 'sending', ':now': new Date().toISOString() }),
    }));
  } catch (err) {
    console.error('campaign revert failed', id, err);
  }
}

async function* scanAll(table: string) {
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const out = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey }));
    for (const item of out.Items ?? []) yield item;
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}
