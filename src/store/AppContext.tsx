import React, { createContext, useContext, useReducer, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Coin, Holding, Trade, Competition, CompetitionEntry, PendingOrder, PriceAlert, CoachNudge, PortfolioSlice } from './types';
import { fetchPrices, fetchGlobalMarketStats, fetchFearGreedIndex, formatLargeNumber, type PriceData } from '../services/priceService';
import { loadProfile, saveProfile, saveTrade, subscribeToProfile, subscribeToCoachNudges, subscribeToLeaderboard, loadContestPortfolios, saveContestPortfolio } from '../services/portfolioService';
import { fetchCompetitions, subscribeToCompetitions } from '../services/competitionService';
import { fetchTokenCatalog } from '../services/tokenCatalog';
import { applyDailyClaim, sellXp, realizedPnl, CASH_EVENT_SYMBOL } from '../services/gamification';
import { useAuth } from './AuthContext';

// AsyncStorage key for local gamification state (daily-claim streak). Persisted
// for guests and signed-in users alike; cloud cross-device sync comes later via
// UserProfile.gamificationJson.
const GAMIFICATION_KEY = 'gamification.v1';

// Cold-start fallback only. The full tradeable list comes from the Token
// catalog (DynamoDB, populated by the crypto-dashboard admin) via
// fetchTokenCatalog() on auth and is merged into state.coins via SET_COINS.
// USDC stays here as the stability anchor — the tick simulator and risk math
// assume USDC is always present in state.coins.
// USDC stays at index 0 (SET_COINS + the tick simulator reference it as the
// cash anchor). The rest are the top-10 tradeable coins with seed prices so a
// first-time / offline open already has a populated Markets tab; live prices
// from the catalog merge over these via SET_COINS once online.
const INITIAL_COINS: Coin[] = [
  { symbol: 'USDC', name: 'USD Coin',   price: 1.0000, change24h: 0.00,  marketCap: '$32B',  volume: '$5B',  history: [1,1,1,1,1,1,1,1] },
  { symbol: 'BTC',  name: 'Bitcoin',    price: 65000,  change24h: 1.8,   marketCap: '$1.28T', volume: '$28B', history: [63800,64200,64000,64600,64300,64800,64700,65000] },
  { symbol: 'ETH',  name: 'Ethereum',   price: 3500,   change24h: 2.1,   marketCap: '$420B', volume: '$15B', history: [3410,3440,3430,3470,3450,3490,3480,3500] },
  { symbol: 'SOL',  name: 'Solana',     price: 150,    change24h: 3.4,   marketCap: '$70B',  volume: '$4B',  history: [144,146,145,148,147,149,149,150] },
  { symbol: 'BNB',  name: 'BNB',        price: 600,    change24h: 0.9,   marketCap: '$88B',  volume: '$2B',  history: [594,596,595,598,597,599,599,600] },
  { symbol: 'XRP',  name: 'XRP',        price: 0.60,   change24h: -1.2,  marketCap: '$33B',  volume: '$1.5B', history: [0.61,0.605,0.607,0.6,0.598,0.602,0.601,0.60] },
  { symbol: 'DOGE', name: 'Dogecoin',   price: 0.15,   change24h: 4.2,   marketCap: '$21B',  volume: '$1.2B', history: [0.143,0.145,0.144,0.148,0.147,0.149,0.149,0.15] },
  { symbol: 'ADA',  name: 'Cardano',    price: 0.45,   change24h: 1.1,   marketCap: '$16B',  volume: '$600M', history: [0.444,0.446,0.445,0.448,0.447,0.449,0.449,0.45] },
  { symbol: 'AVAX', name: 'Avalanche',  price: 35,     change24h: 2.7,   marketCap: '$14B',  volume: '$500M', history: [34.0,34.3,34.2,34.6,34.4,34.8,34.7,35] },
  { symbol: 'LINK', name: 'Chainlink',  price: 18,     change24h: 1.5,   marketCap: '$11B',  volume: '$450M', history: [17.6,17.7,17.65,17.8,17.75,17.9,17.85,18] },
  { symbol: 'DOT',  name: 'Polkadot',   price: 7,      change24h: -0.6,  marketCap: '$10B',  volume: '$300M', history: [7.05,7.04,7.06,7.0,6.98,7.02,7.01,7] },
];

const INITIAL_HOLDINGS: { symbol: string; units: number; avgCost: number }[] = [];

// Local-storage key for the guest/offline portfolio (cash, holdings, trades,
// watchlist, stop-losses). Persisted only while unauthenticated; once a user
// signs in the cloud UserProfile is the source of truth.
const OFFLINE_PORTFOLIO_KEY = 'offlinePortfolio.v1';

function computeCoachNudges(
  holdings: { symbol: string; units: number }[],
  cash: number,
  bankroll: number,
  coins: { symbol: string; price: number; change24h: number }[],
  stopLosses: Record<string, number>,
  tradeCount: number,
): CoachNudge[] {
  if (bankroll <= 0 || holdings.length === 0) return [];
  const nudges: CoachNudge[] = [];
  const now = Date.now();

  for (const h of holdings) {
    const coin = coins.find(c => c.symbol === h.symbol);
    if (!coin) continue;
    const pct = (h.units * coin.price) / bankroll;
    if (pct > 0.4) {
      nudges.push({ id: `conc-${h.symbol}`, message: `${h.symbol} is ${Math.round(pct * 100)}% of your portfolio — consider trimming to below 40%`, severity: 'warn', createdAt: now });
    }
    if (coin.change24h < -8 && !stopLosses[h.symbol]) {
      nudges.push({ id: `vol-${h.symbol}`, message: `${h.symbol} is down ${Math.abs(coin.change24h).toFixed(0)}% today with no stop-loss set`, severity: 'warn', createdAt: now });
    }
  }
  if (cash / bankroll < 0.05) {
    nudges.push({ id: 'cash-low', message: 'Your cash buffer is below 5% — you may not have room to buy dips', severity: 'warn', createdAt: now });
  }
  if (holdings.length === 1) {
    nudges.push({ id: 'diversify', message: `You're 100% in ${holdings[0].symbol} — spreading across 3–5 assets reduces single-coin risk`, severity: 'tip', createdAt: now });
  }
  if (tradeCount > 0 && tradeCount % 10 === 0) {
    nudges.push({ id: `milestone-${tradeCount}`, message: `Nice! ${tradeCount} trades completed — review your win/loss ratio in Activity`, severity: 'info', createdAt: now });
  }
  return nudges.slice(0, 3);
}

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

// Symbols pulled from the tradeable universe. PEPE is a sub-cent meme coin that
// rendered as $0 in the holdings list and behaved as a dead/un-priced position;
// it's filtered out of state.coins (see SET_COINS) and folded out of holdings by
// healHoldings, so it can't be traded, held, or pulled into a rebalance.
const BLOCKED_SYMBOLS = ['PEPE'];

// Heal a loaded/restored holdings list before anything is derived from it
// (bankroll, nudges, risk all depend on holdings + cash).
//   • USDC is the cash anchor, not a position. If it ends up in `holdings` (an
//     older build let it be bought) the balance gets stranded — not counted as
//     buying power, un-tappable, blocks rebalancing. Fold it back at its $1 peg.
//   • BLOCKED_SYMBOLS (e.g. PEPE) are coins we've removed from the app. Fold any
//     held units back into cash at the last-known price (0 if we have none) so
//     the position disappears instead of lingering as a stuck $0 row.
// A no-op (returns the same refs) when there's nothing to heal, so it's safe to
// run on every load. The corrected values persist on the next save.
function healHoldings<H extends { symbol: string; units: number }>(
  holdings: H[],
  cash: number,
  coins: { symbol: string; price: number }[] = [],
): { holdings: H[]; cash: number } {
  const needsHeal = holdings.some(h => h.symbol === 'USDC' || BLOCKED_SYMBOLS.includes(h.symbol));
  if (!needsHeal) return { holdings, cash };
  let recovered = 0;
  const kept: H[] = [];
  for (const h of holdings) {
    if (h.symbol === 'USDC') { recovered += h.units; continue; } // $1 peg
    if (BLOCKED_SYMBOLS.includes(h.symbol)) {
      recovered += h.units * (coins.find(c => c.symbol === h.symbol)?.price ?? 0);
      continue;
    }
    kept.push(h);
  }
  return { holdings: kept, cash: cash + recovered };
}

const INITIAL_STATE: AppState = {
  user: { handle: 'you', xp: 0, league: 'Bronze', division: 1, streak: 0, avatarColor: '#6366F1' },
  bankroll: 10000,
  cash: 10000,
  holdings: INITIAL_HOLDINGS,
  trades: [],
  coins: INITIAL_COINS,
  activeTournament: null,
  competitions: [],                  // populated from cloud on auth
  joinedTournamentIds: [],
  leaderboard: {},
  pendingOrders: [],
  watchlist: ['BTC', 'ETH'],
  riskScore: 100,
  stopLosses: {},
  priceAlerts: [],
  triggeredAlerts: [],
  coachNudges: [],
  dismissedNudgeIds: [],
  hasOnboarded: false,
  tradeSymbol: 'BTC',
  lastClaimDay: null,
  achievements: {},
  predictionWins: 0,
  predictionLosses: 0,
  activePortfolioId: 'main',
  portfolios: {},
};

type Action =
  | { type: 'TICK_PRICES' }
  | { type: 'UPDATE_PRICES'; prices: PriceData[] }
  | { type: 'SET_COINS'; coins: Coin[] }
  | { type: 'LOAD_PROFILE'; profile: Partial<AppState> }
  | { type: 'HYDRATE_OFFLINE'; portfolio: Partial<Pick<AppState, 'cash' | 'holdings' | 'trades' | 'watchlist' | 'stopLosses'>> }
  | { type: 'SEED_STARTER' }
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
  | { type: 'CANCEL_LIMIT_ORDER'; orderId: string }
  | { type: 'ADD_PRICE_ALERT'; symbol: string; targetPrice: number; direction: 'above' | 'below' }
  | { type: 'DISMISS_PRICE_ALERT'; alertId: string }
  | { type: 'RESET_DEMO' }
  | { type: 'DISMISS_NUDGE'; nudgeId: string }
  | { type: 'SET_AVATAR_URI'; uri: string }
  | { type: 'SET_AVATAR'; uri: string; key: string }
  | { type: 'SET_CLOUD_NUDGES'; nudges: CoachNudge[] }
  | { type: 'SWITCH_PORTFOLIO'; portfolioId: string }
  | { type: 'INIT_CONTEST_PORTFOLIO'; competitionId: string; slice?: PortfolioSlice }
  | { type: 'CLEAR_USER_DATA' }
  | { type: 'SET_GLOBAL_STATS'; stats: { totalMarketCap: number; change24h: number } }
  | { type: 'SET_FEAR_GREED'; reading: { value: number; label: string } }
  | { type: 'CLAIM_DAILY_REWARD' }
  | { type: 'SET_ACHIEVEMENTS'; achievements: Record<string, number> }
  | { type: 'HYDRATE_GAMIFICATION'; data: { lastClaimDay: string | null; streak?: number; achievements?: Record<string, number> } };

function tickPrices(coins: Coin[]): Coin[] {
  return coins.map(coin => {
    if (coin.symbol === 'USDC') return coin;
    const volatility = coin.symbol === 'PEPE' || coin.symbol === 'DOGE' ? 0.0004 : 0.0001;
    const delta = coin.price * (Math.random() - 0.5) * volatility;
    const newPrice = Math.max(coin.price * 0.5, coin.price + delta);
    // Don't touch history — it's the real 24h sparkline from UPDATE_PRICES.
    return { ...coin, price: newPrice };
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

        // USDC is the cash anchor — never fill a buy into it (would strand cash
        // in an un-spendable holding). Drop the order without executing.
        if (order.side === 'buy' && order.symbol === 'USDC') {
          newState = { ...newState, pendingOrders: newState.pendingOrders.filter(o => o.id !== order.id) };
          continue;
        }

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
            const pnl = realizedPnl(h.avgCost, unitsToSell, coin.price);
            const xpEarned = sellXp(pnl, proceeds);
            const holdings = unitsToSell >= h.units
              ? newState.holdings.filter(x => x.symbol !== order.symbol)
              : newState.holdings.map(x => x.symbol === order.symbol ? { ...x, units: x.units - unitsToSell } : x);
            const trade: Trade = {
              id: order.id, symbol: order.symbol, side: 'sell', amount: proceeds,
              units: unitsToSell, price: coin.price, timestamp: Date.now(),
              xpEarned, slippage: 0, realizedPnl: pnl,
            };
            newState = {
              ...newState,
              cash: newState.cash + proceeds,
              holdings,
              trades: [trade, ...newState.trades],
              user: { ...newState.user, xp: newState.user.xp + xpEarned },
            };
          }
        }
        newState = { ...newState, pendingOrders: newState.pendingOrders.filter(o => o.id !== order.id) };
      }

      // Evaluate price alerts
      const nowMs = Date.now();
      const stillActive: PriceAlert[] = [];
      const justTriggered: PriceAlert[] = [];
      for (const alert of newState.priceAlerts) {
        const coin = newState.coins.find(c => c.symbol === alert.symbol);
        if (!coin) { stillActive.push(alert); continue; }
        const fired = alert.direction === 'above'
          ? coin.price >= alert.targetPrice
          : coin.price <= alert.targetPrice;
        if (fired) justTriggered.push({ ...alert, triggeredAt: nowMs });
        else stillActive.push(alert);
      }
      if (justTriggered.length > 0) {
        newState = {
          ...newState,
          priceAlerts: stillActive,
          triggeredAlerts: [...justTriggered, ...newState.triggeredAlerts],
        };
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
        // Skip coins with no price update (or zero/negative — would zero out
        // any holdings in that coin and crash the bankroll value).
        if (!pd || coin.symbol === 'USDC' || !(pd.price > 0)) return coin;
        // `history` is the real 24h series (hourly sparkline from /coins/markets),
        // refreshed each poll. The graphs' live right-edge is the CURRENT price,
        // appended at render time (Markets sparkline + Trade 24H chart) so they
        // move with every price tick — the same pattern as the homepage equity
        // graph's live endpoint. Fall back to the prior series if no sparkline.
        const realHistory = pd.sparkline24h && pd.sparkline24h.length > 0
          ? pd.sparkline24h
          : coin.history;
        return {
          ...coin,
          price:     pd.price,
          change24h: pd.change24h,
          marketCap: pd.marketCapRaw > 0 ? formatLargeNumber(pd.marketCapRaw) : coin.marketCap,
          volume:    pd.volumeRaw    > 0 ? formatLargeNumber(pd.volumeRaw)    : coin.volume,
          history:   realHistory,
          high24h:   pd.high24h > 0 ? pd.high24h : coin.high24h,
          low24h:    pd.low24h  > 0 ? pd.low24h  : coin.low24h,
        };
      });
      const holdingsValue = state.holdings.reduce((sum, h) => {
        const coin = coins.find(c => c.symbol === h.symbol);
        return sum + (coin ? coin.price * h.units : 0);
      }, 0);
      return { ...state, coins, bankroll: state.cash + holdingsValue };
    }
    case 'SET_COINS': {
      // Merge the catalog over what's in state.coins: keep any existing live
      // prices for symbols that survived the catalog refresh, drop any coin
      // that's no longer enabled, and always preserve USDC even if the catalog
      // ever drops it (the tick simulator special-cases USDC by symbol).
      const existingBySym = new Map(state.coins.map(c => [c.symbol, c]));
      const usdc = existingBySym.get('USDC') ?? INITIAL_COINS[0];
      const merged = action.coins.map(catalog => {
        const prior = existingBySym.get(catalog.symbol);
        return prior ? { ...catalog, price: prior.price, change24h: prior.change24h, history: prior.history } : catalog;
      });
      const hasUsdc = merged.some(c => c.symbol === 'USDC');
      const nextCoins = hasUsdc ? merged : [...merged, usdc];
      // Preserve any coin the user still holds even when the catalog drops it
      // (e.g. a token the dashboard disabled for practice). Without this the
      // position loses its price — it shows $0, can't be sold, and crashes
      // flows that assume every holding has a matching coin (Rebalance). We
      // re-add the last-known coin data (from state.coins, seeded by
      // INITIAL_COINS) so the position stays valued and exitable; it just
      // won't get fresh prices since its id is no longer in the catalog.
      const present = new Set(nextCoins.map(c => c.symbol));
      const orphans = state.holdings
        .filter(h => !present.has(h.symbol))
        .map(h => existingBySym.get(h.symbol) ?? INITIAL_COINS.find(c => c.symbol === h.symbol))
        .filter((c): c is Coin => !!c);
      const assembled = orphans.length > 0 ? [...nextCoins, ...orphans] : nextCoins;
      // Drop blocked symbols (e.g. PEPE) so they never enter the tradeable
      // universe, even if the dashboard catalog still lists them. Any held
      // position in a blocked coin is folded back into cash by healHoldings.
      const finalCoins = assembled.filter(c => !BLOCKED_SYMBOLS.includes(c.symbol));
      const holdingsValue = state.holdings.reduce((sum, h) => {
        const coin = finalCoins.find(c => c.symbol === h.symbol);
        return sum + (coin ? coin.price * h.units : 0);
      }, 0);
      return { ...state, coins: finalCoins, bankroll: state.cash + holdingsValue };
    }
    case 'LOAD_PROFILE': {
      // Merge cloud profile over current state and recompute nudges from the
      // loaded holdings. activeTournament is a UI-only summary; we clear it
      // because there's no cloud source of truth for it yet.
      const merged = { ...state, ...action.profile };
      // Heal any stranded USDC position by folding it back into cash before we
      // derive anything from holdings/cash (bankroll, nudges, risk all depend
      // on these). The corrected values persist on the next saveProfile.
      const { holdings: loadedHoldings, cash: loadedCash } = healHoldings(merged.holdings, merged.cash, merged.coins);
      // Bankroll is a derived value — recompute it against live coin prices.
      // The stored bankroll in DynamoDB is a stale snapshot from the moment
      // saveProfile last ran, so loading it directly would cause a flash
      // every time the subscription fires after a save.
      const recomputedBankroll = loadedCash + loadedHoldings.reduce((s, h) => {
        const c = merged.coins.find(x => x.symbol === h.symbol);
        return s + (c ? c.price * h.units : 0);
      }, 0);
      const recomputedNudges = computeCoachNudges(
        loadedHoldings,
        loadedCash,
        recomputedBankroll,
        merged.coins,
        merged.stopLosses,
        merged.trades.length,
      );
      return {
        ...merged,
        cash: loadedCash,
        holdings: loadedHoldings,
        bankroll: recomputedBankroll,
        activeTournament: null,
        coachNudges: recomputedNudges,
        // dismissedNudgeIds preserved — login shouldn't un-dismiss nudges the
        // user already closed. The subscription fires after every saveProfile,
        // which would otherwise re-pop every dismissed nudge.
      };
    }
    case 'HYDRATE_OFFLINE': {
      // Restore a previously-saved guest/offline portfolio from local storage.
      // Bankroll is derived against current prices, not the saved snapshot.
      const p = action.portfolio;
      const rawCash = typeof p.cash === 'number' ? p.cash : state.cash;
      const rawHoldings = Array.isArray(p.holdings) ? p.holdings : state.holdings;
      // Fold stranded USDC + blocked coins (PEPE) out before deriving bankroll.
      const { holdings, cash } = healHoldings(rawHoldings, rawCash, state.coins);
      const holdingsValue = holdings.reduce((s, h) => {
        const c = state.coins.find(x => x.symbol === h.symbol);
        return s + (c ? c.price * h.units : 0);
      }, 0);
      return {
        ...state,
        cash,
        holdings,
        trades:     Array.isArray(p.trades) ? p.trades : state.trades,
        watchlist:  Array.isArray(p.watchlist) ? p.watchlist : state.watchlist,
        stopLosses: p.stopLosses ?? state.stopLosses,
        bankroll:   cash + holdingsValue,
      };
    }
    case 'SEED_STARTER': {
      // Brand-new portfolio → drop a small starter position (0.01 BTC) in so the
      // Holdings list opens with a real, tappable holding instead of being empty.
      // We ALSO record a $0 "seed" trade so the trade ledger is self-describing:
      // the portfolio-value history (src/services/portfolioHistory.ts) replays
      // trades, and a holding with no trade behind it would otherwise be opaque
      // to it. amount:0 keeps cash intact on replay — the starter is a free
      // grant, not a purchase — so bankroll stays cash + the BTC value.
      // No-op once there's any holding or trade history, so it never re-seeds.
      if (state.holdings.length > 0 || state.trades.length > 0) return state;
      const btc = state.coins.find(c => c.symbol === 'BTC');
      if (!btc || !(btc.price > 0)) return state;
      const holdings = [{ symbol: 'BTC', units: 0.01, avgCost: btc.price }];
      const seedTrade: Trade = {
        id: `SEED-${Date.now()}`,
        symbol: 'BTC', side: 'buy', amount: 0, units: 0.01,
        price: btc.price, timestamp: Date.now(), xpEarned: 0, slippage: 0,
      };
      return { ...state, holdings, trades: [seedTrade], bankroll: state.cash + 0.01 * btc.price };
    }
    case 'BUY': {
      // USDC is the cash anchor — "buying" it would just move spendable cash
      // into a holding that can't be spent or tapped. Reject it outright.
      if (action.symbol === 'USDC') return state;
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
      const newNudges = computeCoachNudges(holdings, newCash, newBankroll, state.coins, state.stopLosses, state.trades.length + 1);
      return {
        ...state,
        cash: newCash,
        bankroll: newBankroll,
        holdings,
        trades: [trade, ...state.trades],
        user: { ...state.user, xp: state.user.xp + 25 },
        riskScore: computeRiskScore(holdings, newCash, newBankroll, state.coins, state.stopLosses),
        coachNudges: newNudges,
        // dismissedNudgeIds preserved — a dismissed conc-BTC stays dismissed
        // even if the BTC concentration is still flagged after this trade.
      };
    }
    case 'SELL': {
      const coin = state.coins.find(c => c.symbol === action.symbol);
      const holding = state.holdings.find(h => h.symbol === action.symbol);
      if (!coin || !holding) return state;
      const unitsToSell = Math.min(action.amount / coin.price, holding.units);
      const proceeds = unitsToSell * coin.price;
      const pnl = realizedPnl(holding.avgCost, unitsToSell, coin.price);
      const sellXpEarned = sellXp(pnl, proceeds);
      const holdings = unitsToSell >= holding.units
        ? state.holdings.filter(h => h.symbol !== action.symbol)
        : state.holdings.map(h => h.symbol === action.symbol ? { ...h, units: h.units - unitsToSell } : h);
      const trade: Trade = {
        id: `SIM-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        symbol: action.symbol, side: 'sell', amount: proceeds,
        units: unitsToSell, price: coin.price, timestamp: Date.now(),
        xpEarned: sellXpEarned, slippage: 0.001, realizedPnl: pnl,
      };
      const newCashSell = state.cash + proceeds;
      const newBankrollSell = newCashSell + holdings.reduce((s, h) => {
        const c = state.coins.find(x => x.symbol === h.symbol);
        return s + (c ? c.price * h.units : 0);
      }, 0);
      const newStopLosses = { ...state.stopLosses };
      if (unitsToSell >= holding.units) delete newStopLosses[action.symbol];
      const sellNudges = computeCoachNudges(holdings, newCashSell, newBankrollSell, state.coins, newStopLosses, state.trades.length + 1);
      return {
        ...state,
        cash: newCashSell,
        bankroll: newBankrollSell,
        holdings,
        trades: [trade, ...state.trades],
        stopLosses: newStopLosses,
        user: { ...state.user, xp: state.user.xp + sellXpEarned },
        riskScore: computeRiskScore(holdings, newCashSell, newBankrollSell, state.coins, newStopLosses),
        coachNudges: sellNudges,
        // dismissedNudgeIds preserved — see BUY for rationale.
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

      // Cold-start rebalance: no holdings yet, so build a balanced portfolio
      // from cash. Splits 95% across the top 5 non-stablecoin coins, leaves
      // 5% as cash buffer.
      if (top5.length === 0) {
        const targetCoins = state.coins.filter(c => c.symbol !== 'USDC').slice(0, 5);
        if (targetCoins.length === 0 || state.cash < 50) return state;
        const investable = state.cash * 0.95;
        const perCoin = investable / targetCoins.length;

        const newHoldings = targetCoins.map(c => ({
          symbol:  c.symbol,
          units:   perCoin / c.price,
          avgCost: c.price,
        }));
        const newTradesFromCold: Trade[] = targetCoins.map(c => ({
          id:        `SIM-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
          symbol:    c.symbol,
          side:      'buy',
          amount:    perCoin,
          units:     perCoin / c.price,
          price:     c.price,
          timestamp: Date.now(),
          xpEarned:  25,
          slippage:  0.001,
        }));
        const newCashCold     = state.cash - investable;
        const newBankrollCold = newCashCold + newHoldings.reduce((s, h) => {
          const c = state.coins.find(x => x.symbol === h.symbol);
          return s + (c ? c.price * h.units : 0);
        }, 0);
        return {
          ...state,
          cash:      newCashCold,
          bankroll:  newBankrollCold,
          holdings:  newHoldings,
          trades:    [...newTradesFromCold, ...state.trades],
          user:      { ...state.user, xp: state.user.xp + 50 },
          riskScore: computeRiskScore(newHoldings, newCashCold, newBankrollCold, state.coins, state.stopLosses),
        };
      }

      const holdingValues = top5.flatMap(h => {
        const coin = state.coins.find(c => c.symbol === h.symbol);
        if (!coin) return [];
        return [{ ...h, coin, currentValue: h.units * coin.price }];
      });
      if (holdingValues.length === 0) return state;
      const totalInvested = holdingValues.reduce((s, h) => s + h.currentValue, 0);
      const targetPerCoin = totalInvested / holdingValues.length;

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
    case 'SET_AVATAR_URI':
      return { ...state, user: { ...state.user, avatarUri: action.uri } };
    case 'SET_AVATAR':
      return { ...state, user: { ...state.user, avatarUri: action.uri, avatarKey: action.key } };
    case 'SET_CLOUD_NUDGES': {
      // Merge server-side nudges with locally-computed ones, dedupe by id, drop dismissed
      const merged = [...action.nudges, ...state.coachNudges]
        .filter(n => !state.dismissedNudgeIds.includes(n.id))
        .filter((n, i, arr) => arr.findIndex(x => x.id === n.id) === i)
        .slice(0, 3);
      return { ...state, coachNudges: merged };
    }
    case 'TOGGLE_WATCHLIST': {
      const inList = state.watchlist.includes(action.symbol);
      return {
        ...state,
        watchlist: inList
          ? state.watchlist.filter(s => s !== action.symbol)
          : [...state.watchlist, action.symbol],
      };
    }
    case 'SET_GLOBAL_STATS':
      return { ...state, globalStats: action.stats };
    case 'SET_FEAR_GREED':
      return { ...state, fearGreed: action.reading };
    case 'HYDRATE_GAMIFICATION':
      // Restore locally-persisted daily-claim state. streak is only overwritten
      // when storage provides one (signed-in users get the authoritative streak
      // from the cloud UserProfile via LOAD_PROFILE, which runs after this).
      return {
        ...state,
        lastClaimDay: action.data.lastClaimDay ?? state.lastClaimDay,
        achievements: action.data.achievements ?? state.achievements,
        user: typeof action.data.streak === 'number'
          ? { ...state.user, streak: action.data.streak }
          : state.user,
      };
    case 'SET_ACHIEVEMENTS':
      return { ...state, achievements: action.achievements };
    case 'CLAIM_DAILY_REWARD': {
      // Daily reward applies only to the main portfolio (contests have their own
      // fresh bankroll). The card is gated to main, but guard here too.
      if (state.activePortfolioId !== 'main') return state;
      const res = applyDailyClaim({ streak: state.user.streak, lastClaimDay: state.lastClaimDay }, Date.now());
      if (!res.claimed) return state;  // already claimed today → no-op
      // Record the cash bonus as a sentinel cash-injection trade (symbol 'USD',
      // kind 'reward'). The equity-history reconstruction treats symbol 'USD' as
      // a pure cash delta, so the portfolio line steps up at the claim without
      // distorting the reverse-replay baseline. amount = the cash granted.
      const rewardTrade: Trade = {
        id: `RWD-${Date.now()}`,
        symbol: CASH_EVENT_SYMBOL, side: 'buy', amount: res.cash,
        units: 0, price: 0, timestamp: Date.now(),
        xpEarned: res.xp, slippage: 0, kind: 'reward',
      };
      const newCash = state.cash + res.cash;
      const holdingsValue = state.holdings.reduce((s, h) => {
        const c = state.coins.find(x => x.symbol === h.symbol);
        return s + (c ? c.price * h.units : 0);
      }, 0);
      return {
        ...state,
        cash: newCash,
        bankroll: newCash + holdingsValue,
        lastClaimDay: res.lastClaimDay,
        trades: [rewardTrade, ...state.trades],
        user: { ...state.user, xp: state.user.xp + res.xp, streak: res.streak },
      };
    }
    case 'SET_COMPETITIONS':
      return { ...state, competitions: action.competitions };
    case 'JOIN_TOURNAMENT': {
      if (state.joinedTournamentIds.includes(action.tournamentId)) return state;
      // Spawn a fresh $10K portfolio for the new contest if one doesn't exist.
      const newPortfolios = state.portfolios[action.tournamentId]
        ? state.portfolios
        : { ...state.portfolios, [action.tournamentId]: { cash: 10000, holdings: [], trades: [] } };
      return {
        ...state,
        joinedTournamentIds: [...state.joinedTournamentIds, action.tournamentId],
        portfolios: newPortfolios,
      };
    }
    case 'LEAVE_TOURNAMENT': {
      // Drop the contest portfolio, and if it's currently active, fall back to main.
      const { [action.tournamentId]: _removed, ...remainingPortfolios } = state.portfolios;
      let nextActive = state.activePortfolioId;
      let nextCash = state.cash, nextHoldings = state.holdings, nextTrades = state.trades;
      if (state.activePortfolioId === action.tournamentId) {
        nextActive = 'main';
        const main = remainingPortfolios['main'] ?? { cash: 10000, holdings: [], trades: [] };
        nextCash = main.cash;
        nextHoldings = main.holdings;
        nextTrades = main.trades;
      }
      return {
        ...state,
        joinedTournamentIds: state.joinedTournamentIds.filter(id => id !== action.tournamentId),
        portfolios: remainingPortfolios,
        activePortfolioId: nextActive,
        cash: nextCash,
        holdings: nextHoldings,
        trades: nextTrades,
      };
    }
    case 'INIT_CONTEST_PORTFOLIO': {
      // Used when restoring a contest portfolio from cloud on login.
      const slice = action.slice ?? { cash: 10000, holdings: [], trades: [] };
      return {
        ...state,
        portfolios: { ...state.portfolios, [action.competitionId]: slice },
      };
    }
    case 'CLEAR_USER_DATA': {
      // Reset every per-user field back to INITIAL_STATE so a new user
      // signing in doesn't inherit the previous user's portfolios,
      // watchlist, alerts, etc. Coins (live prices) and competitions
      // (shared global list) are preserved.
      return {
        ...INITIAL_STATE,
        coins:        state.coins,
        competitions: state.competitions,
      };
    }
    case 'SWITCH_PORTFOLIO': {
      if (action.portfolioId === state.activePortfolioId) return state;
      // Stash current portfolio's live cash/holdings/trades back into the map,
      // then load the target. If the target doesn't exist yet, initialize it
      // with $10K cash. activeTournament stays null — it was UI-only legacy.
      const stashed = {
        ...state.portfolios,
        [state.activePortfolioId]: {
          cash: state.cash,
          holdings: state.holdings,
          trades: state.trades,
        },
      };
      const rawTarget = stashed[action.portfolioId]
        ?? { cash: 10000, holdings: [], trades: [] };
      // Heal the portfolio we're switching to (fold stranded USDC + blocked
      // coins back into cash, same as LOAD_PROFILE).
      const { holdings: targetHoldings, cash: targetCash } = healHoldings(rawTarget.holdings, rawTarget.cash, state.coins);
      const target = { ...rawTarget, holdings: targetHoldings, cash: targetCash };
      const holdingsValue = target.holdings.reduce((s, h) => {
        const c = state.coins.find(x => x.symbol === h.symbol);
        return s + (c ? c.price * h.units : 0);
      }, 0);
      return {
        ...state,
        activePortfolioId: action.portfolioId,
        portfolios: stashed,
        cash: target.cash,
        holdings: target.holdings,
        trades: target.trades,
        bankroll: target.cash + holdingsValue,
        // Coach nudges recomputed against the active portfolio so they stay
        // relevant. dismissedNudgeIds preserved across switches — nudge ids
        // are symbolic (e.g. conc-BTC), so a dismiss on one portfolio still
        // suppresses the same condition if it surfaces on another.
        coachNudges: computeCoachNudges(target.holdings, target.cash, target.cash + holdingsValue, state.coins, state.stopLosses, target.trades.length),
        riskScore: computeRiskScore(target.holdings, target.cash, target.cash + holdingsValue, state.coins, state.stopLosses),
      };
    }
    case 'SET_LEADERBOARD':
      return { ...state, leaderboard: { ...state.leaderboard, [action.competitionId]: action.entries } };
    case 'ADD_PRICE_ALERT': {
      const alert: PriceAlert = {
        id: `ALT-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        symbol: action.symbol,
        targetPrice: action.targetPrice,
        direction: action.direction,
        createdAt: Date.now(),
      };
      return { ...state, priceAlerts: [...state.priceAlerts, alert] };
    }
    case 'DISMISS_PRICE_ALERT':
      return {
        ...state,
        priceAlerts: state.priceAlerts.filter(a => a.id !== action.alertId),
        triggeredAlerts: state.triggeredAlerts.filter(a => a.id !== action.alertId),
      };
    case 'DISMISS_NUDGE':
      return { ...state, dismissedNudgeIds: [...state.dismissedNudgeIds, action.nudgeId] };
    case 'RESET_DEMO':
      // Truly clean: $10K cash, no holdings/trades/orders/joined comps, fresh
      // XP. Keeps profile identity (handle, avatar) and current coin prices.
      return {
        ...state,
        bankroll: 10000,
        cash: 10000,
        holdings: [],
        trades: [],
        pendingOrders: [],
        joinedTournamentIds: [],
        activeTournament: null,
        leaderboard: {},
        stopLosses: {},
        priceAlerts: [],
        triggeredAlerts: [],
        coachNudges: [],
        dismissedNudgeIds: [],
        riskScore: 100,
        user: { ...state.user, xp: 0, streak: 0, league: 'Bronze', division: 1 },
      };
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
  const [saveTick, setSaveTick] = useState(0);  // incremented by wrappedDispatch to trigger save effect
  const offlineHydratedRef = useRef(false);      // gate offline saves until we've loaded the saved portfolio
  const gamiHydratedRef = useRef(false);         // gate gamification saves until we've loaded local claim state
  const { status: authStatus } = useAuth();

  // Wrap dispatch so any state-mutating action that should persist to the
  // cloud sets lastActionRef — the save effect below picks it up. Includes
  // trades, rebalances, profile edits, watchlist changes, stop-losses, and
  // limit-order management.
  const SAVE_ACTIONS = [
    'SEED_STARTER',
    'BUY', 'SELL', 'REBALANCE',
    'SET_HANDLE', 'SET_AVATAR_COLOR', 'SET_AVATAR_URI', 'SET_AVATAR',
    'SET_STOP_LOSS', 'TOGGLE_WATCHLIST',
    'PLACE_LIMIT_ORDER', 'CANCEL_LIMIT_ORDER',
    'RESET_DEMO', 'CLAIM_DAILY_REWARD',
  ];
  const wrappedDispatch = (action: Action) => {
    // Persist the outgoing portfolio before switching, so the snapshot lands
    // in the right source (UserProfile for 'main', CompetitionEntry otherwise).
    if (action.type === 'SWITCH_PORTFOLIO' && authStatus === 'authenticated' && action.portfolioId !== state.activePortfolioId) {
      if (state.activePortfolioId === 'main') {
        saveProfile(state);
      } else {
        const pnlPct = ((state.bankroll - 10000) / 10000) * 100;
        saveContestPortfolio(
          state.activePortfolioId,
          { cash: state.cash, holdings: state.holdings, trades: state.trades },
          state.bankroll,
          pnlPct,
        );
      }
    }
    if (SAVE_ACTIONS.includes(action.type)) {
      lastActionRef.current = action;
      setSaveTick(t => t + 1);
    }
    dispatch(action);
  };

  // Always-on: price simulation. Competition fetch moved to auth-gated effect
  // because Competition's GraphQL schema is owner-scoped for writes and the
  // auto-seeder needs to persist rows on first run.
  useEffect(() => {
    tickRef.current = setInterval(() => dispatch({ type: 'TICK_PRICES' }), 2000);

    const doFetch = async () => {
      // Fan out all external market fetches in parallel so a slow one doesn't
      // block the others. Each call has its own cache + 429 backoff internally.
      const [prices, globalStats, fearGreed] = await Promise.all([
        fetchPrices().catch(() => null),
        fetchGlobalMarketStats().catch(() => null),
        fetchFearGreedIndex().catch(() => null),
      ]);
      if (prices) dispatch({ type: 'UPDATE_PRICES', prices });
      if (globalStats) dispatch({ type: 'SET_GLOBAL_STATS', stats: globalStats });
      if (fearGreed) dispatch({ type: 'SET_FEAR_GREED', reading: fearGreed });
    };
    // Token catalog (which symbols are tradeable + their CoinGecko ids) is
    // owned by the dashboard admin. Resolve it before the first price tick so
    // fetchPrices() reads the live id map. Falls through silently if the
    // catalog is empty — state.coins stays at the USDC-only fallback.
    (async () => {
      const catalog = await fetchTokenCatalog();
      if (catalog.length > 0) dispatch({ type: 'SET_COINS', coins: catalog });
      doFetch();
    })();
    priceRef.current = setInterval(doFetch, 10000);

    return () => {
      clearInterval(tickRef.current);
      clearInterval(priceRef.current);
    };
  }, []);

  // Wipe all per-user state when auth flips to unauthenticated. Otherwise a
  // sign-out followed by a different user's sign-in (no app reload) would
  // leave the previous user's portfolios / watchlist / alerts in state for
  // the new user to inherit.
  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      dispatch({ type: 'CLEAR_USER_DATA' });
    }
  }, [authStatus]);

  // Auth-gated: profile load + real-time subscriptions. AppSync rejects
  // observeQuery and any owner-scoped query without a Cognito JWT, so we
  // wait for status === 'authenticated' before touching the cloud.
  useEffect(() => {
    if (authStatus !== 'authenticated') return;

    loadProfile().then(profile => {
      if (profile) dispatch({ type: 'LOAD_PROFILE', profile });
    });

    fetchCompetitions().then(competitions => {
      dispatch({ type: 'SET_COMPETITIONS', competitions });
    });

    // Restore per-contest portfolios from CompetitionEntry rows
    loadContestPortfolios().then(stash => {
      for (const [competitionId, slice] of Object.entries(stash)) {
        dispatch({ type: 'INIT_CONTEST_PORTFOLIO', competitionId, slice });
      }
    });

    let unsubProfile: () => void = () => {};
    let unsubNudges:  () => void = () => {};
    // Stash the last cash/holdings signature we accepted so the subscription
    // doesn't bounce-back our own writes. The subscription fires once per
    // observeQuery update — including immediately after our own saveProfile —
    // and re-dispatching the just-saved data clobbers any in-flight local
    // state, producing a 1-2s flash to the saved snapshot before TICK_PRICES
    // recomputes. Skipping no-op updates breaks the loop.
    let lastSig = '';
    const accept = (profile: any) => {
      const sig = JSON.stringify([
        profile.cash,
        (profile.holdings ?? []).map((h: any) => [h.symbol, h.units, h.avgCost]),
      ]);
      if (sig === lastSig) return;
      lastSig = sig;
      dispatch({ type: 'LOAD_PROFILE', profile });
    };
    subscribeToProfile(accept).then(unsub => { unsubProfile = unsub; });
    subscribeToCoachNudges(nudges => dispatch({ type: 'SET_CLOUD_NUDGES', nudges }))
      .then(unsub => { unsubNudges = unsub; });

    // Live Competition list: new contests, status flips, entry-count rolls.
    let unsubComps: () => void = () => {};
    subscribeToCompetitions(comps => dispatch({ type: 'SET_COMPETITIONS', competitions: comps }))
      .then(unsub => { unsubComps = unsub; });

    return () => {
      unsubProfile();
      unsubNudges();
      unsubComps();
    };
  }, [authStatus]);

  // Offline portfolio persistence — hydrate. When unauthenticated, restore the
  // saved guest portfolio once (after CLEAR_USER_DATA has reset to INITIAL_STATE
  // for this auth flip). The ref gates the save effect below so it can't clobber
  // storage before we've read it. Resets when a user signs in so a later
  // sign-out re-hydrates.
  useEffect(() => {
    if (authStatus === 'authenticated') {
      offlineHydratedRef.current = false;
      return;
    }
    if (authStatus !== 'unauthenticated' || offlineHydratedRef.current) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(OFFLINE_PORTFOLIO_KEY);
        if (raw) dispatch({ type: 'HYDRATE_OFFLINE', portfolio: JSON.parse(raw) });
      } catch {
        // Corrupt/absent storage → fall through to the seeded starter.
      }
      offlineHydratedRef.current = true;
    })();
  }, [authStatus]);

  // Offline portfolio persistence — save. Only while unauthenticated and after
  // hydration, so guest trades/resets survive app restarts. No-op when signed
  // in (the cloud UserProfile owns persistence then).
  useEffect(() => {
    if (authStatus !== 'unauthenticated' || !offlineHydratedRef.current) return;
    const payload = JSON.stringify({
      cash:       state.cash,
      holdings:   state.holdings,
      trades:     state.trades,
      watchlist:  state.watchlist,
      stopLosses: state.stopLosses,
    });
    AsyncStorage.setItem(OFFLINE_PORTFOLIO_KEY, payload).catch(() => {});
  }, [authStatus, state.cash, state.holdings, state.trades, state.watchlist, state.stopLosses]);

  // Gamification (daily-claim) persistence — hydrate once on mount, regardless
  // of auth. For signed-in users the cloud LOAD_PROFILE runs later and sets the
  // authoritative streak; lastClaimDay stays device-local until Phase 9 adds a
  // cloud field. The ref gates the save effect below so it can't clobber storage
  // before we've read it.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(GAMIFICATION_KEY);
        if (raw) {
          const g = JSON.parse(raw);
          dispatch({
            type: 'HYDRATE_GAMIFICATION',
            data: {
              lastClaimDay: typeof g.lastClaimDay === 'string' ? g.lastClaimDay : null,
              streak: typeof g.streak === 'number' ? g.streak : undefined,
              achievements: g.achievements && typeof g.achievements === 'object' ? g.achievements : undefined,
            },
          });
        }
      } catch {
        // Corrupt/absent → leave defaults (null lastClaimDay, streak 0).
      }
      gamiHydratedRef.current = true;
    })();
  }, []);

  // Gamification persistence — save. Only after hydration, and skip the empty
  // state (no claim + no achievements) so CLEAR_USER_DATA's reset on sign-out
  // can't wipe a guest's stored progress.
  useEffect(() => {
    if (!gamiHydratedRef.current) return;
    if (state.lastClaimDay === null && Object.keys(state.achievements).length === 0) return;
    AsyncStorage.setItem(
      GAMIFICATION_KEY,
      JSON.stringify({
        lastClaimDay: state.lastClaimDay,
        streak: state.user.streak,
        achievements: state.achievements,
      }),
    ).catch(() => {});
  }, [state.lastClaimDay, state.user.streak, state.achievements]);

  // Seed the starter position once a brand-new portfolio (no holdings, no
  // trades) has live prices available. Runs for guests and new cloud accounts
  // alike; the reducer no-ops once there's any activity, and wrappedDispatch
  // persists it for signed-in users so it doesn't re-seed every load.
  useEffect(() => {
    const btc = state.coins.find(c => c.symbol === 'BTC');
    if (btc && btc.price > 0 && state.holdings.length === 0 && state.trades.length === 0) {
      wrappedDispatch({ type: 'SEED_STARTER' });
    }
  }, [state.coins, state.holdings.length, state.trades.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auth-gated leaderboard subscriptions, one per joined competition.
  // CompetitionEntry is allow.authenticated().to(['read']) so still needs a JWT.
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    const unsubs: (() => void)[] = [];
    state.joinedTournamentIds.forEach(competitionId => {
      subscribeToLeaderboard(competitionId, entries => {
        dispatch({ type: 'SET_LEADERBOARD', competitionId, entries });
      }).then(unsub => unsubs.push(unsub));
    });
    return () => unsubs.forEach(u => u());
  }, [authStatus, state.joinedTournamentIds]);

  // Sync portfolio to cloud after each trade
  useEffect(() => {
    const action = lastActionRef.current;
    if (!action) return;
    lastActionRef.current = null;

    if (authStatus !== 'authenticated') return;

    // Route the save to the active portfolio's persistence source.
    if (state.activePortfolioId === 'main') {
      saveProfile(state);
      // BUY/SELL prepend a coin trade; CLAIM_DAILY_REWARD prepends a 'USD'
      // cash-injection trade. Persist whichever just landed at trades[0] so it
      // survives reload (the reconstruction reads symbol 'USD' as a cash event).
      if ((action.type === 'BUY' || action.type === 'SELL' || action.type === 'CLAIM_DAILY_REWARD') && state.trades.length > 0) {
        saveTrade(state.trades[0]);
      }
    } else {
      const pnlPct = ((state.bankroll - 10000) / 10000) * 100;
      saveContestPortfolio(
        state.activePortfolioId,
        { cash: state.cash, holdings: state.holdings, trades: state.trades },
        state.bankroll,
        pnlPct,
      );
    }
  }, [saveTick, authStatus]); // eslint-disable-line react-hooks/exhaustive-deps

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
