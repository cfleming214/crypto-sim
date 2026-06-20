import { defineFunction, secret } from '@aws-amplify/backend';

// Backs the startPayoutOnboarding / refreshPayoutStatus / claimPayout custom
// mutations (see amplify/data/resource.ts). Talks to the Stripe API to create
// Connect Express accounts, mint onboarding Account Sessions, and pay out
// prizes via Transfers. Table names are injected in backend.ts.
//
// TEST/LIVE MODE: STRIPE_SECRET_KEY is wired as an Amplify secret. The handler
// only falls back to mock mode when the env var is absent; once the secret is
// set it hits the real Stripe API. Set it BEFORE deploying:
//   npx ampx sandbox secret set STRIPE_SECRET_KEY --identifier cflem   (paste sk_test_…)
export const stripeConnect = defineFunction({
  name: 'stripe-connect',
  entry: './handler.ts',
  timeoutSeconds: 30,
  environment: {
    STRIPE_SECRET_KEY: secret('STRIPE_SECRET_KEY'),
    // Transactional email (withdrawal-requested confirmation). Set before deploy:
    //   ampx sandbox secret set RESEND_API_KEY --identifier cflem
    RESEND_API_KEY: secret('RESEND_API_KEY'),
    // TEMP: Resend's test sender (no domain verification needed, but only
    // delivers to your Resend account email). Switch back to
    // 'CryptoComp <noreply@cryptocomp.app>' once cryptocomp.app is verified.
    PAYOUT_EMAIL_FROM: 'CryptoComp <onboarding@resend.dev>',
  },
  // This function is BOTH an AppSync resolver (the data stack depends on it, via
  // the startPayoutOnboarding/refreshPayoutStatus/claimPayout mutations) AND a
  // direct DynamoDB writer (it depends on the StripeAccount/Payout tables, granted
  // in backend.ts). In separate stacks those two edges form a CloudFormation
  // circular dependency. Co-locating it in the data stack makes both edges
  // intra-stack — the same technique the preSignUp trigger uses with 'auth'.
  resourceGroupName: 'data',
});
