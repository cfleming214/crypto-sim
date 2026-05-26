import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { AppState, Coin, Holding, Trade } from './types';

const INITIAL_COINS: Coin[] = [
  { symbol: 'BTC',  name: 'Bitcoin',   price: 64210.48, change24h: 2.41,  marketCap: '$1.26T', volume: '$1.24B', history: [58000,60000,61500,63000,62000,64000,63500,64210] },
  { symbol: 'ETH',  name: 'Ethereum',  price: 3180.12,  change24h: 1.10,  marketCap: '$381B',  volume: '$420M',  history: [2800,2950,3050,3100,3000,3150,3120,3180] },
  { symbol: 'SOL',  name: 'Solana',    price: 182.40,   change24h: -0.80, marketCap: '$80B',   volume: '$180M',  history: [195,192,188,185,183,184,182,182] },
  { symbol: 'DOGE', name: 'Dogecoin',  price: 0.1601,   change24h: 5.70,  marketCap: '$23B',   volume: '$850M',  history: [0.14,0.145,0.148,0.152,0.155,0.158,0.160,0.160] },
  { symbol: 'USDC', name: 'USD Coin',  price: 1.0000,   change24h: 0.00,  marketCap: '$32B',   volume: '$5B',    history: [1,1,1,1,1,1,1,1] },
  { symbol: 'PEPE', name: 'Pepe',      price: 0.0000118,change24h: 12.30, marketCap: '$4.2B',  volume: '$320M',  history: [0.0000095,0.0000100,0.0000105,0.0000108,0.0000111,0.0000114,0.0000116,0.0000118] },
];

const INITIAL_STATE: AppState = {
  user: { handle: 'you', xp: 2340, league: 'Diamond', division: 3, streak: 12 },
  bankroll: 10847.32,
  cash: 1163.67,
  holdings: [
    { symbol: 'BTC',  units: 0.0656,  avgCost: 61200 },
    { symbol: 'ETH',  units: 1.0001,  avgCost: 3050  },
    { symbol: 'SOL',  units: 5.382,   avgCost: 185   },
    { symbol: 'DOGE', units: 1952,    avgCost: 0.148 },
  ],
  trades: [],
  coins: INITIAL_COINS,
  activeTournament: {
    id: 'ww-1',
    name: 'Weekend Warriors',
    type: 'featured',
    status: 'live',
    prizePool: '$5,000',
    players: 1284,
    userRank: 47,
    endsAt: Date.now() + 2 * 60 * 60 * 1000 + 14 * 60 * 1000,
    stake: 'Free',
  },
  riskScore: 62,
  hasOnboarded: false,
  tradeSymbol: 'BTC',
};

type Action =
  | { type: 'TICK_PRICES' }
  | { type: 'BUY'; symbol: string; amount: number }
  | { type: 'SELL'; symbol: string; amount: number }
  | { type: 'SET_ONBOARDED' }
  | { type: 'ADD_XP'; amount: number }
  | { type: 'SET_TRADE_SYMBOL'; symbol: string };

function tickPrices(coins: Coin[]): Coin[] {
  return coins.map(coin => {
    if (coin.symbol === 'USDC') return coin;
    const volatility = coin.symbol === 'PEPE' || coin.symbol === 'DOGE' ? 0.004 : 0.001;
    const delta = coin.price * (Math.random() - 0.5) * volatility;
    const newPrice = Math.max(0.00001, coin.price + delta);
    const newHistory = [...coin.history.slice(-19), newPrice];
    return { ...coin, price: newPrice, history: newHistory };
  });
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'TICK_PRICES': {
      const coins = tickPrices(state.coins);
      // Recalculate bankroll
      const holdingsValue = state.holdings.reduce((sum, h) => {
        const coin = coins.find(c => c.symbol === h.symbol);
        return sum + (coin ? coin.price * h.units : 0);
      }, 0);
      const bankroll = state.cash + holdingsValue;
      return { ...state, coins, bankroll };
    }
    case 'BUY': {
      const coin = state.coins.find(c => c.symbol === action.symbol);
      if (!coin || state.cash < action.amount) return state;
      const units = action.amount / coin.price;
      const existing = state.holdings.find(h => h.symbol === action.symbol);
      const holdings = existing
        ? state.holdings.map(h =>
            h.symbol === action.symbol
              ? { ...h, units: h.units + units, avgCost: (h.avgCost * h.units + action.amount) / (h.units + units) }
              : h
          )
        : [...state.holdings, { symbol: action.symbol, units, avgCost: coin.price }];
      const trade: Trade = {
        id: `SIM-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        symbol: action.symbol, side: 'buy', amount: action.amount,
        units, price: coin.price, timestamp: Date.now(), xpEarned: 25, slippage: 0.001,
      };
      return {
        ...state,
        cash: state.cash - action.amount,
        holdings,
        trades: [trade, ...state.trades],
        user: { ...state.user, xp: state.user.xp + 25 },
      };
    }
    case 'SELL': {
      const coin = state.coins.find(c => c.symbol === action.symbol);
      const holding = state.holdings.find(h => h.symbol === action.symbol);
      if (!coin || !holding) return state;
      const unitsToSell = Math.min(action.amount / coin.price, holding.units);
      const proceeds = unitsToSell * coin.price;
      const holdings = unitsToSell >= holding.units
        ? state.holdings.filter(h => h.symbol !== action.symbol)
        : state.holdings.map(h => h.symbol === action.symbol ? { ...h, units: h.units - unitsToSell } : h);
      const trade: Trade = {
        id: `SIM-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        symbol: action.symbol, side: 'sell', amount: proceeds,
        units: unitsToSell, price: coin.price, timestamp: Date.now(), xpEarned: 10, slippage: 0.001,
      };
      return { ...state, cash: state.cash + proceeds, holdings, trades: [trade, ...state.trades] };
    }
    case 'SET_ONBOARDED':
      return { ...state, hasOnboarded: true };
    case 'ADD_XP':
      return { ...state, user: { ...state.user, xp: state.user.xp + action.amount } };
    case 'SET_TRADE_SYMBOL':
      return { ...state, tradeSymbol: action.symbol };
    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  getCoin: (symbol: string) => Coin | undefined;
  getHolding: (symbol: string) => { units: number; value: number; pnl: number; pnlPct: number } | null;
}

const AppContext = createContext<AppContextValue>({
  state: INITIAL_STATE,
  dispatch: () => {},
  getCoin: () => undefined,
  getHolding: () => null,
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    intervalRef.current = setInterval(() => dispatch({ type: 'TICK_PRICES' }), 2000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const getCoin = (symbol: string) => state.coins.find(c => c.symbol === symbol);

  const getHolding = (symbol: string) => {
    const h = state.holdings.find(h => h.symbol === symbol);
    const coin = getCoin(symbol);
    if (!h || !coin) return null;
    const value = h.units * coin.price;
    const cost = h.units * h.avgCost;
    const pnl = value - cost;
    const pnlPct = (pnl / cost) * 100;
    return { units: h.units, value, pnl, pnlPct };
  };

  return (
    <AppContext.Provider value={{ state, dispatch, getCoin, getHolding }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
