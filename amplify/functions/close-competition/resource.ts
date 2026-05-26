import { defineFunction } from '@aws-amplify/backend';

export const closeCompetition = defineFunction({
  name: 'close-competition',
  entry: './handler.ts',
  timeoutSeconds: 60,
});
