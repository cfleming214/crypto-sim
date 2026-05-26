import { defineBackend } from '@aws-amplify/backend';
import { Duration, Stack } from 'aws-cdk-lib';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { auth } from './auth/resource.js';
import { data } from './data/resource.js';
import { tickLeaderboard } from './functions/tick-leaderboard/resource.js';
import { closeCompetition } from './functions/close-competition/resource.js';
import { createCompetition } from './functions/create-competition/resource.js';

const backend = defineBackend({
  auth,
  data,
  tickLeaderboard,
  closeCompetition,
  createCompetition,
});

// DynamoDB table references
const competitionTable = backend.data.resources.tables['Competition'];
const entryTable       = backend.data.resources.tables['CompetitionEntry'];

// --- tickLeaderboard: runs every 5 minutes ---
const tickFn = backend.tickLeaderboard.resources.lambda;
competitionTable.grantReadData(tickFn);
entryTable.grantReadWriteData(tickFn);
tickFn.addEnvironment('COMPETITION_ENTRY_TABLE_NAME', entryTable.tableName);

new Rule(Stack.of(tickFn), 'TickLeaderboardRule', {
  schedule: Schedule.rate(Duration.minutes(5)),
  targets: [new LambdaFunction(tickFn)],
});

// --- closeCompetition: runs every 10 minutes ---
const closeFn = backend.closeCompetition.resources.lambda;
competitionTable.grantReadWriteData(closeFn);
entryTable.grantReadWriteData(closeFn);
closeFn.addEnvironment('COMPETITION_TABLE_NAME', competitionTable.tableName);
closeFn.addEnvironment('COMPETITION_ENTRY_TABLE_NAME', entryTable.tableName);

new Rule(Stack.of(closeFn), 'CloseCompetitionRule', {
  schedule: Schedule.rate(Duration.minutes(10)),
  targets: [new LambdaFunction(closeFn)],
});

// --- createCompetition: admin invoke only, no schedule ---
const createFn = backend.createCompetition.resources.lambda;
competitionTable.grantWriteData(createFn);
createFn.addEnvironment('COMPETITION_TABLE_NAME', competitionTable.tableName);
