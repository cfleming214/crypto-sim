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
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
