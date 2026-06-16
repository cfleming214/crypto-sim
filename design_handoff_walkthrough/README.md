# Handoff: In-App Walkthrough / Onboarding Flow

## Overview
A 7-slide animated onboarding walkthrough for Crypto Comp — a React Native paper-trading and competition app. Shown to new users after sign-up. Each slide introduces a core feature with staggered entry animations. Navigation: Next button, Back button (hidden on slide 1), Skip intro, and left/right swipe gestures.

## About the Design Files
`In-App Walkthrough.html` is a **high-fidelity interactive prototype** created in HTML/CSS/JS. It is a design reference — not production code. The task is to **recreate these screens in the existing React Native (Expo) codebase** using its established patterns (`FlatList`/`ScrollView`-based carousels, `Animated` API or `react-native-reanimated`, existing `Card`, `Button`, `Chip`, `ProgressBar` components, and the app's `ThemeContext`/`useTheme` design tokens).

## Fidelity
**High-fidelity.** Colors, typography, spacing, component shapes, animation timings, and copy are all final and should be reproduced precisely. The prototype uses the exact same design tokens the app uses (`--grn: #2BF06A`, `--card: #131a14`, etc.).

---

## Screens / Views

### Slide 1 — Welcome
**Purpose:** First impression. Communicates the 3 core value props.

**Layout:**
- Full-screen dark background (`#080c0a`) with a subtle green radial glow centered at 28% from top
- Flex column, `align-items: center`, `justify-content: center`
- Padding: 100px top, 28px horizontal, 180px bottom (leaves room for nav)

**Components:**
- **App icon** — 90×90px squircle (superellipse n=4.2). Dark gradient background (`#1c2722` → `#080b09`), green tubular glyph. Entry: `scale(0.5) → scale(1)`, bounce easing, 550ms
- **Wordmark** — "Crypto Comp": "Crypto" in weight 500, "Comp" in weight 700, 30px, letter-spacing −0.04em, `#e8ede9`. Entry: `translateY(18px) → 0`, 450ms, delay 280ms
- **Tagline** — "Trade. Compete. Win." — 21px, weight 700, `#2BF06A`. Entry: `translateY(18px) → 0`, delay 440ms
- **3 feature cards** — Each: dark card (`#131a14`), 1px border (`#1e2820`), border-radius 13px, padding 13×15px, flex row with 13px gap
  - Icon container: 34×34px, radius 9px, `rgba(43,240,106,0.16)` bg, green icon
  - Label: 13.5px weight 600, `#e8ede9`, `white-space: nowrap`
  - Sublabel: 12px, `#7a887c`
  - Entry: `translateY(18px) → 0`, staggered at 640ms / 820ms / 1000ms delay
- Copy:
  1. "Paper-trade on live prices" / "Real market data, zero risk"
  2. "Compete in live tournaments" / "Daily sprints, weekly brackets & 1v1s"
  3. "Mirror top traders' moves" / "Copy trades in real time"

---

### Slide 2 — Portfolio
**Purpose:** Show how portfolio tracking works.

**Copy:** Eyebrow: "Portfolio" | Title: "Track your P&L in real time" | Sub: "See holdings, performance, and your overall return — all in one glance."

**Components:**
- **UI card** (`#131a14`, radius 18px, border `#1e2820`, overflow hidden)
  - Header pad: 18px. Label "Total value" 11px `#7a887c`. Value: 30px weight 700 `#e8ede9`, tabular-nums. Change: 13px weight 600 `#2BF06A` "↑ +$2,847.32 · 28.47%"
  - **Portfolio counter:** starts at $0.00, counts to $12,847.32 over 1700ms with easeOutCubic. Starts at 850ms after slide enters.
  - **Area chart:** 96px tall, green gradient fill + 2px green stroke line. Reveals left-to-right with `clip-path: inset(0 100% 0 0) → inset(0 0 0 0)` over 1500ms cubic-bezier(.4,0,.2,1), starting at 860ms delay.
  - **Holdings rows** (3): flex row, 11px horizontal padding, 10px vertical. Coin glyph 32×32px circle, symbol 14px weight 600, units 11px muted, price 14px right, change % 11px colored. Slide in from right (`translateX(26px) → 0`) staggered at 1560ms / 1740ms / 1920ms.
  - Holdings: BTC `$6,512.40` +4.2%, ETH `$2,957.10` +1.8%, SOL `$1,353.42` −2.1%

---

### Slide 3 — Markets
**Purpose:** Introduce the Markets tab.

**Copy:** Eyebrow: "Markets" | Title: "Stay ahead of every move" | Sub: "Real-time prices, market caps, and trending movers across the whole crypto market."

**Components:**
- **Market stats card** — flex row, 2 cols divided by border. Each: label 11px `#7a887c`, value 17px weight 700, change 11px. Left: "Total market cap" $3.42T +2.1%. Right: "Fear & Greed" 64, "Greed" (`#D4A017`).
- **Coin list** — 4 rows: BTC +2.3% / ETH +1.8% / SOL −2.1% / DOGE +5.4%. Each: coin glyph 32px circle, symbol 14px weight 600, name+mcap 11px muted, price 14px right, change % 11px (green up, red down). Rows slide from right staggered at 760/940/1120/1340ms.

---

### Slide 4 — Trade
**Purpose:** Show how to place a trade.

**Copy:** Eyebrow: "Trade" | Title: "Buy or sell in seconds" | Sub: "Pick any asset, set your size, and execute — all with simulated funds."

**Components:**
- **Price block** — "BTC / USD" 13px muted, "$94,237.00" 34px weight 700 tabular, "↑ +2.34%" green chip + "24h" muted label. Entry: `translateY(14px) → 0`, delay 480ms.
- **Line chart** — 108px tall, green gradient area + 2.5px green line stroke (same style as portfolio). Reveals left-to-right over 1200ms, delay 740ms.
- **Order panel** — dark card with segmented Buy/Sell/Limit tabs, two detail rows (Amount $1,000.00 / Est. received 0.01061 BTC), "Buy BTC" button (`rgba(43,240,106,0.18)` bg, green text, green border). Entry: `translateY(14px) → 0`, delay 1080ms.
- **Tap animation** — Buy button pulses (scale 0.94 → 1.02 → 1) at 1820ms delay.
- **Success overlay** — absolute inset, `rgba(8,12,10,0.94)` bg, green checkmark ring (56×56px), "Order Filled" label, "Bought 0.01061 BTC · $1,000" sub. Slides up from `translateY(110%)` over 480ms with bounce easing, delay 2360ms. (`.opanel` has `overflow: hidden`)

---

### Slide 5 — Learn (Academy)
**Purpose:** Introduce the Crypto Academy learning system.

**Copy:** Eyebrow: "Academy" | Title: "Learn crypto, earn XP" | Sub: "Bite-sized lessons on crypto, charts & strategy — each one earns XP and levels you up."

**Components:**
- **Academy hero card** — dark green gradient bg (`#172414` → `#0f1c0f`), green border. Row with 🎓 icon (42×42px, radius 12px, green tint bg), "Crypto Academy" 15px weight 700, "14 lessons · up to 580 XP" 12px muted. Progress bar (6px, `rgba(255,255,255,0.1)` track, green fill). Bar animates to 21% width over 1400ms cubic, starting at 760ms delay.
- **3 lesson rows** (reuse coin-list style): coin glyph → lesson emoji icon (34×34px, radius 10px, green-tinted bg), title 14px weight 600, "X min · Category" 11px muted. XP badge (green chip "+40 XP") or "Done" pill (green). Rows slide from right at 760/920/1080ms.
  - 🪙 What is crypto? · 2 min · Crypto basics → +40 XP
  - 🕯️ Reading candlestick charts · 3 min · Reading the market → +50 XP
  - ✓ Fear & Greed sentiment · 2 min · Reading the market → Done
- **Achievements row** — label "Achievements" 13px weight 600 + "Unlock as you play" 12px muted. 5 badges 50×50px, radius 14px:
  - Earned (🔥📈🏆): `rgba(43,240,106,0.1)` bg, green border
  - Locked (⚡💎): `filter: grayscale(0.9); opacity: 0.4`
  - Row pops in with scale(0.75) → scale(1) bounce easing at 1320ms delay.

**Data source:** `src/data/academy.ts` — ACADEMY array, ACADEMY_CATEGORIES, CATEGORY_META.

---

### Slide 6 — Compete
**Purpose:** Introduce tournaments and XP leagues. Notes that real money prizes are coming.

**Copy:** Eyebrow: "Compete" | Title: "Climb the ranks, earn XP." | Sub: "Join daily tournaments, build your XP, and reach Diamond league."

**⚠️ Important:** Prizes are currently **XP only**. Real money prizes are on the roadmap. All prize displays use XP, not $.

**Components:**
- **XP card** — green background (`#2BF06A`), radius 16px, padding 18px. "GOLD II · DAY 12 OF 30" 11px weight 600 `rgba(4,19,10,0.6)` uppercase. "3,240 / 6,000 XP" 26px weight 700 `#04130a`. Progress bar 7px, `rgba(4,19,10,0.15)` track, `rgba(4,19,10,0.45)` fill. Animates from 0 → 54% over 1600ms, delay 900ms. "Your global rank" label + counter that counts from #4,847 → #23 over 2000ms, starts at 1100ms.
- **Live tournament card** — dark card. Red live dot (7px circle, pulsing) + "Live · 4h 12m left". "Weekend Warriors" 18px weight 700. "$10K bankroll · 1,284 players" 12px muted. Stats row: "#23" rank (green), "5,000 XP" top prize (`#FFD93D`), "+18.4%" P&L (green).
- **Prize badge** — gold tinted card: 🏆 icon + "Weekly prize pool" label + "25,000 XP" 19px weight 700 `#FFD93D`.
- **Coming soon banner** — `rgba(255,200,50,0.07)` bg, gold border `rgba(255,200,50,0.22)`, radius 12px. Pulsing yellow dot + "💰 Real money prizes — coming soon" 13px weight 700 `#FFD93D` + "Cash tournaments are on the roadmap" 11px `rgba(255,200,50,0.65)`. Bounces in at 2020ms delay.

---

### Slide 7 — Copy Trade
**Purpose:** Introduce mirror trading.

**Copy:** Eyebrow: "Copy Trade" | Title: "Mirror top traders automatically" | Sub: "Follow expert traders and clone their positions in real time — no research needed."

**Components:**
- **Trader row** — dark card. Avatar "MO" 42×42px circle `rgba(98,104,143,0.2)`. "@moonshot" 15px weight 700, "388 trades · 68% win rate" 12px muted. "Diamond" badge: green chip, green border.
- **Stats row** — 3-col flex, each centered. "All-time P&L" +147.8% (green), "Win rate" 68% (green), "Trades" 388.
- **P&L chart** — 88px tall, green gradient area + 2px green line. Same reveal animation, 1500ms, delay 1060ms.
- **Mirror button** — full-width 50px, green gradient, "Start Mirroring · $2,000" 16px weight 700 `#04130a`. After fade-in, glows infinitely: `box-shadow` pulses between `0 4px 28px rgba(43,240,106,0.32)` and `0 4px 52px rgba(43,240,106,0.7)` over 1300ms, starts at 2100ms.

---

## Navigation Controls

**Structure:** Fixed bottom bar overlaid on all slides. Height ~155px.
- **Dots row** — 7 dots, 6×6px, radius 3px, `rgba(255,255,255,0.18)`. Active dot: 26×6px, `#2BF06A`. Animated with CSS transition 300ms.
- **Button row** — flex row with 10px gap:
  - **Back button** (`<` chevron) — 52×52px, radius 15px, `rgba(255,255,255,0.07)` bg, 1px border `rgba(255,255,255,0.1)`. **Hidden on slide 1** (`opacity: 0; pointer-events: none`). `flex-shrink: 0`.
  - **Next/CTA button** — `flex: 1`, 52px height, radius 15px, green gradient `#2BF06A → #13D257`, weight 700 16px `#03120a`. Labels: "Get Started" (slide 1) → "Next" (slides 2–6) → "Start Trading" (slide 7).
- **Skip button** — below button row, 14px `#7a887c`. Hidden (`opacity: 0`) on last slide.
- **Nav gradient** — `linear-gradient(0deg, #080c0a 52%, transparent)` extending 70px above the nav area.

**Swipe:** Touch delta > 52px triggers forward/back navigation.

---

## Animations: Timing Reference

| Element type | From state | Duration | Easing |
|---|---|---|---|
| Standard fade-up | `translateY(16px)` | 440ms | ease |
| Scale-in (icon, bounce) | `scale(0.75)` | 480ms | cubic-bezier(.34,1.3,.64,1) |
| Slide from right | `translateX(26px)` | 440ms | ease |
| Chart reveal | `clip-path inset(0 100% 0 0)` | 1200–1500ms | cubic-bezier(.4,0,.2,1) |
| Success slide-up | `translateY(110%)` | 480ms | cubic-bezier(.34,1.3,.64,1) |

**Stagger pattern:** Eyebrow 80ms → Title 200ms → Subtitle 320ms → Card 480ms → Children staggered +160–180ms each.

**Slide transition:** Track translates by one slide width, 420ms, `cubic-bezier(.4,0,.2,1)`. Content of incoming slide pre-set to initial transform state before transition starts.

---

## Design Tokens

```
Background:     #080c0a
Surface:        #0f1410
Card:           #131a14
Border:         #1e2820
Green:          #2BF06A
Green dark:     #13D257
Green glow:     rgba(43,240,106,0.16)
Text:           #e8ede9
Muted text:     #7a887c
Red/Down:       #FF4D6A
Gold:           #FFD93D
Font:           Geist (400/500/600/700)
```

All tokens match `src/theme/tokens.ts` in the codebase.

---

## Implementation Notes (React Native)

1. **Carousel:** Use a horizontal `FlatList` with `pagingEnabled` or `react-native-pager-view`. Each slide is a full-screen `View`.

2. **Animations:** Use `react-native-reanimated` v3 for the staggered entry animations. Use `withTiming` + `withDelay` + `withSequence`. The chart reveal can use a `SharedValue` animating `clipPath` (iOS) or a `LinearGradient` mask expanding from left.

3. **Charts:** Use `react-native-svg` with `Path`/`LinearGradient`. The portfolio and P&L charts are smooth area charts (same as existing `AreaChart` component in `src/components/charts/`).

4. **Academy data:** Import from `src/data/academy.ts` — show real lesson titles, XP values, and categories.

5. **Back button:** `Pressable` with chevron icon, `opacity: 0` + `pointerEvents: 'none'` when `currentIndex === 0`.

6. **Coming soon banner:** Show on the Compete slide. Keep as a static element — no feature flag needed yet.

7. **Existing screen:** Check `src/screens/walkthrough/` — there may already be a walkthrough scaffold to build on.

---

## Files

| File | Description |
|---|---|
| `In-App Walkthrough.html` | Interactive HTML prototype — all 7 slides with live animations. Open in any browser. |
| `README.md` | This document |

---

## Assets
- App icon: `assets/app-icon.svg` (vector master), `assets/app-icon-1024.png`
- Coin glyphs: rendered in-app using emoji / letter initials in colored circles (no external images needed)
- Academy emojis: from `src/data/academy.ts` lesson definitions
- Achievement emojis: 🔥📈🏆⚡💎 — map to `src/components/ui/achievementIcons.tsx`
