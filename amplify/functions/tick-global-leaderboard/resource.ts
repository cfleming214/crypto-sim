import { defineFunction } from '@aws-amplify/backend';

// Rebuilds the public global leaderboard every few minutes: values every
// opted-in user's holdings at current Token prices, ranks them, and writes the
// top ~100 into the GlobalLeaderboard table. Table names injected in backend.ts.
export const tickGlobalLeaderboard = defineFunction({
  name: 'tick-global-leaderboard',
  entry: './handler.ts',
  timeoutSeconds: 120,
});
