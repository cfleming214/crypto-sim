import { isAmplifyConfigured } from '../lib/amplify';

// Talks to the Stripe payout backend (the stripeConnect Lambda, exposed as the
// startPayoutOnboarding / refreshPayoutStatus / claimPayout custom mutations)
// and reads the user's own StripeAccount / Payout rows. Mirrors the lazy
// generateClient() pattern used across the other services.

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

// a.json() mutation results arrive either already-parsed or as a JSON string,
// depending on transport — normalize to an object.
function parseJson(v: any): any {
  if (v == null) return null;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v;
}

export interface PayoutAccount {
  stripeAccountId?: string;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  status: 'onboarding' | 'enabled' | 'restricted' | string;
  // Withdrawable balance (cents) + chosen payout method, surfaced by
  // refreshPayoutStatus so the Profile/Withdraw screens don't need a separate read.
  balanceCents: number;
  preferredMethodId?: string | null;
  preferredMethodLabel?: string | null;
}

export interface PayoutRow {
  id: string;
  competitionId: string;
  competitionName: string;
  rank: number | null;
  amountCents: number;
  status: 'pending' | 'processing' | 'paid' | 'failed' | string;
  stripeTransferId?: string;
  createdAt: string;
  paidAt?: string;
}

// Kicks off (or resumes) Connect onboarding. Returns the Stripe-hosted Account
// Link URL the onboarding WebView opens.
export async function startOnboarding(): Promise<{ url: string | null; mock?: boolean; error?: string }> {
  const client = await getClient();
  if (!client) return { url: null, error: 'Offline' };
  try {
    const { data, errors } = await client.mutations.startPayoutOnboarding();
    if (errors?.length) return { url: null, error: errors[0].message };
    const res = parseJson(data);
    if (res?.error) return { url: null, error: res.error };
    // Mock backend: no URL to open — payouts were activated server-side, so the
    // caller just refreshes status instead of onboarding.
    return { url: res?.url ?? null, mock: !!res?.mock };
  } catch (e) {
    console.warn('startOnboarding failed', e);
    return { url: null, error: String(e) };
  }
}

// Re-reads the Stripe account after onboarding and syncs payoutsEnabled.
export async function refreshStatus(): Promise<PayoutAccount | null> {
  const client = await getClient();
  if (!client) return null;
  try {
    const { data } = await client.mutations.refreshPayoutStatus();
    const res = parseJson(data);
    if (!res) return null;
    return {
      payoutsEnabled: !!res.payoutsEnabled,
      detailsSubmitted: !!res.detailsSubmitted,
      status: res.status ?? 'onboarding',
      balanceCents: Number(res.balanceCents ?? 0),
      preferredMethodId: res.preferredMethodId ?? null,
      preferredMethodLabel: res.preferredMethodLabel ?? null,
    };
  } catch (e) {
    console.warn('refreshStatus failed', e);
    return null;
  }
}

export async function fetchPayouts(): Promise<PayoutRow[]> {
  const client = await getClient();
  if (!client) return [];
  try {
    const { data } = await client.models.Payout.list();
    return (data as any[])
      .map((d) => ({
        id: d.id,
        competitionId: d.competitionId,
        competitionName: d.competitionName ?? '',
        rank: d.rank ?? null,
        amountCents: d.amountCents ?? 0,
        status: d.status ?? 'pending',
        stripeTransferId: d.stripeTransferId ?? undefined,
        createdAt: d.createdAt,
        paidAt: d.paidAt ?? undefined,
      }))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  } catch (e) {
    console.warn('fetchPayouts failed', e);
    return [];
  }
}

// Claims a pending payout — server creates the Stripe Transfer if onboarded.
export async function claimPayout(
  payoutId: string,
): Promise<{ ok: boolean; error?: string; needsOnboarding?: boolean }> {
  const client = await getClient();
  if (!client) return { ok: false, error: 'Offline' };
  try {
    const { data, errors } = await client.mutations.claimPayout({ payoutId });
    if (errors?.length) return { ok: false, error: errors[0].message };
    const res = parseJson(data);
    return { ok: !!res?.ok, error: res?.error, needsOnboarding: res?.needsOnboarding };
  } catch (e) {
    console.warn('claimPayout failed', e);
    return { ok: false, error: String(e) };
  }
}
