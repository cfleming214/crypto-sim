"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
const backend_1 = require("@aws-amplify/backend");
const schema = backend_1.a.schema({
    UserProfile: backend_1.a.model({
        handle: backend_1.a.string().required(),
        xp: backend_1.a.integer(),
        league: backend_1.a.string(),
        division: backend_1.a.integer(),
        streak: backend_1.a.integer(),
        cash: backend_1.a.float(),
        bankroll: backend_1.a.float(),
        riskScore: backend_1.a.integer(),
        holdingsJson: backend_1.a.string(),
    }).authorization(allow => [allow.owner()]),
    Trade: backend_1.a.model({
        tradeId: backend_1.a.string().required(),
        symbol: backend_1.a.string().required(),
        side: backend_1.a.string().required(),
        amount: backend_1.a.float().required(),
        units: backend_1.a.float().required(),
        price: backend_1.a.float().required(),
        xpEarned: backend_1.a.integer(),
        slippage: backend_1.a.float(),
    }).authorization(allow => [allow.owner()]),
    LeaderboardEntry: backend_1.a.model({
        tournamentId: backend_1.a.string().required(),
        handle: backend_1.a.string().required(),
        rank: backend_1.a.integer(),
        bankroll: backend_1.a.float(),
        pnlPct: backend_1.a.float(),
        league: backend_1.a.string(),
    }).authorization(allow => [
        allow.authenticated().to(['read']),
        allow.owner(),
    ]),
});
exports.data = (0, backend_1.defineData)({
    schema,
    authorizationModes: {
        defaultAuthorizationMode: 'userPool',
    },
});
