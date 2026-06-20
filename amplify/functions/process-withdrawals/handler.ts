import {
  DynamoDBClient,
  GetItemCommand,
  ScanCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import Stripe from 'stripe';
import { sendEmail, emailShell } from '../lib/sendEmail';

const ddb = new DynamoDBClient({});
// MOCK MODE when no Stripe key is configured: transfers get a synthetic id and
// no Stripe API call is made. Set STRIPE_SECRET_KEY to pay real test Transfers.
const MOCK = !process.env.STRIPE_SECRET_KEY;
const stripe = MOCK ? null : new Stripe(process.env.STRIPE_SECRET_KEY!);

const payoutTable = () => {
  const t = process.env.PAYOUT_TABLE_NAME;
  if (!t) throw new Error('PAYOUT_TABLE_NAME not set');
  return t;
};
const accountTable = () => {
  const t = process.env.STRIPE_ACCOUNT_TABLE_NAME;
  if (!t) throw new Error('STRIPE_ACCOUNT_TABLE_NAME not set');
  return t;
};
const withdrawalTable = () => {
  const t = process.env.WITHDRAWAL_REQUEST_TABLE_NAME;
  if (!t) throw new Error('WITHDRAWAL_REQUEST_TABLE_NAME not set');
  return t;
};

interface CheckResult {
  payoutId: string;
  competition: string;
  amountCents: number;
  winner: boolean;       // the request's user is the Payout's userId
  claimed: boolean;      // prize was claimed into balance
  notWithdrawn: boolean; // not already paid out
  reserved: boolean;     // reserved to THIS request
  ok: boolean;           // all of the above
}

async function getPayout(id: string): Promise<any | null> {
  const { Item } = await ddb.send(new GetItemCommand({ TableName: payoutTable(), Key: marshall({ id }) }));
  return Item ? unmarshall(Item) : null;
}

// Restore a failed/rejected request's reservation: un-reserve its payouts and
// credit the amount back to the balance so the user can fix the issue and retry.
async function releaseAndRefund(userId: string, payoutIds: string[], amountCents: number) {
  for (const id of payoutIds) {
    try {
      await ddb.send(new UpdateItemCommand({
        TableName: payoutTable(),
        Key: marshall({ id }),
        UpdateExpression: 'REMOVE withdrawalRequestId SET updatedAt = :now',
        ExpressionAttributeValues: marshall({ ':now': new Date().toISOString() }),
      }));
    } catch (err) {
      console.error('release reservation failed for', id, err);
    }
  }
  if (amountCents > 0) {
    await ddb.send(new UpdateItemCommand({
      TableName: accountTable(),
      Key: marshall({ id: userId }),
      UpdateExpression: 'SET updatedAt = :now ADD balanceCents :d',
      ExpressionAttributeValues: marshall({ ':now': new Date().toISOString(), ':d': amountCents }),
    }));
  }
}

async function finishRequest(reqId: string, fields: Record<string, any>) {
  const now = new Date().toISOString();
  const exprNames: Record<string, string> = {};
  const exprValues: Record<string, any> = { ':now': now };
  const sets: string[] = ['updatedAt = :now', 'processedAt = :now'];
  for (const [k, v] of Object.entries(fields)) {
    exprNames[`#${k}`] = k;
    exprValues[`:${k}`] = v;
    sets.push(`#${k} = :${k}`);
  }
  await ddb.send(new UpdateItemCommand({
    TableName: withdrawalTable(),
    Key: marshall({ id: reqId }),
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: exprNames,
    ExpressionAttributeValues: marshall(exprValues, { removeUndefinedValues: true }),
  }));
}

async function processRequest(req: any) {
  const reqId: string = req.id;
  const userId: string = req.userId;
  const amountCents: number = Number(req.amountCents ?? 0);
  let payoutIds: string[] = [];
  try { payoutIds = JSON.parse(req.payoutsJson || '[]'); } catch { payoutIds = []; }

  // 1. Re-verify every contest prize funding this request.
  const checks: CheckResult[] = [];
  for (const id of payoutIds) {
    const p = await getPayout(id);
    const winner = !!p && p.userId === userId;
    const claimed = !!p && p.claimed === true;
    const notWithdrawn = !!p && p.withdrawn !== true;
    const reserved = !!p && p.withdrawalRequestId === reqId;
    checks.push({
      payoutId: id,
      competition: p?.competitionName ?? p?.competitionId ?? '—',
      amountCents: Number(p?.amountCents ?? 0),
      winner, claimed, notWithdrawn, reserved,
      ok: winner && claimed && notWithdrawn && reserved,
    });
  }
  const verificationJson = JSON.stringify(checks);
  const verifiedSum = checks.filter(c => c.ok).reduce((s, c) => s + c.amountCents, 0);
  const allOk = checks.length > 0 && checks.every(c => c.ok);

  // 2. Verification failure → reject, release the reservation, refund the balance.
  if (!allOk || verifiedSum !== amountCents) {
    await releaseAndRefund(userId, payoutIds, amountCents);
    await finishRequest(reqId, {
      status: 'rejected',
      failureReason: checks.length === 0 ? 'No prizes attached' : `Verification failed (verified $${(verifiedSum / 100).toFixed(2)} of $${(amountCents / 100).toFixed(2)})`,
      verificationJson,
    });
    return;
  }

  // 3. Confirm the user can still receive funds.
  const { Item: acctItem } = await ddb.send(new GetItemCommand({ TableName: accountTable(), Key: marshall({ id: userId }) }));
  const acct = acctItem ? unmarshall(acctItem) : null;
  if (!acct?.stripeAccountId || !acct.payoutsEnabled) {
    await releaseAndRefund(userId, payoutIds, amountCents);
    await finishRequest(reqId, { status: 'failed', failureReason: 'Payout account not enabled', verificationJson });
    return;
  }

  // 4. Transfer. Idempotency key is keyed on the request, so a crashed re-run
  // returns the same transfer instead of paying twice.
  let transferId: string;
  try {
    const transfer = MOCK
      ? { id: `mock_tr_withdrawal_${reqId}` }
      : await stripe!.transfers.create({
          amount: amountCents,
          currency: 'usd',
          destination: acct.stripeAccountId,
          metadata: { withdrawalRequestId: reqId, userId },
        }, { idempotencyKey: `withdrawal-${reqId}` });
    transferId = transfer.id;
  } catch (err) {
    console.error('Withdrawal transfer failed for', reqId, err);
    await releaseAndRefund(userId, payoutIds, amountCents);
    await finishRequest(reqId, { status: 'failed', failureReason: err instanceof Error ? err.message : 'Transfer failed', verificationJson });
    return;
  }

  // 5. Mark every funding prize withdrawn (the paid-out guard), then the request.
  const now = new Date().toISOString();
  for (const id of payoutIds) {
    try {
      await ddb.send(new UpdateItemCommand({
        TableName: payoutTable(),
        Key: marshall({ id }),
        UpdateExpression: 'SET withdrawn = :t, #s = :w, stripeTransferId = :tid, paidAt = :now, updatedAt = :now',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: marshall({ ':t': true, ':w': 'withdrawn', ':tid': transferId, ':now': now }),
      }));
    } catch (err) {
      console.error('mark withdrawn failed for', id, err);
    }
  }
  await finishRequest(reqId, { status: 'paid', stripeTransferId: transferId, verificationJson });

  // "Payout sent" email — best-effort, never blocks settlement.
  const dollars = (amountCents / 100).toFixed(2);
  const methodLine = req.methodLabel ? ` to ${req.methodLabel}` : ' to your connected account';
  await sendEmail({
    to: req.email,
    subject: `Payout sent — $${dollars}`,
    html: emailShell('Your payout is on its way 🎉', `We've sent your <b>$${dollars}</b> withdrawal${methodLine}. Depending on your bank it can take 1–3 business days to arrive. Stripe transfer reference: <code>${transferId}</code>.`),
    text: `We've sent your $${dollars} withdrawal${methodLine}. It can take 1–3 business days to arrive. Stripe transfer reference: ${transferId}.`,
  });
}

// Runs daily on an EventBridge schedule. Pays out every pending withdrawal.
export const handler = async (): Promise<void> => {
  const { Items = [] } = await ddb.send(new ScanCommand({
    TableName: withdrawalTable(),
    FilterExpression: '#s = :pending',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: marshall({ ':pending': 'pending' }),
  }));

  for (const raw of Items) {
    const req = unmarshall(raw);
    try {
      await processRequest(req);
    } catch (err) {
      console.error('processRequest failed for', req.id, err); // isolate one bad request
    }
  }
};
