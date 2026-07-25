import { defineAuth, defineFunction } from '@aws-amplify/backend';

// PreSignUp trigger, deliberately a NO-OP: new sign-ups must confirm their email
// with a code before the account is usable. (This comment used to claim the
// opposite — that sign-ups were auto-confirmed — which stopped being true when
// the handler was emptied. Corrected during the CRYP-19 security review, since a
// stale claim here misrepresents the auth posture.) Kept wired rather than
// removed so the auth stack wiring is unchanged; see the handler.
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
