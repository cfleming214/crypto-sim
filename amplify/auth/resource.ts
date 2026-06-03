import { defineAuth } from '@aws-amplify/backend';

export const auth = defineAuth({
  // Username-only sign-in. Email is an optional, mutable attribute that users
  // add + verify later (gated on contest entry). No login alias is configured,
  // so signup collects only username + password and Cognito issues no
  // verification code at create time.
  loginWith: {},
  userAttributes: {
    email: {
      required: false,
      mutable: true,
    },
  },
});
