# Crypto Comp — Launch & Growth Plan

## Context

Crypto Comp (`com.simpledesignllc.cryptocomp`, v1.3.4) is a polished, production-ready free-to-play
**crypto trading-competition** app. The product and engagement layers are strong; the
**user-acquisition layer is nearly empty**. This is a go-to-market strategy that (a) closes the
measurement/virality gaps that would otherwise make any ad spend wasteful, then (b) drives retained
users US-first on a lean budget.

**Locked inputs:** budget **< $500/mo**, **XP-only** prizes at launch (keep `PAYOUTS_ENABLED` off),
north-star metric **retained active users (D7/D30 / weekly active competitors)**, market **US-first**.

A companion build backlog with a ready-to-run Claude prompt lives in `../future_todo.md`.

---

## What exists today (grounding facts)

- **Product:** $100k paper bankroll; Daily/Featured/1v1/Replay contests; 6-hour Sprint (20 players)
  and Weekly (1000 players) auto-created by Lambda; leagues Bronze→Platinum, XP, quests, streaks,
  copy-trading, price-prediction game. Files: `src/screens/CompeteScreen.tsx`,
  `src/services/gamification.ts`, `src/constants/featureFlags.ts`.
- **Monetization:** AdMob (banner/interstitial/rewarded/native, capped in `src/lib/adManager.ts`);
  RevenueCat IAP — No-Ads $2.99/mo, Premium $3.99/mo, $5M balance $2.99 (`src/components/PurchaseModal.tsx`);
  Stripe Connect cash payouts built but flag-gated off; default prize **5000 XP**.
- **Engagement infra:** push notifications with audience segmentation (`src/services/pushDeviceService.ts`,
  notification-campaign Lambda); native Share for profile/duel/trade.
- **Acquisition gaps (the problem):**
  - **No referral system** — only untracked 1v1 duel codes in `CompeteScreen.tsx`.
  - **No deep-link attribution** — shares are plain text; no Branch/universal links/URL scheme.
  - **No product analytics** — only Sentry error tracking; no funnel/retention/cohort events.
  - **Auth friction** — email/password only; no Apple Sign-In or guest mode (`src/screens/AuthScreen.tsx`).

---

## Phase 0 — Readiness (do BEFORE spending a dollar; ~1–2 weeks)

Spending on ads with zero attribution/analytics is the single biggest avoidable mistake here.

1. **Product analytics (free tier):** PostHog or Amplitude. Instrument the core funnel —
   install → signup → onboarding complete → first trade → first contest join → D1/D7 return.
   Hook into existing choke points: `OnboardingWalkthrough.tsx`, `TradeScreen.tsx`,
   `CompeteScreen.tsx`. This is what makes "retained active users" measurable.
2. **Attribution + deep links:** Branch (free <10k MAU) or Apple Search Ads + Apple's own
   attribution. Enables referral tracking AND paid-channel CAC. Add a URL scheme/universal link in
   `app.json` (none today).
3. **Cut signup friction:** add **Sign in with Apple** + optional **guest mode** so users can reach
   the first contest before creating an account (`AuthScreen.tsx`, Cognito). Biggest retention lever
   for a free app.
4. **ASO pass (free, highest ROI channel):** title/subtitle/keywords around
   "crypto trading game / simulator / contest / paper trading / fantasy crypto"; screenshots that
   lead with the **competition + leaderboard** hook, not a generic portfolio. Localize for US English.

---

## Positioning & message

**"Fantasy sports for crypto."** Free, everyone starts with the same $100k, best P&L wins — no real
money at risk. Lead every asset with **competition + leaderboard + bragging rights**, not "practice
trading" (crowded, low-emotion). Hooks: 6-hour sprints (fast dopamine), 1v1 duels (built-in 1:1
virality), seasonal leagues (retention).

---

## Plan A — Where to advertise (US-first, lean < $500/mo)

Lean budget → **one paid channel done well + heavy organic**. Recommended monthly split:

| Channel | Spend | Why |
|---|---|---|
| **Apple Search Ads** (exact-match: brand + high-intent e.g. "crypto trading game", "paper trading", "crypto simulator") | **$250–300** | Highest-intent, cheapest measurable installs for iOS; tight US targeting; works at small budgets. Primary paid channel. |
| **Creative testing** — TikTok Spark Ads *or* Reddit Ads (r/CryptoCurrency-adjacent), boosting your best organic video | **$100–150** | Find one winning creative before ever scaling. Treat as research, not growth. |
| **Micro-influencer / community seeding** (gift Premium codes, sponsor a community contest) | **$0–100** | Often free via affiliate/XP; see referral + free playbook. |

**Rule:** do not increase spend until Apple Search Ads CAC is known and D7 retention ≥ target.
Gate scaling on measured CAC < projected LTV (ad ARPDAU + IAP), not on install count.

---

## Free / organic user acquisition (the main engine on this budget)

1. **Build-in-public on X/Twitter:** daily/weekly leaderboard screenshots, biggest-winner P&L,
   "this week's champion." Crypto X loves competition + numbers. Costs $0.
2. **Short-form video (TikTok + YT Shorts + Reels):** 15–30s clips — "I turned $100k into $480k in a
   6-hour crypto contest." Reuse the existing **share/screenshot** surfaces as content fuel.
3. **Reddit / Discord communities:** participate (not spam) in r/CryptoCurrency, r/CryptoMarkets,
   trading Discords; run a "community cup" using the existing 20-player 6h sprint — perfect free
   tournament unit.
4. **ASO + App Store featuring:** strong screenshots + "Today" submission to Apple; contest apps
   with seasonal events get featured.
5. **Crypto newsletters / micro-influencers (affiliate, not cash):** give creators a referral code;
   they earn Premium/XP per signup — converts paid influencer marketing into performance/free.
6. **Push re-engagement (already built):** use `pushDeviceService` + campaign Lambda for
   "your sprint starts in 1h," "you dropped to #4," "league resets tonight" — keeps the
   retention north-star healthy with no media spend.
7. **Launch moments:** Product Hunt + a "Season 1 Championship" launch event to concentrate signups.

---

## Content auto-poster bot ("HypeBot") — automate X / Instagram / TikTok

The biggest cost of the organic strategy (and *all* of Plan B) is the manual content grind. A bot
removes it: on every post-worthy moment it generates the copy + hashtags + media and publishes to all
three platforms. This reuses the app's **existing EventBridge + Lambda** stack (the same infra that
already auto-creates a contest every 6h — `amplify/functions/create-rolling-contest/`), so it's a
natural extension, not new plumbing.

### Pipeline (per post)
1. **Trigger:** EventBridge fires on a real moment — contest close (`close-competition/handler.ts`),
   a new season champion, a big P&L (>X%), or a fixed daily slot. No fabricated hype.
2. **Fetch the moment:** query DynamoDB (`FinishedCompetition`, `CompetitionEntry`, leaderboard) for
   the facts — winner handle (respecting `leaderboardVisible`), P&L, contest type, # players.
3. **Generate copy + tags (Claude API):** send the moment facts to the Anthropic API
   (`claude-sonnet` for quality, or `claude-haiku` for cheap high-volume) with a brand-voice system
   prompt. Return JSON: `{ caption, platformVariants, hashtags[], altText }`. The model writes
   platform-appropriate copy (punchy/emoji for TikTok & IG, tighter for X) and selects **rotating,
   relevant hashtags** (#crypto #cryptotrading #tradingchallenge #fantasycrypto …) — rotation avoids
   spam/shadowban flags from repeated identical tag sets.
4. **Source stock media + render:** text-only won't work for IG/TikTok — they require image/video, and
   strong visuals lift engagement. Two layers:
   - **Fetch high-quality stock** by keyword (crypto, bitcoin, trading desk, charts, finance) — keywords
     chosen by the Claude step in (3) — from **licensed free stock APIs**: **Pexels** (images + video,
     free API, commercial use, no attribution), **Pixabay** (images + video, free), **Unsplash**
     (images, free API). Pick the best-scoring asset; cache to S3 to avoid refetching.
     **Do NOT scrape arbitrary web images/video** — copyright/ToS risk. Stock APIs only, and store the
     asset's license/source URL with each post for an audit trail.
   - **Composite the brand layer on top:** overlay the **result card** (leaderboard/P&L, the existing
     dark+neon theme) + logo + caption onto the stock image (Satori/`@vercel/og`) or onto a 10–15s
     stock **video** background via **Remotion** for TikTok/Reels. Stock = the eye-catching backdrop;
     your real stats = the foreground. Store final render to S3 → public URL for the publishers.
5. **Publish** to each platform API (below).
6. **Human-in-the-loop (recommended):** post to a **review queue** (Slack/email approval) before
   going live, at least until voice + compliance are trusted. Avoids platform-ToS automation issues
   and off-brand/compliance misses.

### Platform APIs & realities (important caveats)
| Platform | API | Reality |
|---|---|---|
| **X** | X API v2 `POST /2/tweets` (+ media upload) | Easiest. Note write access needs a paid tier (~$100/mo Basic) or the limited free tier — the one place a "$0" plan may hit a wall; mitigate by posting X manually under Plan B. |
| **Instagram** | Instagram Graph API — Content Publishing (`/media` → `/media_publish`) | Free, but requires an IG **Business/Creator** account + linked Facebook app + review. Posts images/Reels from a hosted URL. |
| **TikTok** | TikTok **Content Posting API** (Direct Post) | Free, but requires an approved developer app + audited scopes; video only. Highest approval friction — expect lead time. |

### Implementation shape
- A standalone **Node/TypeScript** module (e.g. `scripts/hypebot/` or a new
  `amplify/functions/social-poster/`) with: `momentSource.ts` (DynamoDB queries), `generate.ts`
  (Anthropic call + JSON schema), `stock.ts` (Pexels/Pixabay/Unsplash fetch + license capture),
  `render.ts` (composite card/video over stock), and one `publishers/{x,instagram,tiktok}.ts`
  each. Secrets (API + stock tokens) in AWS Secrets Manager / SSM, never committed.
- Config: posting cadence caps (e.g. max 3/day/platform), quiet hours, per-platform on/off, dry-run mode.
- Cost: Claude calls are pennies/post at Haiku/Sonnet; the only real cost is X write access.

### Compliance & safety
- FTC: brand account is first-party, but keep claims truthful ("paper trading / no real money").
- Crypto-promo & automation policies differ per platform — the review queue + rate caps keep you inside
  ToS. Never auto-DM or auto-follow; this bot only **posts**.

---

## Plan B — launch with $0 media budget (pure organic)

A complete fallback if you want to spend **nothing** on ads. Cut Apple Search Ads and all paid
creative testing; the engine becomes content + community + the referral loop. The product is already
built and the costable infra (PostHog/Branch/Amplitude free tiers, Apple Sign-In) is $0, so this is
fully viable — it trades money for **founder time + consistency**.

**What changes vs Plan A:** remove the entire paid table. Everything in "Free / organic acquisition"
becomes the whole strategy, plus:

1. **Founder-led content is the budget.** Commit to a non-negotiable cadence: 1 build-in-public post/day
   on X + 3 short-form videos/week (TikTok/Shorts/Reels) from real leaderboard moments. This is the
   single highest-leverage $0 activity — treat it like a job, not an afterthought.
2. **Referral loop does the paid channel's job.** With no ad spend, "Recruit & Rise" (below) is your
   *only* scalable acquisition — prioritize building it first and make its rewards generous early.
3. **Community tournaments as distribution.** Run weekly "community cups" on the existing 20-player 6h
   sprint inside crypto Discords/subreddits — you bring the prize (XP/Premium codes, $0), they bring
   the players. Partner with community mods, not paid influencers.
4. **Affiliate-only creators.** No cash to influencers — give them referral codes; they earn
   Premium/XP/"Ambassador" status per activation. Converts influencer marketing to pure performance.
5. **Earn featuring instead of buying installs.** Heavy ASO + a polished Product Hunt launch + an Apple
   "Today" submission tied to a "Season 1 Championship" event — concentrate organic signups into a moment.
6. **Cross-post free everywhere.** Reuse each video across TikTok/Shorts/Reels/X; repurpose top posts
   into a simple weekly email (Resend is already wired for transactional — extend to a digest).

**Trade-offs (be honest):** slower, spikier growth; depends entirely on content consistency and one or
two channels catching; no fast CAC read. **Trigger to graduate to Plan A:** once any organic channel
shows repeatable signups *and* D7 ≥ target, introduce the $250/mo Apple Search Ads layer to pour fuel
on what already works.

---

## Referral program — "Recruit & Rise" (highest-leverage growth investment)

For a free, competitive, social app with weak acquisition infra, a referral loop is the best $0-media
growth lever — but it must be **built** (the untracked duel codes don't count). Reuses the existing
XP/pass/league systems so it needs no real money (fits the XP-only launch).

### Mechanic
- Each user gets a unique **referral code + Branch deep link** (e.g. `cryptocomp.app/r/AB12CD`).
- New user installs via link → attributed to referrer (requires Phase 0 deep-link attribution).
- All rewards gate on **activation = invitee completes their first contest**, never on raw install —
  protects against abuse and directly serves the retention north-star.

### Two-sided reward (per successful referral)
| Recipient | Reward | Source system |
|---|---|---|
| **Invitee** (new user) | +3 contest passes + 1,000 XP welcome bonus | weekly-pass grant + XP in `gamification.ts` |
| **Referrer** | +2 contest passes + 750 XP | same |
| **Both, if invitee buys Premium within 14d** | +1 free month No-Ads for referrer | RevenueCat entitlement |

Passes are the natural currency (free users get 5/wk in `gamification.ts`; 1 pass = 1 contest entry),
so referrals literally buy more play — tightly coupled to engagement.

### Milestone tiers (cumulative *activated* referrals → status + perks)
| Tier | Activated referrals | Perks |
|---|---|---|
| **Scout** | 1 | Referral badge on profile |
| **Recruiter** | 3 | +5 passes, exclusive profile flair |
| **Captain** | 10 | Permanent +2 weekly passes, "Captain" league frame |
| **Ambassador** | 25 | Free Premium while active + early access to new contest types |

### Anti-abuse
- Reward only on first-contest activation + device/IP dedupe + Apple attribution; cap rewards/day.
- Self-referral and reinstall fraud blocked via Branch fingerprint + Cognito account age.

### Surfaces (where the loop lives)
- **Post-win share sheet** — "You placed #2 — challenge a friend" (peak motivation moment).
- **Profile** — referral code, progress to next tier, "invite" CTA.
- **Upgrade 1v1 duel codes into tracked referral links** (small change in `CompeteScreen.tsx`) — the
  duel invite already implies a friend; make every duel a tracked referral.
- **Onboarding** — "have a code?" field so invitees claim their welcome bonus.

### Seasonal Recruiter Cup (top-5 prize)
- **"Top Recruiters this Season"** leaderboard reusing the existing league/season UI — ranks users by
  **activated referrals** in the season, turning recruiting into a competition itself.
- **Top 5 recruiters each season win a prize.** Reward mode follows the same `PAYOUTS_ENABLED` /
  `CONTEST_CASH_PRIZES` gate as contests — **XP/perks now, cash later** — so it ships at launch with
  zero legal/payment surface and flips to cash with one flag, no rebuild:

  | Rank | XP-only mode (launch) | Cash mode (when payouts on) |
  |---|---|---|
  | 1st | 25,000 XP + 3 mo Premium + "Season Recruiter" frame | $250 + 1 mo Premium |
  | 2nd | 15,000 XP + 2 mo Premium | $150 |
  | 3rd | 10,000 XP + 1 mo Premium | $100 |
  | 4th | 6,000 XP | $50 |
  | 5th | 4,000 XP | $25 |

  Sample cash pool **$575/season** — modest, tunable, and well under the `$4,999` compliance cap in
  `amplify/functions/lib/contestCompliance.ts`.
- **Reuse, don't rebuild:** pay cash through the **same Stripe Connect payout path** as contest prizes
  (`close-competition` / `process-withdrawals`), and gate XP-vs-cash on the existing flag in
  `src/constants/featureFlags.ts`.
- **Compliance note (cash mode):** referrals stay **free actions**, so it remains a free-entry
  skill/sweepstakes consistent with `docs/official-contest-rules.html`; still apply the same 1099/$600
  reporting + dedupe/anti-fraud rules before enabling cash. Keep per-user seasonal cash under the 1099
  threshold initially.
- Push nudge via `pushDeviceService` when a friend activates and when seasonal standings change.

### Targets
- Goal: **K-factor 0.15–0.3** at launch (every 4–7 active users bring 1 more), trending up as surfaces
  optimize. Track invites sent → installs → activations as a funnel in analytics.

**Prereq & sequencing:** depends on Phase 0 deep-link attribution + analytics. Ship "Recruit & Rise"
immediately after Phase 0, before scaling any paid spend — it lowers blended CAC for everything after.

---

## Suggested timeline

- **30 days:** Phase 0 (analytics, attribution, Apple Sign-In, ASO). App approved & live. Begin
  organic (X build-in-public, first community cup). No paid yet.
- **60 days:** Ship referral loop. Start Apple Search Ads ($250/mo). Begin short-form video cadence
  (2–3/wk). Measure D1/D7, CAC, contest fill rate.
- **90 days:** Double down on whichever organic channel + the one paid creative that work; kill the
  rest. Re-evaluate flipping select contests to cash prizes once weekly-active + fill-rate are healthy.

---

## Metrics & targets (north star: retained active users)

- **North star:** Weekly Active Competitors (users who join ≥1 contest/week).
- **Guardrails:** D1 ≥ 35%, D7 ≥ 15%, D30 ≥ 6% (free mobile-game benchmarks; iterate from real data);
  onboarding→first-trade completion; **6h-sprint fill rate** (are the 20 seats filling?).
- **Acquisition:** Apple Search Ads CAC; referral K-factor (invites sent × conversion); organic vs paid mix.
- **Don't optimize raw installs** — explicitly a guardrail, not a goal.

---

## Implementation workstreams (everything to build — nothing deferred)

### WS1 — Analytics & attribution (Phase 0, blocking)
- **Scope:** PostHog/Amplitude funnel (install → signup → onboarding → first trade → first contest →
  D1/D7) + Branch deep links + URL scheme/universal links.
- **Files:** `app.json`, `App.tsx`, `OnboardingWalkthrough.tsx`, `TradeScreen.tsx`, `CompeteScreen.tsx`.
- **Dep:** none. Unblocks WS4, WS5, all paid spend.

### WS2 — Auth friction reduction (Phase 0)
- **Scope:** Sign in with Apple + optional guest mode.
- **Files:** `src/screens/AuthScreen.tsx`, `amplify/auth/`. **Dep:** none.

### WS3 — ASO pass (Phase 0, $0)
- **Scope:** keywords, competition-led screenshots, US-English; Product Hunt + Apple "Today" assets.
- **Files:** App Store Connect metadata; screenshot assets. **Dep:** app approved.

### WS4 — Referral "Recruit & Rise" + Seasonal Recruiter Cup
- **Scope:** codes/links, two-sided rewards, tiers, top-5 cup (XP-now/cash-later), anti-abuse, surfaces.
- **Files:** new referral service + `amplify/data/resource.ts`, `CompeteScreen.tsx`,
  `src/services/gamification.ts`, seasonal-close job, reuse `close-competition`/`process-withdrawals` +
  `featureFlags.ts`. **Dep:** WS1.

### WS5 — HypeBot auto-poster (X / IG / TikTok, stock media)
- **Scope:** EventBridge → moment → Claude copy+hashtags → stock + render → publish (review queue).
- **Files:** new `amplify/functions/social-poster/` (`momentSource/generate/stock/render/publishers`);
  EventBridge rule; Secrets Manager. **Dep:** pairs with WS1. Note: X write tier (~$100/mo).

### WS6 — Real-money prize enablement (trigger-gated)
- **Scope:** flip `PAYOUTS_ENABLED`/`CONTEST_CASH_PRIZES` for select contests + Recruiter Cup once
  retention/fill-rate healthy. Sweepstakes registration, 1099 ($600+), Stripe QA, prize-cap enforcement.
- **Files:** `featureFlags.ts`, `WithdrawScreen.tsx`, `contestCompliance.ts`,
  `stripe-webhook`/`process-withdrawals`, `docs/official-contest-rules.html`.
- **Dep:** WS1 + legal review. **Trigger:** DAU/fill-rate threshold, not a date.

### WS7 — International / non-US expansion
- **Scope:** localize ASO, vet per-market crypto/prize ad rules, geo-gate cash contests.
- **Files:** store metadata; `contestCompliance.ts`. **Dep:** healthy US retention + legal review.

### Suggested build order
WS1 + WS2 + WS3 (Phase 0) → WS4 + WS5 (growth engine) → WS6 (monetize once retained) → WS7 (scale geo).

---

## Verification (end-to-end)

- **WS1:** fire a test event end-to-end; confirm the funnel appears in analytics and a Branch link opens
  the app to the right screen with attribution recorded.
- **WS2:** complete Apple Sign-In + guest flow on a TestFlight build; a guest can reach a contest and
  later bind an account.
- **WS4:** install via a referral link on a clean device → complete first contest → confirm both users'
  rewards and that Recruiter Cup standings update at season close (XP mode).
- **WS5:** run the poster in **dry-run**; confirm copy/hashtags + composited stock render look right and
  land in the review queue before any live post.
- **WS6:** in staging, flip the flag and run a contest + cup settlement through Stripe test mode; verify
  payout records, the $4,999 cap, and 1099 thresholds.
- Gestures/visuals and on-device flows can't be verified headlessly — build to TestFlight and test on a
  real device.
