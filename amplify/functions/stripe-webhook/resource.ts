import { defineFunction } from '@aws-amplify/backend';

// Public Stripe webhook receiver. Exposed via a Lambda Function URL (authType
// NONE) in backend.ts, since Stripe's servers can't authenticate against
// AppSync/Cognito. Verifies the signature with STRIPE_WEBHOOK_SECRET and syncs
// account/payout state into DynamoDB. Table names injected in backend.ts.
//
// MOCK MODE: no Stripe secrets are wired right now (see stripe-connect/resource
// .ts), so the handler runs without a key — it returns 400 to any caller and is
// never exercised, but deploys cleanly. To go live, re-add the environment block
//   environment: { STRIPE_SECRET_KEY: secret('STRIPE_SECRET_KEY'),
//                  STRIPE_WEBHOOK_SECRET: secret('STRIPE_WEBHOOK_SECRET') },
// (re-import `secret`) and `ampx sandbox secret set`.
export const stripeWebhook = defineFunction({
  name: 'stripe-webhook',
  entry: './handler.ts',
  timeoutSeconds: 30,
});
