import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import Stripe from 'stripe';

const ddb = new DynamoDBClient({});
// MOCK MODE when no Stripe key is configured: onboarding instantly "enables"
// payouts and claims are marked paid with a synthetic transfer id — no Stripe
// API calls. Set STRIPE_SECRET_KEY (see resource.ts) to switch to the real path.
const MOCK = !process.env.STRIPE_SECRET_KEY;
const stripe = MOCK ? null : new Stripe(process.env.STRIPE_SECRET_KEY!);

// AppSync resolver event shape for an Amplify custom mutation backed by a
// function handler. identity is the authenticated Cognito user; fieldName tells
// us which of the three mutations was called.
interface ResolverEvent {
  arguments?: Record<string, any>;
  identity?: { sub?: string; username?: string; claims?: Record<string, any> };
  info?: { fieldName?: string };
  fieldName?: string;
}

const accountTable = () => {
  const t = process.env.STRIPE_ACCOUNT_TABLE_NAME;
  if (!t) throw new Error('STRIPE_ACCOUNT_TABLE_NAME not set');
  return t;
};
const payoutTable = () => {
  const t = process.env.PAYOUT_TABLE_NAME;
  if (!t) throw new Error('PAYOUT_TABLE_NAME not set');
  return t;
};

async function getStripeAccountRow(userId: string): Promise<any | null> {
  const { Item } = await ddb.send(new GetItemCommand({
    TableName: accountTable(),
    Key: marshall({ id: userId }),
  }));
  return Item ? unmarshall(Item) : null;
}

// Map a Stripe account's capability state onto our coarse status string.
function deriveStatus(acct: Stripe.Account): { payoutsEnabled: boolean; detailsSubmitted: boolean; status: string } {
  const payoutsEnabled = acct.capabilities?.transfers === 'active' && !!acct.payouts_enabled;
  const detailsSubmitted = !!acct.details_submitted;
  const status = payoutsEnabled ? 'enabled' : detailsSubmitted ? 'restricted' : 'onboarding';
  return { payoutsEnabled, detailsSubmitted, status };
}

async function upsertStripeAccountRow(userId: string, fields: Record<string, any>) {
  const now = new Date().toISOString();
  const exprNames: Record<string, string> = {};
  const exprValues: Record<string, any> = { ':u': now };
  const sets: string[] = ['updatedAt = :u'];
  for (const [k, v] of Object.entries(fields)) {
    exprNames[`#${k}`] = k;
    exprValues[`:${k}`] = v;
    sets.push(`#${k} = :${k}`);
  }
  await ddb.send(new UpdateItemCommand({
    TableName: accountTable(),
    Key: marshall({ id: userId }),
    UpdateExpression: `SET ${sets.join(', ')}, createdAt = if_not_exists(createdAt, :u), #__typename = if_not_exists(#__typename, :tn), #owner = if_not_exists(#owner, :ownr)`,
    ExpressionAttributeNames: { ...exprNames, '#__typename': '__typename', '#owner': 'owner' },
    ExpressionAttributeValues: marshall({ ...exprValues, ':tn': 'StripeAccount', ':ownr': userId }, { removeUndefinedValues: true }),
  }));
}

async function startPayoutOnboarding(userId: string, email?: string) {
  if (MOCK) {
    // Simulate a fully-onboarded Connect account so the client flips straight to
    // "Payouts active" without rendering the embedded onboarding WebView.
    const accountId = `mock_acct_${userId}`;
    await upsertStripeAccountRow(userId, {
      stripeAccountId: accountId,
      payoutsEnabled: true,
      detailsSubmitted: true,
      status: 'enabled',
    });
    return { mock: true, accountId, payoutsEnabled: true, status: 'enabled', clientSecret: null };
  }

  let row = await getStripeAccountRow(userId);
  let accountId: string | undefined = row?.stripeAccountId;

  if (!accountId) {
    const account = await stripe!.accounts.create({
      type: 'express',
      email,
      capabilities: { transfers: { requested: true } },
      business_type: 'individual',
      metadata: { userId },
    });
    accountId = account.id;
    await upsertStripeAccountRow(userId, {
      stripeAccountId: accountId,
      payoutsEnabled: false,
      detailsSubmitted: false,
      status: 'onboarding',
    });
  }

  // Embedded onboarding: the client renders Stripe's account-onboarding
  // component with this session's client_secret.
  const session = await stripe!.accountSessions.create({
    account: accountId,
    components: { account_onboarding: { enabled: true } },
  });

  return { clientSecret: session.client_secret, accountId };
}

async function refreshPayoutStatus(userId: string) {
  const row = await getStripeAccountRow(userId);
  if (!row?.stripeAccountId) return { payoutsEnabled: false, status: 'onboarding' };
  if (MOCK) {
    // No Stripe to query — echo the row the mock onboarding wrote.
    return {
      payoutsEnabled: !!row.payoutsEnabled,
      detailsSubmitted: !!row.detailsSubmitted,
      status: row.status ?? 'enabled',
    };
  }
  const acct = await stripe!.accounts.retrieve(row.stripeAccountId);
  const derived = deriveStatus(acct);
  await upsertStripeAccountRow(userId, derived);
  return derived;
}

async function claimPayout(userId: string, payoutId: string) {
  const { Item } = await ddb.send(new GetItemCommand({
    TableName: payoutTable(),
    Key: marshall({ id: payoutId }),
  }));
  if (!Item) return { ok: false, error: 'Payout not found' };
  const payout = unmarshall(Item) as { userId: string; status: string; amountCents: number };

  if (payout.userId !== userId) return { ok: false, error: 'Not your payout' };
  if (payout.status === 'paid') return { ok: true, alreadyPaid: true };
  if (payout.status !== 'pending' && payout.status !== 'failed') {
    return { ok: false, error: `Payout is ${payout.status}` };
  }

  const row = await getStripeAccountRow(userId);
  if (!row?.stripeAccountId || !row.payoutsEnabled) {
    return { ok: false, error: 'Payouts not set up', needsOnboarding: true };
  }

  const transfer = MOCK
    ? { id: `mock_tr_${payoutId}` }
    : await stripe!.transfers.create({
        amount: payout.amountCents,
        currency: 'usd',
        destination: row.stripeAccountId,
        metadata: { payoutId, userId },
      });

  await ddb.send(new UpdateItemCommand({
    TableName: payoutTable(),
    Key: marshall({ id: payoutId }),
    UpdateExpression: 'SET #s = :paid, stripeTransferId = :tid, paidAt = :now',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: marshall({ ':paid': 'paid', ':tid': transfer.id, ':now': new Date().toISOString() }),
  }));

  return { ok: true, transferId: transfer.id };
}

export const handler = async (event: ResolverEvent): Promise<any> => {
  const userId = event.identity?.sub;
  if (!userId) throw new Error('Unauthenticated');
  const field = event.info?.fieldName ?? event.fieldName;
  const email = event.identity?.claims?.email as string | undefined;

  try {
    switch (field) {
      case 'startPayoutOnboarding':
        return await startPayoutOnboarding(userId, email);
      case 'refreshPayoutStatus':
        return await refreshPayoutStatus(userId);
      case 'claimPayout':
        return await claimPayout(userId, String(event.arguments?.payoutId));
      default:
        throw new Error(`Unknown field: ${field}`);
    }
  } catch (err) {
    console.error('stripe-connect error', field, err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};
