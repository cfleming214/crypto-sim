import { isAmplifyConfigured } from '../lib/amplify';
import { USER_ESCROW_CONTESTS_ENABLED } from '../constants/featureFlags';

// Client wrapper for user-funded escrow contests. GATED: every call no-ops unless
// USER_ESCROW_CONTESTS_ENABLED (EXPO_PUBLIC_USER_ESCROW_CONTESTS). The backend is
// additionally gated by ESCROW_ENABLED + a real Stripe key, so this can't move
// money until both the flag flips AND legal sign-off + LIVE keys are in place.
//
// FOLLOW-UP (needs a native build): escrowCreateHold returns a Stripe clientSecret;
// the create-contest UI must present @stripe/stripe-react-native's PaymentSheet
// with that secret to authorize the hold. Until then this is callable but the app
// exposes no dollar-prize creation path.

async function getClient() {
  if (!isAmplifyConfigured) return null;
  try {
    const { generateClient } = await import('aws-amplify/data');
    return generateClient();
  } catch { return null; }
}

export interface EscrowHoldResult {
  ok: boolean;
  clientSecret?: string;
  paymentIntentId?: string;
  escrowHoldId?: string;
  error?: string;
}

// Authorize/hold the caller's entry fee for an escrow contest/duel. Returns the
// Stripe clientSecret for the app to confirm via PaymentSheet.
export async function createEscrowHold(competitionId: string, amountCents: number): Promise<EscrowHoldResult> {
  if (!USER_ESCROW_CONTESTS_ENABLED) return { ok: false, error: 'Escrow contests are not available.' };
  const client = await getClient();
  if (!client) return { ok: false, error: 'Offline' };
  try {
    const { data, errors } = await (client as any).mutations.escrowCreateHold({ competitionId, amountCents });
    if (errors?.length) return { ok: false, error: errors[0].message };
    const res = typeof data === 'string' ? JSON.parse(data) : (data as any);
    return { ok: !!res?.ok, clientSecret: res?.clientSecret, paymentIntentId: res?.paymentIntentId, escrowHoldId: res?.escrowHoldId, error: res?.error };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
