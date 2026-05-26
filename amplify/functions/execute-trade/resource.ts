import { defineFunction } from '@aws-amplify/backend';

export const executeTrade = defineFunction({
  name: 'execute-trade',
  entry: './handler.ts',
  timeoutSeconds: 15,
});
