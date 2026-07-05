// Guarded wrapper around @stripe/stripe-react-native's PaymentSheet, used ONLY by
// the (gated) user-funded escrow flow. Lazy-required behind try/catch like ads.ts
// / purchases.ts, so the JS bundle degrades to a safe no-op when the native module
// isn't in the binary (Expo Go / an OTA on an older build). Needs
// EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY (pk_test_… for sandbox).

let mod: any = null;
let tried = false;
function load(): any {
  if (tried) return mod;
  tried = true;
  try { mod = require('@stripe/stripe-react-native'); } catch { mod = null; }
  return mod;
}

let initialized = false;
async function ensureInit(): Promise<boolean> {
  const m = load();
  if (!m) return false;
  const key = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return false;
  if (initialized) return true;
  try {
    await m.initStripe({ publishableKey: key });
    initialized = true;
    return true;
  } catch { return false; }
}

export interface PaymentResult { ok: boolean; canceled?: boolean; error?: string }

// Present the native PaymentSheet to authorize a hold for `clientSecret` (from
// escrowCreateHold). A manual-capture PaymentIntent is authorized here and
// captured server-side at settlement.
export async function presentEscrowPayment(clientSecret: string): Promise<PaymentResult> {
  const m = load();
  if (!m) return { ok: false, error: 'In-app payments are unavailable on this build.' };
  if (!(await ensureInit())) return { ok: false, error: 'Payments are not configured (missing publishable key).' };
  try {
    const init = await m.initPaymentSheet({
      paymentIntentClientSecret: clientSecret,
      merchantDisplayName: 'CryptoComp',
      returnURL: 'cryptocomp://stripe-redirect',
    });
    if (init.error) return { ok: false, error: init.error.message };
    const res = await m.presentPaymentSheet();
    if (res.error) {
      const canceled = res.error.code === 'Canceled';
      return { ok: false, canceled, error: canceled ? undefined : res.error.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
