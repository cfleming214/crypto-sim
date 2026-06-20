import { defineFunction, secret } from '@aws-amplify/backend';

// Daily batch payout. Processes every 'pending' WithdrawalRequest: re-verifies
// each contest funding it (the user actually won, the prize was claimed, and it
// hasn't been paid before), then transfers to the user's Stripe connected
// account and flips each prize's `withdrawn` flag. Runs on an EventBridge daily
// schedule (see backend.ts). Table names are injected in backend.ts.
//
// TEST/LIVE MODE: shares STRIPE_SECRET_KEY with stripe-connect. Without it the
// handler runs in MOCK mode (synthetic transfer ids, no Stripe call).
export const processWithdrawals = defineFunction({
  name: 'process-withdrawals',
  entry: './handler.ts',
  timeoutSeconds: 120,
  environment: {
    STRIPE_SECRET_KEY: secret('STRIPE_SECRET_KEY'),
    // Transactional email (payout-sent notification). Set before deploy:
    //   ampx sandbox secret set RESEND_API_KEY --identifier cflem
    RESEND_API_KEY: secret('RESEND_API_KEY'),
    // TEMP: Resend's test sender (no domain verification needed, but only
    // delivers to your Resend account email). Switch back to
    // 'CryptoComp <noreply@cryptocomp.app>' once cryptocomp.app is verified.
    PAYOUT_EMAIL_FROM: 'CryptoComp <onboarding@resend.dev>',
  },
});
