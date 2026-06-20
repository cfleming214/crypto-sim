import { isAmplifyConfigured } from '../lib/amplify';

// Wallet / payout flow on top of the stripeConnect Lambda mutations (claimPrize,
// requestWithdrawal, listPayoutMethods, setPayoutMethod) plus owner-auth reads of
// the user's own Payout / WithdrawalRequest rows. Mirrors the lazy
// generateClient() + parseJson() pattern in stripeService.ts.

let clientPromise: Promise<any> | null = null;
async function getClient() {
  if (!isAmplifyConfigured) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      const { generateClient } = await import('aws-amplify/data');
      return generateClient();
    })();
  }
  return clientPromise;
}

function parseJson(v: any): any {
  if (v == null) return null;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v;
}

export interface UnclaimedPrize {
  payoutId: string;
  competitionId: string;
  competitionName: string;
  rank: number | null;
  amountCents: number;
}

export interface PayoutHistoryRow {
  payoutId: string;
  competitionName: string;
  rank: number | null;
  amountCents: number;
  status: 'unclaimed' | 'claimed' | 'withdrawn' | string;
  claimed: boolean;
  withdrawn: boolean;
  createdAt: string;
}

export interface WithdrawalRow {
  id: string;
  amountCents: number;
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'rejected' | string;
  methodLabel?: string;
  stripeTransferId?: string;
  failureReason?: string;
  createdAt: string;
  processedAt?: string;
}

export interface PayoutMethod {
  id: string;
  type: string;           // 'bank_account' | 'card'
  label: string;          // e.g. "Bank ••••6789"
  last4: string;
  currency: string;
  isDefault: boolean;
}

// Unclaimed contest wins = the user's Payout rows that haven't been claimed yet.
// Drives the Compete "Unclaimed" pill; reads the owner-auth Payout model.
export async function fetchUnclaimed(): Promise<UnclaimedPrize[]> {
  const client = await getClient();
  if (!client) return [];
  try {
    const { data } = await client.models.Payout.list();
    return (data as any[])
      .filter((p) => p.claimed !== true)
      .map((p) => ({
        payoutId: p.id,
        competitionId: p.competitionId,
        competitionName: p.competitionName ?? '',
        rank: p.rank ?? null,
        amountCents: p.amountCents ?? 0,
      }))
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  } catch (e) {
    console.warn('fetchUnclaimed failed', e);
    return [];
  }
}

// Every prize the user has won, with its lifecycle status (unclaimed → claimed →
// withdrawn). Drives the payout-history card.
export async function fetchPayoutHistory(): Promise<PayoutHistoryRow[]> {
  const client = await getClient();
  if (!client) return [];
  try {
    const { data } = await client.models.Payout.list();
    return (data as any[])
      .map((p) => ({
        payoutId: p.id,
        competitionName: p.competitionName ?? '',
        rank: p.rank ?? null,
        amountCents: p.amountCents ?? 0,
        status: p.status ?? 'unclaimed',
        claimed: p.claimed === true,
        withdrawn: p.withdrawn === true,
        createdAt: p.createdAt,
      }))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  } catch (e) {
    console.warn('fetchPayoutHistory failed', e);
    return [];
  }
}

// Claim a won prize into the withdrawable balance. Returns the new balance.
export async function claimPrize(
  payoutId: string,
): Promise<{ ok: boolean; balanceCents?: number; amountCents?: number; error?: string }> {
  const client = await getClient();
  if (!client) return { ok: false, error: 'Offline' };
  try {
    const { data, errors } = await client.mutations.claimPrize({ payoutId });
    if (errors?.length) return { ok: false, error: errors[0].message };
    const res = parseJson(data);
    return { ok: !!res?.ok, balanceCents: res?.balanceCents, amountCents: res?.amountCents, error: res?.error };
  } catch (e) {
    console.warn('claimPrize failed', e);
    return { ok: false, error: String(e) };
  }
}

// Open a pending withdrawal of the full available balance.
export async function requestWithdrawal(): Promise<{
  ok: boolean; requestId?: string; amountCents?: number; balanceCents?: number; error?: string; needsOnboarding?: boolean;
}> {
  const client = await getClient();
  if (!client) return { ok: false, error: 'Offline' };
  try {
    const { data, errors } = await client.mutations.requestWithdrawal();
    if (errors?.length) return { ok: false, error: errors[0].message };
    const res = parseJson(data);
    return {
      ok: !!res?.ok, requestId: res?.requestId, amountCents: res?.amountCents,
      balanceCents: res?.balanceCents, error: res?.error, needsOnboarding: res?.needsOnboarding,
    };
  } catch (e) {
    console.warn('requestWithdrawal failed', e);
    return { ok: false, error: String(e) };
  }
}

export async function fetchWithdrawals(): Promise<WithdrawalRow[]> {
  const client = await getClient();
  if (!client) return [];
  try {
    const { data } = await client.models.WithdrawalRequest.list();
    return (data as any[])
      .map((w) => ({
        id: w.id,
        amountCents: w.amountCents ?? 0,
        status: w.status ?? 'pending',
        methodLabel: w.methodLabel ?? undefined,
        stripeTransferId: w.stripeTransferId ?? undefined,
        failureReason: w.failureReason ?? undefined,
        createdAt: w.createdAt,
        processedAt: w.processedAt ?? undefined,
      }))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  } catch (e) {
    console.warn('fetchWithdrawals failed', e);
    return [];
  }
}

export async function listPayoutMethods(): Promise<{ methods: PayoutMethod[]; preferredMethodId?: string | null }> {
  const client = await getClient();
  if (!client) return { methods: [] };
  try {
    const { data, errors } = await client.mutations.listPayoutMethods();
    if (errors?.length) return { methods: [] };
    const res = parseJson(data) ?? {};
    return { methods: (res.methods ?? []) as PayoutMethod[], preferredMethodId: res.preferredMethodId ?? null };
  } catch (e) {
    console.warn('listPayoutMethods failed', e);
    return { methods: [] };
  }
}

export async function setPayoutMethod(
  externalAccountId: string,
): Promise<{ ok: boolean; preferredMethodId?: string; preferredMethodLabel?: string; error?: string }> {
  const client = await getClient();
  if (!client) return { ok: false, error: 'Offline' };
  try {
    const { data, errors } = await client.mutations.setPayoutMethod({ externalAccountId });
    if (errors?.length) return { ok: false, error: errors[0].message };
    const res = parseJson(data);
    return { ok: !!res?.ok, preferredMethodId: res?.preferredMethodId, preferredMethodLabel: res?.preferredMethodLabel, error: res?.error };
  } catch (e) {
    console.warn('setPayoutMethod failed', e);
    return { ok: false, error: String(e) };
  }
}
