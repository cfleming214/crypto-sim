import { defineAuth } from '@aws-amplify/backend';

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
});
