import { defineBackend } from '@aws-amplify/backend';
import { Duration, Stack } from 'aws-cdk-lib';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { auth } from './auth/resource.js';
import { data } from './data/resource.js';
import { tickLeaderboard } from './functions/tick-leaderboard/resource.js';
import { closeCompetition } from './functions/close-competition/resource.js';
import { createCompetition } from './functions/create-competition/resource.js';
import { resetDemo } from './functions/reset-demo/resource.js';
import { evaluateCoach } from './functions/evaluate-coach/resource.js';
import { executeTrade } from './functions/execute-trade/resource.js';
import { runMirror } from './functions/run-mirror/resource.js';

const backend = defineBackend({
  auth,
  data,
  tickLeaderboard,
  closeCompetition,
  createCompetition,
  resetDemo,
  evaluateCoach,
  executeTrade,
  runMirror,
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

// --- resetDemo: user-invoked, clears trades + profile ---
const resetFn = backend.resetDemo.resources.lambda;
const profileTable = backend.data.resources.tables['UserProfile'];
const tradeTable   = backend.data.resources.tables['Trade'];
profileTable.grantReadWriteData(resetFn);
tradeTable.grantReadWriteData(resetFn);
resetFn.addEnvironment('USER_PROFILE_TABLE_NAME', profileTable.tableName);
resetFn.addEnvironment('TRADE_TABLE_NAME', tradeTable.tableName);

// --- evaluateCoach: DynamoDB stream trigger on Trade table ---
const coachFn = backend.evaluateCoach.resources.lambda;
profileTable.grantReadData(coachFn);
coachFn.addEnvironment('USER_PROFILE_TABLE_NAME', profileTable.tableName);

// --- executeTrade: user-invoked, server-side validated trade execution ---
const execFn = backend.executeTrade.resources.lambda;
profileTable.grantReadWriteData(execFn);
tradeTable.grantWriteData(execFn);
execFn.addEnvironment('USER_PROFILE_TABLE_NAME', profileTable.tableName);
execFn.addEnvironment('TRADE_TABLE_NAME', tradeTable.tableName);

// --- runMirror: DynamoDB stream trigger on Trade table, copies trades to followers ---
const mirrorFn = backend.runMirror.resources.lambda;
profileTable.grantReadWriteData(mirrorFn);
tradeTable.grantWriteData(mirrorFn);
mirrorFn.addEnvironment('USER_PROFILE_TABLE_NAME', profileTable.tableName);
mirrorFn.addEnvironment('TRADE_TABLE_NAME', tradeTable.tableName);
