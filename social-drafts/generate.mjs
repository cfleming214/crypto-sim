#!/usr/bin/env node
// CryptoComp social ad generator.
//
//   node generate.mjs              # write HTML + render PNGs (default)
//   node generate.mjs --no-render  # only (re)write the HTML templates
//
// Same approach as ../aso-screenshots: compose in HTML/CSS, screenshot with
// headless Chrome at exact platform dimensions. Nothing is downloaded and no
// third-party imagery is used — every asset here is the app's own icon plus
// vector drawn in CSS/SVG, so these are clean to post anywhere with no
// attribution or stock licence to track.
//
// Edit ADS below to change copy, then re-run.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPO = join(ROOT, '..');
const RENDER = !process.argv.includes('--no-render');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ---- Brand (matches app theme tokens + the ASO kit) ----
const BG = '#0A0A0B';          // darkColors.bg / splash background
const INK = '#F5F4EF';         // darkColors.ink
const MUTED = '#88868A';       // darkColors.ink3
const MINT = '#34D399';
const CYAN = '#22D3EE';
const UP = '#2BF06A';          // from the app icon gradient
const HAIRLINE = '#25252A';    // darkColors.hairline

const LOGO = join(REPO, 'assets', 'app-icon-1024.png');
const INTER = join(REPO, 'node_modules', '@expo-google-fonts', 'inter');

// Every ad carries this. CryptoComp is a SIMULATED trading app — social copy
// that could read as a real-money return claim is both untrue and a compliance
// problem, so the disclaimer is part of the template rather than something a
// caption has to remember.
const DISCLAIMER = 'Simulated trading · No real money · 17+';

// ---- The set ----
// `kind` selects the layout; sizes are the native post dimensions per platform.
const ADS = [
  {
    file: '01-hero-square',
    kind: 'hero',
    w: 1080, h: 1080,
    platform: 'Instagram / Facebook feed · 1:1',
    headline: 'Trade crypto.\nWin prizes.\nRisk nothing.',
    sub: 'Live prices on 240+ coins. Practice money, real competition.',
    cta: 'Free on the App Store',
  },
  {
    file: '02-story-vertical',
    kind: 'story',
    w: 1080, h: 1920,
    platform: 'Instagram / TikTok story · 9:16',
    headline: 'Real prices.\nPractice money.',
    sub: 'Learn the market on live data — without putting a cent at risk.',
    cta: 'Free on the App Store',
  },
  {
    file: '03-x-landscape',
    kind: 'split',
    w: 1600, h: 900,
    platform: 'X / LinkedIn · 16:9',
    headline: 'Everyone starts\nwith $100K.',
    sub: 'In practice money. Free tournaments on live crypto markets — equal bankroll, pure skill.',
    cta: 'Free on the App Store',
  },
  {
    file: '04-leagues-square',
    kind: 'board',
    w: 1080, h: 1080,
    platform: 'Instagram / Facebook feed · 1:1',
    headline: 'Climb Bronze\nto Diamond.',
    sub: 'Seasonal leagues with weekly promotion. Prove your edge on the leaderboard.',
    cta: 'Free on the App Store',
  },
  {
    file: '05-learn-square',
    kind: 'learn',
    w: 1080, h: 1080,
    platform: 'Instagram / Facebook feed · 1:1',
    headline: 'Make the mistakes\nthat teach you.',
    sub: 'Every trader pays tuition to the market. Pay yours in practice money.',
    cta: 'Free on the App Store',
  },
];

// ---- Shared pieces ----------------------------------------------------------

// The app ships Inter (see the design pass in #85). Pulled from node_modules so
// the ads match the product's typeface; the stack degrades to SF Pro if absent.
const fontFace = existsSync(INTER) ? `
@font-face{font-family:'InterLocal';font-weight:400;src:url('file://${INTER}/400Regular/Inter_400Regular.ttf')}
@font-face{font-family:'InterLocal';font-weight:600;src:url('file://${INTER}/600SemiBold/Inter_600SemiBold.ttf')}
@font-face{font-family:'InterLocal';font-weight:700;src:url('file://${INTER}/700Bold/Inter_700Bold.ttf')}
@font-face{font-family:'InterLocal';font-weight:800;src:url('file://${INTER}/800ExtraBold/Inter_800ExtraBold.ttf')}
` : '';

// Deterministic series so re-running produces byte-identical art.
const SERIES = [38, 34, 41, 37, 45, 43, 52, 48, 57, 54, 63, 59, 68, 72, 67, 78, 84, 80, 91, 96];

function sparkline(w, h, stroke = UP) {
  const max = Math.max(...SERIES), min = Math.min(...SERIES);
  const pts = SERIES.map((v, i) => {
    const x = (i / (SERIES.length - 1)) * w;
    const y = h - ((v - min) / (max - min)) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `0,${h} ${pts.join(' ')} ${w},${h}`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">
    <defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${stroke}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${stroke}" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon points="${area}" fill="url(#fill)"/>
    <polyline points="${pts.join(' ')}" stroke="${stroke}" stroke-width="${Math.max(3, w / 260)}"
      stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function candles(w, h) {
  const n = 14;
  const bw = w / n;
  let out = '';
  for (let i = 0; i < n; i++) {
    const base = SERIES[i] ?? 50;
    const up = i % 3 !== 1;
    const bodyH = h * (0.10 + (base % 17) / 100);
    const cy = h - (base / 110) * h;
    const x = i * bw + bw * 0.22;
    const bwid = bw * 0.56;
    const c = up ? UP : '#B5322E';
    out += `<rect x="${x + bwid / 2 - 1.5}" y="${cy - bodyH * 0.42}" width="3" height="${bodyH * 1.84}" fill="${c}" opacity="0.55" rx="1.5"/>`;
    out += `<rect x="${x}" y="${cy}" width="${bwid}" height="${bodyH}" fill="${c}" rx="4"/>`;
  }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">${out}</svg>`;
}

const lockup = (scale = 1) => `
<div class="lockup">
  <img class="mark" src="file://${LOGO}" alt=""/>
  <div class="word">CryptoComp</div>
</div>`;

const footer = (cta) => `
<div class="footer">
  <div class="cta">${cta}</div>
  <div class="disc">${DISCLAIMER}</div>
</div>`;

// ---- Layouts ----------------------------------------------------------------

function body(ad) {
  const H = ad.headline.replace(/\n/g, '<br/>');
  switch (ad.kind) {
    case 'hero':
      return `<div class="pad col center">
        ${lockup()}
        <h1 class="mt">${H}</h1>
        <p class="sub">${ad.sub}</p>
        <div class="spark">${sparkline(760, 200)}</div>
        ${footer(ad.cta)}
      </div>`;

    // Everything sits inside the story safe area (see .pad override below) —
    // Instagram and TikTok lay their own chrome over roughly the top 12% and
    // bottom 17%, which was covering the CTA and the disclaimer.
    case 'story':
      return `<div class="pad col">
        ${lockup()}
        <div class="grow"></div>
        <h1>${H}</h1>
        <p class="sub">${ad.sub}</p>
        <div class="chartcard">
          <div class="row between">
            <div><div class="tick">BTC / USD</div><div class="price">$67,412.80</div></div>
            <div class="chip up">▲ 4.21%</div>
          </div>
          <div class="mt2">${candles(840, 300)}</div>
          <div class="note">Live market data · positions are simulated</div>
        </div>
        ${footer(ad.cta)}
        <div class="grow"></div>
      </div>`;

    case 'split':
      return `<div class="pad row split">
        <div class="col left">
          ${lockup()}
          <div class="grow"></div>
          <h1>${H}</h1>
          <p class="sub">${ad.sub}</p>
          <div class="grow"></div>
          ${footer(ad.cta)}
        </div>
        <div class="col right">
          <div class="statcard">
            <div class="tick">YOUR BANKROLL</div>
            <div class="big">$100,000</div>
            <div class="chip up mt2">Practice money</div>
            <div class="mt3">${sparkline(560, 190, CYAN)}</div>
            <div class="rowsplit">
              <div><div class="tick">CONTESTS</div><div class="med">Free</div></div>
              <div><div class="tick">COINS</div><div class="med">240+</div></div>
              <div><div class="tick">RISK</div><div class="med">$0</div></div>
            </div>
          </div>
        </div>
      </div>`;

    case 'board': {
      const rows = [
        ['1', 'ravenx', '+38.4%', 'Diamond'],
        ['2', 'you', '+31.2%', 'Platinum'],
        ['3', 'm_lark', '+27.9%', 'Gold'],
        ['4', 'tsuki', '+22.1%', 'Gold'],
      ].map(([r, h, p, l], i) => `
        <div class="brow${h === 'you' ? ' me' : ''}">
          <div class="rank">${r}</div>
          <div class="who">@${h}</div>
          <div class="league">${l}</div>
          <div class="pct up">${p}</div>
        </div>`).join('');
      return `<div class="pad col">
        ${lockup()}
        <h1 class="mt">${H}</h1>
        <p class="sub">${ad.sub}</p>
        <div class="board">${rows}</div>
        ${footer(ad.cta)}
      </div>`;
    }

    case 'learn':
      return `<div class="pad col center">
        ${lockup()}
        <div class="seal">
          <div class="sealinner"><div class="sealnum">$0</div><div class="sealtxt">AT RISK</div></div>
        </div>
        <h1>${H}</h1>
        <p class="sub">${ad.sub}</p>
        ${footer(ad.cta)}
      </div>`;
  }
}

function html(ad) {
  // Type scale derives from the shorter edge so every format stays proportional.
  const u = Math.min(ad.w, ad.h) / 1080;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFace}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${ad.w}px;height:${ad.h}px;overflow:hidden}
body{
  background:${BG};
  font-family:'InterLocal',-apple-system,'SF Pro Display',system-ui,sans-serif;
  color:${INK};
  -webkit-font-smoothing:antialiased;
}
/* Ambient brand glow — keeps the flat dark background from reading as empty. */
body::before{content:'';position:absolute;inset:0;
  background:
    radial-gradient(90% 60% at 12% 0%, ${MINT}1F 0%, transparent 60%),
    radial-gradient(80% 55% at 100% 100%, ${CYAN}1A 0%, transparent 62%);}
body::after{content:'';position:absolute;inset:0;opacity:.35;
  background-image:linear-gradient(${HAIRLINE} 1px,transparent 1px),linear-gradient(90deg,${HAIRLINE} 1px,transparent 1px);
  background-size:${64 * u}px ${64 * u}px;
  -webkit-mask-image:radial-gradient(70% 60% at 50% 40%,#000 0%,transparent 78%);}
.pad{position:relative;z-index:1;width:100%;height:100%;padding:${72 * u}px;display:flex}
.col{flex-direction:column}
.row{flex-direction:row}
.center{align-items:center;text-align:center;justify-content:center}
.grow{flex:1}
.between{justify-content:space-between;align-items:center;display:flex;width:100%}
.mt{margin-top:${44 * u}px}.mt2{margin-top:${18 * u}px}.mt3{margin-top:${26 * u}px}

.lockup{display:flex;align-items:center;gap:${18 * u}px}
.mark{width:${86 * u}px;height:${86 * u}px;border-radius:${20 * u}px;display:block}
.word{font-size:${38 * u}px;font-weight:700;letter-spacing:-0.02em}

h1{font-size:${ad.kind === 'split' ? 88 * u : 96 * u}px;line-height:1.03;font-weight:800;
   letter-spacing:-0.035em;margin-top:${28 * u}px;
   background:linear-gradient(105deg,${INK} 30%,${MINT} 78%,${CYAN} 100%);
   -webkit-background-clip:text;-webkit-text-fill-color:transparent;}
.sub{font-size:${34 * u}px;line-height:1.38;color:${MUTED};margin-top:${26 * u}px;max-width:${ad.kind === 'split' ? '100%' : '86%'};font-weight:400}
.center .sub{margin-left:auto;margin-right:auto}

.footer{margin-top:${40 * u}px;width:100%}
.center .footer{margin-top:${52 * u}px}
.cta{display:inline-block;font-size:${30 * u}px;font-weight:700;color:${BG};
  background:linear-gradient(100deg,${MINT},${CYAN});
  padding:${20 * u}px ${38 * u}px;border-radius:${999}px;letter-spacing:-0.01em}
.disc{margin-top:${20 * u}px;font-size:${21 * u}px;color:#6E6D72;letter-spacing:0.01em;font-weight:600}

.spark{margin-top:${40 * u}px;opacity:.95}
.chip{display:inline-block;font-size:${24 * u}px;font-weight:700;padding:${10 * u}px ${20 * u}px;border-radius:999px}
.chip.up{color:${UP};background:${UP}1F}
.tick{font-size:${20 * u}px;font-weight:700;letter-spacing:.14em;color:${MUTED};text-transform:uppercase}

.chartcard,.statcard,.board{background:#141416;border:1px solid ${HAIRLINE};border-radius:${34 * u}px;padding:${40 * u}px}
.chartcard{margin-top:${52 * u}px}
.price{font-size:${52 * u}px;font-weight:800;letter-spacing:-0.025em;margin-top:${6 * u}px;font-variant-numeric:tabular-nums}
.note{margin-top:${22 * u}px;font-size:${21 * u}px;color:#6E6D72}
.big{font-size:${92 * u}px;font-weight:800;letter-spacing:-0.035em;margin-top:${10 * u}px;font-variant-numeric:tabular-nums}
.med{font-size:${34 * u}px;font-weight:700;margin-top:${6 * u}px}
.rowsplit{display:flex;gap:${34 * u}px;margin-top:${34 * u}px;border-top:1px solid ${HAIRLINE};padding-top:${28 * u}px}

.split{gap:${64 * u}px}
.left{flex:1.05;justify-content:center}
.right{flex:1;justify-content:center;display:flex}
.statcard{width:100%}

.board{margin-top:${46 * u}px;padding:${12 * u}px ${18 * u}px}
.brow{display:flex;align-items:center;gap:${22 * u}px;padding:${26 * u}px ${22 * u}px;border-bottom:1px solid ${HAIRLINE}}
.brow:last-child{border-bottom:none}
.brow.me{background:${MINT}14;border-radius:${20 * u}px}
.rank{font-size:${30 * u}px;font-weight:800;color:${MUTED};width:${44 * u}px;font-variant-numeric:tabular-nums}
.who{font-size:${32 * u}px;font-weight:700;flex:1}
.league{font-size:${24 * u}px;font-weight:600;color:${MUTED}}
.pct{font-size:${32 * u}px;font-weight:800;width:${140 * u}px;text-align:right;font-variant-numeric:tabular-nums}
.pct.up{color:${UP}}

.seal{width:${300 * u}px;height:${300 * u}px;border-radius:50%;margin:${52 * u}px auto ${10 * u}px;
  display:flex;align-items:center;justify-content:center;
  background:conic-gradient(from 200deg,${MINT},${CYAN},${MINT});padding:${5 * u}px}
.sealinner{width:100%;height:100%;border-radius:50%;background:#111113;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${6 * u}px}
.sealnum{font-size:${104 * u}px;font-weight:800;letter-spacing:-0.04em;
  background:linear-gradient(120deg,${MINT},${CYAN});-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.sealtxt{font-size:${23 * u}px;font-weight:700;letter-spacing:.2em;color:${MUTED}}

/* --- Per-format overrides. Must stay LAST: these share specificity with the
       base rules above, so they only win by source order. --- */
${ad.kind === 'story' ? `
/* Story safe area. Instagram and TikTok lay their own chrome over roughly the
   top 12% and bottom 17% of a 9:16 story — which was covering the CTA and the
   disclaimer. Keep every element inside the readable band. */
.pad{padding-top:215px;padding-bottom:330px}` : ''}
${ad.kind === 'board' ? `
/* Tallest layout: four leaderboard rows plus a chart-height headline. Tighten
   the vertical rhythm so the footer — and with it the compliance line — can't
   be pushed off the bottom edge. */
h1{margin-top:${14 * u}px;font-size:${82 * u}px}
.sub{margin-top:${16 * u}px;font-size:${30 * u}px}
.board{margin-top:${26 * u}px}
.brow{padding:${19 * u}px ${20 * u}px}
.footer{margin-top:${26 * u}px}
.cta{padding:${16 * u}px ${32 * u}px;font-size:${28 * u}px}
.disc{margin-top:${14 * u}px}` : ''}
</style></head><body>${body(ad)}</body></html>`;
}

// ---- Write + render ---------------------------------------------------------

mkdirSync(join(ROOT, 'html'), { recursive: true });
mkdirSync(join(ROOT, 'out'), { recursive: true });

for (const ad of ADS) writeFileSync(join(ROOT, 'html', `${ad.file}.html`), html(ad));
console.log(`Wrote ${ADS.length} templates to html/`);

if (!RENDER) process.exit(0);
if (!existsSync(CHROME)) { console.error(`Chrome not found at ${CHROME} — skipping render.`); process.exit(0); }

for (const ad of ADS) {
  const src = join(ROOT, 'html', `${ad.file}.html`);
  const out = join(ROOT, 'out', `${ad.file}.png`);
  execFileSync(CHROME, ['--headless=new', '--hide-scrollbars', '--disable-gpu',
    '--force-device-scale-factor=1', '--force-color-profile=srgb',
    '--allow-file-access-from-files',
    `--window-size=${ad.w},${ad.h}`, `--screenshot=${out}`, `file://${src}`],
    { stdio: 'ignore' });
  console.log(`  ${ad.file}.png  ${ad.w}x${ad.h}  — ${ad.platform}`);
}
console.log(`Done. ${ADS.length} PNGs in out/.`);
