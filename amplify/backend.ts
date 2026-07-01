import { defineBackend } from '@aws-amplify/backend';
import { Duration, Stack } from 'aws-cdk-lib';
import { Rule, Schedule, RuleTargetInput } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
import { auth } from './auth/resource.js';
import { data } from './data/resource.js';
import { storage } from './storage/resource.js';
import { tickPrices } from './functions/tick-prices/resource.js';
import { tickOhlc } from './functions/tick-ohlc/resource.js';
import { tickLeaderboard } from './functions/tick-leaderboard/resource.js';
import { tickGlobalLeaderboard } from './functions/tick-global-leaderboard/resource.js';
import { closeCompetition } from './functions/close-competition/resource.js';
import { createCompetition } from './functions/create-competition/resource.js';
import { createWeeklyContest } from './functions/create-weekly-contest/resource.js';
import { createRollingContest } from './functions/create-rolling-contest/resource.js';
import { resetDemo } from './functions/reset-demo/resource.js';
import { evaluateCoach } from './functions/evaluate-coach/resource.js';
import { executeTrade } from './functions/execute-trade/resource.js';
import { runMirror } from './functions/run-mirror/resource.js';
import { settleSeason } from './functions/settle-season/resource.js';
import { settleRecruiterCup } from './functions/settle-recruiter-cup/resource.js';
import { tickReplayLeaderboard } from './functions/tick-replay-leaderboard/resource.js';
import { closeReplayContest } from './functions/close-replay-contest/resource.js';
import { priceWatch } from './functions/price-watch/resource.js';
import { notificationDispatcher } from './functions/notification-dispatcher/resource.js';
import { stripeConnect } from './functions/stripe-connect/resource.js';
import { stripeWebhook } from './functions/stripe-webhook/resource.js';
import { processWithdrawals } from './functions/process-withdrawals/resource.js';

// NOTE: backend.ts is loaded by the CDK assembler with a type-stripping transformer
// that handles annotations but NOT `as` casts or other TS-only expressions. Keep
// this file syntactically valid JavaScript — use // @ts-expect-error to satisfy
// strict tsc for the addEnvironment calls, since .resources.lambda is typed as
// the read-only IFunction interface while the runtime object is a Function.

const backend = defineBackend({
  auth,
  data,
  storage,
  tickPrices,
  tickOhlc,
  tickLeaderboard,
  tickGlobalLeaderboard,
  closeCompetition,
  createCompetition,
  createWeeklyContest,
  createRollingContest,
  resetDemo,
  evaluateCoach,
  executeTrade,
  runMirror,
  settleSeason,
  settleRecruiterCup,
  tickReplayLeaderboard,
  closeReplayContest,
  priceWatch,
  notificationDispatcher,
  stripeConnect,
  stripeWebhook,
  processWithdrawals,
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
const withdrawalReqTable = backend.data.resources.tables['WithdrawalRequest'];

// Live-trades feed self-prunes via DynamoDB TTL on `expiresAt` (epoch seconds),
// so the global ticker table can't grow unbounded.
backend.data.resources.cfnResources.amplifyDynamoDbTables['LiveTrade'].timeToLiveAttribute = {
  attributeName: 'expiresAt',
  enabled: true,
};
const tokenTable         = backend.data.resources.tables['Token'];
const tokenHistoryTable  = backend.data.resources.tables['TokenHistory'];
const globalBoardTable   = backend.data.resources.tables['GlobalLeaderboard'];
// Device push tokens — read by the notification-sending Lambdas; write access
// is for flipping dead tokens (DeviceNotRegistered) to active:false.
const pushDeviceTable    = backend.data.resources.tables['PushDevice'];
// Replay contests — fully separate tables so replay activity never touches live
// contest/global ranking.
const replayContestTable = backend.data.resources.tables['ReplayContest'];
const replayEntryTable   = backend.data.resources.tables['ReplayEntry'];

// --- tickPrices: every minute, refresh Token live prices from CoinGecko once
// for the whole user base (so devices read prices from our backend, not the
// shared CoinGecko key) and keep the valuation crons reading fresh prices ---
const pricesFn = backend.tickPrices.resources.lambda;
tokenTable.grantReadWriteData(pricesFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
pricesFn.addEnvironment('TOKEN_TABLE_NAME', tokenTable.tableName);

new Rule(Stack.of(pricesFn), 'TickPricesRule', {
  schedule: Schedule.rate(Duration.minutes(1)),
  targets: [new LambdaFunction(pricesFn)],
});

// --- tickOhlc: caches per-coin chart history on the TokenHistory table so the
// Trade-screen chart reads from our backend instead of every device hitting the
// shared CoinGecko key. Two schedules invoke the SAME function with different
// `mode` inputs: hourly refreshes the 90-day HOURLY stream (serves 7D/30D/90D),
// daily refreshes the 365-day DAILY stream (serves 1Y). ---
const ohlcFn = backend.tickOhlc.resources.lambda;
tokenTable.grantReadData(ohlcFn);              // symbol -> coingeckoId catalog
tokenHistoryTable.grantReadWriteData(ohlcFn);  // upsert each symbol's history
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
ohlcFn.addEnvironment('TOKEN_TABLE_NAME', tokenTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
ohlcFn.addEnvironment('TOKEN_HISTORY_TABLE_NAME', tokenHistoryTable.tableName);

// Cron (not rate) with offset minutes so the hourly and daily runs NEVER fire in
// the same minute — two concurrent keyless walkers just 429 each other. Hourly at
// :05 every hour; daily at 04:35 UTC (a quiet hour). A full walk takes minutes but
// finishes well before the next hourly tick.
new Rule(Stack.of(ohlcFn), 'TickOhlcHourlyRule', {
  schedule: Schedule.cron({ minute: '5' }),
  targets: [new LambdaFunction(ohlcFn, { event: RuleTargetInput.fromObject({ mode: 'hourly' }) })],
});
new Rule(Stack.of(ohlcFn), 'TickOhlcDailyRule', {
  schedule: Schedule.cron({ minute: '35', hour: '4' }),
  targets: [new LambdaFunction(ohlcFn, { event: RuleTargetInput.fromObject({ mode: 'daily' }) })],
});

// --- tickLeaderboard: runs every 5 minutes ---
const tickFn = backend.tickLeaderboard.resources.lambda;
competitionTable.grantReadData(tickFn);
entryTable.grantReadWriteData(tickFn);
// Reads live Token prices to reprice each entry's holdings before ranking.
tokenTable.grantReadData(tickFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
tickFn.addEnvironment('COMPETITION_ENTRY_TABLE_NAME', entryTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
tickFn.addEnvironment('TOKEN_TABLE_NAME', tokenTable.tableName);

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
// Reads finished CompetitionEntry rows to count contests won per user.
entryTable.grantReadData(globalTickFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
globalTickFn.addEnvironment('USER_PROFILE_TABLE_NAME', profileTableForBoard.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
globalTickFn.addEnvironment('TOKEN_TABLE_NAME', tokenTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
globalTickFn.addEnvironment('GLOBAL_LEADERBOARD_TABLE_NAME', globalBoardTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
globalTickFn.addEnvironment('COMPETITION_ENTRY_TABLE_NAME', entryTable.tableName);
// Push rank-band crossings to the affected users.
pushDeviceTable.grantReadWriteData(globalTickFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
globalTickFn.addEnvironment('PUSH_TOKEN_TABLE_NAME', pushDeviceTable.tableName);

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
// Archive: finished contests are MOVED out of Competition into FinishedCompetition.
const finishedTable = backend.data.resources.tables['FinishedCompetition'];
finishedTable.grantWriteData(closeFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
closeFn.addEnvironment('FINISHED_COMPETITION_TABLE_NAME', finishedTable.tableName);
// Push the winner a "you won" notification at settlement.
pushDeviceTable.grantReadWriteData(closeFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
closeFn.addEnvironment('PUSH_TOKEN_TABLE_NAME', pushDeviceTable.tableName);
// 1099 tracking: roll each prize into the winner's per-tax-year winnings total.
const annualWinningsTable = backend.data.resources.tables['AnnualWinnings'];
annualWinningsTable.grantReadWriteData(closeFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
closeFn.addEnvironment('ANNUAL_WINNINGS_TABLE_NAME', annualWinningsTable.tableName);

new Rule(Stack.of(closeFn), 'CloseCompetitionRule', {
  schedule: Schedule.rate(Duration.minutes(10)),
  targets: [new LambdaFunction(closeFn)],
});

// --- createCompetition: admin invoke only, no schedule ---
const createFn = backend.createCompetition.resources.lambda;
competitionTable.grantWriteData(createFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
createFn.addEnvironment('COMPETITION_TABLE_NAME', competitionTable.tableName);

// --- createWeeklyContest: auto-creates a fresh 7-day XP contest every week ---
const weeklyFn = backend.createWeeklyContest.resources.lambda;
competitionTable.grantWriteData(weeklyFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
weeklyFn.addEnvironment('COMPETITION_TABLE_NAME', competitionTable.tableName);
new Rule(Stack.of(weeklyFn), 'CreateWeeklyContestRule', {
  schedule: Schedule.rate(Duration.days(7)),
  targets: [new LambdaFunction(weeklyFn)],
});

// --- createRollingContest: rolling XP contests on multiple cadences (2h/3h/6h) ---
// Each run ensures the current + next window of EVERY cadence exists, so each has
// one running and one queued. Runs hourly — more frequent than the smallest (2h)
// window — so the next window is always pre-created before the current ends.
// 20-player cap, 5000 XP, free entry. (Idempotent conditional puts → no dupes.)
const rollingFn = backend.createRollingContest.resources.lambda;
competitionTable.grantWriteData(rollingFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
rollingFn.addEnvironment('COMPETITION_TABLE_NAME', competitionTable.tableName);
new Rule(Stack.of(rollingFn), 'CreateRollingContestRule', {
  schedule: Schedule.rate(Duration.hours(1)),
  targets: [new LambdaFunction(rollingFn)],
});

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

// --- settleRecruiterCup: every 5 min, rebuild the Recruiter Cup standings (top
// recruiters by activated referrals this season) for the Compete tab + write each
// referrer's lifetime activatedReferrals back onto UserProfile. ---
const cupFn = backend.settleRecruiterCup.resources.lambda;
const referralTable = backend.data.resources.tables['Referral'];
const cupBoardTable = backend.data.resources.tables['RecruiterCupLeaderboard'];
referralTable.grantReadData(cupFn);
profileTable.grantReadWriteData(cupFn);   // read profiles + write activatedReferrals
cupBoardTable.grantReadWriteData(cupFn);
// WS6: cash settlement of the cup's top-5 (gated OFF via CONTEST_CASH_PRIZES) reuses
// the contest Payout + 1099 rails.
payoutTable.grantReadWriteData(cupFn);
annualWinningsTable.grantReadWriteData(cupFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
cupFn.addEnvironment('REFERRAL_TABLE_NAME', referralTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
cupFn.addEnvironment('USER_PROFILE_TABLE_NAME', profileTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
cupFn.addEnvironment('RECRUITER_CUP_LEADERBOARD_TABLE_NAME', cupBoardTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
cupFn.addEnvironment('PAYOUT_TABLE_NAME', payoutTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
cupFn.addEnvironment('ANNUAL_WINNINGS_TABLE_NAME', annualWinningsTable.tableName);
// Cash-prize gate — mirror the client flag. Dormant (XP-only) until set to 'true'.
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
cupFn.addEnvironment('CONTEST_CASH_PRIZES', process.env.EXPO_PUBLIC_PAYOUTS_ENABLED === 'true' ? 'true' : 'false');

new Rule(Stack.of(cupFn), 'SettleRecruiterCupRule', {
  schedule: Schedule.rate(Duration.minutes(5)),
  targets: [new LambdaFunction(cupFn)],
});

// --- tickReplayLeaderboard: runs every 5 minutes ---
// Reprices each active ReplayEntry against its contest's DETERMINISTIC current
// price (from the contest's own pricesJson + elapsed time — no Token table) and
// re-ranks within each replay contest. No tokenTable grant = proof it can't
// affect live ranking.
const replayTickFn = backend.tickReplayLeaderboard.resources.lambda;
replayContestTable.grantReadData(replayTickFn);
replayEntryTable.grantReadWriteData(replayTickFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
replayTickFn.addEnvironment('REPLAY_CONTEST_TABLE_NAME', replayContestTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
replayTickFn.addEnvironment('REPLAY_ENTRY_TABLE_NAME', replayEntryTable.tableName);

new Rule(Stack.of(replayTickFn), 'TickReplayLeaderboardRule', {
  schedule: Schedule.rate(Duration.minutes(5)),
  targets: [new LambdaFunction(replayTickFn)],
});

// --- closeReplayContest: runs every 10 minutes ---
const closeReplayFn = backend.closeReplayContest.resources.lambda;
replayContestTable.grantReadWriteData(closeReplayFn);
replayEntryTable.grantReadWriteData(closeReplayFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
closeReplayFn.addEnvironment('REPLAY_CONTEST_TABLE_NAME', replayContestTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
closeReplayFn.addEnvironment('REPLAY_ENTRY_TABLE_NAME', replayEntryTable.tableName);

new Rule(Stack.of(closeReplayFn), 'CloseReplayContestRule', {
  schedule: Schedule.rate(Duration.minutes(10)),
  targets: [new LambdaFunction(closeReplayFn)],
});

// --- priceWatch: every minute, evaluate persisted alerts/limit orders against
// live CoinGecko prices; push alerts and fill limit orders authoritatively ---
const priceWatchFn = backend.priceWatch.resources.lambda;
const priceAlertTable = backend.data.resources.tables['PriceAlert'];
const limitOrderTable = backend.data.resources.tables['LimitOrder'];
priceAlertTable.grantReadWriteData(priceWatchFn);  // claim (active true→false)
limitOrderTable.grantReadWriteData(priceWatchFn);  // claim + consume
profileTable.grantReadWriteData(priceWatchFn);     // server-authoritative fills
tradeTable.grantWriteData(priceWatchFn);           // write the fill Trade row
tokenTable.grantReadData(priceWatchFn);            // symbol → coingeckoId catalog
pushDeviceTable.grantReadWriteData(priceWatchFn);  // notify the user
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
priceWatchFn.addEnvironment('PRICE_ALERT_TABLE_NAME', priceAlertTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
priceWatchFn.addEnvironment('LIMIT_ORDER_TABLE_NAME', limitOrderTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
priceWatchFn.addEnvironment('USER_PROFILE_TABLE_NAME', profileTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
priceWatchFn.addEnvironment('TRADE_TABLE_NAME', tradeTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
priceWatchFn.addEnvironment('TOKEN_TABLE_NAME', tokenTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
priceWatchFn.addEnvironment('PUSH_TOKEN_TABLE_NAME', pushDeviceTable.tableName);

new Rule(Stack.of(priceWatchFn), 'PriceWatchRule', {
  schedule: Schedule.rate(Duration.minutes(1)),
  targets: [new LambdaFunction(priceWatchFn)],
});

// --- notificationDispatcher: every minute, send due admin push campaigns ---
const dispatchFn = backend.notificationDispatcher.resources.lambda;
const campaignTable = backend.data.resources.tables['NotificationCampaign'];
campaignTable.grantReadWriteData(dispatchFn);   // claim + write back stats
pushDeviceTable.grantReadWriteData(dispatchFn); // read tokens + deactivate dead ones
profileTable.grantReadData(dispatchFn);         // resolve league / xp audiences
entryTable.grantReadData(dispatchFn);           // resolve specific-contest audiences
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
dispatchFn.addEnvironment('NOTIFICATION_CAMPAIGN_TABLE_NAME', campaignTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
dispatchFn.addEnvironment('PUSH_TOKEN_TABLE_NAME', pushDeviceTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
dispatchFn.addEnvironment('USER_PROFILE_TABLE_NAME', profileTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
dispatchFn.addEnvironment('COMPETITION_ENTRY_TABLE_NAME', entryTable.tableName);

new Rule(Stack.of(dispatchFn), 'NotificationDispatcherRule', {
  schedule: Schedule.rate(Duration.minutes(1)),
  targets: [new LambdaFunction(dispatchFn)],
});

// --- stripeConnect: backs the payout onboarding / status / claim / wallet
// (claimPrize, requestWithdrawal, list/setPayoutMethod) mutations ---
const stripeConnectFn = backend.stripeConnect.resources.lambda;
stripeAccountTable.grantReadWriteData(stripeConnectFn);
payoutTable.grantReadWriteData(stripeConnectFn);
withdrawalReqTable.grantReadWriteData(stripeConnectFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
stripeConnectFn.addEnvironment('STRIPE_ACCOUNT_TABLE_NAME', stripeAccountTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
stripeConnectFn.addEnvironment('PAYOUT_TABLE_NAME', payoutTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
stripeConnectFn.addEnvironment('WITHDRAWAL_REQUEST_TABLE_NAME', withdrawalReqTable.tableName);
// W-9 gate: read the payee's annual winnings before allowing a withdrawal.
annualWinningsTable.grantReadData(stripeConnectFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
stripeConnectFn.addEnvironment('ANNUAL_WINNINGS_TABLE_NAME', annualWinningsTable.tableName);
// W-9 capture: setW9Collected writes the TaxForm record + flips w9CollectedAt.
const taxFormTable = backend.data.resources.tables['TaxForm'];
taxFormTable.grantReadWriteData(stripeConnectFn);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
stripeConnectFn.addEnvironment('TAX_FORM_TABLE_NAME', taxFormTable.tableName);

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

// --- processWithdrawals: daily batch payout of pending withdrawal requests ---
const withdrawFn = backend.processWithdrawals.resources.lambda;
withdrawalReqTable.grantReadWriteData(withdrawFn);   // claim + finish requests
payoutTable.grantReadWriteData(withdrawFn);          // verify + flip withdrawn
stripeAccountTable.grantReadWriteData(withdrawFn);   // read account + refund balance
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
withdrawFn.addEnvironment('WITHDRAWAL_REQUEST_TABLE_NAME', withdrawalReqTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
withdrawFn.addEnvironment('PAYOUT_TABLE_NAME', payoutTable.tableName);
// @ts-expect-error addEnvironment exists on the concrete Function, not on IFunction
withdrawFn.addEnvironment('STRIPE_ACCOUNT_TABLE_NAME', stripeAccountTable.tableName);

new Rule(Stack.of(withdrawFn), 'ProcessWithdrawalsRule', {
  schedule: Schedule.rate(Duration.days(1)),
  targets: [new LambdaFunction(withdrawFn)],
});
