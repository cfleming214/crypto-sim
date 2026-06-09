import { defineBackend } from '@aws-amplify/backend';
import { Duration, Stack } from 'aws-cdk-lib';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
import { auth } from './auth/resource.js';
import { data } from './data/resource.js';
import { storage } from './storage/resource.js';
import { tickLeaderboard } from './functions/tick-leaderboard/resource.js';
import { tickGlobalLeaderboard } from './functions/tick-global-leaderboard/resource.js';
import { closeCompetition } from './functions/close-competition/resource.js';
import { createCompetition } from './functions/create-competition/resource.js';
import { resetDemo } from './functions/reset-demo/resource.js';
import { evaluateCoach } from './functions/evaluate-coach/resource.js';
import { executeTrade } from './functions/execute-trade/resource.js';
import { runMirror } from './functions/run-mirror/resource.js';
import { settleSeason } from './functions/settle-season/resource.js';
import { stripeConnect } from './functions/stripe-connect/resource.js';
import { stripeWebhook } from './functions/stripe-webhook/resource.js';

// NOTE: backend.ts is loaded by the CDK assembler with a type-stripping transformer
// that handles annotations but NOT `as` casts or other TS-only expressions. Keep
// this file syntactically valid JavaScript — use // @ts-expect-error to satisfy
// strict tsc for the addEnvironment calls, since .resources.lambda is typed as
// the read-only IFunction interface while the runtime object is a Function.

const backend = defineBackend({
  auth,
  data,
  storage,
  tickLeaderboard,
  tickGlobalLeaderboard,
  closeCompetition,
  createCompetition,
  resetDemo,
  evaluateCoach,
  executeTrade,
  runMirror,
  settleSeason,
  stripeConnect,
  stripeWebhook,
});

// Enable USER_PASSWORD_AUTH on the Cognito user pool client. The default
// USER_SRP_AUTH flow needs crypto.getRandomValues + BigInt math, which is
// brittle under Hermes on React Native and surfaces only as "An unknown
// error has occurred". USER_PASSWORD_AUTH sends the password in the request
// body (still TLS-encrypted) and skips the SRP challenge entirely.
backend.auth.resources.cfnResources.cfnUserPoolClient.explicitAuthFlows = [
  'ALLOW_USER_PASSWORD_AUTH',
  'ALLOW_USER_SRP_AUTH',
  'ALLOW_REFRESH_TOKEN_AUTH',
  'ALLOW_CUSTOM_AUTH',
];

// DynamoDB table references
const competitionTable  = backend.data.resources.tables['Competition'];
const entryTable        = backend.data.resources.tables['CompetitionEntry'];
const stripeAccountTable = backend.data.resources.tables['StripeAccount'];
const payoutTable        = backend.data.resources.tables['Payout'];
const tokenTable         = backend.data.resources.tables['Token'];
const globalBoardTable   = backend.data.resources.tables['GlobalLeaderboard'];

// --- tickLeaderboard: runs every 5 minutes ---
const tickFn = backend.tickLeaderboard.resources.lambda;
competitionTable.grantReadData(tickFn);
entryTable.grantReadWriteData(tickFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
tickFn.addEnvironment('COMPETITION_ENTRY_TABLE_NAME', entryTable.tableName);

new Rule(Stack.of(tickFn), 'TickLeaderboardRule', {
  schedule: Schedule.rate(Duration.minutes(5)),
  targets: [new LambdaFunction(tickFn)],
});

// --- tickGlobalLeaderboard: runs every 5 minutes ---
// Values every visible UserProfile at current Token prices and rewrites the
// bounded top-100 GlobalLeaderboard table that phones read.
const globalTickFn = backend.tickGlobalLeaderboard.resources.lambda;
const profileTableForBoard = backend.data.resources.tables['UserProfile'];
profileTableForBoard.grantReadData(globalTickFn);
tokenTable.grantReadData(globalTickFn);
globalBoardTable.grantReadWriteData(globalTickFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
globalTickFn.addEnvironment('USER_PROFILE_TABLE_NAME', profileTableForBoard.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
globalTickFn.addEnvironment('TOKEN_TABLE_NAME', tokenTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
globalTickFn.addEnvironment('GLOBAL_LEADERBOARD_TABLE_NAME', globalBoardTable.tableName);

new Rule(Stack.of(globalTickFn), 'TickGlobalLeaderboardRule', {
  schedule: Schedule.rate(Duration.minutes(5)),
  targets: [new LambdaFunction(globalTickFn)],
});

// --- closeCompetition: runs every 10 minutes ---
const closeFn = backend.closeCompetition.resources.lambda;
competitionTable.grantReadWriteData(closeFn);
entryTable.grantReadWriteData(closeFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
closeFn.addEnvironment('COMPETITION_TABLE_NAME', competitionTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
closeFn.addEnvironment('COMPETITION_ENTRY_TABLE_NAME', entryTable.tableName);
// Settlement: write Payout rows and read onboarding state to auto-Transfer.
payoutTable.grantReadWriteData(closeFn);
stripeAccountTable.grantReadData(closeFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
closeFn.addEnvironment('PAYOUT_TABLE_NAME', payoutTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
closeFn.addEnvironment('STRIPE_ACCOUNT_TABLE_NAME', stripeAccountTable.tableName);

new Rule(Stack.of(closeFn), 'CloseCompetitionRule', {
  schedule: Schedule.rate(Duration.minutes(10)),
  targets: [new LambdaFunction(closeFn)],
});

// --- createCompetition: admin invoke only, no schedule ---
const createFn = backend.createCompetition.resources.lambda;
competitionTable.grantWriteData(createFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
createFn.addEnvironment('COMPETITION_TABLE_NAME', competitionTable.tableName);

// --- resetDemo: user-invoked, clears trades + profile ---
const resetFn = backend.resetDemo.resources.lambda;
const profileTable = backend.data.resources.tables['UserProfile'];
const tradeTable   = backend.data.resources.tables['Trade'];
profileTable.grantReadWriteData(resetFn);
tradeTable.grantReadWriteData(resetFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
resetFn.addEnvironment('USER_PROFILE_TABLE_NAME', profileTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
resetFn.addEnvironment('TRADE_TABLE_NAME', tradeTable.tableName);

// --- evaluateCoach: DynamoDB stream trigger on Trade table ---
const coachFn = backend.evaluateCoach.resources.lambda;
const coachNudgeTable = backend.data.resources.tables['CoachNudge'];
profileTable.grantReadData(coachFn);
coachNudgeTable.grantWriteData(coachFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
coachFn.addEnvironment('USER_PROFILE_TABLE_NAME', profileTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
coachFn.addEnvironment('COACH_NUDGE_TABLE_NAME', coachNudgeTable.tableName);

// --- executeTrade: user-invoked, server-side validated trade execution ---
const execFn = backend.executeTrade.resources.lambda;
profileTable.grantReadWriteData(execFn);
tradeTable.grantWriteData(execFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
execFn.addEnvironment('USER_PROFILE_TABLE_NAME', profileTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
execFn.addEnvironment('TRADE_TABLE_NAME', tradeTable.tableName);

// --- runMirror: DynamoDB stream trigger on Trade table, copies trades to followers ---
const mirrorFn = backend.runMirror.resources.lambda;
const mirrorTable = backend.data.resources.tables['Mirror'];
profileTable.grantReadWriteData(mirrorFn);
tradeTable.grantWriteData(mirrorFn);
mirrorTable.grantReadData(mirrorFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
mirrorFn.addEnvironment('USER_PROFILE_TABLE_NAME', profileTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
mirrorFn.addEnvironment('TRADE_TABLE_NAME', tradeTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
mirrorFn.addEnvironment('MIRROR_TABLE_NAME', mirrorTable.tableName);

// --- settleSeason: weekly league promotion/relegation ---
const seasonFn = backend.settleSeason.resources.lambda;
profileTable.grantReadWriteData(seasonFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
seasonFn.addEnvironment('USER_PROFILE_TABLE_NAME', profileTable.tableName);

new Rule(Stack.of(seasonFn), 'SettleSeasonRule', {
  schedule: Schedule.rate(Duration.days(7)),
  targets: [new LambdaFunction(seasonFn)],
});

// --- stripeConnect: backs the payout onboarding / status / claim mutations ---
const stripeConnectFn = backend.stripeConnect.resources.lambda;
stripeAccountTable.grantReadWriteData(stripeConnectFn);
payoutTable.grantReadWriteData(stripeConnectFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
stripeConnectFn.addEnvironment('STRIPE_ACCOUNT_TABLE_NAME', stripeAccountTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
stripeConnectFn.addEnvironment('PAYOUT_TABLE_NAME', payoutTable.tableName);

// --- stripeWebhook: public Function URL, syncs account + payout state ---
const stripeWebhookFn = backend.stripeWebhook.resources.lambda;
stripeAccountTable.grantReadWriteData(stripeWebhookFn);
payoutTable.grantReadWriteData(stripeWebhookFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
stripeWebhookFn.addEnvironment('STRIPE_ACCOUNT_TABLE_NAME', stripeAccountTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
stripeWebhookFn.addEnvironment('PAYOUT_TABLE_NAME', payoutTable.tableName);

// Stripe's servers can't authenticate against Cognito, so expose the webhook on
// an unauthenticated Function URL. The handler verifies the Stripe signature.
const webhookUrl = stripeWebhookFn.addFunctionUrl({ authType: FunctionUrlAuthType.NONE });
// Surface the URL in amplify_outputs so we can paste it into the Stripe Dashboard.
backend.addOutput({ custom: { stripeWebhookUrl: webhookUrl.url } });
