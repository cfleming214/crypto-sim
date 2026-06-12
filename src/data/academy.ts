// Crypto Academy curriculum. Each lesson = short explainer sections → an optional
// "try it" that deep-links to a real feature → a quick quiz → XP. Copy is in the
// app's coaching voice (mirrors the Fear & Greed explainer + coach nudges).
//
// Visuals are lightweight enums the LessonScreen maps to existing components.

export type LessonVisual = 'candles' | 'chart' | 'risk' | 'feargreed' | 'leagues';

export interface LessonSection {
  heading: string;
  body: string;           // **bold** segments are rendered emphasized
  visual?: LessonVisual;
}

export interface TryIt {
  hint: string;                                   // what to do
  cta: string;                                    // button label
  target: { name: string; params?: Record<string, any> };  // navigate() args
  // Optional auto-detect of completion when the user returns to the lesson.
  check?: 'trade' | 'alert' | 'limit' | 'watchlist' | 'stop' | 'daily';
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explain: string;
}

export interface Lesson {
  id: string;
  category: string;
  title: string;
  emoji: string;
  minutes: number;
  sections: LessonSection[];
  tryIt?: TryIt;
  quiz: QuizQuestion[];
  xp: number;
}

export const ACADEMY_CATEGORIES = ['Crypto basics', 'Reading the market', 'Risk & strategy', 'Using the app'] as const;

export const ACADEMY: Lesson[] = [
  // ── Crypto basics ──────────────────────────────────────────────────────────
  {
    id: 'what-is-crypto', category: 'Crypto basics', title: 'What is crypto?', emoji: '🪙', minutes: 2, xp: 40,
    sections: [
      { heading: 'Digital money on a shared ledger', body: 'A cryptocurrency like **Bitcoin** is money that lives on a **blockchain** — a public record copied across thousands of computers. No bank or government runs it; the network agrees on every balance.' },
      { heading: 'Why people care', body: 'Because supply is limited and no single party controls it, people treat crypto as both a way to send value anywhere and a **speculative asset** whose price moves a lot.' },
      { heading: 'In this app it\'s risk-free', body: 'Everything here is **simulated** with a $100,000 practice balance. Prices are real and live — but you can\'t lose real money learning.' },
    ],
    quiz: [
      { question: 'What records crypto transactions?', options: ['A central bank', 'A blockchain (shared public ledger)', 'A single company server'], correctIndex: 1, explain: 'A blockchain is a public ledger copied across many computers — no single owner.' },
    ],
  },
  {
    id: 'price-supply-mcap', category: 'Crypto basics', title: 'Price, supply & market cap', emoji: '📊', minutes: 3, xp: 50,
    sections: [
      { heading: 'A "cheap" coin isn\'t cheaper', body: 'A coin at **$0.10** isn\'t a better deal than one at **$60,000**. What matters is **market cap** = price × the number of coins in circulation.' },
      { heading: 'Market cap = total value', body: 'A coin priced at $0.10 with 1 trillion coins is worth **$100B** — bigger than many coins that cost thousands. Compare market caps, not sticker prices.' },
      { heading: 'See it in Markets', body: 'The Markets tab shows each coin\'s price, 24h change, **market cap** and volume so you can size them up properly.' },
    ],
    tryIt: { hint: 'Open Markets and compare two coins by market cap, not price.', cta: 'Open Markets', target: { name: 'MainTabs', params: { screen: 'Markets' } } },
    quiz: [
      { question: 'Which tells you a coin\'s total size?', options: ['Its price per coin', 'Its market cap (price × supply)', 'Its 24h % change'], correctIndex: 1, explain: 'Market cap = price × circulating supply. A low price can still be a huge coin.' },
    ],
  },
  {
    id: 'volatility', category: 'Crypto basics', title: 'Volatility: why prices swing', emoji: '🎢', minutes: 2, xp: 40,
    sections: [
      { heading: 'Crypto moves fast', body: 'Crypto is **volatile** — double-digit moves in a day are normal. That\'s the opportunity and the risk: gains and losses both come quickly.' },
      { heading: 'Don\'t chase every candle', body: 'Big green days tempt you to buy the top; big red days tempt you to panic-sell the bottom. A plan beats reacting to every swing.' },
    ],
    quiz: [
      { question: 'A coin dropping 12% in a day means…', options: ['Something is broken', 'Normal crypto volatility', 'You must sell immediately'], correctIndex: 1, explain: 'Large daily swings are normal for crypto. Stick to your plan instead of reacting.' },
    ],
  },
  {
    id: 'stablecoins', category: 'Crypto basics', title: 'Stablecoins & USDC', emoji: '💵', minutes: 2, xp: 40,
    sections: [
      { heading: 'A coin pegged to $1', body: '**USDC** is a stablecoin designed to always equal **$1**. It barely moves, so traders use it like cash — a safe place to sit between trades.' },
      { heading: 'Your "cash" here', body: 'In this app your spendable balance acts like USDC: when you sell a coin, the value returns to cash you can redeploy.' },
    ],
    quiz: [
      { question: 'What is a stablecoin like USDC for?', options: ['Maximum upside', 'Holding steady value (~$1) like cash', 'Mining new coins'], correctIndex: 1, explain: 'Stablecoins track $1 so you can hold value steady between trades.' },
    ],
  },

  // ── Reading the market ─────────────────────────────────────────────────────
  {
    id: 'candlesticks', category: 'Reading the market', title: 'Reading candlestick charts', emoji: '🕯️', minutes: 3, xp: 50,
    sections: [
      { heading: 'Green up, red down', body: '**Green** bars mean the price closed higher than it opened. **Red** means it dropped. Each bar covers one slice of time.', visual: 'candles' },
      { heading: 'The wicks show the range', body: 'The thin line through a bar marks the **high and low** for that period — how far price travelled before settling.' },
      { heading: 'Timeframes', body: 'Switch 24H → MAX to zoom out. Short frames show noise; longer frames show the real trend.' },
    ],
    tryIt: { hint: 'Open a coin\'s chart and flip between 24H and MAX.', cta: 'Open a chart', target: { name: 'Trade', params: { symbol: 'BTC' } } },
    quiz: [
      { question: 'A green candle means the price…', options: ['Closed higher than it opened', 'Hit an all-time high', 'Has low volume'], correctIndex: 0, explain: 'Green = close above open for that period; red = close below.' },
    ],
  },
  {
    id: 'indicators', category: 'Reading the market', title: 'Indicators: MA & RSI', emoji: '📈', minutes: 3, xp: 50,
    sections: [
      { heading: 'Moving averages smooth the noise', body: 'An **MA20 / MA50** is the average price over the last 20 / 50 periods. When price is above its MA, the trend is generally up.' },
      { heading: 'RSI: overbought vs oversold', body: '**RSI** runs 0–100. Above ~70 can mean "overbought" (a lot of buying, maybe due for a pause); below ~30 "oversold". They\'re hints, not guarantees.' },
      { heading: 'Toggle them on the chart', body: 'On the Trade screen tap **Indicators** to overlay MA20, MA50 and RSI.' },
    ],
    tryIt: { hint: 'On a chart, tap Indicators and turn on RSI.', cta: 'Open a chart', target: { name: 'Trade', params: { symbol: 'ETH' } } },
    quiz: [
      { question: 'An RSI above 70 often suggests…', options: ['Oversold / cheap', 'Overbought / lots of recent buying', 'The coin is a stablecoin'], correctIndex: 1, explain: 'High RSI = strong recent buying ("overbought"); low RSI = "oversold". Treat as a hint.' },
    ],
  },
  {
    id: 'fear-greed', category: 'Reading the market', title: 'Fear & Greed sentiment', emoji: '😱', minutes: 2, xp: 40,
    sections: [
      { heading: 'A 0–100 mood score', body: 'The **Fear & Greed Index** scores the market\'s mood. Low = investors are **fearful** (selling, prices depressed); high = **greedy** (buying, prices frothy).', visual: 'feargreed' },
      { heading: 'A contrarian read', body: 'Extreme greed (≥75) can mean froth — a time to trim winners and check stops. Extreme fear (≤25) can be accumulation, not panic. It\'s a signal, not a command.' },
    ],
    tryIt: { hint: 'In Markets, tap the Fear & Greed gauge to read today\'s score.', cta: 'Open Markets', target: { name: 'MainTabs', params: { screen: 'Markets' } } },
    quiz: [
      { question: 'Extreme greed (75+) is often a moment to…', options: ['Buy aggressively', 'Be cautious — trim winners, check stops', 'Ignore your plan'], correctIndex: 1, explain: 'Frothy/greedy markets are when contrarians get cautious rather than chase.' },
    ],
  },

  // ── Risk & strategy ────────────────────────────────────────────────────────
  {
    id: 'diversification', category: 'Risk & strategy', title: 'Diversification', emoji: '🧺', minutes: 2, xp: 50,
    sections: [
      { heading: 'Don\'t put it all in one coin', body: 'Holding **100% of one coin** means one bad day can wreck your whole portfolio. Spreading across **3–5 assets** reduces single-coin risk.' },
      { heading: 'Watch concentration', body: 'A good rule of thumb: keep any single coin **under ~40%** of your portfolio. The app\'s coach will nudge you when you drift over.' },
    ],
    quiz: [
      { question: 'Why diversify across several coins?', options: ['To pay fewer fees', 'So one coin\'s bad day doesn\'t sink everything', 'It guarantees profit'], correctIndex: 1, explain: 'Diversification spreads risk — one coin\'s crash hurts less.' },
    ],
  },
  {
    id: 'stops-sizing', category: 'Risk & strategy', title: 'Stop-losses & position sizing', emoji: '🛡️', minutes: 3, xp: 60,
    sections: [
      { heading: 'Size each position', body: 'Putting **$100 into one coin out of a $100k bankroll is 1%** — small enough that being wrong barely hurts. Sizing keeps any single mistake survivable.', visual: 'risk' },
      { heading: 'Stop-losses auto-protect', body: 'A **stop-loss** auto-sells if a coin drops a set % from here, locking in a floor so a dip can\'t become a disaster while you\'re away.' },
      { heading: 'Set one in seconds', body: 'On a coin you hold, set a 5% stop. You can always change or remove it.' },
    ],
    tryIt: { hint: 'Buy a small position, then set a 5% stop-loss on it.', cta: 'Open the Trade screen', target: { name: 'Trade', params: { symbol: 'SOL' } }, check: 'stop' },
    quiz: [
      { question: 'A stop-loss does what?', options: ['Buys more automatically', 'Auto-sells if price falls a set % — caps the downside', 'Locks your coin forever'], correctIndex: 1, explain: 'A stop-loss sells at a preset drop, protecting you from a bigger fall.' },
    ],
  },
  {
    id: 'dca', category: 'Risk & strategy', title: 'DCA vs trading', emoji: '🪜', minutes: 2, xp: 40,
    sections: [
      { heading: 'Dollar-cost averaging', body: '**DCA** = buying a fixed amount on a schedule regardless of price. It smooths out volatility and removes the pressure of timing the perfect entry.' },
      { heading: 'Trading is different', body: 'Active trading tries to time entries/exits for bigger gains — more potential reward, more risk and effort. Most beginners do better leaning toward DCA + patience.' },
    ],
    quiz: [
      { question: 'Dollar-cost averaging means…', options: ['Buying everything at the lowest price', 'Buying a fixed amount on a regular schedule', 'Only buying stablecoins'], correctIndex: 1, explain: 'DCA spreads purchases over time so you don\'t have to time the market.' },
    ],
  },

  // ── Using the app ──────────────────────────────────────────────────────────
  {
    id: 'first-trade', category: 'Using the app', title: 'Make your first trade', emoji: '🚀', minutes: 3, xp: 60,
    sections: [
      { heading: 'You spend $, you get coin', body: 'Pick a coin, enter a dollar amount, and confirm. You **spend dollars** and **receive crypto** at the live market price.' },
      { heading: 'Selling returns to cash', body: 'Sell anytime — the value (plus or minus your profit/loss) returns to your spendable balance. Your realized **P&L** is tracked in Activity.' },
    ],
    tryIt: { hint: 'Buy ~$100 of any coin to make your first trade.', cta: 'Place a trade', target: { name: 'Trade', params: { symbol: 'BTC' } }, check: 'trade' },
    quiz: [
      { question: 'When you buy $100 of BTC you…', options: ['Spend $100 cash and receive BTC at market price', 'Borrow $100', 'Lock $100 forever'], correctIndex: 0, explain: 'A market buy converts your cash to the coin at the current price.' },
    ],
  },
  {
    id: 'alerts-orders', category: 'Using the app', title: 'Price alerts & limit orders', emoji: '🔔', minutes: 3, xp: 50,
    sections: [
      { heading: 'Alerts watch for you', body: 'A **price alert** pings you when a coin crosses a target — so you don\'t have to stare at the chart.' },
      { heading: 'Limit orders trade for you', body: 'A **limit order** auto-buys when price drops to your number (or sells when it rises) — you set the price you\'re willing to act at and walk away.' },
    ],
    tryIt: { hint: 'On a coin, set a price alert above or below the current price.', cta: 'Set an alert', target: { name: 'Trade', params: { symbol: 'ETH' } }, check: 'alert' },
    quiz: [
      { question: 'A limit buy order…', options: ['Buys instantly at any price', 'Buys automatically only when price drops to your target', 'Is the same as a stop-loss'], correctIndex: 1, explain: 'A limit order executes only at the price you set — no need to watch.' },
    ],
  },
  {
    id: 'contests-xp', category: 'Using the app', title: 'Contests, XP & leagues', emoji: '🏆', minutes: 3, xp: 50,
    sections: [
      { heading: 'Compete for free', body: 'Join **daily and featured contests** — everyone starts equal and the best P&L climbs the leaderboard. Free, and the fastest way to learn.' },
      { heading: 'XP and leagues', body: 'Every trade and win earns **XP**, moving you up the leagues: **Bronze → Silver → Gold → Diamond → Platinum**. Daily rewards and streaks add more.', visual: 'leagues' },
    ],
    tryIt: { hint: 'Open Compete and browse the live contests.', cta: 'Open Compete', target: { name: 'MainTabs', params: { screen: 'Compete' } } },
    quiz: [
      { question: 'How do you climb the leagues?', options: ['Pay a fee', 'Earn XP from trading, winning and daily rewards', 'Only by inviting friends'], correctIndex: 1, explain: 'XP from activity moves you Bronze → Platinum across the leagues.' },
    ],
  },
];

export function lessonById(id: string): Lesson | undefined {
  return ACADEMY.find(l => l.id === id);
}
