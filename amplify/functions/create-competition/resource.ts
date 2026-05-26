import { defineFunction } from '@aws-amplify/backend';

export const createCompetition = defineFunction({
  name: 'create-competition',
  entry: './handler.ts',
  timeoutSeconds: 30,
});
