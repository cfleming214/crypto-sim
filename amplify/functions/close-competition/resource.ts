import { defineFunction, secret } from '@aws-amplify/backend';

// LIVE (TEST mode): STRIPE_SECRET_KEY is wired so settlement creates REAL Stripe
// Transfers (test mode) — onboarded winners are auto-paid the moment the cron
// settles their contest, instead of recording a simulated `mock_tr_` payout.
// The handler's `MOCK = !process.env.STRIPE_SECRET_KEY` flips to false once this
// secret is present (set it with `ampx sandbox secret set STRIPE_SECRET_KEY`).
export const closeCompetition = defineFunction({
  name: 'close-competition',
  entry: './handler.ts',
  timeoutSeconds: 60,
  environment: { STRIPE_SECRET_KEY: secret('STRIPE_SECRET_KEY') },
});
