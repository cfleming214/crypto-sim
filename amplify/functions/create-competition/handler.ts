import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { randomUUID } from 'crypto';
import { assertPrizePoolWithinCap, hasCashPrize } from '../lib/contestCompliance';

const ddb = new DynamoDBClient({});

interface CreateInput {
  name: string;
  type: 'daily' | 'featured' | 'replay' | '1v1';
  prizePool?: string;
  maxPlayers?: number;
  stake?: string;
  startAt: string; // ISO
  endAt: string;   // ISO
  prizeXp?: number;          // XP awarded to the winner (default 5000)
  numberOfPrizes?: number;   // paid positions (for the cash path)
  prizesJson?: string;       // JSON dollar amounts (for the cash path)
  lockAfterStart?: boolean;  // true => no new entries once the contest starts
}

// Admin utility — create a competition record.
// Invoke via Lambda console, CLI, or AppSync mutation with adminGroups auth.
export const handler = async (event: CreateInput): Promise<{ id: string }> => {
  const compTable = process.env.COMPETITION_TABLE_NAME;
  if (!compTable) throw new Error('COMPETITION_TABLE_NAME not set');

  // Compliance: keep every cash contest's total prize pool under the NY/FL
  // sweepstakes registration threshold (<$5k), and mark cashPrize so the app's
  // Lane-A/Lane-B split (free entry, no ad/pass gating) keys off it correctly.
  assertPrizePoolWithinCap(event.prizesJson);
  const cashPrize = hasCashPrize(event.prizesJson);

  const id = randomUUID();
  const now = new Date().toISOString();
  const status = new Date(event.startAt) <= new Date() ? 'live' : 'open';

  await ddb.send(new PutItemCommand({
    TableName: compTable,
    Item: marshall({
      id,
      name: event.name,
      type: event.type,
      status,
      prizePool: event.prizePool ?? '',
      maxPlayers: event.maxPlayers ?? 1000,
      stake: event.stake ?? 'Free',
      startAt: event.startAt,
      endAt: event.endAt,
      entryCount: 0,
      prizeXp: event.prizeXp ?? 5000,
      numberOfPrizes: event.numberOfPrizes ?? 0,
      prizesJson: event.prizesJson ?? '[]',
      cashPrize,
      lockAfterStart: event.lockAfterStart ?? false,
      createdAt: now,
      updatedAt: now,
    }),
  }));

  return { id };
};
