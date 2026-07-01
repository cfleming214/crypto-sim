# Crypto Comp — Future TODO

Growth & launch backlog derived from `docs/launch-growth-plan.md`. Build order:
Phase 0 → growth engine → monetize → scale. Check items off as they ship.

## Phase 0 — Readiness (blocking; do before any ad spend)
- [x] WS1 — Product analytics (PostHog) SHIPPED: funnel events wired (App/Onboarding/Trade/Compete/
      Auth). ACTION: create PostHog project + set EXPO_PUBLIC_POSTHOG_KEY (eas env) to activate.
- [~] WS1b — Branch attribution: built GUARDED/OFF (`src/lib/attribution.ts`, no native dep). ACTION
      to activate: Branch account + `npm i react-native-branch` + config plugin/keys in app.json +
      EXPO_PUBLIC_BRANCH_ENABLED=true + native build.
- [~] WS2 — Sign in with Apple built GUARDED/OFF (button behind EXPO_PUBLIC_APPLE_SIGNIN_ENABLED;
      AuthContext.signInWithApple via Cognito hosted UI) + explicit "Continue as guest" shipped.
      ACTION: configure Cognito Apple provider + hosted-UI OAuth + native build, then flip the flag.
- [ ] WS3 — ASO pass: title/subtitle/keywords, competition-led screenshots, US-English; prep
      Product Hunt + Apple "Today" assets

## Growth engine
- [x] WS4 — Referral "Recruit & Rise" SHIPPED: Referral/ReferralCode models, referralService,
      two-sided pass+XP rewards (invitee on first contest; referrer per activation), milestone
      tiers, Profile ReferralCard + manual code entry, scheme deep-link capture. Remaining
      follow-ups: duel-code→referral upgrade, post-win share CTA (Branch links via WS1b).
- [x] WS4b — Recruiter Cup SHIPPED: RecruiterCupLeaderboard + settle-recruiter-cup Lambda,
      Compete-tab "Cup" board (rank/handle/season-activated/own-row/podium/countdown).
- [ ] WS5 — HypeBot auto-poster (X/IG/TikTok): DESIGNED in the plan, DEFERRED (not built). New
      `amplify/functions/social-poster/`. Note: X write tier (~$100/mo).

## Monetize (trigger-gated, once retention + fill-rate healthy)
- [x] WS6 — Cash-prize WIRING built + gated OFF: Recruiter Cup top-5 settles into Payout rows via
      the same Stripe Connect rail (process-withdrawals) when CONTEST_CASH_PRIZES on, $4,999 cap
      enforced. ACTION to enable: sweepstakes registration, 1099 ($600+), Stripe live QA, then flip
      EXPO_PUBLIC_PAYOUTS_ENABLED. Contest cash-prize flip is the pre-existing path.

## Scale
- [ ] WS7 — International expansion: localize ASO, vet per-market crypto/prize ad rules, geo-gate
      cash contests (`contestCompliance.ts`)

## Channels / ops (ongoing)
- [ ] Organic cadence: 1 build-in-public post/day (X) + 3 short-form videos/week (TikTok/Shorts/Reels)
- [ ] Community cups in crypto Discords/subreddits using the 20-player 6h sprint
- [ ] Plan A only: Apple Search Ads ($250/mo, exact-match) once D7 ≥ target
- [ ] Push re-engagement campaigns via `pushDeviceService` (sprint reminders, rank-drop nudges)

## North-star & guardrails
- North star: Weekly Active Competitors. Guardrails: D1 ≥ 35%, D7 ≥ 15%, D30 ≥ 6%, 6h-sprint
  fill rate, referral K-factor 0.15–0.3. Do NOT optimize raw installs.

---

## Prompt for Claude

> You are working in the `crypto-sim` Expo 56 / React Native 0.85 iOS app (AWS Amplify backend:
> Cognito, AppSync/DynamoDB, Lambda). Read `docs/launch-growth-plan.md` and this `future_todo.md`
> for full context, then implement **WS1 — Product analytics & attribution** as the first workstream.
>
> Scope WS1: add a product-analytics SDK (PostHog or Amplitude, free tier) and Branch deep links;
> register a URL scheme / universal links in `app.json`; instrument the core funnel events
> install → signup → onboarding complete → first trade → first contest join → D1/D7 return in
> `App.tsx`, `src/screens/OnboardingWalkthrough.tsx`, `src/screens/TradeScreen.tsx`, and
> `src/screens/CompeteScreen.tsx`. Keep all keys/tokens in env/SSM — never commit secrets.
>
> Before coding: confirm the analytics tool choice with me, propose the exact event names + properties
> as a short schema, and list every file you'll touch. Follow the repo's existing patterns and run
> `npx tsc --noEmit` plus an `npx expo export --platform ios` bundle check before finishing. Do not
> start WS2+ until WS1 is reviewed. When WS1 is done, check its boxes in `future_todo.md`.
