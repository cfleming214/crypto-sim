import { defineFunction } from '@aws-amplify/backend';

// Rebuilds the Recruiter Cup standings (top recruiters by activated referrals
// THIS season) into RecruiterCupLeaderboard for the Compete tab, and writes each
// referrer's lifetime activatedReferrals back onto UserProfile (drives milestone
// tiers). Mirrors tick-global-leaderboard / settle-season. Runs every 5 minutes.
export const settleRecruiterCup = defineFunction({
  name: 'settle-recruiter-cup',
  entry: './handler.ts',
  timeoutSeconds: 120,
});
