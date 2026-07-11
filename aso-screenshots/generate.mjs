#!/usr/bin/env node
// CryptoComp App Store screenshot template generator.
//
//   node generate.mjs            # write slide HTML + render placeholder PNGs
//   node generate.mjs --render   # (default) also render PNGs via headless Chrome
//   node generate.mjs --no-render # only (re)write the HTML templates
//
// Workflow:
//   1. Run once to see the framed placeholders in ./out/.
//   2. Drop your real app captures into ./screens/ as 01.png … 06.png
//      (full-height portrait screenshots — any tall size; they're cover-cropped).
//   3. Re-run `node generate.mjs` to render store-ready PNGs into ./out/<size>/.
//   4. Upload with the ASC API (ask Claude to wire ./out into the uploader).
//
// Edit HEADLINES / ACCENT / SIZES below to taste, then re-run.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const RENDER = !process.argv.includes('--no-render');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ---- Brand ----
const ACCENT_1 = '#34D399';   // mint
const ACCENT_2 = '#22D3EE';   // cyan
const BG = '#0A0A0B';         // matches app splash background

// ---- Required output sizes (App Store portrait, px) ----
// 6.7" is the current primary iPhone requirement; 6.5"/5.5" are still accepted
// and already used by the live listing. iPad has a different aspect — add later.
const SIZES = [
  { key: 'iphone_67', w: 1290, h: 2796 }, // APP_IPHONE_67  (primary)
  { key: 'iphone_65', w: 1242, h: 2688 }, // APP_IPHONE_65
  { key: 'iphone_55', w: 1242, h: 2208 }, // APP_IPHONE_55
];

// ---- Slide copy (headline uses \n for line breaks) ----
const SLIDES = [
  { headline: 'Trade crypto.\nWin prizes.\nRisk nothing.', sub: 'Skill-based crypto trading on real markets — no real money, ever.' },
  { headline: 'Real prices,\npractice money',            sub: 'Live data on 240+ coins. Make the mistakes that teach you — for free.' },
  { headline: 'Free tournaments\n& leaderboards',         sub: 'Equal $100K bankroll for everyone. Race the clock. Climb the ranks.' },
  { headline: 'Climb Bronze\nto Diamond',                 sub: 'Seasonal league with weekly promotion and demotion. Prove your edge.' },
  { headline: 'Mirror the\ntop traders',                  sub: 'Browse leaderboard pros and copy their moves into your portfolio.' },
  { headline: 'The Time Machine',                         sub: 'Replay the 2021 bull run, the FTX collapse, and COVID at up to 60×.' },
];

const css = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100vw;height:100vh;overflow:hidden;background:${BG};
  font-family:-apple-system,'SF Pro Display','Inter',system-ui,sans-serif;color:#F5F7FA;
  -webkit-font-smoothing:antialiased}
.slide{position:relative;width:100vw;height:100vh;display:flex;flex-direction:column;align-items:center;
  padding:7.2vh 8vw 0;text-align:center;
  background:
    radial-gradient(130vw 70vh at 50% -8%, ${ACCENT_1}2e, transparent 60%),
    radial-gradient(130vw 70vh at 50% 108%, ${ACCENT_2}26, transparent 60%),
    ${BG}}
.headline{font-size:8.6vw;line-height:1.05;font-weight:800;letter-spacing:-0.025em;white-space:pre-line;
  background:linear-gradient(105deg,#FFFFFF 40%,${ACCENT_1});-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{margin-top:2.6vh;font-size:3.55vw;line-height:1.35;font-weight:500;color:#98A2B3;max-width:78vw}
.dots{display:flex;gap:1.4vw;margin-top:2.6vh}
.dots i{width:1.7vw;height:1.7vw;border-radius:50%;background:#2A2E37}
.dots i.on{background:linear-gradient(90deg,${ACCENT_1},${ACCENT_2});width:5.5vw;border-radius:1vw}
.stage{position:relative;flex:1;width:100%;display:flex;justify-content:center;align-items:flex-end;margin-top:4.5vh}
.device{position:relative;width:68vw;aspect-ratio:1179/2556;background:#000;
  border:1.5vw solid #15171C;border-bottom:none;border-radius:13vw 13vw 0 0;
  box-shadow:0 0 0 .45vw #2A2E37, 0 5vh 14vh rgba(0,0,0,.65);overflow:hidden}
.island{position:absolute;top:2.6vw;left:50%;transform:translateX(-50%);width:27vw;height:3.4vw;background:#000;border-radius:2vw;z-index:6}
.slot{position:absolute;inset:1.3vw;border-radius:11.7vw 11.7vw 0 0;overflow:hidden;background:#0d1017}
.hint{position:absolute;inset:0;display:flex;flex-direction:column;gap:1.6vh;align-items:center;justify-content:center;padding:7vw;color:#5B6472}
.hint .b{font-size:4.4vw;font-weight:700;color:#7A8698}
.hint .m{font-size:3.4vw;font-weight:600;color:${ACCENT_2};font-family:ui-monospace,Menlo,monospace}
.hint .s{font-size:2.7vw;line-height:1.4}
.screen{position:absolute;inset:0;background-size:cover;background-position:top center;background-repeat:no-repeat;z-index:3}
`;

function slideHtml(i, s) {
  const n = String(i + 1).padStart(2, '0');
  const dots = SLIDES.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div class="slide">
  <div class="headline">${s.headline}</div>
  <div class="sub">${s.sub}</div>
  <div class="dots">${dots}</div>
  <div class="stage"><div class="device"><div class="island"></div>
    <div class="slot">
      <div class="hint"><div class="b">Drop screen here</div><div class="m">screens/${n}.png</div>
        <div class="s">Full-height portrait app capture<br>(any tall size — cover-cropped)</div></div>
      <div class="screen" style="background-image:url('../screens/${n}.png')"></div>
    </div>
  </div></div>
</div></body></html>`;
}

// ---- Write templates ----
mkdirSync(join(ROOT, 'slides'), { recursive: true });
mkdirSync(join(ROOT, 'screens'), { recursive: true });
SLIDES.forEach((s, i) => {
  const n = String(i + 1).padStart(2, '0');
  writeFileSync(join(ROOT, 'slides', `slide-${n}.html`), slideHtml(i, s));
});
console.log(`Wrote ${SLIDES.length} slide templates to slides/`);

// ---- Render ----
if (RENDER) {
  if (!existsSync(CHROME)) { console.error(`Chrome not found at ${CHROME} — skipping render.`); process.exit(0); }
  let count = 0;
  for (const size of SIZES) {
    mkdirSync(join(ROOT, 'out', size.key), { recursive: true });
    SLIDES.forEach((_, i) => {
      const n = String(i + 1).padStart(2, '0');
      const html = join(ROOT, 'slides', `slide-${n}.html`);
      const out = join(ROOT, 'out', size.key, `slide-${n}.png`);
      execFileSync(CHROME, ['--headless=new', '--hide-scrollbars', '--disable-gpu',
        '--force-device-scale-factor=1', '--force-color-profile=srgb',
        `--window-size=${size.w},${size.h}`, `--screenshot=${out}`, `file://${html}`],
        { stdio: 'ignore' });
      count++;
    });
    console.log(`  rendered ${size.key} (${size.w}x${size.h}) — ${SLIDES.length} slides`);
  }
  console.log(`Done. ${count} PNGs in out/. Drop real captures into screens/01–06.png and re-run.`);
}
