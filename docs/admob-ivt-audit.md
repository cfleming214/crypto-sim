# AdMob Invalid-Traffic Audit — 2026-08-07 (CRYP-60)

Sweep of every ad surface for patterns AdMob's Invalid Traffic policy penalises.
Follows CRYP-58 (daily budget + cooldown) and CRYP-59 (rewarded consent).

## Findings (fixed in this pass)

**1. Budget denial masqueraded as no-fill → free grants past the cap.**
`showRewarded` returned a bare `shown:false` when `canShowAd` denied the ad,
which is the same shape as "no inventory" — so the callers' `grantOnUnavailable`
fallback granted the reward. Net effect after CRYP-58: hitting the 20/day
rewarded cap made every further tap a free grant. Denials now return
`blocked:true`, which callers treat as do-nothing.

**2. The no-fill fallback was an infinite reward faucet offline.**
A fallback grant never called `noteAdShown`, so no cooldown and no daily count —
airplane-mode taps granted +$50K each, unbounded (and bankroll feeds
leaderboards). Fallback grants now consume the rewarded budget via
`noteFallbackGrant()`: same 60s cooldown, same 20/day ceiling as a watched ad.

**3. News-feed native ads farmed impressions on scroll.**
`NativeAdCard` sat inside a FlatList `renderItem`; windowing unmounts offscreen
cells, and every remount issued a fresh `createForAdRequest` — scrolling the
feed up and down inflated requests/impressions passively. Cards now accept a
`cacheKey`; the News feed caches per slot with a 5-minute TTL, so remounts reuse
the live ad. Markets rows mount once per screen (ScrollView) and are unchanged.

## Checked and clean

- **Interstitial triggers** — `resultsExit` (blur of a *finished* contest) and
  `replayEnd` (once, ref-guarded). Natural transitions, frequency-capped,
  lane-guarded. No programmatic/looping trigger paths found.
- **Attribution** — native cards carry a visible "Ad" badge and wrap every asset
  in `NativeAsset` (clicks route through the SDK); ads are visually distinct
  from content cards.
- **Accidental-click layout** — the single banner (Compete) is anchored-adaptive
  at screen bottom, not adjacent to tap-heavy controls; native cards reserve a
  fixed media height (no layout shift on load).
- **Incentive language** — every rewarded CTA says "watch"; nothing rewards or
  invites clicking an ad. Rewarded grants are defined only in
  `REWARDED_REWARDS`, all `tag: 'virtual'`.
- **Money surfaces** — `isMoneySurface` hard wall is first in `canShowAd`;
  Lane B allows only the passive banner and results-exit interstitial.
- **Lifecycle** — native ads `destroy()` on unmount (cached ones are owned and
  replaced by the cache); no banner auto-refresh configured beyond SDK default.
- **Test mode** — env flag OR device toggle, env wins; unset env → real units
  only in EAS builds. Test ads use Google's TestIds with the real App ID.

## Follow-ups (config-side, not code)

1. **Register the team's device IDs as test devices** in the AdMob console —
   heavy testing on live units from developer devices is itself an IVT vector.
   (The code comment already warns never to tap live ads.)
2. **Verify `EXPO_PUBLIC_ADMOB_TEST_MODE` is unset/false in the EAS production
   environment** — value not readable from the repo.
3. Economy note (not IVT): No-Ads/Premium users receive rewarded *grants*
   directly with no ad and no budget charge. Pass/boost grants for entitled
   users are therefore bounded only by their own dialogs. Acceptable for paying
   users; revisit if pass balances inflate.
