import { defineFunction } from '@aws-amplify/backend';

export const settleSeason = defineFunction({
  name: 'settle-season',
  entry: './handler.ts',
  timeoutSeconds: 120,
});
