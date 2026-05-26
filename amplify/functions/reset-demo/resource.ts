import { defineFunction } from '@aws-amplify/backend';

export const resetDemo = defineFunction({
  name: 'reset-demo',
  entry: './handler.ts',
  timeoutSeconds: 30,
});
