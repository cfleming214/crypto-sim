# CryptoComp — social ad drafts

Five ready-to-post images at native platform dimensions, each carrying the app
icon, the CryptoComp wordmark, and a compliance line.

## Regenerate

```
node generate.mjs              # write HTML + render PNGs
node generate.mjs --no-render  # templates only
```

Output lands in `out/`. Edit the `ADS` array in `generate.mjs` to change copy,
then re-run — everything else (type scale, layout, safe areas) follows.

## The set

| File | Size | Where it fits | Message |
| --- | --- | --- | --- |
| `01-hero-square.png` | 1080×1080 | Instagram / Facebook feed | Brand hero — "Trade crypto. Win prizes. Risk nothing." |
| `02-story-vertical.png` | 1080×1920 | Instagram / TikTok story, Reels | "Real prices. Practice money." with a live-chart mock |
| `03-x-landscape.png` | 1600×900 | X, LinkedIn | "Everyone starts with $100K." — the equal-bankroll hook |
| `04-leagues-square.png` | 1080×1080 | Instagram / Facebook feed | Leaderboard + seasonal leagues |
| `05-learn-square.png` | 1080×1080 | Instagram / Facebook feed | "$0 at risk" — the learn-to-trade angle |

## Two things that are deliberate

**No stock photography.** Every pixel is the app's own icon plus vector drawn in
CSS/SVG. Nothing is downloaded, so there is no licence to track, no attribution
to carry, and no model-release exposure from a stock photo of a person. These
are clean to post anywhere, including paid placements.

**The disclaimer is in the template, not the caption.** `DISCLAIMER` in
`generate.mjs` renders onto every image. CryptoComp is a simulated trading app —
a caption can be truncated, cropped, or reposted without its text, but the image
carries its own context. The copy also avoids anything that reads as a
real-money return claim: dollar figures always appear next to "practice money",
and the charts are labelled "positions are simulated".

Change `DISCLAIMER` in one place and every image updates.

## Platform notes baked in

- **Story safe area.** Instagram and TikTok overlay their own UI across roughly
  the top 12% and bottom 17% of a 9:16 story. `02` keeps all content — the CTA
  and the disclaimer especially — inside the readable band.
- **Feed crop.** The square images hold their message well inside the frame, so
  a 4:5 or 1:1 crop in-feed won't cut the wordmark or the disclaimer.

## Suggested captions

Pair with the image; the image already carries the legal line.

1. **Hero** — "Live crypto markets. Practice money. Real leaderboards. Start free → [link]"
2. **Story** — "Every trader's first year is expensive. Ours is free. 📈"
3. **X** — "Everyone gets the same $100K practice bankroll. No deposits, no edge you can buy — just who reads the market best. Free on iOS."
4. **Leagues** — "Bronze to Diamond. Weekly promotion, seasonal resets. Where do you land? 🏆"
5. **Learn** — "You don't learn the market by reading about it. You learn it by being wrong — cheaply."

## Before posting

- The App Store link isn't embedded — add your real listing URL to the caption
  or link-in-bio.
- `@ravenx`, `@m_lark`, `@tsuki` on the leaderboard card and the `$67,412.80`
  BTC price are illustrative placeholders, not live data. Swap for a real
  capture if you'd rather show genuine numbers.
- The "17+" in the disclaimer should match the App Store age rating on the live
  listing.
