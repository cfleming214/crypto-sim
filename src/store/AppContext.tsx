import React, { createContext, useContext, useReducer, useEffect, useRef, useState } from 'react';
import { AppState as RNAppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Coin, Holding, Trade, Competition, CompetitionEntry, PendingOrder, PriceAlert, CoachNudge, PortfolioSlice, BlockedUser, ReplayMeta, ReplayContestSummary } from './types';
import { replayPriceAt } from '../services/replayPricing';
import { fetchGlobalMarketStats, fetchFearGreedIndex, formatLargeNumber, type PriceData } from '../services/priceService';
import { loadProfileIfExists, createStarterProfile, adoptGuestProfile, saveProfile, saveTrade, saveEquityHistory, loadEquityHistory, subscribeToProfile, subscribeToCoachNudges, subscribeToLeaderboard, loadContestPortfolios, saveContestPortfolio, touchPresence, fetchMyContestWins } from '../services/portfolioService';
import { createCloudAlert, deleteCloudAlert, createCloudOrder, deleteCloudOrder, hydratePriceTriggers } from '../services/priceTriggerService';
import { fetchCompetitions, fetchFinishedCompetitions, subscribeToCompetitions } from '../services/competitionService';
import { saveReplayEntry, subscribeToReplayLeaderboard, fetchReplayContests } from '../services/replayService';
import { fetchTokenCatalog, fetchLivePrices } from '../services/tokenCatalog';
import { applyDailyClaim, sellXp, realizedPnl, PREDICTION_XP, PREDICTION_STREAK_XP, CASH_EVENT_SYMBOL, assignLeague, leagueRank, type PredictionOutcome } from '../services/gamification';
import { planRebalance, planCopyAllocation } from '../services/rebalance';
import { appendSnapshot, loadSnapshots, mergeSnapshots, downsampleForCloud, clearSnapshots } from '../services/equitySnapshots';
import { STARTING_CASH } from '../constants/featureFlags';
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
// cash anchor). The rest are the top-25 tradeable coins with seed prices so a
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
  { symbol: 'TRX',  name: 'TRON',       price: 0.27,   change24h: 0.8,   marketCap: '$24B',  volume: '$700M', history: [0.262,0.264,0.263,0.266,0.265,0.268,0.269,0.27] },
  { symbol: 'TON',  name: 'Toncoin',    price: 7.5,    change24h: 2.4,   marketCap: '$19B',  volume: '$400M', history: [7.38,7.42,7.40,7.46,7.44,7.48,7.49,7.5] },
  { symbol: 'SHIB', name: 'Shiba Inu',  price: 0.000025, change24h: 5.1, marketCap: '$15B',  volume: '$500M', history: [0.0000244,0.0000246,0.0000245,0.0000248,0.0000247,0.0000249,0.0000249,0.000025] },
  { symbol: 'LTC',  name: 'Litecoin',   price: 95,     change24h: -0.9,  marketCap: '$7B',   volume: '$350M', history: [93.2,93.8,93.5,94.3,94.0,94.6,94.8,95] },
  { symbol: 'BCH',  name: 'Bitcoin Cash', price: 480,  change24h: 1.3,   marketCap: '$9B',   volume: '$300M', history: [471,474,473,477,475,478,479,480] },
  { symbol: 'UNI',  name: 'Uniswap',    price: 12,     change24h: 2.0,   marketCap: '$9B',   volume: '$250M', history: [11.7,11.8,11.75,11.9,11.85,11.95,11.98,12] },
  { symbol: 'ATOM', name: 'Cosmos',     price: 9.5,    change24h: -1.4,  marketCap: '$4B',   volume: '$180M', history: [9.32,9.38,9.35,9.43,9.4,9.46,9.48,9.5] },
  { symbol: 'XLM',  name: 'Stellar',    price: 0.13,   change24h: 0.7,   marketCap: '$4B',   volume: '$150M', history: [0.1275,0.1285,0.128,0.129,0.1288,0.1295,0.1298,0.13] },
  { symbol: 'NEAR', name: 'NEAR Protocol', price: 6.0, change24h: 3.1,   marketCap: '$7B',   volume: '$300M', history: [5.88,5.92,5.9,5.95,5.93,5.97,5.99,6.0] },
  { symbol: 'APT',  name: 'Aptos',      price: 11,     change24h: 2.5,   marketCap: '$6B',   volume: '$250M', history: [10.7,10.8,10.75,10.9,10.85,10.95,10.98,11] },
  { symbol: 'ARB',  name: 'Arbitrum',   price: 1.10,   change24h: -2.2,  marketCap: '$4B',   volume: '$200M', history: [1.075,1.085,1.08,1.09,1.088,1.095,1.098,1.10] },
  { symbol: 'OP',   name: 'Optimism',   price: 2.20,   change24h: 1.9,   marketCap: '$3B',   volume: '$180M', history: [2.15,2.17,2.16,2.18,2.175,2.19,2.195,2.20] },
  { symbol: 'FIL',  name: 'Filecoin',   price: 6.0,    change24h: -0.5,  marketCap: '$4B',   volume: '$160M', history: [5.88,5.92,5.9,5.95,5.93,5.97,5.99,6.0] },
  { symbol: 'ICP',  name: 'Internet Computer', price: 13, change24h: 1.2, marketCap: '$6B',  volume: '$140M', history: [12.7,12.8,12.75,12.9,12.85,12.95,12.98,13] },
  { symbol: 'AAVE', name: 'Aave',       price: 110,    change24h: 2.8,   marketCap: '$2B',   volume: '$200M', history: [107.5,108.4,108.0,109.0,108.6,109.5,109.8,110] },
];

const INITIAL_HOLDINGS: { symbol: string; units: number; avgCost: number }[] = [];

// Local-storage key for the guest/offline portfolio (cash, holdings, trades,
// watchlist, stop-losses). Persisted only while unauthenticated; once a user
// signs in the cloud UserProfile is the source of truth.
const OFFLINE_PORTFOLIO_KEY = 'offlinePortfolio.v1';

// AsyncStorage key for the device's blocked-users list. Per-device (not
// per-account): a user's block choices persist across sign-out/sign-in so
// abusive traders stay hidden. Cleared only on account deletion.
const BLOCKED_KEY = 'blocked.v1';
const DISMISSED_NUDGES_KEY = 'dismissedNudges.v1';

// A market-sentiment nudge derived from the Fear & Greed index. Extreme greed
// (>=75) warns about froth; extreme fear (<=25) encourages sticking to a plan.
// Neutral bands produce nothing. Stable ids ('fng-greed'/'fng-fear') so it
// dedupes/dismisses cleanly and can be merged independently of trade nudges.
function fearGreedNudge(fg?: { value: number; label: string }): CoachNudge | null {
  if (!fg) return null;
  const now = Date.now();
  if (fg.value >= 75) {
    return { id: 'fng-greed', message: `Fear & Greed is ${fg.value} (${fg.label}) — markets are frothy. Consider trimming winners and checking your stop-losses.`, severity: 'warn', createdAt: now };
  }
  if (fg.value <= 25) {
    return { id: 'fng-fear', message: `Fear & Greed is ${fg.value} (${fg.label}) — extreme fear. Stick to your plan; dips can be accumulation chances, not panic exits.`, severity: 'tip', createdAt: now };
  }
  return null;
}

function computeCoachNudges(
  holdings: { symbol: string; units: number }[],
  cash: number,
  bankroll: number,
  coins: { symbol: string; price: number; change24h: number }[],
  stopLosses: Record<string, number>,
  tradeCount: number,
  fearGreed?: { value: number; label: string },
): CoachNudge[] {
  const nudges: CoachNudge[] = [];
  const now = Date.now();

  // Portfolio-specific nudges (only meaningful once invested).
  if (bankroll > 0 && holdings.length > 0) {
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
  }

  // Market-sentiment nudge (independent of holdings), appended after the
  // portfolio warnings so those keep priority within the 3-nudge cap.
  const fng = fearGreedNudge(fearGreed);
  if (fng) nudges.push(fng);

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
  bankroll: STARTING_CASH,
  cash: STARTING_CASH,
  holdings: INITIAL_HOLDINGS,
  trades: [],
  coins: INITIAL_COINS,
  activeTournament: null,
  competitions: [],                  // populated from cloud on auth
  finishedCompetitions: [],          // past contests (FinishedCompetition table)
  joinedTournamentIds: [],
  leaderboard: {},
  myContestWins: 0,
  pendingOrders: [],
  watchlist: ['BTC', 'ETH'],
  riskScore: 100,
  stopLosses: {},
  buyStops: {},
  priceAlerts: [],
  triggeredAlerts: [],
  coachNudges: [],
  dismissedNudgeIds: [],
  hasOnboarded: false,
  onboardingChecked: false,
  tradeSymbol: 'BTC',
  lastClaimDay: null,
  achievements: {},
  academyCompleted: [],
  predictionWins: 0,
  predictionLosses: 0,
  predictionStreak: 0,
  claimedContestIds: [],
  duelsCreated: 0,
  quests: { dayKey: null, baseline: { predictionsTotal: 0, lessonsTotal: 0, watchlistCount: 0 }, claimedIds: [], chestClaimed: false },
  season: { id: null, baselineXp: 0, claimedTiers: [] },
  cosmetics: { titles: [], frames: [], equippedTitle: null, equippedFrame: null },
  activePrediction: null,
  blockedUsers: [],
  activePortfolioId: 'main',
  portfolios: {},
  joinedReplayIds: [],
  replayMeta: {},
  replayPrices: {},
  replayContests: [],
};

type Action =
  | { type: 'TICK_PRICES' }
  | { type: 'UPDATE_PRICES'; prices: PriceData[] }
  | { type: 'SET_COINS'; coins: Coin[] }
  | { type: 'LOAD_PROFILE'; profile: Partial<AppState> }
  | { type: 'HYDRATE_OFFLINE'; portfolio: Partial<Pick<AppState, 'cash' | 'holdings' | 'trades' | 'watchlist' | 'stopLosses' | 'buyStops'>> }
  | { type: 'SEED_STARTER' }
  | { type: 'BUY'; symbol: string; amount: number }
  | { type: 'SELL'; symbol: string; amount: number }
  | { type: 'SET_ONBOARDED' }
  | { type: 'LOAD_ONBOARDING'; hasOnboarded: boolean }
  | { type: 'COMPLETE_LESSON'; lessonId: string; xp: number; total: number }
  | { type: 'ADD_XP'; amount: number }
  | { type: 'PROMOTE_LEAGUE'; league: string; division: number }
  | { type: 'SET_TRADE_SYMBOL'; symbol: string }
  | { type: 'SET_STOP_LOSS'; symbol: string; pct: number }
  | { type: 'SET_BUY_STOP'; symbol: string; price: number; amount: number }
  | { type: 'CLEAR_BUY_STOP'; symbol: string }
  | { type: 'REBALANCE' }
  | { type: 'COPY_ALLOCATION'; allocation: { symbol: string; pct: number }[] }
  | { type: 'SET_COMPETITIONS'; competitions: Competition[] }
  | { type: 'SET_FINISHED_COMPETITIONS'; competitions: Competition[] }
  | { type: 'JOIN_TOURNAMENT'; tournamentId: string }
  | { type: 'LEAVE_TOURNAMENT'; tournamentId: string }
  | { type: 'SET_LEADERBOARD'; competitionId: string; entries: CompetitionEntry[] }
  | { type: 'SET_MY_WINS'; wins: number }
  | { type: 'TOGGLE_WATCHLIST'; symbol: string }
  | { type: 'SET_HANDLE'; handle: string }
  | { type: 'SET_LEADERBOARD_VISIBLE'; visible: boolean }
  | { type: 'SET_AVATAR_COLOR'; color: string }
  | { type: 'PLACE_LIMIT_ORDER'; symbol: string; side: 'buy' | 'sell'; amount: number; limitPrice: number }
  | { type: 'CANCEL_LIMIT_ORDER'; orderId: string }
  | { type: 'ADD_PRICE_ALERT'; symbol: string; targetPrice: number; direction: 'above' | 'below' }
  | { type: 'DISMISS_PRICE_ALERT'; alertId: string }
  | { type: 'HYDRATE_PRICE_TRIGGERS'; alerts: PriceAlert[]; orders: PendingOrder[] }
  | { type: 'RESET_DEMO' }
  | { type: 'DISMISS_NUDGE'; nudgeId: string }
  | { type: 'SET_AVATAR_URI'; uri: string }
  | { type: 'SET_AVATAR'; uri: string; key: string }
  | { type: 'SET_CLOUD_NUDGES'; nudges: CoachNudge[] }
  | { type: 'SWITCH_PORTFOLIO'; portfolioId: string }
  | { type: 'INIT_CONTEST_PORTFOLIO'; competitionId: string; slice?: PortfolioSlice }
  | { type: 'JOIN_REPLAY'; replayContestId: string; meta: ReplayMeta }
  | { type: 'INIT_REPLAY_PORTFOLIO'; replayContestId: string; meta: ReplayMeta; slice?: PortfolioSlice }
  | { type: 'LEAVE_REPLAY'; replayContestId: string }
  | { type: 'SET_REPLAY_CONTESTS'; contests: ReplayContestSummary[] }
  | { type: 'CLEAR_USER_DATA' }
  | { type: 'SET_GLOBAL_STATS'; stats: { totalMarketCap: number; change24h: number } }
  | { type: 'SET_FEAR_GREED'; reading: { value: number; label: string } }
  | { type: 'CLAIM_DAILY_REWARD' }
  | { type: 'RECORD_PREDICTION'; outcome: PredictionOutcome }
  | { type: 'START_PREDICTION'; prediction: NonNullable<AppState['activePrediction']> }
  | { type: 'SETTLE_PREDICTION'; outcome: PredictionOutcome }
  | { type: 'CLAIM_CONTEST_XP'; contestId: string; xp: number }
  | { type: 'INCREMENT_DUELS_CREATED' }
  | { type: 'ROLL_QUEST_DAY'; dayKey: string }
  | { type: 'CLAIM_QUEST'; questId: string; xp: number }
  | { type: 'CLAIM_QUEST_CHEST'; xp: number; cash: number }
  | { type: 'ROLL_SEASON'; id: number; baselineXp: number }
  | { type: 'CLAIM_SEASON_TIER'; tier: number; kind: 'xp' | 'cash' | 'title' | 'frame'; value: number | string }
  | { type: 'EQUIP_COSMETIC'; slot: 'title' | 'frame'; id: string | null }
  | { type: 'SET_ACHIEVEMENTS'; achievements: Record<string, number> }
  | { type: 'BLOCK_USER'; user: BlockedUser }
  | { type: 'UNBLOCK_USER'; owner: string }
  | { type: 'HYDRATE_BLOCKED'; blockedUsers: BlockedUser[] }
  | { type: 'HYDRATE_DISMISSED_NUDGES'; ids: string[] }
  | { type: 'HYDRATE_GAMIFICATION'; data: { lastClaimDay: string | null; streak?: number; achievements?: Record<string, number>; academyCompleted?: string[]; predictionWins?: number; predictionLosses?: number; predictionStreak?: number; activePrediction?: AppState['activePrediction']; claimedContestIds?: string[]; duelsCreated?: number; quests?: AppState['quests']; season?: AppState['season']; cosmetics?: AppState['cosmetics'] } };

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

// True when the active portfolio is a joined replay contest.
function isReplayActive(state: AppState): boolean {
  return !!state.replayMeta[state.activePortfolioId];
}

// Authoritative price for a symbol in the CURRENT context: when a replay is the
// active portfolio, its event coin is priced at the deterministic minute close;
// everything else falls through to live `state.coins`.
function priceFor(symbol: string, state: AppState): number {
  const id = state.activePortfolioId;
  const meta = state.replayMeta[id];
  if (meta && symbol === meta.coin) return state.replayPrices[id] ?? meta.prices[0] ?? 0;
  return state.coins.find(c => c.symbol === symbol)?.price ?? 0;
}

// A coins array with the active replay's event coin overridden to its replay
// price — pass this anywhere a reducer values holdings (bankroll, risk, nudges)
// so a replay portfolio is valued at historical, not live, prices. Returns the
// untouched `state.coins` when no replay is active (no allocation cost).
function activeCoins(state: AppState): Coin[] {
  const id = state.activePortfolioId;
  const meta = state.replayMeta[id];
  if (!meta) return state.coins;
  const px = state.replayPrices[id] ?? meta.prices[0] ?? 0;
  return state.coins.map(c => (c.symbol === meta.coin ? { ...c, price: px } : c));
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'TICK_PRICES': {
      const coins = tickPrices(state.coins);

      // Advance the deterministic price of every joined replay contest from
      // elapsed real time — this is what makes a replay portfolio's value move.
      const nowTick = Date.now();
      const nextReplayPrices: Record<string, number> = {};
      for (const rid of state.joinedReplayIds) {
        const m = state.replayMeta[rid];
        if (m) nextReplayPrices[rid] = replayPriceAt(m, nowTick);
      }
      let newState = { ...state, coins, replayPrices: nextReplayPrices };

      // Background auto-fills (limit orders / stop-losses / buy-stops / alerts)
      // pertain to LIVE trading only — never run them against a replay portfolio's
      // historical prices.
      let stopsChanged = false;
      const replayActive = isReplayActive(state);
      if (!replayActive) {
      // Auto-fill triggered limit orders
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

      // Auto-fire stop-losses: when a held coin falls to avgCost×(1−pct/100),
      // market-sell the WHOLE position. Trade id 'STP-' so EventWatcher toasts it.
      for (const [sym, pct] of Object.entries(newState.stopLosses)) {
        const coin = newState.coins.find(c => c.symbol === sym);
        const h = newState.holdings.find(x => x.symbol === sym);
        if (!coin || !h || !(pct > 0)) continue;
        if (coin.price > h.avgCost * (1 - pct / 100)) continue;
        const proceeds = h.units * coin.price;
        const pnl = realizedPnl(h.avgCost, h.units, coin.price);
        const xpEarned = sellXp(pnl, proceeds);
        const trade: Trade = {
          id: `STP-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
          symbol: sym, side: 'sell', amount: proceeds, units: h.units,
          price: coin.price, timestamp: Date.now(), xpEarned, slippage: 0, realizedPnl: pnl,
        };
        const nextStops = { ...newState.stopLosses }; delete nextStops[sym];
        newState = {
          ...newState,
          cash: newState.cash + proceeds,
          holdings: newState.holdings.filter(x => x.symbol !== sym),
          trades: [trade, ...newState.trades],
          stopLosses: nextStops,
          user: { ...newState.user, xp: newState.user.xp + xpEarned },
        };
        stopsChanged = true;
      }

      // Auto-fire buy-stops: when a coin falls to the target, market-buy `amount`
      // dollars. Trade id 'BYS-' so EventWatcher toasts it.
      for (const [sym, bs] of Object.entries(newState.buyStops)) {
        const coin = newState.coins.find(c => c.symbol === sym);
        if (!coin || sym === 'USDC' || coin.price > bs.price || newState.cash < bs.amount) continue;
        const units = bs.amount / coin.price;
        const existing = newState.holdings.find(x => x.symbol === sym);
        const holdings = existing
          ? newState.holdings.map(x => x.symbol === sym
              ? { ...x, units: x.units + units, avgCost: (x.avgCost * x.units + bs.amount) / (x.units + units) }
              : x)
          : [...newState.holdings, { symbol: sym, units, avgCost: coin.price }];
        const trade: Trade = {
          id: `BYS-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
          symbol: sym, side: 'buy', amount: bs.amount, units,
          price: coin.price, timestamp: Date.now(), xpEarned: 25, slippage: 0,
        };
        const nextBuys = { ...newState.buyStops }; delete nextBuys[sym];
        newState = {
          ...newState,
          cash: newState.cash - bs.amount,
          holdings,
          trades: [trade, ...newState.trades],
          buyStops: nextBuys,
          user: { ...newState.user, xp: newState.user.xp + 25 },
        };
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
      } // end live-only auto-fills (skipped while a replay portfolio is active)

      // Value the active portfolio's holdings — replay-aware: a replay portfolio
      // values its event coin at the current historical price, not the live one.
      const valCoins = activeCoins(newState);
      const holdingsValue = newState.holdings.reduce((sum, h) => {
        const coin = valCoins.find(c => c.symbol === h.symbol);
        return sum + (coin ? coin.price * h.units : 0);
      }, 0);
      const tickedBankroll = newState.cash + holdingsValue;
      // A fired stop-loss removed a position → refresh the risk score against it.
      const tickedRisk = stopsChanged
        ? computeRiskScore(newState.holdings, newState.cash, tickedBankroll, valCoins, newState.stopLosses)
        : newState.riskScore;
      return { ...newState, bankroll: tickedBankroll, riskScore: tickedRisk };
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
      // Defensive: the joined list must hold each contest id at most once, or
      // the portfolio selector renders duplicate pills (same id → both
      // highlight, colliding key). De-dupe whatever the cloud load produced.
      if (merged.joinedTournamentIds) merged.joinedTournamentIds = [...new Set(merged.joinedTournamentIds)];
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
        merged.fearGreed,
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
        buyStops:   p.buyStops ?? state.buyStops,
        bankroll:   cash + holdingsValue,
      };
    }
    case 'SEED_STARTER':
      // Starter-position seeding removed: fresh portfolios now open with cash
      // only (no 0.01 BTC grant), so a new account starts flat at STARTING_CASH.
      // Kept as a no-op so the action wiring/allowlist stays valid.
      return state;
    case 'BUY': {
      // USDC is the cash anchor — "buying" it would just move spendable cash
      // into a holding that can't be spent or tapped. Reject it outright.
      if (action.symbol === 'USDC') return state;
      // A replay portfolio may only trade its single event coin.
      const buyReplay = state.replayMeta[state.activePortfolioId];
      if (buyReplay && action.symbol !== buyReplay.coin) return state;
      // Replay-aware prices: when a replay portfolio is active, its event coin is
      // valued at the deterministic historical minute price, not the live price.
      const coins = activeCoins(state);
      const coin = coins.find(c => c.symbol === action.symbol);
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
        const c = coins.find(x => x.symbol === h.symbol);
        return s + (c ? c.price * h.units : 0);
      }, 0);
      const newNudges = computeCoachNudges(holdings, newCash, newBankroll, coins, state.stopLosses, state.trades.length + 1, state.fearGreed);
      return {
        ...state,
        cash: newCash,
        bankroll: newBankroll,
        holdings,
        trades: [trade, ...state.trades],
        user: { ...state.user, xp: state.user.xp + 25 },
        riskScore: computeRiskScore(holdings, newCash, newBankroll, coins, state.stopLosses),
        coachNudges: newNudges,
        // dismissedNudgeIds preserved — a dismissed conc-BTC stays dismissed
        // even if the BTC concentration is still flagged after this trade.
      };
    }
    case 'SELL': {
      const sellReplay = state.replayMeta[state.activePortfolioId];
      if (sellReplay && action.symbol !== sellReplay.coin) return state;
      const coins = activeCoins(state);
      const coin = coins.find(c => c.symbol === action.symbol);
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
        const c = coins.find(x => x.symbol === h.symbol);
        return s + (c ? c.price * h.units : 0);
      }, 0);
      const newStopLosses = { ...state.stopLosses };
      if (unitsToSell >= holding.units) delete newStopLosses[action.symbol];
      const sellNudges = computeCoachNudges(holdings, newCashSell, newBankrollSell, coins, newStopLosses, state.trades.length + 1, state.fearGreed);
      return {
        ...state,
        cash: newCashSell,
        bankroll: newBankrollSell,
        holdings,
        trades: [trade, ...state.trades],
        stopLosses: newStopLosses,
        user: { ...state.user, xp: state.user.xp + sellXpEarned },
        riskScore: computeRiskScore(holdings, newCashSell, newBankrollSell, coins, newStopLosses),
        coachNudges: sellNudges,
        // dismissedNudgeIds preserved — see BUY for rationale.
      };
    }
    case 'SET_ONBOARDED':
      return { ...state, hasOnboarded: true, onboardingChecked: true };
    case 'LOAD_ONBOARDING':
      return { ...state, hasOnboarded: action.hasOnboarded, onboardingChecked: true };
    case 'COMPLETE_LESSON': {
      // Idempotent: award the lesson's XP once, append the id, and unlock the
      // 'graduate' achievement when the final lesson is done.
      if (state.academyCompleted.includes(action.lessonId)) return state;
      const academyCompleted = [...state.academyCompleted, action.lessonId];
      const achievements = { ...state.achievements };
      if (academyCompleted.length >= action.total && !achievements['graduate']) {
        achievements['graduate'] = Date.now();
      }
      return {
        ...state,
        academyCompleted,
        achievements,
        user: { ...state.user, xp: state.user.xp + action.xp },
      };
    }
    case 'ADD_XP':
      return { ...state, user: { ...state.user, xp: state.user.xp + action.amount } };
    case 'PROMOTE_LEAGUE':
      // Client-side level-up only — never demotes (see the on-load check).
      return { ...state, user: { ...state.user, league: action.league, division: action.division } };
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
    case 'SET_BUY_STOP': {
      if (!(action.price > 0) || !(action.amount > 0)) return state;
      return { ...state, buyStops: { ...state.buyStops, [action.symbol]: { price: action.price, amount: action.amount } } };
    }
    case 'CLEAR_BUY_STOP': {
      if (!state.buyStops[action.symbol]) return state;
      const next = { ...state.buyStops };
      delete next[action.symbol];
      return { ...state, buyStops: next };
    }
    case 'REBALANCE': {
      // Plan via the shared pure planner (src/services/rebalance.ts) so the
      // trades we apply here EXACTLY match the preview the user confirmed in the
      // RebalanceSheet. It picks DEPLOY (build an equal-weight top-5 basket from
      // idle cash — e.g. right after a reset, when only the starter seed is
      // held) vs EQUALIZE (level an existing multi-coin basket) automatically.
      const plan = planRebalance(state.holdings, state.cash, state.coins);
      if (plan.lines.length === 0) return state;

      let newHoldings = [...state.holdings];
      let newCash = state.cash;
      const newTrades = [...state.trades];

      // Sells first so their proceeds fund the buys in the same pass.
      for (const line of plan.lines) {
        if (line.side !== 'sell') continue;
        newHoldings = newHoldings
          .map(x => (x.symbol === line.symbol ? { ...x, units: x.units - line.units } : x))
          .filter(x => x.units > 0.000001);
        newCash += line.amount;
        newTrades.unshift({
          id: `SIM-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
          symbol: line.symbol, side: 'sell', amount: line.amount,
          units: line.units, price: line.price,
          timestamp: Date.now(), xpEarned: 10, slippage: 0.001,
        });
      }

      for (const line of plan.lines) {
        if (line.side !== 'buy') continue;
        if (newCash < line.amount) continue; // skip if proceeds didn't cover it
        const existing = newHoldings.find(x => x.symbol === line.symbol);
        newHoldings = existing
          ? newHoldings.map(x =>
              x.symbol === line.symbol
                ? { ...x, units: x.units + line.units, avgCost: (x.avgCost * x.units + line.amount) / (x.units + line.units) }
                : x,
            )
          : [...newHoldings, { symbol: line.symbol, units: line.units, avgCost: line.price }];
        newCash -= line.amount;
        newTrades.unshift({
          id: `SIM-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
          symbol: line.symbol, side: 'buy', amount: line.amount,
          units: line.units, price: line.price,
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
    case 'COPY_ALLOCATION': {
      // Rebalance MY offline portfolio to MATCH a trader's allocation weights —
      // same buy/sell engine as REBALANCE, just a different target plan. Sized
      // to my own equity, so I end with the same mix (not the same dollars).
      const plan = planCopyAllocation(state.holdings, state.cash, state.coins, action.allocation);
      if (plan.lines.length === 0) return state;

      let newHoldings = [...state.holdings];
      let newCash = state.cash;
      const newTrades = [...state.trades];

      for (const line of plan.lines) {
        if (line.side !== 'sell') continue;
        newHoldings = newHoldings
          .map(x => (x.symbol === line.symbol ? { ...x, units: x.units - line.units } : x))
          .filter(x => x.units > 0.000001);
        newCash += line.amount;
        newTrades.unshift({
          id: `SIM-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
          symbol: line.symbol, side: 'sell', amount: line.amount,
          units: line.units, price: line.price,
          timestamp: Date.now(), xpEarned: 10, slippage: 0.001,
        });
      }
      for (const line of plan.lines) {
        if (line.side !== 'buy') continue;
        if (newCash < line.amount) continue;
        const existing = newHoldings.find(x => x.symbol === line.symbol);
        newHoldings = existing
          ? newHoldings.map(x =>
              x.symbol === line.symbol
                ? { ...x, units: x.units + line.units, avgCost: (x.avgCost * x.units + line.amount) / (x.units + line.units) }
                : x,
            )
          : [...newHoldings, { symbol: line.symbol, units: line.units, avgCost: line.price }];
        newCash -= line.amount;
        newTrades.unshift({
          id: `SIM-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
          symbol: line.symbol, side: 'buy', amount: line.amount,
          units: line.units, price: line.price,
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
    case 'SET_LEADERBOARD_VISIBLE':
      return { ...state, user: { ...state.user, leaderboardVisible: action.visible } };
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
    case 'SET_FEAR_GREED': {
      // Refresh the F&G sentiment nudge in place without disturbing other
      // (trade- or cloud-sourced) nudges: drop any prior fng-* nudge, then add
      // the current one if the band is extreme and it isn't dismissed. Capped 3.
      const fng = fearGreedNudge(action.reading);
      const withoutFng = state.coachNudges.filter(n => !n.id.startsWith('fng-'));
      const coachNudges = fng && !state.dismissedNudgeIds.includes(fng.id)
        ? [...withoutFng, fng].slice(0, 3)
        : withoutFng;
      return { ...state, fearGreed: action.reading, coachNudges };
    }
    case 'HYDRATE_GAMIFICATION':
      // Restore locally-persisted daily-claim state. streak is only overwritten
      // when storage provides one (signed-in users get the authoritative streak
      // from the cloud UserProfile via LOAD_PROFILE, which runs after this).
      return {
        ...state,
        lastClaimDay: action.data.lastClaimDay ?? state.lastClaimDay,
        achievements: action.data.achievements ?? state.achievements,
        academyCompleted: action.data.academyCompleted ?? state.academyCompleted,
        predictionWins: action.data.predictionWins ?? state.predictionWins,
        predictionLosses: action.data.predictionLosses ?? state.predictionLosses,
        predictionStreak: action.data.predictionStreak ?? state.predictionStreak,
        activePrediction: action.data.activePrediction ?? state.activePrediction,
        claimedContestIds: action.data.claimedContestIds ?? state.claimedContestIds,
        duelsCreated: action.data.duelsCreated ?? state.duelsCreated,
        quests: action.data.quests ?? state.quests,
        season: action.data.season ?? state.season,
        cosmetics: action.data.cosmetics ?? state.cosmetics,
        user: typeof action.data.streak === 'number'
          ? { ...state.user, streak: action.data.streak }
          : state.user,
      };
    case 'SET_ACHIEVEMENTS':
      return { ...state, achievements: action.achievements };
    case 'BLOCK_USER': {
      // De-dupe by owner so re-blocking is idempotent. The matching content
      // disappears from every feed on the next render (feeds filter on this).
      if (state.blockedUsers.some(b => b.owner === action.user.owner)) return state;
      return { ...state, blockedUsers: [...state.blockedUsers, action.user] };
    }
    case 'UNBLOCK_USER':
      return { ...state, blockedUsers: state.blockedUsers.filter(b => b.owner !== action.owner) };
    case 'HYDRATE_BLOCKED':
      return { ...state, blockedUsers: action.blockedUsers };
    case 'HYDRATE_DISMISSED_NUDGES':
      // Union so a dismissal that happened before hydration completed isn't lost.
      return { ...state, dismissedNudgeIds: [...new Set([...action.ids, ...state.dismissedNudgeIds])] };
    case 'RECORD_PREDICTION': {
      if (action.outcome === 'push') return state;  // tie → no win/loss, no XP, streak unchanged
      const won = action.outcome === 'win';
      // Each consecutive correct call stacks a +500 XP streak bonus on top of the
      // base win XP: 1st in a row +500, 2nd +1000, 3rd +1500… A loss resets it.
      const nextStreak = won ? state.predictionStreak + 1 : 0;
      const gained = won ? PREDICTION_XP + nextStreak * PREDICTION_STREAK_XP : 0;
      return {
        ...state,
        predictionWins: state.predictionWins + (won ? 1 : 0),
        predictionLosses: state.predictionLosses + (won ? 0 : 1),
        predictionStreak: nextStreak,
        user: { ...state.user, xp: state.user.xp + gained },
      };
    }
    case 'START_PREDICTION':
      // One prediction at a time: ignore if a live (unexpired) one already exists.
      if (state.activePrediction && Date.now() < state.activePrediction.expiresAt) return state;
      return { ...state, activePrediction: action.prediction };
    case 'SETTLE_PREDICTION': {
      // Single-authority guard: only the first settle counts. The global
      // PredictionWatcher is the sole resolver, but this also prevents any
      // stray double-dispatch from awarding XP twice.
      if (!state.activePrediction) return state;
      // Clear the active round and record the outcome (win/loss + XP), reusing
      // the same streak-bonus scoring as RECORD_PREDICTION. A push just clears it
      // and leaves the streak intact.
      const won = action.outcome === 'win';
      const nextStreak = won ? state.predictionStreak + 1 : 0;
      const gained = won ? PREDICTION_XP + nextStreak * PREDICTION_STREAK_XP : 0;
      const scored = action.outcome === 'push' ? {} : {
        predictionWins: state.predictionWins + (won ? 1 : 0),
        predictionLosses: state.predictionLosses + (won ? 0 : 1),
        predictionStreak: nextStreak,
        user: { ...state.user, xp: state.user.xp + gained },
      };
      return { ...state, activePrediction: null, ...scored };
    }
    case 'CLAIM_CONTEST_XP': {
      // Idempotent: a contest's XP prize is awarded once. Guard on the claimed set.
      if (action.xp <= 0 || state.claimedContestIds.includes(action.contestId)) return state;
      return {
        ...state,
        claimedContestIds: [...state.claimedContestIds, action.contestId],
        user: { ...state.user, xp: state.user.xp + action.xp },
      };
    }
    case 'INCREMENT_DUELS_CREATED':
      return { ...state, duelsCreated: state.duelsCreated + 1 };
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
    case 'ROLL_QUEST_DAY':
      // New UTC day: re-snapshot the baselines (so "today" metrics restart from
      // zero) and clear claims. No-op if already on this day.
      if (state.quests.dayKey === action.dayKey) return state;
      return {
        ...state,
        quests: {
          dayKey: action.dayKey,
          baseline: {
            predictionsTotal: state.predictionWins + state.predictionLosses,
            lessonsTotal: state.academyCompleted.length,
            watchlistCount: state.watchlist.length,
          },
          claimedIds: [],
          chestClaimed: false,
        },
      };
    case 'CLAIM_QUEST': {
      if (state.quests.claimedIds.includes(action.questId)) return state;  // already claimed
      return {
        ...state,
        quests: { ...state.quests, claimedIds: [...state.quests.claimedIds, action.questId] },
        user: { ...state.user, xp: state.user.xp + action.xp },
      };
    }
    case 'CLAIM_QUEST_CHEST': {
      if (state.quests.chestClaimed) return state;
      // Bonus cash rides in as a sentinel reward trade, same as the daily reward.
      const chestTrade: Trade = {
        id: `QST-${Date.now()}`,
        symbol: CASH_EVENT_SYMBOL, side: 'buy', amount: action.cash,
        units: 0, price: 0, timestamp: Date.now(),
        xpEarned: action.xp, slippage: 0, kind: 'reward',
      };
      const newCash = state.cash + action.cash;
      const holdingsValue = state.holdings.reduce((s, h) => {
        const c = state.coins.find(x => x.symbol === h.symbol);
        return s + (c ? c.price * h.units : 0);
      }, 0);
      return {
        ...state,
        cash: newCash,
        bankroll: newCash + holdingsValue,
        trades: [chestTrade, ...state.trades],
        quests: { ...state.quests, chestClaimed: true },
        user: { ...state.user, xp: state.user.xp + action.xp },
      };
    }
    case 'ROLL_SEASON':
      // New season window: snapshot the XP baseline + clear claimed tiers.
      // Cosmetics are intentionally preserved. No-op if already on this season.
      if (state.season.id === action.id) return state;
      return { ...state, season: { id: action.id, baselineXp: action.baselineXp, claimedTiers: [] } };
    case 'CLAIM_SEASON_TIER': {
      if (state.season.claimedTiers.includes(action.tier)) return state;
      const season = { ...state.season, claimedTiers: [...state.season.claimedTiers, action.tier] };
      if (action.kind === 'xp') {
        return { ...state, season, user: { ...state.user, xp: state.user.xp + Number(action.value) } };
      }
      if (action.kind === 'cash') {
        const cash = Number(action.value);
        const tierTrade: Trade = {
          id: `SSN-${Date.now()}`,
          symbol: CASH_EVENT_SYMBOL, side: 'buy', amount: cash,
          units: 0, price: 0, timestamp: Date.now(), xpEarned: 0, slippage: 0, kind: 'reward',
        };
        const newCash = state.cash + cash;
        const holdingsValue = state.holdings.reduce((s, h) => {
          const c = state.coins.find(x => x.symbol === h.symbol);
          return s + (c ? c.price * h.units : 0);
        }, 0);
        return { ...state, season, cash: newCash, bankroll: newCash + holdingsValue, trades: [tierTrade, ...state.trades] };
      }
      // Cosmetic unlock (title or frame). Auto-equip if nothing is equipped yet.
      const id = String(action.value);
      if (action.kind === 'title') {
        return { ...state, season, cosmetics: {
          ...state.cosmetics,
          titles: state.cosmetics.titles.includes(id) ? state.cosmetics.titles : [...state.cosmetics.titles, id],
          equippedTitle: state.cosmetics.equippedTitle ?? id,
        } };
      }
      return { ...state, season, cosmetics: {
        ...state.cosmetics,
        frames: state.cosmetics.frames.includes(id) ? state.cosmetics.frames : [...state.cosmetics.frames, id],
        equippedFrame: state.cosmetics.equippedFrame ?? id,
      } };
    }
    case 'EQUIP_COSMETIC':
      return { ...state, cosmetics: {
        ...state.cosmetics,
        ...(action.slot === 'title' ? { equippedTitle: action.id } : { equippedFrame: action.id }),
      } };
    case 'SET_COMPETITIONS':
      return { ...state, competitions: action.competitions };
    case 'SET_FINISHED_COMPETITIONS':
      return { ...state, finishedCompetitions: action.competitions };
    case 'JOIN_TOURNAMENT': {
      if (state.joinedTournamentIds.includes(action.tournamentId)) return state;
      // Spawn a fresh $100K portfolio for the new contest if one doesn't exist.
      const newPortfolios = state.portfolios[action.tournamentId]
        ? state.portfolios
        : { ...state.portfolios, [action.tournamentId]: { cash: STARTING_CASH, holdings: [], trades: [] } };
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
        const main = remainingPortfolios['main'] ?? { cash: STARTING_CASH, holdings: [], trades: [] };
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
      const slice = action.slice ?? { cash: STARTING_CASH, holdings: [], trades: [] };
      return {
        ...state,
        portfolios: { ...state.portfolios, [action.competitionId]: slice },
      };
    }
    case 'SET_REPLAY_CONTESTS':
      return { ...state, replayContests: action.contests };
    case 'SET_MY_WINS':
      return { ...state, myContestWins: action.wins };
    case 'JOIN_REPLAY': {
      const id = action.replayContestId;
      if (state.joinedReplayIds.includes(id)) return state;
      // Spawn a fresh $100K portfolio (reuses the portfolios map so the selector
      // pill + equity capture work) and stash the replay config + opening price.
      return {
        ...state,
        joinedReplayIds: [...state.joinedReplayIds, id],
        portfolios: state.portfolios[id] ? state.portfolios : { ...state.portfolios, [id]: { cash: STARTING_CASH, holdings: [], trades: [] } },
        replayMeta: { ...state.replayMeta, [id]: action.meta },
        replayPrices: { ...state.replayPrices, [id]: replayPriceAt(action.meta, Date.now()) },
      };
    }
    case 'INIT_REPLAY_PORTFOLIO': {
      // Login restore from a ReplayEntry row + its ReplayContest config.
      const id = action.replayContestId;
      const slice = action.slice ?? { cash: STARTING_CASH, holdings: [], trades: [] };
      return {
        ...state,
        joinedReplayIds: state.joinedReplayIds.includes(id) ? state.joinedReplayIds : [...state.joinedReplayIds, id],
        portfolios: { ...state.portfolios, [id]: slice },
        replayMeta: { ...state.replayMeta, [id]: action.meta },
        replayPrices: { ...state.replayPrices, [id]: replayPriceAt(action.meta, Date.now()) },
      };
    }
    case 'LEAVE_REPLAY': {
      const id = action.replayContestId;
      const { [id]: _removedSlice, ...remainingPortfolios } = state.portfolios;
      const { [id]: _removedMeta, ...remainingMeta } = state.replayMeta;
      const { [id]: _removedPrice, ...remainingPrices } = state.replayPrices;
      let nextActive = state.activePortfolioId;
      let nextCash = state.cash, nextHoldings = state.holdings, nextTrades = state.trades;
      if (state.activePortfolioId === id) {
        nextActive = 'main';
        const main = remainingPortfolios['main'] ?? { cash: STARTING_CASH, holdings: [], trades: [] };
        nextCash = main.cash; nextHoldings = main.holdings; nextTrades = main.trades;
      }
      return {
        ...state,
        joinedReplayIds: state.joinedReplayIds.filter(x => x !== id),
        portfolios: remainingPortfolios,
        replayMeta: remainingMeta,
        replayPrices: remainingPrices,
        activePortfolioId: nextActive,
        cash: nextCash, holdings: nextHoldings, trades: nextTrades,
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
        finishedCompetitions: state.finishedCompetitions,
        replayContests: state.replayContests,   // shared global list, like competitions
        // Blocked users are per-device, not per-account — a sign-out shouldn't
        // un-hide traders this device chose to block. Preserved across the wipe;
        // only account deletion purges the 'blocked.v1' store.
        blockedUsers: state.blockedUsers,
      };
    }
    case 'SWITCH_PORTFOLIO': {
      if (action.portfolioId === state.activePortfolioId) return state;
      // Stash current portfolio's live cash/holdings/trades back into the map,
      // then load the target. If the target doesn't exist yet, initialize it
      // with $100K cash. activeTournament stays null — it was UI-only legacy.
      const stashed = {
        ...state.portfolios,
        [state.activePortfolioId]: {
          cash: state.cash,
          holdings: state.holdings,
          trades: state.trades,
        },
      };
      const rawTarget = stashed[action.portfolioId]
        ?? { cash: STARTING_CASH, holdings: [], trades: [] };
      // Heal the portfolio we're switching to (fold stranded USDC + blocked
      // coins back into cash, same as LOAD_PROFILE).
      const { holdings: targetHoldings, cash: targetCash } = healHoldings(rawTarget.holdings, rawTarget.cash, state.coins);
      const target = { ...rawTarget, holdings: targetHoldings, cash: targetCash };
      // If switching INTO a replay, value its event coin at the historical price.
      const targetMeta = state.replayMeta[action.portfolioId];
      const switchCoins = targetMeta
        ? state.coins.map(c => (c.symbol === targetMeta.coin ? { ...c, price: replayPriceAt(targetMeta, Date.now()) } : c))
        : state.coins;
      const holdingsValue = target.holdings.reduce((s, h) => {
        const c = switchCoins.find(x => x.symbol === h.symbol);
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
        coachNudges: computeCoachNudges(target.holdings, target.cash, target.cash + holdingsValue, switchCoins, state.stopLosses, target.trades.length, state.fearGreed),
        riskScore: computeRiskScore(target.holdings, target.cash, target.cash + holdingsValue, switchCoins, state.stopLosses),
      };
    }
    case 'SET_LEADERBOARD': {
      // De-dupe by handle: a player can hold more than one CompetitionEntry for a
      // contest (leaving used to drop only the local slice, never the cloud row,
      // so a rejoin stacked a second entry), which listed their username twice.
      // Collapse to one row per handle, keeping the richest (highest bankroll).
      const byHandle = new Map<string, CompetitionEntry>();
      for (const e of action.entries) {
        const prev = byHandle.get(e.handle);
        if (!prev || e.bankroll > prev.bankroll) byHandle.set(e.handle, e);
      }
      return { ...state, leaderboard: { ...state.leaderboard, [action.competitionId]: [...byHandle.values()] } };
    }
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
    case 'HYDRATE_PRICE_TRIGGERS': {
      // Merge cloud-persisted alerts/orders into local state on launch (union by
      // id) so they survive reinstall / sync across devices.
      const haveAlerts = new Set(state.priceAlerts.map(a => a.id));
      const haveOrders = new Set(state.pendingOrders.map(o => o.id));
      return {
        ...state,
        priceAlerts: [...state.priceAlerts, ...action.alerts.filter(a => !haveAlerts.has(a.id))],
        pendingOrders: [...state.pendingOrders, ...action.orders.filter(o => !haveOrders.has(o.id))],
      };
    }
    case 'DISMISS_NUDGE':
      return { ...state, dismissedNudgeIds: [...state.dismissedNudgeIds, action.nudgeId] };
    case 'RESET_DEMO':
      // Truly clean: $100K cash, no holdings/trades/orders/joined comps, fresh
      // XP. Keeps profile identity (handle, avatar, createdAt) and current coin
      // prices. resetAt re-anchors the equity graph (see the reset effect).
      return {
        ...state,
        resetAt: Date.now(),
        bankroll: STARTING_CASH,
        cash: STARTING_CASH,
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

// True when the guest has done anything beyond the auto-seeded starter (0.01
// BTC + its SEED- trade): a real buy/sell/daily-reward always leaves a non-SEED
// trade in the ledger. Used at first sign-up to decide whether to adopt the
// guest portfolio into the new account vs. start them on a fresh starter.
function hasMeaningfulGuestPortfolio(s: AppState): boolean {
  return s.trades.some(t => !t.id.startsWith('SEED-'));
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const tickRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const priceRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const lastActionRef = useRef<Action | null>(null);
  const [saveTick, setSaveTick] = useState(0);  // incremented by wrappedDispatch to trigger save effect
  const [profileLoaded, setProfileLoaded] = useState(false); // true once the cloud profile load resolves (gates seeding)
  const offlineHydratedRef = useRef(false);      // gate offline saves until we've loaded the saved portfolio
  const gamiHydratedRef = useRef(false);         // gate gamification saves until we've loaded local claim state
  const blockedHydratedRef = useRef(false);      // gate blocked-users saves until we've loaded the stored list
  const nudgesHydratedRef = useRef(false);       // gate dismissed-nudge saves until we've loaded the stored list
  const stateRef = useRef(state);                // always-latest state, for async effects that must read the guest portfolio at sign-in time
  stateRef.current = state;
  const lastCloudFlushRef = useRef(0);           // throttle the equity-history cloud backup (~15 min)
  const triggersHydratedRef = useRef(false);     // gate: load cloud alerts/orders once per auth session
  const seenAlertIds = useRef<Set<string>>(new Set());  // alert ids already mirrored to the cloud
  const seenOrderIds = useRef<Set<string>>(new Set());  // order ids already mirrored to the cloud
  const { status: authStatus } = useAuth();
  const authRef = useRef(authStatus);            // latest auth status for timer/AppState callbacks
  authRef.current = authStatus;
  const profileLoadedRef = useRef(false);        // mirror of profileLoaded for the ref-closure capture timer
  profileLoadedRef.current = profileLoaded;

  // Wrap dispatch so any state-mutating action that should persist to the
  // cloud sets lastActionRef — the save effect below picks it up. Includes
  // trades, rebalances, profile edits, watchlist changes, stop-losses, and
  // limit-order management.
  const SAVE_ACTIONS = [
    'SEED_STARTER',
    'BUY', 'SELL', 'REBALANCE', 'COPY_ALLOCATION',
    'SET_HANDLE', 'SET_LEADERBOARD_VISIBLE', 'SET_AVATAR_COLOR', 'SET_AVATAR_URI', 'SET_AVATAR',
    'SET_STOP_LOSS', 'TOGGLE_WATCHLIST',
    'PLACE_LIMIT_ORDER', 'CANCEL_LIMIT_ORDER',
    'RESET_DEMO', 'CLAIM_DAILY_REWARD', 'RECORD_PREDICTION', 'SETTLE_PREDICTION', 'CLAIM_CONTEST_XP', 'INCREMENT_DUELS_CREATED',
    // Daily-quest + season-pass progress: without these, claims persisted only to
    // local storage and the stale cloud gamificationJson overwrote them on the
    // next LOAD_PROFILE — so quests/season tiers were claimable again every
    // session. Rolls persist the new day/season baseline too.
    'CLAIM_QUEST', 'CLAIM_QUEST_CHEST', 'CLAIM_SEASON_TIER', 'ROLL_QUEST_DAY', 'ROLL_SEASON',
  ];
  const wrappedDispatch = (action: Action) => {
    // Persist the outgoing portfolio before switching, so the snapshot lands
    // in the right source (UserProfile for 'main', CompetitionEntry otherwise).
    if (action.type === 'SWITCH_PORTFOLIO' && authStatus === 'authenticated' && action.portfolioId !== state.activePortfolioId) {
      const outId = state.activePortfolioId;
      const outSlice = { cash: state.cash, holdings: state.holdings, trades: state.trades };
      const outPnl = ((state.bankroll - STARTING_CASH) / STARTING_CASH) * 100;
      const outMeta = state.replayMeta[outId];
      if (outId === 'main') saveProfile(state);
      else if (outMeta) { if (!outMeta.solo) saveReplayEntry(outId, outSlice, state.bankroll, outPnl); }
      else saveContestPortfolio(outId, outSlice, state.bankroll, outPnl);
      // Heal the contest/replay we're switching INTO: push its true bankroll to
      // the cloud entry now, before any trade (a fresh join reports $100K / 0%).
      if (action.portfolioId !== 'main') {
        const inMeta = state.replayMeta[action.portfolioId];
        const inPrice = inMeta ? replayPriceAt(inMeta, Date.now()) : 0;
        const incoming = state.portfolios[action.portfolioId] ?? { cash: STARTING_CASH, holdings: [], trades: [] };
        const inBankroll = incoming.cash + incoming.holdings.reduce((s, h) => {
          if (inMeta && h.symbol === inMeta.coin) return s + inPrice * h.units;
          const c = state.coins.find(x => x.symbol === h.symbol);
          return s + (c ? c.price * h.units : 0);
        }, 0);
        const inPnl = ((inBankroll - STARTING_CASH) / STARTING_CASH) * 100;
        if (inMeta) { if (!inMeta.solo) saveReplayEntry(action.portfolioId, incoming, inBankroll, inPnl); }
        else saveContestPortfolio(action.portfolioId, incoming, inBankroll, inPnl);
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
        // Backend-first (Token table, refreshed centrally by tick-prices) so
        // signed-in devices don't each hit the shared CoinGecko key.
        fetchLivePrices().catch(() => null),
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

  // Hydrate cloud-persisted price alerts + limit orders once signed in, so they
  // survive reinstall and sync across devices. Seeds seenAlertIds/seenOrderIds
  // with the cloud ids so the sync effect below doesn't try to re-create them.
  useEffect(() => {
    if (authStatus !== 'authenticated' || triggersHydratedRef.current) return;
    triggersHydratedRef.current = true;
    (async () => {
      const { alerts, orders } = await hydratePriceTriggers();
      alerts.forEach(a => seenAlertIds.current.add(a.id));
      orders.forEach(o => seenOrderIds.current.add(o.id));
      if (alerts.length || orders.length) dispatch({ type: 'HYDRATE_PRICE_TRIGGERS', alerts, orders });
    })();
  }, [authStatus]);

  // Mirror local alert/order changes to the cloud so the price-watch Lambda can
  // act on them while the app is closed. New ids → create the row; removed ids
  // (cancelled OR locally filled) → delete it. Deleting on a local fill is also
  // the mutex that stops the server from re-filling an order the client already
  // filled. No-ops for guests (the service short-circuits when unconfigured).
  // Depends on authStatus too, so the moment a guest signs in this re-runs and
  // uploads any alerts/orders they created while signed out (hydrate seeds the
  // seen sets synchronously before its dispatch, so cloud items aren't re-created).
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    const curAlerts = new Set(state.priceAlerts.map(a => a.id));
    for (const a of state.priceAlerts) {
      if (!seenAlertIds.current.has(a.id)) { seenAlertIds.current.add(a.id); createCloudAlert(a); }
    }
    for (const id of [...seenAlertIds.current]) {
      if (!curAlerts.has(id)) { seenAlertIds.current.delete(id); deleteCloudAlert(id); }
    }
    const curOrders = new Set(state.pendingOrders.map(o => o.id));
    for (const o of state.pendingOrders) {
      if (!seenOrderIds.current.has(o.id)) { seenOrderIds.current.add(o.id); createCloudOrder(o); }
    }
    for (const id of [...seenOrderIds.current]) {
      if (!curOrders.has(id)) { seenOrderIds.current.delete(id); deleteCloudOrder(id); }
    }
  }, [state.priceAlerts, state.pendingOrders, authStatus]);

  // Always-on: record the live portfolio balance every 60s so the equity chart
  // is driven by ACTUAL observed values, not reconstruction. Reads the latest
  // state at fire time (stateRef) and writes to the active portfolio's local
  // snapshot store. Time the app is closed is filled in by backfillGap when the
  // PortfolioScreen next loads (see services/equitySnapshots.ts). Skips the
  // pre-price warmup (bankroll 0) so we don't seed a bogus point.
  const CLOUD_FLUSH_MS = 15 * 60_000;
  const flushEquityToCloud = async (series: { t: number; v: number }[]) => {
    // Cloud-backup only the main portfolio (contests persist their own slice)
    // and only when authenticated. Coarse (hourly/daily) copy to keep the
    // DynamoDB write small. Caller is responsible for throttling.
    if (authRef.current !== 'authenticated') return;
    lastCloudFlushRef.current = Date.now();
    await saveEquityHistory(downsampleForCloud(series, Date.now()));
  };
  useEffect(() => {
    const capture = async () => {
      const s = stateRef.current;
      if (!(s.bankroll > 0)) return;
      // Don't record the INITIAL_STATE $100k placeholder before real data has
      // loaded — that produces a spurious dip-to-$100k on the equity chart.
      // Authenticated: wait for the cloud profile; guest: wait for local hydrate.
      const ready = (authRef.current === 'authenticated' && profileLoadedRef.current)
        || (authRef.current === 'unauthenticated' && offlineHydratedRef.current);
      if (!ready) return;
      const series = await appendSnapshot(s.activePortfolioId, { t: Date.now(), v: s.bankroll });
      if (s.activePortfolioId === 'main' && Date.now() - lastCloudFlushRef.current >= CLOUD_FLUSH_MS) {
        flushEquityToCloud(series);
      }
      // Presence heartbeat — refresh lastActiveAt while foregrounded so other
      // viewers see an accurate online dot (one cheap single-field write/min).
      if (authRef.current === 'authenticated') touchPresence();
    };
    const id = setInterval(capture, 60_000);
    return () => clearInterval(id);
  }, []);

  // Seed the equity graph's origin point at account creation, so a brand-new
  // profile's chart starts at t0 (not a synthetic placeholder) and then builds
  // minute-by-minute off the capture interval above. Runs once, as soon as the
  // bankroll is warm: only when there are no snapshots yet AND no real trading
  // activity (the 0.01 BTC starter grant is a SEED- row, which doesn't count).
  const seededOriginRef = useRef(false);
  useEffect(() => {
    if (seededOriginRef.current) return;
    if (!(state.bankroll > 0)) return;
    // Wait until the real balance is loaded — otherwise this seeds the chart with
    // the INITIAL_STATE $100k placeholder (the dip-to-$100k bug). Re-runs when
    // profileLoaded/hydration flips, so it still fires exactly once when ready.
    const ready = (authStatus === 'authenticated' && profileLoaded)
      || (authStatus === 'unauthenticated' && offlineHydratedRef.current);
    if (!ready) return;
    const portfolioId = state.activePortfolioId;
    const isFreshProfile = !state.trades.some(t => !t.id.startsWith('SEED-'));
    seededOriginRef.current = true;
    (async () => {
      const existing = await loadSnapshots(portfolioId);
      // Fresh profile with no history → anchor an origin point at account creation.
      if (existing.length === 0 && isFreshProfile) {
        const originT = state.user.createdAt ?? Date.now();
        await appendSnapshot(portfolioId, { t: originT, v: state.bankroll });
      }
      // Always record a point at app-open. Otherwise a short session (opened for
      // under 60s, before the capture interval fires) contributes no sub-hour
      // data and the Live/1H windows never accumulate points.
      await appendSnapshot(portfolioId, { t: Date.now(), v: state.bankroll });
    })();
  }, [state.bankroll, state.activePortfolioId, state.trades, state.user.createdAt, profileLoaded, authStatus]);

  // Re-anchor the equity graph on RESET_DEMO. A reset means "fresh $100K
  // portfolio starting now", so we wipe the old curve and seed a new origin at
  // the reset moment (the account's createdAt is deliberately left untouched).
  // Overwriting the cloud backup stops a reload from restoring the pre-reset
  // history. resetAt is ephemeral (not persisted), so this never re-fires on
  // app reload.
  const lastHandledResetRef = useRef(0);
  useEffect(() => {
    const resetAt = state.resetAt ?? 0;
    if (!resetAt || resetAt === lastHandledResetRef.current) return;
    lastHandledResetRef.current = resetAt;
    seededOriginRef.current = true; // we seed explicitly here; block the mount-seed
    (async () => {
      await clearSnapshots('main');
      const series = await appendSnapshot('main', { t: resetAt, v: STARTING_CASH });
      flushEquityToCloud(series); // overwrite the cloud backup with the cleared series
    })();
  }, [state.resetAt]);

  // Flush the equity backup when the app backgrounds, so the latest local
  // points survive even if the throttle window hasn't elapsed. This is the main
  // cloud write for light sessions (open → glance → background).
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', next => {
      // On every foreground, record a point so brief sessions (which never let
      // the 60s capture interval fire) still contribute Live/1H data.
      if (next === 'active') {
        const s = stateRef.current;
        if (s.bankroll > 0) appendSnapshot(s.activePortfolioId, { t: Date.now(), v: s.bankroll });
        // Mark the user online again the moment they return to the app.
        if (authRef.current === 'authenticated') touchPresence();
        return;
      }
      if (next !== 'background' && next !== 'inactive') return;
      const s = stateRef.current;
      if (s.activePortfolioId !== 'main' || authRef.current !== 'authenticated' || !(s.bankroll > 0)) return;
      loadSnapshots('main').then(series => { if (series.length) flushEquityToCloud(series); });
    });
    return () => sub.remove();
  }, []);

  // Wipe all per-user state when auth flips to unauthenticated. Otherwise a
  // sign-out followed by a different user's sign-in (no app reload) would
  // leave the previous user's portfolios / watchlist / alerts in state for
  // the new user to inherit.
  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      dispatch({ type: 'CLEAR_USER_DATA' });
      // The equity-snapshot store is keyed "main" for both the signed-in user
      // and the guest, so without this the guest's portfolio chart shows the
      // previous user's recorded balance history. Safe to wipe — a returning
      // user's cloud backup (equityHistoryJson) re-seeds it on next sign-in.
      clearSnapshots('main').catch(() => {});
      // Reset the price-trigger sync gates so the NEXT user to sign in hydrates
      // their own cloud alerts/orders (the hydrate ref is "once per session") and
      // doesn't inherit the previous user's mirrored ids.
      triggersHydratedRef.current = false;
      seenAlertIds.current.clear();
      seenOrderIds.current.clear();
    }
  }, [authStatus]);

  // Auth-gated: profile load + real-time subscriptions. AppSync rejects
  // observeQuery and any owner-scoped query without a Cognito JWT, so we
  // wait for status === 'authenticated' before touching the cloud.
  useEffect(() => {
    if (authStatus !== 'authenticated') return;

    // Gate seeding on the profile load completing (see the SEED_STARTER effect):
    // without this, the brief empty INITIAL_STATE at mount spawns a duplicate
    // starter-seed trade in the cloud on every login.
    setProfileLoaded(false);
    // Snapshot the portfolio AS OF the moment of authentication. On sign-IN this
    // is whatever loaded; on first sign-UP (guest → authenticated, which does NOT
    // fire CLEAR_USER_DATA) it's the guest's live portfolio — the thing we want
    // to carry into the new account instead of resetting.
    const guestSnapshot = stateRef.current;
    loadProfileIfExists()
      .then(async (res) => {
        if (res.status === 'exists') {
          // Returning sign-in → load the cloud account.
          dispatch({ type: 'LOAD_PROFILE', profile: res.profile });
          // Seed the local equity-snapshot store from the cloud backup so the
          // chart's history survives a reinstall / new device. Merges under the
          // local store's retention; new 1-min points accrue from here.
          loadEquityHistory().then(points => {
            if (points.length) {
              mergeSnapshots('main', points);
              lastCloudFlushRef.current = Date.now();  // just synced — hold off the next flush
            }
          });
        } else if (res.status === 'new') {
          // Brand-new account. If the guest actually built something, register
          // that portfolio to the new user (write it to the cloud, keep local
          // state). Otherwise seed a fresh starter.
          if (hasMeaningfulGuestPortfolio(guestSnapshot)) {
            await adoptGuestProfile(guestSnapshot);
            // Keep local state — it already IS the adopted portfolio. No
            // LOAD_PROFILE, so cash/holdings/trades are preserved exactly.
          } else {
            const starter = await createStarterProfile();
            if (starter) dispatch({ type: 'LOAD_PROFILE', profile: starter });
          }
        }
        // res.status === 'error' → keep local state (network hiccup); a later
        // saveProfile/subscription reconciles. Never write on an error.
      })
      .finally(() => setProfileLoaded(true));

    fetchCompetitions().then(competitions => {
      dispatch({ type: 'SET_COMPETITIONS', competitions });
    });
    fetchFinishedCompetitions().then(competitions => {
      if (competitions.length) dispatch({ type: 'SET_FINISHED_COMPETITIONS', competitions });
    });
    fetchReplayContests().then(contests => {
      if (contests.length) dispatch({ type: 'SET_REPLAY_CONTESTS', contests });
    });
    // Your own contest-win count, so it shows even when opted out of the board.
    fetchMyContestWins().then(wins => dispatch({ type: 'SET_MY_WINS', wins }));

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
      // The observeQuery subscription can emit one last cached event AFTER
      // sign-out (before unsub lands), which would re-run LOAD_PROFILE on top of
      // CLEAR_USER_DATA and restore the previous user's handle/avatar on the
      // guest home. Drop any emission once we're no longer authenticated.
      if (authRef.current !== 'authenticated') return;
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
      buyStops:   state.buyStops,
    });
    AsyncStorage.setItem(OFFLINE_PORTFOLIO_KEY, payload).catch(() => {});
  }, [authStatus, state.cash, state.holdings, state.trades, state.watchlist, state.stopLosses, state.buyStops]);

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
              academyCompleted: Array.isArray(g.academyCompleted) ? g.academyCompleted.filter((x: any) => typeof x === 'string') : undefined,
              predictionWins: typeof g.predictionWins === 'number' ? g.predictionWins : undefined,
              predictionLosses: typeof g.predictionLosses === 'number' ? g.predictionLosses : undefined,
              predictionStreak: typeof g.predictionStreak === 'number' ? g.predictionStreak : undefined,
              activePrediction: g.activePrediction && typeof g.activePrediction === 'object' ? g.activePrediction : undefined,
              claimedContestIds: Array.isArray(g.claimedContestIds) ? g.claimedContestIds.filter((x: any) => typeof x === 'string') : undefined,
              duelsCreated: typeof g.duelsCreated === 'number' ? g.duelsCreated : undefined,
              // These were SAVED but never restored here, so daily-quest claims,
              // season-pass tier claims, and earned cosmetics reset on every
              // launch (QuestWatcher then rolled a fresh day/season). Restore them.
              quests: g.quests && typeof g.quests === 'object' ? g.quests : undefined,
              season: g.season && typeof g.season === 'object' ? g.season : undefined,
              cosmetics: g.cosmetics && typeof g.cosmetics === 'object' ? g.cosmetics : undefined,
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
    const empty = state.lastClaimDay === null
      && Object.keys(state.achievements).length === 0
      && state.academyCompleted.length === 0
      && state.predictionWins === 0
      && state.predictionLosses === 0
      && !state.activePrediction
      && state.claimedContestIds.length === 0
      && state.duelsCreated === 0
      && state.quests.claimedIds.length === 0
      && !state.quests.chestClaimed
      && state.season.claimedTiers.length === 0
      && state.cosmetics.titles.length === 0
      && state.cosmetics.frames.length === 0;
    if (empty) return;
    AsyncStorage.setItem(
      GAMIFICATION_KEY,
      JSON.stringify({
        lastClaimDay: state.lastClaimDay,
        streak: state.user.streak,
        achievements: state.achievements,
        academyCompleted: state.academyCompleted,
        predictionWins: state.predictionWins,
        predictionLosses: state.predictionLosses,
        predictionStreak: state.predictionStreak,
        activePrediction: state.activePrediction ?? null,
        claimedContestIds: state.claimedContestIds,
        duelsCreated: state.duelsCreated,
        quests: state.quests,
        season: state.season,
        cosmetics: state.cosmetics,
      }),
    ).catch(() => {});
  }, [state.lastClaimDay, state.user.streak, state.achievements, state.academyCompleted, state.predictionWins, state.predictionLosses, state.predictionStreak, state.activePrediction, state.claimedContestIds, state.duelsCreated, state.quests, state.season, state.cosmetics]);

  // Tier sync. Lifetime XP maps directly onto a fixed 10-level ladder (see
  // assignLeague), so whenever XP changes — or the stored tier/division is stale
  // (e.g. a "division 3" left over from the old 3-division scheme) — snap the
  // player to the level their XP qualifies for. XP only ever grows, so in
  // practice this only climbs; the correction also self-heals any out-of-range
  // division. Persisted via the normal profile save.
  useEffect(() => {
    const target = assignLeague(state.user.xp);
    if (target.league !== state.user.league || target.division !== state.user.division) {
      dispatch({ type: 'PROMOTE_LEAGUE', league: target.league, division: target.division });
    }
  }, [state.user.xp]); // eslint-disable-line react-hooks/exhaustive-deps

  // Onboarding flag — read the persisted value once on mount so RootNavigator
  // knows whether to show the first-run walkthrough. Resolves during the splash.
  useEffect(() => {
    AsyncStorage.getItem('hasOnboarded')
      .then(v => dispatch({ type: 'LOAD_ONBOARDING', hasOnboarded: v === 'true' }))
      .catch(() => dispatch({ type: 'LOAD_ONBOARDING', hasOnboarded: false }));
  }, []);

  // Blocked-users persistence — hydrate once on mount (per-device, auth-agnostic)
  // then save on every change. The ref gates the save so the empty initial list
  // can't clobber a stored one before hydration completes.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(BLOCKED_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            dispatch({
              type: 'HYDRATE_BLOCKED',
              blockedUsers: parsed.filter((b: any) => b && typeof b.owner === 'string'),
            });
          }
        }
      } catch {
        // Corrupt/absent → leave the empty default.
      }
      blockedHydratedRef.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!blockedHydratedRef.current) return;
    AsyncStorage.setItem(BLOCKED_KEY, JSON.stringify(state.blockedUsers)).catch(() => {});
  }, [state.blockedUsers]);

  // Dismissed coach-nudge ids persistence — same pattern. Coach nudges are
  // recomputed from the portfolio on every launch, so without persisting which
  // ones were dismissed (the X), every dismissed tip reappeared on reopen.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DISMISSED_NUDGES_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            dispatch({ type: 'HYDRATE_DISMISSED_NUDGES', ids: parsed.filter((x: any) => typeof x === 'string') });
          }
        }
      } catch {
        // Corrupt/absent → leave the empty default.
      }
      nudgesHydratedRef.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!nudgesHydratedRef.current) return;
    AsyncStorage.setItem(DISMISSED_NUDGES_KEY, JSON.stringify(state.dismissedNudgeIds)).catch(() => {});
  }, [state.dismissedNudgeIds]);

  // Auth-gated leaderboard subscriptions, one per joined competition.
  // CompetitionEntry is allow.authenticated().to(['read']) so still needs a JWT.
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    const unsubs: (() => void)[] = [];
    state.joinedTournamentIds.forEach(competitionId => {
      subscribeToLeaderboard(competitionId, entries => {
        // Ignore empty snapshots. observeQuery emits a partial/empty local-cache
        // snapshot before it syncs from the cloud; dispatching it would wipe the
        // populated list (the names vanish). refreshLeaderboard applies the same
        // guard — a contest with real entries never legitimately reads as empty.
        if (entries.length === 0) return;
        dispatch({ type: 'SET_LEADERBOARD', competitionId, entries });
      }).then(unsub => unsubs.push(unsub));
    });
    return () => unsubs.forEach(u => u());
  }, [authStatus, state.joinedTournamentIds]);

  // Auth-gated leaderboard subscriptions for joined REPLAY contests (ReplayEntry).
  // Reuses the same SET_LEADERBOARD map (replay ids never collide with contest ids).
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    const unsubs: (() => void)[] = [];
    // Solo replays have no cloud entries/leaderboard — only subscribe contests.
    state.joinedReplayIds.filter(id => !state.replayMeta[id]?.solo).forEach(replayContestId => {
      subscribeToReplayLeaderboard(replayContestId, entries => {
        if (entries.length === 0) return;
        dispatch({ type: 'SET_LEADERBOARD', competitionId: replayContestId, entries });
      }).then(unsub => unsubs.push(unsub));
    });
    return () => unsubs.forEach(u => u());
  }, [authStatus, state.joinedReplayIds]);

  // Sync portfolio to cloud after each trade
  useEffect(() => {
    const action = lastActionRef.current;
    if (!action) return;

    if (authStatus !== 'authenticated') { lastActionRef.current = null; return; }
    // Defer the first save until the bootstrap load-or-create has resolved.
    // Otherwise an early autosave races the starter create: its own list-check
    // can't yet see the just-created row (eventual consistency), so it writes a
    // second UserProfile — the "you" + "newtrader" duplicate pair. Keep the
    // pending action so it saves once profileLoaded flips.
    if (!profileLoaded) return;
    lastActionRef.current = null;

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
      const pnlPct = ((state.bankroll - STARTING_CASH) / STARTING_CASH) * 100;
      const slice = { cash: state.cash, holdings: state.holdings, trades: state.trades };
      // Replay portfolios persist to ReplayEntry (separate table); contests to
      // CompetitionEntry. Solo replays are local-only (no cloud entry).
      const activeMeta = state.replayMeta[state.activePortfolioId];
      if (activeMeta) {
        if (!activeMeta.solo) saveReplayEntry(state.activePortfolioId, slice, state.bankroll, pnlPct);
      } else {
        saveContestPortfolio(state.activePortfolioId, slice, state.bankroll, pnlPct);
      }
    }
  }, [saveTick, authStatus, profileLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Replay-aware: when a replay portfolio is active, its event coin reports the
  // current historical price (so the holdings list / donut value it correctly).
  const getCoin = (symbol: string) => {
    const c = state.coins.find(x => x.symbol === symbol);
    const meta = state.replayMeta[state.activePortfolioId];
    if (c && meta && symbol === meta.coin) {
      return { ...c, price: state.replayPrices[state.activePortfolioId] ?? meta.prices[0] ?? c.price };
    }
    return c;
  };

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
