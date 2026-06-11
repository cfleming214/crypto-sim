import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { stripeConnect } from '../functions/stripe-connect/resource.js';

const schema = a.schema({
  UserProfile: a.model({
    handle: a.string().required(),
    xp: a.integer(),
    league: a.string(),
    division: a.integer(),
    streak: a.integer(),
    // Lifetime count of contests finished in 1st place — the secondary
    // leaderboard ranking (alongside XP). Seeded for bots; for real users the
    // tick-global-leaderboard Lambda also derives it from won CompetitionEntry
    // rows and takes the max, so it stays correct even if this is left 0.
    contestsWon: a.integer(),
    cash: a.float(),
    bankroll: a.float(),
    riskScore: a.integer(),
    holdingsJson: a.string(),
    avatarKey: a.string(),       // S3 storage key (e.g. "profile.jpg") — full path is avatars/{identityId}/{avatarKey}
    avatarColor: a.string(),
    // Local gamification blob (daily-claim, achievements, prediction stats) for
    // cross-device sync — written by the client.
    gamificationJson: a.string(),
    // Whether this user appears on the public global leaderboard. null/undefined
    // = visible (opt-out default). The tick-global-leaderboard Lambda reads it to
    // include/exclude the user; toggling it off in Settings just flips this flag
    // (no row deletion), so there's nothing to spam-delete.
    leaderboardVisible: a.boolean(),
    // Recorded portfolio-balance history (private, full-fidelity backup of the
    // local equity-snapshot store) so the chart survives reinstall / new device.
    // JSON array of {t,v}; downsampled to hourly+daily before write, flushed on
    // a throttled cadence by the client (see services/equitySnapshots.ts).
    equityHistoryJson: a.string(),
    // Season baseline XP, written ONLY by the settle-season Lambda each week.
    // seasonXp = xp - seasonStartXp drives league/division. Kept out of
    // gamificationJson so client saves never clobber it.
    seasonStartXp: a.integer(),
  }).authorization(allow => [allow.owner()]),

  Trade: a.model({
    tradeId: a.string().required(),
    symbol: a.string().required(),
    side: a.string().required(),
    amount: a.float().required(),
    units: a.float().required(),
    price: a.float().required(),
    xpEarned: a.integer(),
    slippage: a.float(),
    // Original client trade time (ms epoch). The row's createdAt is the cloud
    // write time, which is wrong for trades bulk-saved on sign-up adoption;
    // this preserves the real ordering for equity reconstruction. Optional for
    // back-compat with rows written before this field existed.
    timestamp: a.float(),
  }).authorization(allow => [allow.owner()]),

  LeaderboardEntry: a.model({
    tournamentId: a.string().required(),
    handle: a.string().required(),
    rank: a.integer(),
    bankroll: a.float(),
    pnlPct: a.float(),
    league: a.string(),
  }).authorization(allow => [
    allow.authenticated().to(['read']),
    allow.owner(),
  ]),

  Competition: a.model({
    name: a.string().required(),
    type: a.string().required(),    // 'daily' | 'featured' | 'replay' | '1v1'
    status: a.string().required(),  // 'open' | 'live' | 'finished'
    prizePool: a.string(),
    maxPlayers: a.integer(),
    stake: a.string(),
    startAt: a.string().required(), // ISO timestamp
    endAt: a.string().required(),   // ISO timestamp
    entryCount: a.integer(),
    createdBy: a.string(),
    numberOfPrizes: a.integer(),    // length of the prizes array
    prizesJson: a.string(),         // JSON array of dollar amounts, e.g. "[100,50,20,10,5]"
    // Headline XP awarded to the winner when cash prizes are off (the podium
    // splits it 100/50/25%). Null on legacy rows → client falls back to
    // DEFAULT_PRIZE_XP (5000).
    prizeXp: a.integer(),
    // Token symbols this contest restricts trading to. Empty / null = all
    // practice-enabled tokens are allowed (default for legacy rows).
    allowedTokenSymbols: a.string().array(),
    // 1v1 duels (type === '1v1'): a short shareable code the opponent enters to
    // join, and the challenger's handle for display. Null on normal contests.
    inviteCode: a.string(),
    challengerHandle: a.string(),
    // When true, the contest stops accepting new entries once it has started
    // (now >= startAt). Null/false (default, legacy rows) = players can still
    // join live after the start.
    lockAfterStart: a.boolean(),
  }).authorization(allow => [
    allow.authenticated().to(['read']),
    allow.owner(),
  ]),

  // Archive of contests that have ended. The closeCompetition Lambda MOVES a
  // finished contest here (copy + delete from Competition) so the live tables
  // only ever hold open/live contests, and the app reads this table for its
  // "Past" list. Same shape as Competition plus finishedAt.
  FinishedCompetition: a.model({
    name: a.string().required(),
    type: a.string().required(),
    status: a.string().required(),   // always 'finished'
    prizePool: a.string(),
    maxPlayers: a.integer(),
    stake: a.string(),
    startAt: a.string().required(),
    endAt: a.string().required(),
    entryCount: a.integer(),
    createdBy: a.string(),
    numberOfPrizes: a.integer(),
    prizesJson: a.string(),
    prizeXp: a.integer(),
    allowedTokenSymbols: a.string().array(),
    inviteCode: a.string(),
    challengerHandle: a.string(),
    lockAfterStart: a.boolean(),
    finishedAt: a.string(),          // ISO timestamp the contest was archived
  }).authorization(allow => [
    allow.authenticated().to(['read']),
  ]),

  CompetitionEntry: a.model({
    competitionId: a.string().required(),
    handle: a.string().required(),
    bankroll: a.float(),
    pnlPct: a.float(),
    rank: a.integer(),
    joinedAt: a.string().required(), // ISO timestamp
    isActive: a.boolean(),
    // Per-contest portfolio — separate from the user's main UserProfile.
    // Each contest gives the player a fresh $100K and tracks its own holdings
    // and trade history independently.
    cash: a.float(),
    holdingsJson: a.string(),
    tradesJson: a.string(),
  }).authorization(allow => [
    allow.authenticated().to(['read']),
    allow.owner(),
  ]),

  Mirror: a.model({
    leaderId: a.string().required(),   // owner (userId) of the trader being copied
    followerId: a.string().required(), // userId of the copier
    allocation: a.float().required(),  // dollar amount allocated to mirror
    maxPositionPct: a.float(),         // max % of allocation in any one coin (0–1)
    active: a.boolean(),
  }).authorization(allow => [allow.owner()]),

  CoachNudge: a.model({
    message: a.string().required(),
    severity: a.string().required(),   // 'info' | 'warn' | 'tip'
    createdAt: a.string().required(),  // ISO timestamp
    dismissed: a.boolean(),
  }).authorization(allow => [allow.owner()]),

  // User-content moderation reports. Written by the client whenever a user
  // flags content or blocks another trader (a block also files a report, per
  // App Store guideline 1.2 — "blocking should also notify the developer").
  // The reporter owns the row; the developer reviews/actions open reports in
  // the AWS console / crypto-dashboard (direct DynamoDB, no per-user read).
  Report: a.model({
    reportedOwner:  a.string().required(), // PublicProfile.owner (Cognito sub) of the reported trader
    reportedHandle: a.string(),            // their handle at report time, for display
    context:        a.string(),            // 'trader_profile' | 'leaderboard' | 'duel'
    reason:         a.string().required(), // 'block' | 'spam' | 'harassment' | 'inappropriate' | 'other'
    note:           a.string(),            // optional free-text detail
    reporterHandle: a.string(),            // who filed it
    status:         a.string(),            // 'open' | 'actioned'
  }).authorization(allow => [allow.owner()]),

  // PublicProfile is the discoverable face of a UserProfile — same owner
  // writes it, but every authenticated user can read it for trader
  // discovery / copy-trade. Kept in sync by the client whenever UserProfile
  // changes (see portfolioService.saveProfile).
  PublicProfile: a.model({
    handle:      a.string().required(),
    league:      a.string(),
    bankroll:    a.float(),
    pnlPct:      a.float(),       // (bankroll - 100000) / 100000 * 100
    winRate:     a.float(),       // 0..100
    tradeCount:  a.integer(),
    avatarKey:   a.string(),
    avatarColor: a.string(),
    // Rolling equity history for the trader's chart. JSON array of {t, v}
    // where t is ms epoch and v is bankroll at that moment. Capped to last
    // 168 points (~1 week of hourly snapshots) to keep the doc bounded.
    equityHistoryJson: a.string(),
    // Last ~10 trades the user made, for the "recent trades" feed on their
    // public profile. JSON array of { symbol, side, amount, units, price, t }.
    recentTradesJson: a.string(),
  }).authorization(allow => [
    allow.authenticated().to(['read']),
    allow.owner(),
  ]),

  // Catalog of tradeable tokens, populated by the crypto-dashboard admin from
  // CoinGecko. Writes happen directly against DynamoDB from the dashboard
  // server (bypassing AppSync), so no allow.owner() rule is needed — this row
  // has no per-user owner. The app reads via Amplify Data client.
  Token: a.model({
    symbol:             a.string().required(),     // canonical uppercase, e.g. "BTC"
    name:               a.string().required(),
    coingeckoId:        a.string().required(),     // e.g. "bitcoin"
    rank:               a.integer(),               // market-cap rank at last seed
    imageUrl:           a.string(),
    enabledForPractice: a.boolean(),               // true => tradeable in free-play mode
    lastPrice:          a.float(),                 // USD snapshot at last seed (display only)
    marketCapRaw:       a.float(),
    volumeRaw:          a.float(),
    lastSeededAt:       a.string(),                // ISO timestamp of the most recent seed
  }).authorization(allow => [
    allow.authenticated().to(['read']),
  ]),

  // Precomputed global leaderboard — a small, bounded (top ~100) table the
  // tick-global-leaderboard Lambda rebuilds every few minutes by valuing each
  // visible user's holdings at current Token prices and ranking them. Phones
  // just read this (cheap) instead of subscribing to every profile change.
  // Row id = the rank string ("1".."100"). Lambda writes via the DynamoDB SDK
  // (bypasses model authz, like Token); clients only read. No holdings exposed.
  GlobalLeaderboard: a.model({
    rank:        a.integer().required(), // XP rank (primary board order)
    owner:       a.string().required(),  // Cognito sub — self-highlight + block filter
    handle:      a.string().required(),
    xp:          a.integer(),            // lifetime XP — the primary ranking metric
    contestsWon: a.integer(),            // lifetime contests won (secondary metric)
    winsRank:    a.integer(),            // rank by contestsWon across all users
    value:       a.float(),              // live-priced bankroll = cash + Σ holdings×price (secondary stat)
    pnlPct:      a.float(),
    league:      a.string(),
    avatarKey:   a.string(),
    avatarColor: a.string(),
    updatedAt:   a.string(),
  }).authorization(allow => [
    allow.authenticated().to(['read']),
  ]),

  // A user's Stripe Connect (Express) account, used to pay out contest prizes.
  // The row's `id` is deliberately the Cognito userId (the `sub`) so the
  // settlement Lambda can resolve owner -> account with a single GetItem (the
  // UserProfile table uses a random id and is NOT queryable by user). The
  // stripeConnect / stripeWebhook Lambdas write every field via the DynamoDB
  // SDK (bypassing model authz, like the Token catalog); the client only reads
  // its own row to render onboarding status.
  StripeAccount: a.model({
    stripeAccountId:  a.string(),   // "acct_..." from Stripe
    payoutsEnabled:   a.boolean(),  // capabilities.transfers active — can receive Transfers
    detailsSubmitted: a.boolean(),  // finished the onboarding form
    status:           a.string(),   // 'onboarding' | 'enabled' | 'restricted'
  }).authorization(allow => [allow.owner().to(['read'])]),

  // One row per prize owed to a winner. Created by close-competition when a
  // contest finishes: auto-paid (status 'paid') if the winner has already
  // onboarded, otherwise 'pending' until they claim it. Drives the Earnings tab.
  // `userId` is the winner's Cognito sub (== StripeAccount.id) so the claim
  // mutation can verify ownership without depending on the owner-field format.
  Payout: a.model({
    competitionId:    a.string().required(),
    competitionName:  a.string(),
    userId:           a.string().required(),  // Cognito sub of the winner
    rank:             a.integer(),
    amountCents:      a.integer().required(),  // prizesJson dollars * 100
    status:           a.string().required(),   // 'pending'|'processing'|'paid'|'failed'
    stripeTransferId: a.string(),
    createdAt:        a.string().required(),
    paidAt:           a.string(),
  }).authorization(allow => [allow.owner().to(['read'])]),

  // --- Stripe payout custom mutations (client -> stripeConnect Lambda) ---
  // AppSync passes the authenticated identity (event.identity) to the handler,
  // which disambiguates by event.fieldName. Each returns an a.json() blob.
  startPayoutOnboarding: a.mutation()
    .returns(a.json())
    .handler(a.handler.function(stripeConnect))
    .authorization(allow => [allow.authenticated()]),

  refreshPayoutStatus: a.mutation()
    .returns(a.json())
    .handler(a.handler.function(stripeConnect))
    .authorization(allow => [allow.authenticated()]),

  claimPayout: a.mutation()
    .arguments({ payoutId: a.string().required() })
    .returns(a.json())
    .handler(a.handler.function(stripeConnect))
    .authorization(allow => [allow.authenticated()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
