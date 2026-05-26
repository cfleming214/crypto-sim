import { defineFunction } from '@aws-amplify/backend';

export const runMirror = defineFunction({
  name: 'run-mirror',
  entry: './handler.ts',
  timeoutSeconds: 60,
});
