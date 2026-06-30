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
    // ISO timestamp of the user's last foreground heartbeat (see
    // portfolioService.touchPresence). Drives the online/away/offline dot on
    // avatars; carried onto GlobalLeaderboard/PublicProfile for other viewers.
    lastActiveAt: a.string(),
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
    // True for real-money cash-prize contests. Payments-off builds query
    // `cashPrize <> true` so these rows never reach those devices.
    cashPrize: a.boolean(),
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
    // Fraction of elapsed time (0..1) after which joining closes. e.g. 0.9 =
    // "joinable until only 10% of the duration remains". Null (default/legacy) =
    // joinable until the contest ends. Enforced client-side (see isJoinLocked).
    joinCutoffPct: a.float(),
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
    cashPrize: a.boolean(),          // mirrors Competition.cashPrize (carried on archive)
    allowedTokenSymbols: a.string().array(),
    inviteCode: a.string(),
    challengerHandle: a.string(),
    lockAfterStart: a.boolean(),
    joinCutoffPct: a.float(),         // mirrors Competition.joinCutoffPct (carried on archive)
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

  // ── Replay contests ───────────────────────────────────────────────────────
  // A competitive 7-day replay of a real historical window for a single coin.
  // Fully separate from the live Competition tables/Lambdas so replay trading
  // never touches live ranking. The current price is a deterministic function of
  // elapsed real time over `pricesJson` (real 1-minute closes) — every client and
  // the tick-replay-leaderboard Lambda compute it identically, so the leaderboard
  // is fair. The seed script writes these (createdBy 'replay-seed').
  ReplayContest: a.model({
    eventId: a.string().required(),       // e.g. 'bull-run-2021'
    eventTitle: a.string().required(),
    coin: a.string().required(),          // the single tradeable coin, e.g. 'BTC'
    weekIndex: a.integer(),               // which 7-day window of the era
    histStartIso: a.string().required(),  // ISO date of prices[0] — drives the date label
    startAt: a.string().required(),       // ISO real-clock start of the contest
    endAt: a.string().required(),         // ISO (startAt + 7 days)
    status: a.string().required(),        // 'open' | 'live' | 'finished'
    intervalMs: a.integer(),              // ms per price step (60000 = 1 minute)
    pricesJson: a.string().required(),    // JSON array of ~10,080 real minute closes (~80KB)
    maxPlayers: a.integer(),
    prizeXp: a.integer(),
    lockAfterStart: a.boolean(),
    entryCount: a.integer(),
    createdBy: a.string(),
  }).authorization(allow => [
    allow.authenticated().to(['read']),
    allow.owner(),
  ]),

  // A player's portfolio within a replay contest. Mirrors CompetitionEntry but
  // in a separate table so replay activity never appears in live contest ranking.
  ReplayEntry: a.model({
    replayContestId: a.string().required(),
    handle: a.string().required(),
    bankroll: a.float(),
    pnlPct: a.float(),
    rank: a.integer(),
    joinedAt: a.string().required(),
    isActive: a.boolean(),
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
    // Current portfolio allocation (weights), so others can copy the same mix.
    // JSON array of { symbol, pct } where pct is % of the trader's equity; the
    // remainder (100 − Σpct) is cash. No dollar amounts are exposed.
    allocationJson: a.string(),
    // ISO timestamp of the trader's last heartbeat, mirrored from UserProfile so
    // the copy-trade screen can show an online/away/offline dot.
    lastActiveAt: a.string(),
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
    lastPrice:          a.float(),                 // live USD price, refreshed every minute by tick-prices
    change24h:          a.float(),                 // 24h % change
    high24h:            a.float(),
    low24h:             a.float(),
    sparklineJson:      a.string(),                // JSON array of the last ~24 hourly closes
    priceUpdatedAt:     a.string(),                // ISO timestamp of the last live-price refresh
    marketCapRaw:       a.float(),
    volumeRaw:          a.float(),
    lastSeededAt:       a.string(),                // ISO timestamp of the most recent seed
  }).authorization(allow => [
    allow.authenticated().to(['read']),
  ]),

  // Server-cached price history for the Trade-screen chart, keyed by symbol so a
  // device fetches ONE row when opening a coin. The tick-ohlc Lambda refreshes it
  // (hourly stream every hour, daily stream once a day) with a single CoinGecko
  // request per coin for the whole user base — so charts stop hitting the shared
  // CoinGecko key from every device (the same scaling fix as Token/tick-prices).
  // Two granularity tiers, because CoinGecko's market_chart auto-granularity ties
  // resolution to the range: the 90-day HOURLY stream serves 7D/30D/90D by
  // timestamp-slicing; the 365-day DAILY stream serves 1Y. Stored as the raw
  // [[ms, price], ...] arrays CoinGecko returns; the client synthesizes candles.
  // Writes happen via the DynamoDB SDK (bypassing model authz, like Token); the
  // app only reads.
  TokenHistory: a.model({
    symbol:          a.string().required(),   // canonical uppercase, e.g. "BTC" — the identifier
    coingeckoId:     a.string(),              // e.g. "bitcoin"
    hourlyJson:      a.string(),              // JSON [[ms, price], ...] ~90 days hourly
    hourlyUpdatedAt: a.string(),              // ISO timestamp of the last hourly refresh
    dailyJson:       a.string(),              // JSON [[ms, price], ...] ~365 days daily
    dailyUpdatedAt:  a.string(),              // ISO timestamp of the last daily refresh
  })
    .identifier(['symbol'])
    .authorization(allow => [
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
    weeklyXp:    a.integer(),            // XP earned this season-week (xp − seasonStartXp) — drives Weekly Leagues
    contestsWon: a.integer(),            // lifetime contests won (secondary metric)
    winsRank:    a.integer(),            // rank by contestsWon across all users
    value:       a.float(),              // live-priced bankroll = cash + Σ holdings×price (secondary stat)
    pnlPct:      a.float(),
    league:      a.string(),
    avatarKey:   a.string(),
    avatarColor: a.string(),
    updatedAt:   a.string(),
    // ISO timestamp of the user's last heartbeat (copied from UserProfile by the
    // tick Lambda) — drives the presence dot on the leaderboard.
    lastActiveAt: a.string(),
  }).authorization(allow => [
    allow.authenticated().to(['read']),
  ]),

  // One row per device push token. The client registers/refreshes its own row
  // (owner-auth); the send Lambdas (close-competition, tick-global-leaderboard,
  // price-watch, notification-dispatcher) read every active token for a given
  // Cognito sub via the DynamoDB SDK (bypassing model authz, like Token /
  // GlobalLeaderboard). The row id IS the Expo token string, so re-registering
  // the same device is an idempotent upsert and a DeviceNotRegistered receipt
  // can flip `active` with a single keyed UpdateItem.
  PushDevice: a.model({
    token:      a.string().required(),   // ExpoPushToken[...] — also the identifier
    userId:     a.string().required(),   // bare Cognito sub (== owner.split('::')[0])
    platform:   a.string(),              // 'ios' | 'android'
    deviceName: a.string(),
    active:     a.boolean(),             // false on opt-out or DeviceNotRegistered
    updatedAt:  a.string(),
  }).identifier(['token']).authorization(allow => [allow.owner()]),

  // Persisted price alerts and limit orders so the server-side price-watch cron
  // can evaluate them while the app is closed (they used to be in-memory only).
  // Owner-auth — the client CRUDs its own rows and hydrates them on launch. The
  // row id IS the client-generated id ('ALT-...' / 'LMT-...') so create/delete is
  // a keyed upsert and the cron can claim a row with a single conditional update.
  // The auto `owner` field tells the cron whose portfolio to act on.
  PriceAlert: a.model({
    alertId:     a.string().required(),  // client id 'ALT-...' — identifier
    symbol:      a.string().required(),
    targetPrice: a.float().required(),
    direction:   a.string().required(),  // 'above' | 'below'
    active:      a.boolean(),            // false once it fires (or is dismissed)
    createdAt:   a.string(),
  }).identifier(['alertId']).authorization(allow => [allow.owner()]),

  LimitOrder: a.model({
    orderId:    a.string().required(),   // client id 'LMT-...' — identifier
    symbol:     a.string().required(),
    side:       a.string().required(),   // 'buy' | 'sell'
    amount:     a.float().required(),
    limitPrice: a.float().required(),
    active:     a.boolean(),             // false once filled (or cancelled)
    createdAt:  a.string(),
  }).identifier(['orderId']).authorization(allow => [allow.owner()]),

  // Admin-authored push campaign. Composed + scheduled from the crypto-dashboard
  // (direct DynamoDB writes, like Token); the notification-dispatcher cron sends
  // it when due and writes back the send stats. Clients only read (the app could
  // surface a "sent" history); admin writes bypass model authz via the SDK.
  NotificationCampaign: a.model({
    title:          a.string().required(),
    body:           a.string().required(),
    dataJson:       a.string(),              // tap-routing payload, e.g. {"type":"announcement"}
    criteriaJson:   a.string().required(),   // audience selector (see notification-dispatcher)
    scheduledAt:    a.string().required(),   // ISO — dispatcher fires when now >= this
    status:         a.string().required(),   // 'scheduled' | 'sending' | 'sent' | 'canceled'
    audienceSize:   a.integer(),
    sentCount:      a.integer(),
    deliveredCount: a.integer(),
    failedCount:    a.integer(),
    createdBy:      a.string(),              // admin email, stamped from the JWT
    createdAt:      a.string(),
    updatedAt:      a.string(),
    sentAt:         a.string(),
  }).authorization(allow => [allow.authenticated().to(['read'])]),

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
    // The user's chosen default payout method (a Stripe external account on their
    // connected account). setPayoutMethod marks it default_for_currency in Stripe
    // and records it here for display; the daily withdrawal transfer relies on
    // Stripe routing to the connected account's default external account.
    preferredMethodId:    a.string(),  // "ba_..." / "card_..." external-account id
    preferredMethodLabel: a.string(),  // e.g. "Bank •••• 6789"
    // Withdrawable real-money balance, in cents. The row is keyed by the bare
    // Cognito sub (id = userId), so the payout Lambdas credit (claimPrize) and
    // reserve (requestWithdrawal) it with a single keyed UpdateItem — no scan.
    // claimPrize upserts this row even before onboarding, so a winner can build a
    // balance and only needs Stripe to WITHDRAW. The client reads its own row.
    balanceCents:     a.integer(),
    // ISO timestamp of when the user's W-9 was collected (tax form on file). The
    // payout Lambdas require this before a transfer that would cross $600 in
    // winnings for the calendar year (IRS 1099-MISC threshold). Null = not on file.
    w9CollectedAt:    a.string(),
  }).authorization(allow => [allow.owner().to(['read'])]),

  // One row per prize owed to a winner, id "<competitionId>#<userId>". Created
  // by close-competition as 'unclaimed' (no auto-transfer). Lifecycle:
  //   unclaimed → (claimPrize) claimed → (requestWithdrawal reserves it) →
  //   (process-withdrawals pays) withdrawn.
  // The `claimed` and `withdrawn` booleans are the double-payout guards: a prize
  // can be credited to the balance once, and paid out once. `userId` is the
  // winner's Cognito sub (== StripeAccount.id) so the Lambdas verify ownership
  // without depending on the owner-field format.
  Payout: a.model({
    competitionId:    a.string().required(),
    competitionName:  a.string(),
    userId:           a.string().required(),  // Cognito sub of the winner
    rank:             a.integer(),
    amountCents:      a.integer().required(),  // prizesJson dollars * 100
    status:           a.string().required(),   // 'unclaimed'|'claimed'|'withdrawn'
    // Credited-to-balance guard. Set true by claimPrize; once true the prize
    // can't be claimed (double-credited) again.
    claimed:          a.boolean(),
    claimedAt:        a.string(),
    // Paid-out guard. Set true by process-withdrawals once the Stripe transfer
    // for the owning withdrawal request succeeds.
    withdrawn:        a.boolean(),
    // Reserves this prize into a pending WithdrawalRequest (set at request time,
    // cleared if that request fails). Prevents a second request grabbing it.
    withdrawalRequestId: a.string(),
    stripeTransferId: a.string(),
    createdAt:        a.string().required(),
    paidAt:           a.string(),
  }).authorization(allow => [allow.owner().to(['read'])]),

  // A user's request to withdraw their full available balance. Created by the
  // requestWithdrawal mutation (only if Stripe-onboarded); processed once a day
  // by the process-withdrawals Lambda, which re-verifies every contest funding
  // it before transferring. `payoutsJson` lists the contributing Payout ids;
  // `verificationJson` records the per-contest check results for the admin audit
  // view. Client reads its own rows to show withdrawal history/status; all
  // writes come from the Lambdas via the DynamoDB SDK.
  WithdrawalRequest: a.model({
    userId:           a.string().required(),  // Cognito sub of the requester
    handle:           a.string(),
    email:            a.string(),             // captured at request time → confirmation + "paid" emails
    amountCents:      a.integer().required(),
    status:           a.string().required(),  // 'pending'|'processing'|'paid'|'failed'|'rejected'
    method:           a.string(),             // preferred external-account id at request time
    methodLabel:      a.string(),             // e.g. "Bank •••• 6789"
    payoutsJson:      a.string(),             // JSON array of contributing Payout ids
    verificationJson: a.string(),             // JSON: per-contest {winner, claimed, notWithdrawn, ok}
    stripeTransferId: a.string(),
    failureReason:    a.string(),
    createdAt:        a.string().required(),
    processedAt:      a.string(),
  }).authorization(allow => [allow.owner().to(['read'])]),

  // Per-user, per-tax-year cash-winnings rollup for IRS 1099-MISC reporting.
  // id = "<userId>#<taxYear>". close-competition adds each prize's amountCents
  // here (UpdateItem ADD) at settlement, and flips `w9Required` once the year's
  // total crosses $600. The export-1099 script scans this for filing. Lambdas
  // write directly via DynamoDB; the client reads its own rows (owner-auth).
  AnnualWinnings: a.model({
    userId:     a.string().required(),  // Cognito sub
    taxYear:    a.integer().required(),
    totalCents: a.integer().required(), // cumulative cash winnings this tax year
    w9Required: a.boolean(),            // true once totalCents >= $600
    updatedAt:  a.string(),
  })
    .secondaryIndexes((index) => [
      index('userId').queryField('annualWinningsByUser'),
    ])
    .authorization(allow => [allow.owner().to(['read'])]),

  // Tax form (W-9) capture record. We do NOT store raw SSN/TIN here — collection
  // happens via Stripe (tax/identity) and we keep only a reference + status. One
  // row per user per tax year. `providerRef` points at the Stripe-side record.
  TaxForm: a.model({
    userId:      a.string().required(),  // Cognito sub
    taxYear:     a.integer().required(),
    type:        a.string().required(),  // 'W9'
    status:      a.string().required(),  // 'pending' | 'collected'
    providerRef: a.string(),             // Stripe tax-form / file reference (never the raw TIN)
    capturedAt:  a.string(),
  }).authorization(allow => [allow.owner()]),

  // Global "live trades" ticker — a public feed of recent trades across all
  // users, shown on the Compete tab. Each user writes their own rows (owner
  // auth); everyone reads. `feed` is a constant ('global') so a single secondary
  // index sorted by `tradedAt` can return the latest N with one query (no scan).
  // `expiresAt` (epoch seconds) drives a DynamoDB TTL so the feed self-prunes
  // (see backend.ts). Only broadcast for users who are visible on the
  // leaderboard — the client gates the write on that opt-in.
  LiveTrade: a.model({
    feed:        a.string().required(),   // always 'global'
    handle:      a.string().required(),
    symbol:      a.string().required(),
    side:        a.string().required(),   // 'buy' | 'sell'
    amountUsd:   a.float(),
    units:       a.float(),
    price:       a.float(),
    avatarColor: a.string(),
    tradedAt:    a.string().required(),   // ISO — sort key for recency
    expiresAt:   a.integer(),             // epoch seconds — DynamoDB TTL
  })
    .secondaryIndexes((index) => [
      index('feed').sortKeys(['tradedAt']).queryField('liveTradesByFeed'),
    ])
    .authorization(allow => [
      allow.authenticated().to(['read']),
      allow.owner(),
    ]),

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

  // Credit a won prize to the user's withdrawable balance (sets Payout.claimed).
  claimPrize: a.mutation()
    .arguments({ payoutId: a.string().required() })
    .returns(a.json())
    .handler(a.handler.function(stripeConnect))
    .authorization(allow => [allow.authenticated()]),

  // Open a pending withdrawal of the user's full available balance.
  requestWithdrawal: a.mutation()
    .returns(a.json())
    .handler(a.handler.function(stripeConnect))
    .authorization(allow => [allow.authenticated()]),

  // List the Stripe external accounts (banks/cards) on the user's connected
  // account so they can choose a default payout method.
  listPayoutMethods: a.mutation()
    .returns(a.json())
    .handler(a.handler.function(stripeConnect))
    .authorization(allow => [allow.authenticated()]),

  // Set the chosen external account as the default payout method.
  setPayoutMethod: a.mutation()
    .arguments({ externalAccountId: a.string().required() })
    .returns(a.json())
    .handler(a.handler.function(stripeConnect))
    .authorization(allow => [allow.authenticated()]),

  // Record that the user's W-9 was collected (called after the real W-9/TIN
  // capture completes via Stripe). Sets StripeAccount.w9CollectedAt and writes a
  // TaxForm row, which opens the withdrawal gate for $600+ winners. `providerRef`
  // points at the Stripe-side record — never the raw TIN.
  setW9Collected: a.mutation()
    .arguments({ providerRef: a.string() })
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
