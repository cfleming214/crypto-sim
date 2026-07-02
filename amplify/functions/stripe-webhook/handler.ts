import {
  DynamoDBClient,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import Stripe from 'stripe';

const ddb = new DynamoDBClient({});
// MOCK MODE: no key wired (see resource.ts) → null. The handler returns 400 to
// any caller below before touching `stripe`, so it never NPEs; it just isn't
// exercised until real Stripe secrets are configured.
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// Lambda Function URL event (API Gateway v2 payload format).
interface FunctionUrlEvent {
  body?: string;
  isBase64Encoded?: boolean;
  headers?: Record<string, string>;
}

function deriveStatus(acct: Stripe.Account) {
  const payoutsEnabled = acct.capabilities?.transfers === 'active' && !!acct.payouts_enabled;
  const detailsSubmitted = !!acct.details_submitted;
  const status = payoutsEnabled ? 'enabled' : detailsSubmitted ? 'restricted' : 'onboarding';
  return { payoutsEnabled, detailsSubmitted, status };
}

// StripeAccount rows are keyed by userId, not the Stripe account id, so we
// locate the row by the account's metadata.userId (set at creation) and fall
// back to a scan by stripeAccountId.
async function syncAccount(acct: Stripe.Account) {
  const userId = (acct.metadata?.userId as string | undefined);
  const table = process.env.STRIPE_ACCOUNT_TABLE_NAME!;
  const derived = deriveStatus(acct);

  // The row id IS the userId, which we set as metadata.userId at account creation
  // (see stripe-connect). The Function URL is public, so we do NOT fall back to a
  // full-table Scan on a missing/spoofed userId (DoS-by-cost) — just no-op. If a
  // real event ever lacks it, add a stripeAccountId GSI + Query (see future-fixes.md).
  if (!userId) {
    console.warn('account.updated: no metadata.userId for', acct.id, '— skipping');
    return;
  }
  const id = userId;

  await ddb.send(new UpdateItemCommand({
    TableName: table,
    Key: marshall({ id }),
    UpdateExpression: 'SET payoutsEnabled = :p, detailsSubmitted = :d, #s = :st, updatedAt = :u',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: marshall({
      ':p': derived.payoutsEnabled,
      ':d': derived.detailsSubmitted,
      ':st': derived.status,
      ':u': new Date().toISOString(),
    }),
  }));
}

// Reconcile a Payout row's status from a transfer event. We tagged the transfer
// with metadata.payoutId when creating it.
async function syncTransfer(transfer: Stripe.Transfer, failed: boolean) {
  const payoutId = transfer.metadata?.payoutId;
  if (!payoutId) return;
  await ddb.send(new UpdateItemCommand({
    TableName: process.env.PAYOUT_TABLE_NAME!,
    Key: marshall({ id: payoutId }),
    UpdateExpression: 'SET #s = :st, updatedAt = :u',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: marshall({ ':st': failed ? 'failed' : 'paid', ':u': new Date().toISOString() }),
  }));
}

export const handler = async (event: FunctionUrlEvent) => {
  const sig = event.headers?.['stripe-signature'] ?? event.headers?.['Stripe-Signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret || !stripe) return { statusCode: 400, body: 'Missing signature' };

  const raw = event.isBase64Encoded && event.body
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : (event.body ?? '');

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    console.error('Webhook signature verification failed', err);
    return { statusCode: 400, body: 'Invalid signature' };
  }

  try {
    switch (stripeEvent.type) {
      case 'account.updated':
        await syncAccount(stripeEvent.data.object as Stripe.Account);
        break;
      case 'transfer.created':
        await syncTransfer(stripeEvent.data.object as Stripe.Transfer, false);
        break;
      case 'transfer.reversed':
        await syncTransfer(stripeEvent.data.object as Stripe.Transfer, true);
        break;
      default:
        break; // ignore unhandled event types
    }
  } catch (err) {
    console.error('Webhook handler error', stripeEvent.type, err);
    return { statusCode: 500, body: 'Handler error' };
  }

  return { statusCode: 200, body: 'ok' };
};
