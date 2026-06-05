import { defineAuth, defineFunction } from '@aws-amplify/backend';

// Auto-confirms new sign-ups so users can sign in immediately (the pool signs in
// by email but the app verifies email later, on contest entry). See the handler.
const preSignUp = defineFunction({
  name: 'pre-sign-up',
  entry: './pre-sign-up-handler.ts',
  // Place this Lambda in the AUTH stack (not the shared `function` stack).
  // Otherwise: auth → function (this trigger) → data (other fns grant table
  // access) → auth (data's Cognito authorization) is a CloudFormation circular
  // dependency. Co-locating the trigger with auth makes that edge intra-stack,
  // leaving function → data → auth as a valid DAG.
  resourceGroupName: 'auth',
});

export const auth = defineAuth({
  // Email sign-in. This matches the already-deployed Cognito pool
  // (username_attributes / standard_required_attributes / user_verification_types
  // are all email), so applying it is a no-op against the live pool's immutable
  // sign-in config — no user-pool recreation. An empty loginWith ({}) is invalid
  // under current ampx ("at least one auth method must be enabled") and blocked
  // every backend deploy.
  loginWith: {
    email: true,
  },
  triggers: {
    preSignUp,
  },
});
