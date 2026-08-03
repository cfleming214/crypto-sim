// Cognito CustomMessage trigger — writes the subject/body for every code email
// Cognito sends.
//
// Why this exists: Cognito has ONE "verification message" template, and it is
// reused for sign-up confirmation AND for forgot-password. With only that
// template, a password reset arrived saying "Here is the code for your new
// account" — wrong, and alarming for someone who was told an account they
// already own had just been created.
//
// This trigger is the only place the two can be told apart: `triggerSource`
// names the flow, so each gets copy that matches what the user actually did.
//
// `event.request.codeParameter` is Cognito's placeholder ("{####}"). It MUST
// appear verbatim in the body or Cognito rejects the message and sends nothing.
// Typed loosely to avoid a dependency on @types/aws-lambda, matching
// pre-sign-up-handler.ts.

const APP = 'CryptoComp';

export const handler = async (event: any) => {
  const code: string = event?.request?.codeParameter ?? '{####}';

  switch (event?.triggerSource) {
    // A brand-new account confirming its email, or asking for that code again.
    case 'CustomMessage_SignUp':
    case 'CustomMessage_ResendCode':
      event.response.emailSubject = `Confirm your ${APP} account`;
      event.response.emailMessage =
        `Welcome to ${APP}.\n\n` +
        `Your confirmation code is ${code}\n\n` +
        `Enter it in the app to finish creating your account. ` +
        `If you didn't sign up, you can ignore this email.`;
      break;

    // Forgot password. Deliberately says nothing about a new account.
    case 'CustomMessage_ForgotPassword':
      event.response.emailSubject = `Reset your ${APP} password`;
      event.response.emailMessage =
        `We received a request to reset the password for your ${APP} account.\n\n` +
        `Your password reset code is ${code}\n\n` +
        `Enter it in the app to choose a new password. This code expires shortly.\n\n` +
        `If you didn't request a reset, you can ignore this email — your password ` +
        `will not change and your account stays secure.`;
      break;

    // Changing/verifying the email on an EXISTING account.
    case 'CustomMessage_UpdateUserAttribute':
    case 'CustomMessage_VerifyUserAttribute':
      event.response.emailSubject = `Verify your ${APP} email address`;
      event.response.emailMessage =
        `Confirm this email address for your ${APP} account.\n\n` +
        `Your verification code is ${code}\n\n` +
        `If you didn't request this, you can ignore this email.`;
      break;

    // Anything else (admin-created users, MFA) keeps Cognito's default by
    // returning the event untouched — better a generic message than a wrong one.
    default:
      break;
  }

  return event;
};
