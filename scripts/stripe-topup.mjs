#!/usr/bin/env node
/**
 * Add TEST funds to your Stripe platform available balance, so Connect prize
 * Transfers (close-competition / claimPayout) have money to send in sandbox.
 *
 * Dependency-free: talks to the Stripe REST API directly with fetch, so it
 * doesn't touch the (lockfile-sensitive) node_modules. Your secret key is read
 * from the environment and never hard-coded.
 *
 *   STRIPE_SECRET_KEY=sk_test_xxx node scripts/stripe-topup.mjs 100
 *
 * The amount is in DOLLARS (default 100). It uses Stripe's test PaymentMethod
 * `pm_card_bypassPending`, which credits the AVAILABLE balance immediately
 * (normal test charges sit in `pending` and can't fund Transfers).
 *
 * SAFETY: refuses to run with a live key — this is a test-only helper.
 */
const KEY = process.env.STRIPE_SECRET_KEY;
const dollars = Math.max(1, Number(process.argv[2] ?? '100'));
const amount = Math.round(dollars * 100); // cents

if (!KEY) {
  console.error('✖ STRIPE_SECRET_KEY is not set. Run:\n  STRIPE_SECRET_KEY=sk_test_xxx node scripts/stripe-topup.mjs 100');
  process.exit(1);
}
if (KEY.startsWith('sk_live_')) {
  console.error('✖ Refusing to run with a LIVE key — this helper is test-only. Use your sandbox sk_test_ key.');
  process.exit(1);
}
if (!KEY.startsWith('sk_test_')) {
  console.error('✖ Key does not look like a Stripe secret key (expected sk_test_…).');
  process.exit(1);
}

async function stripe(path, method = 'GET', form) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Stripe ${method} ${path} → ${res.status}: ${json?.error?.message ?? JSON.stringify(json)}`);
  }
  return json;
}

const fmt = (cents) => `$${(cents / 100).toFixed(2)}`;

async function main() {
  console.log(`Funding test platform balance with ${fmt(amount)} …`);

  const pi = await stripe('payment_intents', 'POST', {
    amount: String(amount),
    currency: 'usd',
    payment_method: 'pm_card_bypassPending',
    confirm: 'true',
    description: 'Sandbox test top-up (CryptoComp payouts)',
    'automatic_payment_methods[enabled]': 'true',
    'automatic_payment_methods[allow_redirects]': 'never',
  });

  console.log(`  PaymentIntent ${pi.id} → ${pi.status}`);
  if (pi.status !== 'succeeded') {
    console.error('✖ Top-up did not succeed. Check the PaymentIntent in the Stripe dashboard.');
    process.exit(1);
  }

  const bal = await stripe('balance');
  const available = (bal.available ?? []).map((b) => `${fmt(b.amount)} ${b.currency.toUpperCase()}`).join(', ') || '$0.00';
  const pending = (bal.pending ?? []).map((b) => `${fmt(b.amount)} ${b.currency.toUpperCase()}`).join(', ') || '$0.00';
  console.log(`\n✅ Done. Platform balance now — available: ${available}   pending: ${pending}`);
  console.log('   Transfers/payouts draw from AVAILABLE, so you\'re ready to settle a prize.');
}

main().catch((e) => { console.error('✖', e.message); process.exit(1); });
