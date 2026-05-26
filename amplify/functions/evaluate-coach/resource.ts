import { defineFunction } from '@aws-amplify/backend';

export const evaluateCoach = defineFunction({
  name: 'evaluate-coach',
  entry: './handler.ts',
  timeoutSeconds: 30,
});
