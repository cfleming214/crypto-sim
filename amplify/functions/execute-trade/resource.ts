import { defineFunction } from '@aws-amplify/backend';

export const executeTrade = defineFunction({
  name: 'execute-trade',
  entry: './handler.ts',
  timeoutSeconds: 15,
  // Backs the executeContestTrade mutation (AppSync resolver → data stack depends
  // on it) AND reads/writes the CompetitionEntry + Token tables (it depends on the
  // data stack). Co-locate in the data stack so both edges are intra-stack and
  // don't form a CloudFormation circular dependency — same as stripe-connect.
  resourceGroupName: 'data',
});
