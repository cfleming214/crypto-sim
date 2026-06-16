import { defineFunction } from '@aws-amplify/backend';

export const closeReplayContest = defineFunction({
  name: 'close-replay-contest',
  entry: './handler.ts',
  timeoutSeconds: 60,
});
