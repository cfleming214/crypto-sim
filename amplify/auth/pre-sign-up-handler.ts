// Cognito PreSignUp trigger. Intentionally a NO-OP: new sign-ups must verify their
// email with a confirmation code (confirmSignUp) before the account becomes usable
// — we no longer auto-confirm. Kept wired (rather than removed) so the auth stack
// wiring is unchanged; returning the event unmodified leaves Cognito's default
// "require confirmation" behaviour in place. Typed loosely to avoid a dependency on
// @types/aws-lambda.
export const handler = async (event: any) => {
  return event;
};
