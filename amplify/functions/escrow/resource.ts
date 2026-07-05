import { defineFunction, secret } from '@aws-amplify/backend';

// Backs the escrowCreateHold / escrowSettleContest / escrowCancelContest custom
// mutations (see amplify/data/resource.ts) AND runs on a schedule to settle
// finished escrow contests. Handles the CHARGE side of user-funded contests via
// Stripe manual-capture PaymentIntents (authorize/hold → capture at settlement or
// cancel to release). The winner receives the pot through the EXISTING Payout →
// claim → withdraw rail, so this only adds hold/capture/refund.
//
// GATED: does nothing unless CONTEST_CASH_PRIZES === 'true' (mirrors the payout
// rail). MOCK MODE when STRIPE_SECRET_KEY is absent. Set the TEST key before use:
//   npx ampx sandbox secret set STRIPE_SECRET_KEY --identifier cflem   (sk_test_…)
export const escrow = defineFunction({
  name: 'escrow',
  entry: './handler.ts',
  timeoutSeconds: 60,
  environment: {
    STRIPE_SECRET_KEY: secret('STRIPE_SECRET_KEY'),
  },
  // AppSync resolver (data stack depends on it) + direct DynamoDB writer → keep in
  // the data stack to avoid the resolver↔table circular dependency (like stripe-connect).
  resourceGroupName: 'data',
});
