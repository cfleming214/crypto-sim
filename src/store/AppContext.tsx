import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { AppState, Coin, Holding, Trade, Competition, CompetitionEntry, PendingOrder } from './types';
import { fetchPrices, formatLargeNumber, type PriceData } from '../services/priceService';
import { loadProfile, saveProfile, saveTrade } from '../services/portfolioService';
import { fetchCompetitions, SEED_COMPETITIONS } from '../services/competitionService';

const INITIAL_COINS: Coin[] = [
  { symbol: 'BTC',  name: 'Bitcoin',   price: 64210.48, change24h: 2.41,  marketCap: '$1.26T', volume: '$1.24B', history: [58000,60000,61500,63000,62000,64000,63500,64210] },
  { symbol: 'ETH',  name: 'Ethereum',  price: 3180.12,  change24h: 1.10,  marketCap: '$381B',  volume: '$420M',  history: [2800,2950,3050,3100,3000,3150,3120,3180] },
  { symbol: 'SOL',  name: 'Solana',    price: 182.40,   change24h: -0.80, marketCap: '$80B',   volume: '$180M',  history: [195,192,188,185,183,184,182,182] },
  { symbol: 'DOGE', name: 'Dogecoin',  price: 0.1601,   change24h: 5.70,  marketCap: '$23B',   volume: '$850M',  history: [0.14,0.145,0.148,0.152,0.155,0.158,0.160,0.160] },
  { symbol: 'USDC', name: 'USD Coin',  price: 1.0000,   change24h: 0.00,  marketCap: '$32B',   volume: '$5B',    history: [1,1,1,1,1,1,1,1] },
  { symbol: 'PEPE', name: 'Pepe',      price: 0.0000118,change24h: 12.30, marketCap: '$4.2B',  volume: '$320M',  history: [0.0000095,0.0000100,0.0000105,0.0000108,0.0000111,0.0000114,0.0000116,0.0000118] },
];

const INITIAL_HOLDINGS = [
  { symbol: 'BTC',  units: 0.0656,  avgCost: 61200 },
  { symbol: 'ETH',  units: 1.0001,  avgCost: 3050  },
  { symbol: 'SOL',  units: 5.382,   avgCost: 185   },
  { symbol: 'DOGE', units: 1952,    avgCost: 0.148 },
];

function computeRiskScore(
  holdings: { symbol: string; units: number }[],
  cash: number,
  bankroll: number,
  coins: { symbol: string; price: number }[],
  stopLosses: Record<string, number>,
): number {
  if (bankroll <= 0 || holdings.length === 0) return 100;
  let score = 100;
  for (const h of holdings) {
    const coin = coins.find(c => c.symbol === h.symbol);
    if (coin && (h.units * coin.price) / bankroll > 0.4) { score -= 25; break; }
  }
  if (cash / bankroll < 0.1) score -= 20;
  if (Object.keys(stopLosses).length === 0) score -= 15;
  return Math.max(20, Math.min(100, score));
}

const INITIAL_STATE: AppState = {
  user: { handle: 'you', xp: 2340, league: 'Diamond', division: 3, streak: 12, avatarColor: '#6366F1' },
  bankroll: 10847.32,
  cash: 1163.67,
  holdings: INITIAL_HOLDINGS,
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
  competitions: SEED_COMPETITIONS,
  joinedTournamentIds: ['ww-1'],
  leaderboard: {},
  pendingOrders: [],
  watchlist: ['BTC', 'ETH'],
  riskScore: computeRiskScore(INITIAL_HOLDINGS, 1163.67, 10847.32, INITIAL_COINS, {}),
  stopLosses: {},
  hasOnboarded: false,
  tradeSymbol: 'BTC',
};

type Action =
  | { type: 'TICK_PRICES' }
  | { type: 'UPDATE_PRICES'; prices: PriceData[] }
  | { type: 'LOAD_PROFILE'; profile: Partial<AppState> }
  | { type: 'BUY'; symbol: string; amount: number }
  | { type: 'SELL'; symbol: string; amount: number }
  | { type: 'SET_ONBOARDED' }
  | { type: 'ADD_XP'; amount: number }
  | { type: 'SET_TRADE_SYMBOL'; symbol: string }
  | { type: 'SET_STOP_LOSS'; symbol: string; pct: number }
  | { type: 'REBALANCE' }
  | { type: 'SET_COMPETITIONS'; competitions: Competition[] }
  | { type: 'JOIN_TOURNAMENT'; tournamentId: string }
  | { type: 'LEAVE_TOURNAMENT'; tournamentId: string }
  | { type: 'SET_LEADERBOARD'; competitionId: string; entries: CompetitionEntry[] }
  | { type: 'TOGGLE_WATCHLIST'; symbol: string }
  | { type: 'SET_HANDLE'; handle: string }
  | { type: 'SET_AVATAR_COLOR'; color: string }
  | { type: 'PLACE_LIMIT_ORDER'; symbol: string; side: 'buy' | 'sell'; amount: number; limitPrice: number }
  | { type: 'CANCEL_LIMIT_ORDER'; orderId: string };

function tickPrices(coins: Coin[]): Coin[] {
  return coins.map(coin => {
    if (coin.symbol === 'USDC') return coin;
    const volatility = coin.symbol === 'PEPE' || coin.symbol === 'DOGE' ? 0.0004 : 0.0001;
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

      // Auto-fill triggered limit orders
      let newState = { ...state, coins };
      for (const order of state.pendingOrders) {
        const coin = coins.find(c => c.symbol === order.symbol);
        if (!coin) continue;
        const triggered = order.side === 'buy'
          ? coin.price <= order.limitPrice
          : coin.price >= order.limitPrice;
        if (!triggered) continue;

        // Execute the order
        if (order.side === 'buy' && newState.cash >= order.amount) {
          const units = order.amount / coin.price;
          const existing = newState.holdings.find(h => h.symbol === order.symbol);
          const holdings = existing
            ? newState.holdings.map(h => h.symbol === order.symbol
                ? { ...h, units: h.units + units, avgCost: (h.avgCost * h.units + order.amount) / (h.units + units) }
                : h)
            : [...newState.holdings, { symbol: order.symbol, units, avgCost: coin.price }];
          const trade: Trade = {
            id: order.id, symbol: order.symbol, side: 'buy', amount: order.amount,
            units, price: coin.price, timestamp: Date.now(), xpEarned: 25, slippage: 0,
          };
          newState = {
            ...newState,
            cash: newState.cash - order.amount,
            holdings,
            trades: [trade, ...newState.trades],
            user: { ...newState.user, xp: newState.user.xp + 25 },
          };
        } else if (order.side === 'sell') {
          const h = newState.holdings.find(h => h.symbol === order.symbol);
          if (h) {
            const unitsToSell = Math.min(order.amount / coin.price, h.units);
            const proceeds = unitsToSell * coin.price;
            const holdings = unitsToSell >= h.units
              ? newState.holdings.filter(x => x.symbol !== order.symbol)
              : newState.holdings.map(x => x.symbol === order.symbol ? { ...x, units: x.units - unitsToSell } : x);
            const trade: Trade = {
              id: order.id, symbol: order.symbol, side: 'sell', amount: proceeds,
              units: unitsToSell, price: coin.price, timestamp: Date.now(), xpEarned: 10, slippage: 0,
            };
            newState = {
              ...newState,
              cash: newState.cash + proceeds,
              holdings,
              trades: [trade, ...newState.trades],
            };
          }
        }
        newState = { ...newState, pendingOrders: newState.pendingOrders.filter(o => o.id !== order.id) };
      }

      const holdingsValue = newState.holdings.reduce((sum, h) => {
        const coin = newState.coins.find(c => c.symbol === h.symbol);
        return sum + (coin ? coin.price * h.units : 0);
      }, 0);
      return { ...newState, bankroll: newState.cash + holdingsValue };
    }
    case 'UPDATE_PRICES': {
      const coins = state.coins.map(coin => {
        const pd = action.prices.find(p => p.symbol === coin.symbol);
        if (!pd || coin.symbol === 'USDC') return coin;
        const newHistory = [...coin.history.slice(-19), pd.price];
        return {
          ...coin,
          price:     pd.price,
          change24h: pd.change24h,
          marketCap: pd.marketCapRaw > 0 ? formatLargeNumber(pd.marketCapRaw) : coin.marketCap,
          volume:    pd.volumeRaw    > 0 ? formatLargeNumber(pd.volumeRaw)    : coin.volume,
          history:   newHistory,
        };
      });
      const holdingsValue = state.holdings.reduce((sum, h) => {
        const coin = coins.find(c => c.symbol === h.symbol);
        return sum + (coin ? coin.price * h.units : 0);
      }, 0);
      return { ...state, coins, bankroll: state.cash + holdingsValue };
    }
    case 'LOAD_PROFILE':
      return { ...state, ...action.profile };
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
      const newCash = state.cash - action.amount;
      const newBankroll = newCash + holdings.reduce((s, h) => {
        const c = state.coins.find(x => x.symbol === h.symbol);
        return s + (c ? c.price * h.units : 0);
      }, 0);
      return {
        ...state,
        cash: newCash,
        bankroll: newBankroll,
        holdings,
        trades: [trade, ...state.trades],
        user: { ...state.user, xp: state.user.xp + 25 },
        riskScore: computeRiskScore(holdings, newCash, newBankroll, state.coins, state.stopLosses),
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
      const newCashSell = state.cash + proceeds;
      const newBankrollSell = newCashSell + holdings.reduce((s, h) => {
        const c = state.coins.find(x => x.symbol === h.symbol);
        return s + (c ? c.price * h.units : 0);
      }, 0);
      const newStopLosses = { ...state.stopLosses };
      if (unitsToSell >= holding.units) delete newStopLosses[action.symbol];
      return {
        ...state,
        cash: newCashSell,
        bankroll: newBankrollSell,
        holdings,
        trades: [trade, ...state.trades],
        stopLosses: newStopLosses,
        riskScore: computeRiskScore(holdings, newCashSell, newBankrollSell, state.coins, newStopLosses),
      };
    }
    case 'SET_ONBOARDED':
      return { ...state, hasOnboarded: true };
    case 'ADD_XP':
      return { ...state, user: { ...state.user, xp: state.user.xp + action.amount } };
    case 'SET_TRADE_SYMBOL':
      return { ...state, tradeSymbol: action.symbol };
    case 'SET_STOP_LOSS': {
      const newStopLosses = { ...state.stopLosses };
      if (action.pct === 0) delete newStopLosses[action.symbol];
      else newStopLosses[action.symbol] = action.pct;
      return {
        ...state,
        stopLosses: newStopLosses,
        riskScore: computeRiskScore(state.holdings, state.cash, state.bankroll, state.coins, newStopLosses),
      };
    }
    case 'REBALANCE': {
      const top5 = state.holdings.slice(0, 5);
      if (top5.length === 0) return state;

      const holdingValues = top5.map(h => {
        const coin = state.coins.find(c => c.symbol === h.symbol)!;
        return { ...h, coin, currentValue: h.units * coin.price };
      });
      const totalInvested = holdingValues.reduce((s, h) => s + h.currentValue, 0);
      const targetPerCoin = totalInvested / top5.length;

      let newHoldings = [...state.holdings];
      let newCash = state.cash;
      const newTrades = [...state.trades];

      for (const h of holdingValues) {
        const excess = h.currentValue - targetPerCoin;
        if (excess <= 5) continue;
        const unitsToSell = excess / h.coin.price;
        newHoldings = newHoldings.map(x =>
          x.symbol === h.symbol ? { ...x, units: x.units - unitsToSell } : x,
        ).filter(x => x.units > 0.000001);
        newCash += excess;
        newTrades.unshift({
          id: `SIM-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
          symbol: h.symbol, side: 'sell', amount: excess,
          units: unitsToSell, price: h.coin.price,
          timestamp: Date.now(), xpEarned: 10, slippage: 0.001,
        });
      }

      for (const h of holdingValues) {
        const deficit = targetPerCoin - h.currentValue;
        if (deficit <= 5 || newCash < deficit) continue;
        const unitsToBuy = deficit / h.coin.price;
        const existing = newHoldings.find(x => x.symbol === h.symbol);
        newHoldings = existing
          ? newHoldings.map(x =>
              x.symbol === h.symbol
                ? { ...x, units: x.units + unitsToBuy, avgCost: (x.avgCost * x.units + deficit) / (x.units + unitsToBuy) }
                : x,
            )
          : [...newHoldings, { symbol: h.symbol, units: unitsToBuy, avgCost: h.coin.price }];
        newCash -= deficit;
        newTrades.unshift({
          id: `SIM-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
          symbol: h.symbol, side: 'buy', amount: deficit,
          units: unitsToBuy, price: h.coin.price,
          timestamp: Date.now(), xpEarned: 25, slippage: 0.001,
        });
      }

      const newBankroll = newCash + newHoldings.reduce((s, h) => {
        const coin = state.coins.find(c => c.symbol === h.symbol);
        return s + (coin ? coin.price * h.units : 0);
      }, 0);

      return {
        ...state,
        holdings: newHoldings,
        cash: newCash,
        bankroll: newBankroll,
        trades: newTrades,
        user: { ...state.user, xp: state.user.xp + 50 },
        riskScore: computeRiskScore(newHoldings, newCash, newBankroll, state.coins, state.stopLosses),
      };
    }
    case 'PLACE_LIMIT_ORDER': {
      const order: PendingOrder = {
        id: `LMT-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        symbol: action.symbol,
        side: action.side,
        amount: action.amount,
        limitPrice: action.limitPrice,
        createdAt: Date.now(),
      };
      return { ...state, pendingOrders: [...state.pendingOrders, order] };
    }
    case 'CANCEL_LIMIT_ORDER':
      return { ...state, pendingOrders: state.pendingOrders.filter(o => o.id !== action.orderId) };
    case 'SET_HANDLE':
      return { ...state, user: { ...state.user, handle: action.handle.trim() || state.user.handle } };
    case 'SET_AVATAR_COLOR':
      return { ...state, user: { ...state.user, avatarColor: action.color } };
    case 'TOGGLE_WATCHLIST': {
      const inList = state.watchlist.includes(action.symbol);
      return {
        ...state,
        watchlist: inList
          ? state.watchlist.filter(s => s !== action.symbol)
          : [...state.watchlist, action.symbol],
      };
    }
    case 'SET_COMPETITIONS':
      return { ...state, competitions: action.competitions };
    case 'JOIN_TOURNAMENT':
      if (state.joinedTournamentIds.includes(action.tournamentId)) return state;
      return { ...state, joinedTournamentIds: [...state.joinedTournamentIds, action.tournamentId] };
    case 'LEAVE_TOURNAMENT':
      return { ...state, joinedTournamentIds: state.joinedTournamentIds.filter(id => id !== action.tournamentId) };
    case 'SET_LEADERBOARD':
      return { ...state, leaderboard: { ...state.leaderboard, [action.competitionId]: action.entries } };
    default:
      return state;
  }
}

export type { Action };

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
  const tickRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const priceRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const lastActionRef = useRef<Action | null>(null);

  // Wrap dispatch to track trade actions for cloud sync
  const wrappedDispatch = (action: Action) => {
    if (['BUY', 'SELL', 'REBALANCE'].includes(action.type)) {
      lastActionRef.current = action;
    }
    dispatch(action);
  };

  useEffect(() => {
    // Load cloud portfolio on mount
    loadProfile().then(profile => {
      if (profile) dispatch({ type: 'LOAD_PROFILE', profile });
    });

    // Load competitions (falls back to seed data if offline)
    fetchCompetitions().then(competitions => {
      dispatch({ type: 'SET_COMPETITIONS', competitions });
    });

    // Simulated micro-tick for UI fluidity
    tickRef.current = setInterval(() => dispatch({ type: 'TICK_PRICES' }), 2000);

    // Real prices from CoinGecko every 30s
    const doFetch = async () => {
      try {
        const prices = await fetchPrices();
        dispatch({ type: 'UPDATE_PRICES', prices });
      } catch {
        // Silent — simulated tick keeps UI alive
      }
    };
    doFetch();
    priceRef.current = setInterval(doFetch, 30000);

    return () => {
      clearInterval(tickRef.current);
      clearInterval(priceRef.current);
    };
  }, []);

  // Sync portfolio to cloud after each trade
  useEffect(() => {
    const action = lastActionRef.current;
    if (!action) return;
    lastActionRef.current = null;

    saveProfile(state);

    if ((action.type === 'BUY' || action.type === 'SELL') && state.trades.length > 0) {
      saveTrade(state.trades[0]);
    }
  }, [state.trades, state.cash]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <AppContext.Provider value={{ state, dispatch: wrappedDispatch, getCoin, getHolding }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
