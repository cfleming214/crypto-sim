export interface Coin {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  marketCap: string;
  volume: string;
  history: number[];
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

export interface AppState {
  user: {
    handle: string;
    xp: number;
    league: string;
    division: number;
    streak: number;
    avatarColor: string;
  };
  bankroll: number;
  cash: number;
  holdings: Holding[];
  trades: Trade[];
  coins: Coin[];
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
}
