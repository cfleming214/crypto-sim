export interface Coin {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  marketCap: string;
  volume: string;
  history: number[];    // real 24h price series (hourly sparkline), refreshed each
                        // poll; graphs append the live price as the right-edge tip
  high24h?: number;     // raw USD from CoinGecko, undefined until first UPDATE_PRICES
  low24h?: number;
}

export interface Holding {
  symbol: string;
  units: number;
  avgCost: number;
}

export interface Trade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  units: number;
  price: number;
  timestamp: number;
  xpEarned: number;
  slippage: number;
  // 'reward' = a cash-injection event (e.g. daily-reward bonus), recorded with
  // symbol 'USD' (the CASH_EVENT_SYMBOL sentinel), units 0, amount = bonus. It
  // is not a coin trade; ledger replay treats symbol 'USD' as a pure cash delta.
  // Optional/back-compat: undefined on coin trades and on rows reloaded from the
  // cloud (the Trade model has no `kind` column — the symbol carries the mark).
  kind?: 'trade' | 'reward';
  // Realized P&L on a sell, in dollars (proceeds − cost basis at avgCost). Set
  // when the sell executes; undefined on buys/older rows.
  realizedPnl?: number;
}

export interface Tournament {
  id: string;
  name: string;
  type: 'daily' | 'featured' | 'replay' | '1v1';
  status: 'live' | 'open' | 'finished';
  prizePool: string;
  players: number;
  userRank: number;
  endsAt: number;
  stake: string;
}

export interface Competition {
  id: string;
  name: string;
  type: 'daily' | 'featured' | 'replay' | '1v1';
  status: 'open' | 'live' | 'finished';
  prizePool: string;
  maxPlayers: number;
  stake: string;
  startAt: number;
  endAt: number;
  entryCount: number;
  numberOfPrizes: number;   // count of paid positions
  prizes: number[];         // dollar amount per rank (index 0 = #1)
}

export interface CompetitionEntry {
  id: string;
  competitionId: string;
  handle: string;
  bankroll: number;
  pnlPct: number;
  rank: number;
  joinedAt: number;
  isActive: boolean;
}

export interface PendingOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  limitPrice: number;
  createdAt: number;
}

export interface CoachNudge {
  id: string;
  message: string;
  severity: 'info' | 'warn' | 'tip';
  createdAt: number;
}

export interface PriceAlert {
  id: string;
  symbol: string;
  targetPrice: number;
  direction: 'above' | 'below';
  createdAt: number;
  triggeredAt?: number;
}

// A trading portfolio — either the main offline portfolio (id: 'main') or a
// per-contest portfolio (id: competitionId). Each is independent: separate
// $10K starting cash, separate holdings, separate trades.
export interface PortfolioSlice {
  cash: number;
  holdings: Holding[];
  trades: Trade[];
}

export interface AppState {
  user: {
    handle: string;
    xp: number;
    league: string;
    division: number;
    streak: number;
    avatarColor: string;
    avatarUri?: string;   // resolvable URL (signed if from S3, local file:// if just picked)
    avatarKey?: string;   // stable S3 key for cloud persistence (e.g. "profile.jpg")
    createdAt?: number;   // ms epoch — when this UserProfile row was created in DynamoDB
  };
  bankroll: number;
  cash: number;
  holdings: Holding[];
  trades: Trade[];
  coins: Coin[];
  // Active portfolio selector. 'main' = offline personal portfolio, otherwise
  // it's the competitionId of a joined contest. Whichever is active drives
  // state.cash / state.holdings / state.trades. Inactive portfolios are
  // stashed in `portfolios` until switched back to.
  activePortfolioId: string;
  portfolios: Record<string, PortfolioSlice>;
  activeTournament: Tournament | null;
  competitions: Competition[];
  joinedTournamentIds: string[];
  leaderboard: Record<string, CompetitionEntry[]>;
  pendingOrders: PendingOrder[];
  watchlist: string[];
  riskScore: number;
  stopLosses: Record<string, number>;
  priceAlerts: PriceAlert[];
  triggeredAlerts: PriceAlert[];
  coachNudges: CoachNudge[];
  dismissedNudgeIds: string[];
  hasOnboarded: boolean;
  tradeSymbol: string;
  // Daily-reward claim tracking. UTC day-key ("YYYY-MM-DD") of the last claim,
  // or null if never claimed. Drives the streak (see user.streak) and the
  // "claim available / come back tomorrow" state. Persisted to AsyncStorage
  // ('gamification.v1'); cloud sync added later via UserProfile.gamificationJson.
  lastClaimDay: string | null;
  // Unlocked achievements: achievement id → unlockedAt (ms epoch). Persisted in
  // 'gamification.v1'. The watcher evaluates the engine and records new unlocks.
  achievements: Record<string, number>;
  // Price-prediction mini-game lifetime stats (Phase 5). Persisted in
  // 'gamification.v1'. predictionWins feeds the "Predictor" achievement.
  predictionWins: number;
  predictionLosses: number;
  // External market context, refreshed alongside fetchPrices.
  globalStats?: { totalMarketCap: number; change24h: number };
  fearGreed?:   { value: number; label: string };
}
