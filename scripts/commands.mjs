#!/usr/bin/env node
// Prints a grouped, human-readable summary of the project's npm scripts —
// test commands first. Reads package.json live so it never goes stale; add a
// script there and (optionally) a line in DESCRIPTIONS below and it shows up.
//
//   node scripts/commands.mjs           # all groups
//   node scripts/commands.mjs test      # only groups matching "test"
//   npm run commands                    # via the package.json alias
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));
const scripts = pkg.scripts ?? {};
const filter = (process.argv[2] ?? '').toLowerCase();

// Curated one-liners. Anything missing falls back to its raw command string.
const DESCRIPTIONS = {
  'test:e2e':            'Run ALL Maestro E2E flows (smoke + full tags)',
  'test:e2e:smoke':      'Run smoke-tagged Maestro flows only (fast sanity)',
  'test:e2e:multi-user': 'Spin up 5 users, run the multi-user E2E, then clean up',
  'test:e2e:cleanup':    'Delete leftover E2E test data from the backend',
  'test:e2e:lint':       'Lint the Maestro flow files for mistakes',
  'seed:tokens':         'Seed the tradeable token catalog (test fixture)',
  'seed:contests':       'Seed live contests + bots (use --players N)',
  'seed:contests:clean': 'Tear down all seeded contests, bots + profiles',
  'stress:contest':      'Stress-test a contest with bot load',
  'start':               'Start the Expo dev server',
  'android':             'Build + run the app on Android',
  'ios':                 'Build + run the app on iOS',
  'web':                 'Start the app in a web browser',
};

// Group → predicate over the script name. First match wins; order = print order.
const GROUPS = [
  { title: 'TEST / E2E',            match: n => n.startsWith('test') },
  { title: 'DATA / SEED (fixtures)', match: n => n.startsWith('seed') || n.startsWith('stress') },
  { title: 'DEV',                   match: n => ['start', 'android', 'ios', 'web'].includes(n) },
  { title: 'OTHER',                 match: () => true },
];
// Lifecycle hooks run automatically — don't clutter the summary.
const HIDDEN = new Set(['postinstall', 'preinstall', 'prepare', 'eas-build-pre-install', 'eas-build-post-install']);

const isTTY = process.stdout.isTTY;
const c = (code, s) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = s => c('1', s), cyan = s => c('36', s), green = s => c('32', s), dim = s => c('2', s);

// Bucket the visible scripts.
const buckets = GROUPS.map(g => ({ ...g, items: [] }));
for (const name of Object.keys(scripts)) {
  if (HIDDEN.has(name)) continue;
  buckets.find(g => g.match(name)).items.push(name);
}

const width = Math.max(0, ...Object.keys(scripts).filter(n => !HIDDEN.has(n)).map(n => n.length));

console.log(`\n${bold(cyan('CryptoComp'))} ${dim('· run commands')}\n`);
for (const g of buckets) {
  const items = filter ? g.items.filter(n => (g.title.toLowerCase() + ' ' + n).includes(filter)) : g.items;
  if (!items.length) continue;
  console.log(bold(g.title));
  for (const name of items) {
    const desc = DESCRIPTIONS[name] ?? dim(scripts[name]);
    console.log(`  ${green('npm run ' + name.padEnd(width))}  ${desc}`);
  }
  console.log('');
}
console.log(dim(`Tip: node scripts/commands.mjs <filter>  ·  e.g. "test" to show only test commands\n`));
