// Cognito PreSignUp trigger. Auto-confirms new sign-ups (and marks email as
// verified) so users can sign in immediately without entering an email code —
// the pool signs in by email but the app defers real email verification to
// contest entry (handleStartEmailVerification). Typed loosely to avoid a
// dependency on @types/aws-lambda.
export const handler = async (event: any) => {
  event.response = event.response ?? {};
  event.response.autoConfirmUser = true;
  event.response.autoVerifyEmail = true;
  return event;
};
