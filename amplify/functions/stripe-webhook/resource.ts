import { defineFunction, secret } from '@aws-amplify/backend';

// Public Stripe webhook receiver. Exposed via a Lambda Function URL (authType
// NONE) in backend.ts, since Stripe's servers can't authenticate against
// AppSync/Cognito. Verifies the signature with STRIPE_WEBHOOK_SECRET and syncs
// account/payout state into DynamoDB. Table names injected in backend.ts.
//
// Both secrets must EXIST before the first deploy. STRIPE_WEBHOOK_SECRET is
// chicken-and-egg (you only get the whsec_… after creating the endpoint, which
// needs this function's deployed URL), so set a placeholder first, then update
// it for real once the endpoint exists:
//   npx ampx sandbox secret set STRIPE_SECRET_KEY    --identifier cflem   (sk_test_…)
//   npx ampx sandbox secret set STRIPE_WEBHOOK_SECRET --identifier cflem  (whsec_pending → real later)
export const stripeWebhook = defineFunction({
  name: 'stripe-webhook',
  entry: './handler.ts',
  timeoutSeconds: 30,
  environment: {
    STRIPE_SECRET_KEY: secret('STRIPE_SECRET_KEY'),
    STRIPE_WEBHOOK_SECRET: secret('STRIPE_WEBHOOK_SECRET'),
  },
});
