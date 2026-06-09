import { defineFunction } from '@aws-amplify/backend';

// Backs the startPayoutOnboarding / refreshPayoutStatus / claimPayout custom
// mutations (see amplify/data/resource.ts). Talks to the Stripe API to create
// Connect Express accounts, mint onboarding Account Sessions, and pay out
// prizes via Transfers. Table names are injected in backend.ts.
//
// MOCK MODE: STRIPE_SECRET_KEY is intentionally NOT wired as a secret right now,
// so the handler runs in mock mode (simulated onboarding + payouts) and the
// backend deploys with no Stripe secrets configured. To go live, re-add
//   environment: { STRIPE_SECRET_KEY: secret('STRIPE_SECRET_KEY') },
// (re-import `secret` from '@aws-amplify/backend') and `ampx sandbox secret set`.
export const stripeConnect = defineFunction({
  name: 'stripe-connect',
  entry: './handler.ts',
  timeoutSeconds: 30,
  // This function is BOTH an AppSync resolver (the data stack depends on it, via
  // the startPayoutOnboarding/refreshPayoutStatus/claimPayout mutations) AND a
  // direct DynamoDB writer (it depends on the StripeAccount/Payout tables, granted
  // in backend.ts). In separate stacks those two edges form a CloudFormation
  // circular dependency. Co-locating it in the data stack makes both edges
  // intra-stack — the same technique the preSignUp trigger uses with 'auth'.
  resourceGroupName: 'data',
});
