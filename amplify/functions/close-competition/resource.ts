import { defineFunction } from '@aws-amplify/backend';

// MOCK MODE: STRIPE_SECRET_KEY is intentionally NOT wired as a secret right now
// (see stripe-connect/resource.ts), so settlement records simulated payouts and
// the backend deploys with no Stripe secrets configured. To go live, re-add
//   environment: { STRIPE_SECRET_KEY: secret('STRIPE_SECRET_KEY') },
// (re-import `secret` from '@aws-amplify/backend') and `ampx sandbox secret set`.
export const closeCompetition = defineFunction({
  name: 'close-competition',
  entry: './handler.ts',
  timeoutSeconds: 60,
});
