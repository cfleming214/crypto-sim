import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { randomUUID } from 'crypto';
import Stripe from 'stripe';
import { sendEmail, emailShell } from '../lib/sendEmail';

const ddb = new DynamoDBClient({});
// MOCK MODE when no Stripe key is configured: onboarding instantly "enables"
// payouts and claims are marked paid with a synthetic transfer id — no Stripe
// API calls. Set STRIPE_SECRET_KEY (see resource.ts) to switch to the real path.
const MOCK = !process.env.STRIPE_SECRET_KEY;
const stripe = MOCK ? null : new Stripe(process.env.STRIPE_SECRET_KEY!);

// Stripe-hosted Connect onboarding (Account Links) sends the user back here when
// they finish; the app's WebView watches for this URL to close. Hosted
// onboarding (vs. embedded components) needs NO domain allow-listed in Stripe.
const RETURN_BASE = process.env.PAYOUT_RETURN_BASE ?? 'https://cfleming214.github.io/crypto-sim';

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
const withdrawalTable = () => {
  const t = process.env.WITHDRAWAL_REQUEST_TABLE_NAME;
  if (!t) throw new Error('WITHDRAWAL_REQUEST_TABLE_NAME not set');
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
    return { mock: true, accountId, payoutsEnabled: true, status: 'enabled', url: null };
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

  // Hosted onboarding: Stripe serves the onboarding page; the client opens this
  // URL in a WebView and closes when Stripe redirects to return_url. Account
  // Links are single-use and short-lived, so we mint a fresh one per call.
  const link = await stripe!.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    refresh_url: `${RETURN_BASE}/payouts-return.html?status=refresh`,
    return_url: `${RETURN_BASE}/payouts-return.html?status=complete`,
  });

  return { url: link.url, accountId };
}

async function refreshPayoutStatus(userId: string) {
  const row = await getStripeAccountRow(userId);
  // Balance can exist before onboarding (claimed prizes), so surface it even when
  // there's no Stripe account yet.
  const balanceCents = Number(row?.balanceCents ?? 0);
  const preferredMethodId = row?.preferredMethodId ?? null;
  const preferredMethodLabel = row?.preferredMethodLabel ?? null;
  if (!row?.stripeAccountId) {
    return { payoutsEnabled: false, status: 'onboarding', balanceCents, preferredMethodId, preferredMethodLabel };
  }
  if (MOCK) {
    // No Stripe to query — echo the row the mock onboarding wrote.
    return {
      payoutsEnabled: !!row.payoutsEnabled,
      detailsSubmitted: !!row.detailsSubmitted,
      status: row.status ?? 'enabled',
      balanceCents, preferredMethodId, preferredMethodLabel,
    };
  }
  const acct = await stripe!.accounts.retrieve(row.stripeAccountId);
  const derived = deriveStatus(acct);
  await upsertStripeAccountRow(userId, derived);
  return { ...derived, balanceCents, preferredMethodId, preferredMethodLabel };
}

// Read / atomically adjust the withdrawable balance on the sub-keyed
// StripeAccount row. ADD on a missing numeric attribute starts from 0, and the
// SET clause materializes a fresh row (owner/typename/createdAt) the first time
// a not-yet-onboarded winner claims a prize.
async function readBalance(userId: string): Promise<number> {
  const row = await getStripeAccountRow(userId);
  return Number(row?.balanceCents ?? 0);
}
async function adjustBalance(userId: string, deltaCents: number): Promise<number> {
  const now = new Date().toISOString();
  const { Attributes } = await ddb.send(new UpdateItemCommand({
    TableName: accountTable(),
    Key: marshall({ id: userId }),
    UpdateExpression: 'SET updatedAt = :now, createdAt = if_not_exists(createdAt, :now), #tn = if_not_exists(#tn, :tn), #ow = if_not_exists(#ow, :ow) ADD balanceCents :d',
    ExpressionAttributeNames: { '#tn': '__typename', '#ow': 'owner' },
    ExpressionAttributeValues: marshall({ ':now': now, ':tn': 'StripeAccount', ':ow': userId, ':d': deltaCents }),
    ReturnValues: 'UPDATED_NEW',
  }));
  const updated = Attributes ? unmarshall(Attributes) : {};
  return Number(updated.balanceCents ?? 0);
}

// Credit a won prize to the user's withdrawable balance. The Payout's `claimed`
// flag is the double-credit guard: the conditional UpdateItem only succeeds the
// first time, so re-claiming is a no-op (no extra balance).
async function claimPrize(userId: string, payoutId: string) {
  const { Item } = await ddb.send(new GetItemCommand({
    TableName: payoutTable(),
    Key: marshall({ id: payoutId }),
  }));
  if (!Item) return { ok: false, error: 'Prize not found' };
  const p = unmarshall(Item) as { userId: string; amountCents: number; claimed?: boolean };
  if (p.userId !== userId) return { ok: false, error: 'Not your prize' };

  const now = new Date().toISOString();
  try {
    await ddb.send(new UpdateItemCommand({
      TableName: payoutTable(),
      Key: marshall({ id: payoutId }),
      UpdateExpression: 'SET claimed = :t, #s = :claimed, claimedAt = :now, updatedAt = :now',
      ConditionExpression: 'attribute_not_exists(claimed) OR claimed = :f',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: marshall({ ':t': true, ':f': false, ':claimed': 'claimed', ':now': now }),
    }));
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') {
      return { ok: true, alreadyClaimed: true, balanceCents: await readBalance(userId) };
    }
    throw err;
  }

  const balanceCents = await adjustBalance(userId, p.amountCents);
  return { ok: true, amountCents: p.amountCents, balanceCents };
}

// Open a pending withdrawal of the user's FULL available balance. Only allowed
// once the user is Stripe-onboarded (they can win + claim without it, but not
// withdraw). Gathers every claimed, un-withdrawn, un-reserved Payout, reserves
// each to the new request (race-safe conditional), and decrements the balance.
async function requestWithdrawal(userId: string, email?: string) {
  const acct = await getStripeAccountRow(userId);
  if (!acct?.stripeAccountId || !acct.payoutsEnabled) {
    return { ok: false, error: 'Verify your payout details with Stripe first', needsOnboarding: true };
  }

  const { Items = [] } = await ddb.send(new ScanCommand({
    TableName: payoutTable(),
    FilterExpression: 'userId = :u AND claimed = :t AND (attribute_not_exists(withdrawn) OR withdrawn = :f) AND attribute_not_exists(withdrawalRequestId)',
    ExpressionAttributeValues: marshall({ ':u': userId, ':t': true, ':f': false }),
  }));
  const candidates = Items.map(i => unmarshall(i) as { id: string; amountCents: number; owner?: string });
  if (candidates.length === 0) return { ok: false, error: 'No balance to withdraw' };

  const reqId = randomUUID();
  const now = new Date().toISOString();

  // Reserve each payout to this request. The conditional makes a concurrent
  // second request skip already-reserved rows instead of double-spending.
  const reserved: { id: string; amountCents: number }[] = [];
  let ownerStr: string | undefined;
  for (const p of candidates) {
    try {
      await ddb.send(new UpdateItemCommand({
        TableName: payoutTable(),
        Key: marshall({ id: p.id }),
        UpdateExpression: 'SET withdrawalRequestId = :r, updatedAt = :now',
        ConditionExpression: 'attribute_not_exists(withdrawalRequestId) AND claimed = :t AND (attribute_not_exists(withdrawn) OR withdrawn = :f)',
        ExpressionAttributeValues: marshall({ ':r': reqId, ':now': now, ':t': true, ':f': false }),
      }));
      reserved.push({ id: p.id, amountCents: p.amountCents });
      if (!ownerStr && p.owner) ownerStr = p.owner; // copy the known-good owner format for client reads
    } catch (err: any) {
      if (err?.name === 'ConditionalCheckFailedException') continue; // raced — leave for the other request
      throw err;
    }
  }
  if (reserved.length === 0) return { ok: false, error: 'No balance to withdraw' };

  const amountCents = reserved.reduce((s, p) => s + p.amountCents, 0);

  await ddb.send(new PutItemCommand({
    TableName: withdrawalTable(),
    Item: marshall({
      id: reqId,
      __typename: 'WithdrawalRequest',
      owner: ownerStr ?? userId,
      userId,
      email: email ?? null,
      amountCents,
      status: 'pending',
      method: acct.preferredMethodId ?? null,
      methodLabel: acct.preferredMethodLabel ?? null,
      payoutsJson: JSON.stringify(reserved.map(p => p.id)),
      createdAt: now,
      updatedAt: now,
    }, { removeUndefinedValues: true }),
  }));

  const balanceCents = await adjustBalance(userId, -amountCents);

  // Confirmation email — best-effort, never blocks the withdrawal.
  const dollars = (amountCents / 100).toFixed(2);
  const methodLine = acct.preferredMethodLabel ? ` to ${acct.preferredMethodLabel}` : '';
  await sendEmail({
    to: email,
    subject: `Withdrawal requested — $${dollars}`,
    html: emailShell('Withdrawal requested', `We've received your request to withdraw <b>$${dollars}</b>${methodLine}. It'll be reviewed and paid out on our next daily payout run — you'll get another email once it's sent.`),
    text: `We've received your request to withdraw $${dollars}${methodLine}. It'll be paid out on our next daily payout run; you'll get another email once it's sent.`,
  });

  return { ok: true, requestId: reqId, amountCents, balanceCents };
}

// Describe a Stripe external account (bank/card) for the method picker.
function describeExternal(e: any): { id: string; type: string; label: string; last4: string; currency: string; isDefault: boolean } {
  const last4 = e.last4 ?? '????';
  const label = e.object === 'bank_account'
    ? `${e.bank_name ?? 'Bank'} ••••${last4}`
    : `${(e.brand ?? 'Card')} ••••${last4}`;
  return { id: e.id, type: e.object, label, last4, currency: e.currency ?? 'usd', isDefault: !!e.default_for_currency };
}

async function listPayoutMethods(userId: string) {
  const acct = await getStripeAccountRow(userId);
  if (MOCK) {
    const methods = [{ id: 'ba_mock_6789', type: 'bank_account', label: 'Bank ••••6789', last4: '6789', currency: 'usd', isDefault: true }];
    return { methods, preferredMethodId: acct?.preferredMethodId ?? 'ba_mock_6789' };
  }
  if (!acct?.stripeAccountId) return { methods: [] };
  const ext = await stripe!.accounts.listExternalAccounts(acct.stripeAccountId, { limit: 10 });
  const methods = (ext.data ?? []).map(describeExternal);
  return { methods, preferredMethodId: acct.preferredMethodId ?? methods.find(m => m.isDefault)?.id ?? null };
}

async function setPayoutMethod(userId: string, externalAccountId: string) {
  const acct = await getStripeAccountRow(userId);
  let label = 'Bank ••••6789';
  if (!MOCK) {
    if (!acct?.stripeAccountId) return { ok: false, error: 'No connected account' };
    const updated: any = await stripe!.accounts.updateExternalAccount(acct.stripeAccountId, externalAccountId, { default_for_currency: true });
    label = describeExternal(updated).label;
  }
  await upsertStripeAccountRow(userId, { preferredMethodId: externalAccountId, preferredMethodLabel: label });
  return { ok: true, preferredMethodId: externalAccountId, preferredMethodLabel: label };
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
      case 'claimPrize':
        return await claimPrize(userId, String(event.arguments?.payoutId));
      case 'requestWithdrawal':
        return await requestWithdrawal(userId, email);
      case 'listPayoutMethods':
        return await listPayoutMethods(userId);
      case 'setPayoutMethod':
        return await setPayoutMethod(userId, String(event.arguments?.externalAccountId));
      default:
        throw new Error(`Unknown field: ${field}`);
    }
  } catch (err) {
    console.error('stripe-connect error', field, err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};
