import {
  DynamoDBClient,
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import Stripe from 'stripe';

const ddb = new DynamoDBClient({});
// MOCK MODE when no Stripe key is configured (see resource.ts): winners who are
// "onboarded" (mock onboarding sets payoutsEnabled) are settled as paid with a
// synthetic transfer id — no Stripe API call. Set STRIPE_SECRET_KEY to go live.
const MOCK = !process.env.STRIPE_SECRET_KEY;
const stripe = MOCK ? null : new Stripe(process.env.STRIPE_SECRET_KEY!);

// Amplify owner fields can be stored as "<sub>::<username>" or just "<sub>".
// StripeAccount rows are keyed by the bare sub, so normalize before lookups.
const subFromOwner = (owner: string | undefined): string =>
  owner ? owner.split('::')[0] : '';

// Create the Payout row for one winning entry, then attempt an immediate
// Transfer if they've already onboarded. Idempotent: the row id is
// "<competitionId>#<userId>" and the PutItem is conditional, so a re-run after
// a partial failure never duplicates a payout or double-pays.
async function settleWinner(
  payoutTable: string,
  accountTable: string,
  comp: { id: string; name?: string },
  entry: { owner?: string; rank?: number },
  amountCents: number,
) {
  const userId = subFromOwner(entry.owner);
  if (!userId) return;

  const payoutId = `${comp.id}#${userId}`;
  const now = new Date().toISOString();

  // Look up onboarding state up front so the row lands in its final state.
  let stripeAccountId: string | undefined;
  let payoutsEnabled = false;
  const { Item: acctItem } = await ddb.send(new GetItemCommand({
    TableName: accountTable,
    Key: marshall({ id: userId }),
  }));
  if (acctItem) {
    const acct = unmarshall(acctItem);
    stripeAccountId = acct.stripeAccountId;
    payoutsEnabled = !!acct.payoutsEnabled;
  }

  // Reserve the payout row first (pending) — conditional so we only settle once.
  try {
    await ddb.send(new PutItemCommand({
      TableName: payoutTable,
      Item: marshall({
        id: payoutId,
        __typename: 'Payout',
        owner: entry.owner,
        userId,
        competitionId: comp.id,
        competitionName: comp.name ?? '',
        rank: entry.rank ?? null,
        amountCents,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      }, { removeUndefinedValues: true }),
      ConditionExpression: 'attribute_not_exists(id)',
    }));
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return; // already settled
    throw err;
  }

  // Auto-pay if they can receive funds; otherwise leave it pending to claim.
  if (stripeAccountId && payoutsEnabled) {
    try {
      const transfer = MOCK
        ? { id: `mock_tr_${payoutId}` }
        : await stripe!.transfers.create({
            amount: amountCents,
            currency: 'usd',
            destination: stripeAccountId,
            metadata: { payoutId, userId },
          }, { idempotencyKey: `payout-${payoutId}` });

      await ddb.send(new UpdateItemCommand({
        TableName: payoutTable,
        Key: marshall({ id: payoutId }),
        UpdateExpression: 'SET #s = :paid, stripeTransferId = :tid, paidAt = :now, updatedAt = :now',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: marshall({ ':paid': 'paid', ':tid': transfer.id, ':now': new Date().toISOString() }),
      }));
    } catch (err) {
      console.error('Auto-transfer failed for', payoutId, err); // stays pending → claimable
    }
  }
}

async function settleCompetition(compTable: string, entryTable: string, comp: any) {
  const payoutTable = process.env.PAYOUT_TABLE_NAME;
  const accountTable = process.env.STRIPE_ACCOUNT_TABLE_NAME;
  if (!payoutTable || !accountTable) throw new Error('Payout/StripeAccount table env vars not set');

  let prizes: number[] = [];
  try { prizes = JSON.parse(comp.prizesJson || '[]'); } catch { prizes = []; }
  const numberOfPrizes = comp.numberOfPrizes ?? prizes.length;
  if (numberOfPrizes <= 0 || prizes.length === 0) return; // free contest, nothing to pay

  const { Items: entryItems = [] } = await ddb.send(new ScanCommand({
    TableName: entryTable,
    FilterExpression: 'competitionId = :cid',
    ExpressionAttributeValues: marshall({ ':cid': comp.id }),
  }));

  for (const raw of entryItems) {
    const entry = unmarshall(raw) as { owner?: string; rank?: number };
    const rank = entry.rank ?? 999;
    if (rank < 1 || rank > numberOfPrizes) continue;
    const dollars = prizes[rank - 1];
    if (!dollars || dollars <= 0) continue;
    await settleWinner(payoutTable, accountTable, comp, entry, Math.round(dollars * 100));
  }
}

// Runs on EventBridge schedule every 10 minutes.
// Closes any 'live' competitions whose endAt has passed, paying out prizes.
export const handler = async (): Promise<void> => {
  const compTable = process.env.COMPETITION_TABLE_NAME;
  const entryTable = process.env.COMPETITION_ENTRY_TABLE_NAME;
  if (!compTable || !entryTable) throw new Error('Table env vars not set');

  const now = new Date().toISOString();

  const { Items = [] } = await ddb.send(new ScanCommand({
    TableName: compTable,
    FilterExpression: '#s = :live AND endAt <= :now',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: marshall({ ':live': 'live', ':now': now }),
  }));

  const finishedTable = process.env.FINISHED_COMPETITION_TABLE_NAME;

  for (const raw of Items) {
    const fullComp = unmarshall(raw);
    const comp = fullComp as { id: string; name?: string; prizesJson?: string; numberOfPrizes?: number };

    // Settle prizes BEFORE archiving, so a crash mid-settle leaves the contest
    // 'live' and the next run re-settles (idempotently) what's missing.
    await settleCompetition(compTable, entryTable, comp);

    // Mark all entries inactive while the contest still exists.
    const { Items: entryItems = [] } = await ddb.send(new ScanCommand({
      TableName: entryTable,
      FilterExpression: 'competitionId = :cid',
      ExpressionAttributeValues: marshall({ ':cid': comp.id }),
    }));
    await Promise.all(entryItems.map(rawEntry => {
      const entry = unmarshall(rawEntry) as { id: string };
      return ddb.send(new UpdateItemCommand({
        TableName: entryTable,
        Key: marshall({ id: entry.id }),
        UpdateExpression: 'SET isActive = :f',
        ExpressionAttributeValues: marshall({ ':f': false }),
      }));
    }));

    // Archive: MOVE the finished contest into FinishedCompetition (copy + delete
    // from Competition) so the live table only ever holds open/live contests and
    // the app reads this table for its "Past" list. If the archive table env var
    // isn't set (pre-deploy), fall back to flipping status in place.
    const nowIso = new Date().toISOString();
    if (finishedTable) {
      await ddb.send(new PutItemCommand({
        TableName: finishedTable,
        Item: marshall({ ...fullComp, __typename: 'FinishedCompetition', status: 'finished', finishedAt: nowIso, updatedAt: nowIso }, { removeUndefinedValues: true }),
      }));
      await ddb.send(new DeleteItemCommand({
        TableName: compTable,
        Key: marshall({ id: comp.id }),
      }));
    } else {
      await ddb.send(new UpdateItemCommand({
        TableName: compTable,
        Key: marshall({ id: comp.id }),
        UpdateExpression: 'SET #s = :finished',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: marshall({ ':finished': 'finished' }),
      }));
    }
  }
};
