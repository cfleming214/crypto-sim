import { defineFunction } from '@aws-amplify/backend';

export const tickLeaderboard = defineFunction({
  name: 'tick-leaderboard',
  entry: './handler.ts',
  timeoutSeconds: 60,
});
