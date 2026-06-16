import { defineFunction } from '@aws-amplify/backend';

export const tickReplayLeaderboard = defineFunction({
  name: 'tick-replay-leaderboard',
  entry: './handler.ts',
  timeoutSeconds: 60,
});
