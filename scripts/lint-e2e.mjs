#!/usr/bin/env node
/**
 * Static validator for the Maestro suite.
 *
 * 1. YAML syntax: every .yaml file under .maestro/ must parse cleanly.
 * 2. testID coverage: every `id:` referenced in a flow file must either
 *    (a) match a string literal `testID="..."` somewhere under src/, or
 *    (b) be a regex pattern (ends with `.*`) we trust intentionally.
 * 3. Helper references: every `runFlow: file: <path>` must point at an
 *    existing file relative to the referring flow.
 *
 * Doesn't actually launch the app — purely static. Catches drift between
 * flows and source code without needing Maestro or a device.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import YAML from 'yaml';

const ROOT = resolve('.');
const MAESTRO_DIR = resolve('.maestro');
const SRC_DIR = resolve('src');

const errors = [];
const warnings = [];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// ---- Collect every testID literal in src/ ----
const tsxFiles = walk(SRC_DIR).filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
const knownTestIDs = new Set();
const templateTestIDs = []; // testID={`...${var}...`} — store the prefix only
for (const f of tsxFiles) {
  const src = readFileSync(f, 'utf8');
  // testID="literal"
  for (const m of src.matchAll(/testID="([^"]+)"/g)) knownTestIDs.add(m[1]);
  // testID={'literal'}  or testID={"literal"}
  for (const m of src.matchAll(/testID=\{['"]([^'"]+)['"]\}/g)) knownTestIDs.add(m[1]);
  // testID={cond ? 'a' : 'b'}  — ternary returning two literals
  for (const m of src.matchAll(/testID=\{[^?}]+\?\s*['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]\s*\}/g)) {
    knownTestIDs.add(m[1]);
    knownTestIDs.add(m[2]);
  }
  // testID={`tpl-${...}`} — capture prefix for fuzzy match
  for (const m of src.matchAll(/testID=\{`([^`]*)`\}/g)) {
    const raw = m[1];
    const prefix = raw.split('${')[0]; // everything before first interpolation
    templateTestIDs.push({ prefix, raw, file: relative(ROOT, f) });
  }
  // Concatenation patterns: testID={`${'numpad-key-'}...`} or 'trade-' + side + '-toggle'
  for (const m of src.matchAll(/testID=\{['"]([^'"]+)['"]\s*\+/g)) {
    templateTestIDs.push({ prefix: m[1], raw: m[0], file: relative(ROOT, f) });
  }
}

// Known dynamic id prefixes we expect to be matched at runtime
const dynamicMatchers = [
  'portfolio-selector-',
  'portfolio-holding-row-',
  'markets-coin-row-',
  'markets-watchlist-star-',
  'compete-card-',
  'top-traders-row-',
  'numpad-key-',
  'profile-color-',
  'tournament-leaderboard-row-',
  'notif-row-',
  'nudge-dismiss-',
  'trade-quick-amount-',
];

function isKnownId(id) {
  if (knownTestIDs.has(id)) return true;
  // Regex patterns the flow uses to match dynamic ids
  if (id.endsWith('.*') || id.endsWith('-.*')) return true;
  // Pattern like `portfolio-selector-(?!main).*`
  if (id.includes('(?!') || id.includes('(?:')) return true;
  // Prefix-based dynamic IDs
  for (const prefix of dynamicMatchers) {
    if (id.startsWith(prefix)) return true;
  }
  // Template-string literal prefixes from the source
  for (const t of templateTestIDs) {
    if (t.prefix && id.startsWith(t.prefix)) return true;
  }
  return false;
}

// ---- Validate every flow file ----
const yamlFiles = walk(MAESTRO_DIR).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
console.log(`Found ${yamlFiles.length} yaml files under .maestro/\n`);

for (const f of yamlFiles) {
  const rel = relative(ROOT, f);
  let raw = readFileSync(f, 'utf8');
  // Maestro flow files use a `---` document separator: appId/tags then steps
  let docs;
  try {
    docs = YAML.parseAllDocuments(raw);
  } catch (e) {
    errors.push(`${rel}: YAML parse error — ${e.message}`);
    continue;
  }
  for (const doc of docs) {
    if (doc.errors?.length) {
      for (const e of doc.errors) errors.push(`${rel}: ${e.message}`);
    }
  }

  // Walk the steps document (the one with the array) to collect `id:` and
  // `runFlow: file:` references.
  for (const doc of docs) {
    const data = doc.toJSON();
    if (!Array.isArray(data)) continue;
    for (const step of data) {
      if (!step || typeof step !== 'object') continue;
      const collectIds = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        if (typeof obj.id === 'string') {
          if (!isKnownId(obj.id)) {
            errors.push(`${rel}: unknown testID "${obj.id}"`);
          }
        }
        for (const v of Object.values(obj)) {
          if (Array.isArray(v)) v.forEach(collectIds);
          else if (typeof v === 'object') collectIds(v);
        }
      };
      collectIds(step);

      // runFlow file references
      const checkRunFlow = (s) => {
        if (!s || typeof s !== 'object') return;
        if (s.runFlow) {
          const file = typeof s.runFlow === 'string' ? s.runFlow : s.runFlow.file;
          if (file) {
            const abs = resolve(dirname(f), file);
            if (!existsSync(abs)) {
              errors.push(`${rel}: runFlow references missing file → ${file}`);
            }
          }
        }
        for (const v of Object.values(s)) {
          if (Array.isArray(v)) v.forEach(checkRunFlow);
          else if (typeof v === 'object') checkRunFlow(v);
        }
      };
      checkRunFlow(step);
    }
  }
}

console.log(`\nKnown testIDs in src/: ${knownTestIDs.size} literal + ${templateTestIDs.length} template prefixes`);
console.log(`Errors:   ${errors.length}`);
console.log(`Warnings: ${warnings.length}\n`);

for (const w of warnings) console.warn(`  ⚠️  ${w}`);
for (const e of errors)   console.error(`  ✗ ${e}`);

if (errors.length) process.exit(1);
console.log('All flows valid.');
