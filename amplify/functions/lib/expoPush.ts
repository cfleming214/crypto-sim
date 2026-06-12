// Shared Expo Push delivery helper for the notification-sending Lambdas
// (close-competition, tick-global-leaderboard, price-watch, notification-
// dispatcher). Lambdas can't use the owner-auth Amplify Data client, so this
// reads the PushDevice table with the DynamoDB SDK directly.
//
// Delivery is the managed Expo Push Service: we POST ExpoPushTokens to
// exp.host and Expo relays to APNs/FCM using credentials uploaded to EAS — no
// APNs/FCM protocol code here. Node 18+ Lambda has a global `fetch`.
//
// The PushDevice table's partition key is the token string itself
// (model identifier(['token'])), so deactivating a dead token is a single
// keyed UpdateItem.
import {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});
const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_CHUNK = 100; // Expo caps a single request at 100 messages.

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface SendResult {
  sent: number;       // messages handed to Expo
  delivered: number;  // tickets returned with status 'ok'
  failed: number;     // tickets returned with status 'error'
}

// Scan the PushDevice table for every active token belonging to a Cognito sub.
// The table is small (one row per device) so a filtered Scan is fine; a GSI on
// userId is a later optimization if it ever grows.
export async function getActiveTokensForUser(table: string, userId: string): Promise<string[]> {
  return scanTokens(table, 'userId = :u AND active = :a', { ':u': userId, ':a': true });
}

// Every active token across all users (audience = "everyone"), de-duplicated.
export async function getAllActiveTokens(table: string): Promise<string[]> {
  return scanTokens(table, 'active = :a', { ':a': true });
}

// Active tokens for a set of Cognito subs. Done with one full active-scan and an
// in-memory filter so a 200-user campaign isn't 200 scans.
export async function getActiveTokensForUsers(table: string, userIds: Set<string>): Promise<string[]> {
  if (userIds.size === 0) return [];
  const out: string[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: table,
      FilterExpression: 'active = :a',
      ExpressionAttributeValues: marshall({ ':a': true }),
      ExclusiveStartKey: lastKey as any,
    }));
    for (const it of res.Items ?? []) {
      const row = unmarshall(it) as { token?: string; userId?: string };
      if (row.token && row.userId && userIds.has(row.userId)) out.push(row.token);
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return Array.from(new Set(out));
}

async function scanTokens(
  table: string,
  filter: string,
  values: Record<string, unknown>,
): Promise<string[]> {
  const out: string[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: table,
      FilterExpression: filter,
      ExpressionAttributeValues: marshall(values),
      ExclusiveStartKey: lastKey as any,
    }));
    for (const it of res.Items ?? []) {
      const row = unmarshall(it) as { token?: string };
      if (row.token) out.push(row.token);
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return Array.from(new Set(out));
}

// Send a batch of messages through Expo, chunked at 100. Tokens that Expo
// reports as DeviceNotRegistered are flipped to active:false so we stop paying
// to push to dead installs. Returns aggregate counts for stat tracking.
export async function sendExpoPush(table: string, messages: PushMessage[]): Promise<SendResult> {
  const result: SendResult = { sent: 0, delivered: 0, failed: 0 };
  for (let i = 0; i < messages.length; i += EXPO_CHUNK) {
    const chunk = messages.slice(i, i + EXPO_CHUNK);
    result.sent += chunk.length;
    try {
      const res = await fetch(EXPO_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
      const json: any = await res.json().catch(() => null);
      const tickets: any[] = json?.data ?? [];
      // Expo returns tickets in request order; only trust index→token alignment
      // for DeviceNotRegistered cleanup when the counts match, so we never
      // deactivate the wrong token off a partial/misaligned response.
      const aligned = tickets.length === chunk.length;
      await Promise.all(tickets.map((ticket, idx) => {
        if (ticket?.status === 'ok') { result.delivered += 1; return Promise.resolve(); }
        result.failed += 1;
        if (aligned && ticket?.details?.error === 'DeviceNotRegistered') {
          return deactivateToken(table, chunk[idx].to);
        }
        return Promise.resolve();
      }));
      // If Expo returned fewer tickets than messages (e.g. a transport error),
      // count the remainder as failed so stats stay honest.
      if (tickets.length < chunk.length) result.failed += chunk.length - tickets.length;
    } catch (err) {
      console.error('Expo push chunk failed', err);
      result.failed += chunk.length;
    }
  }
  return result;
}

// Convenience: look up a single user's tokens and push the same message to all
// their devices. Returns the aggregate counts (0/0/0 if no devices).
export async function pushToUser(table: string, userId: string, msg: Omit<PushMessage, 'to'>): Promise<SendResult> {
  const tokens = await getActiveTokensForUser(table, userId);
  if (!tokens.length) return { sent: 0, delivered: 0, failed: 0 };
  return sendExpoPush(table, tokens.map(to => ({ to, ...msg })));
}

async function deactivateToken(table: string, token: string): Promise<void> {
  try {
    await ddb.send(new UpdateItemCommand({
      TableName: table,
      Key: marshall({ token }),
      UpdateExpression: 'SET active = :f, updatedAt = :now',
      ExpressionAttributeValues: marshall({ ':f': false, ':now': new Date().toISOString() }),
    }));
  } catch (err) {
    console.error('Failed to deactivate dead token', err);
  }
}
