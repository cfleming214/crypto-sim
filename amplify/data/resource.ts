import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  UserProfile: a.model({
    handle: a.string().required(),
    xp: a.integer(),
    league: a.string(),
    division: a.integer(),
    streak: a.integer(),
    cash: a.float(),
    bankroll: a.float(),
    riskScore: a.integer(),
    holdingsJson: a.string(),
    avatarKey: a.string(),       // S3 storage key (e.g. "profile.jpg") — full path is avatars/{identityId}/{avatarKey}
    avatarColor: a.string(),
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
  }).authorization(allow => [
    allow.authenticated().to(['read']),
    allow.owner(),
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
    // Each contest gives the player a fresh $10K and tracks its own holdings
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

  // PublicProfile is the discoverable face of a UserProfile — same owner
  // writes it, but every authenticated user can read it for trader
  // discovery / copy-trade. Kept in sync by the client whenever UserProfile
  // changes (see portfolioService.saveProfile).
  PublicProfile: a.model({
    handle:      a.string().required(),
    league:      a.string(),
    bankroll:    a.float(),
    pnlPct:      a.float(),       // (bankroll - 10000) / 10000 * 100
    winRate:     a.float(),       // 0..100
    tradeCount:  a.integer(),
    avatarKey:   a.string(),
    avatarColor: a.string(),
  }).authorization(allow => [
    allow.authenticated().to(['read']),
    allow.owner(),
  ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
