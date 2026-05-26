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

export interface AppState {
  user: {
    handle: string;
    xp: number;
    league: string;
    division: number;
    streak: number;
  };
  bankroll: number;
  cash: number;
  holdings: Holding[];
  trades: Trade[];
  coins: Coin[];
  activeTournament: Tournament | null;
  riskScore: number;
  hasOnboarded: boolean;
}
