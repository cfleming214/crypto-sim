#!/usr/bin/env node
/**
 * Guard against amplify_outputs.json drift.
 *
 * The committed amplify_outputs.json is bundled into every build, and its
 * `data.model_introspection.models` block is what generateClient() uses to
 * build the typed `client.models.*` API. If a model is added to
 * amplify/data/resource.ts and deployed, but the outputs file isn't re-synced
 * and committed, then `client.models.<NewModel>` is `undefined` at runtime —
 * every read/write against it throws, usually swallowed by a try/catch, so the
 * feature silently does nothing in builds (see the LiveTrade feed regression).
 *
 * This catches that drift statically: every model defined in resource.ts must
 * be present in the committed introspection. Run after any `amplify/` change
 * and in CI. To fix a failure: re-sync outputs, e.g.
 *   npx ampx sandbox --identifier <id> --once --profile <name>
 * then commit amplify_outputs.json.
 *
 * Purely static — no AWS calls, no device. Mirrors scripts/lint-e2e.mjs.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUTPUTS = resolve('amplify_outputs.json');
const SCHEMA = resolve('amplify/data/resource.ts');

// ---- Models defined in the schema source ----
const src = readFileSync(SCHEMA, 'utf8');
const defined = [...src.matchAll(/^\s+([A-Z][A-Za-z0-9]+):\s*a\.model\(/gm)].map(m => m[1]);
if (defined.length === 0) {
  console.error(`✖ Found no a.model() definitions in ${SCHEMA} — has the schema format changed?`);
  process.exit(1);
}

// ---- Models present in the committed introspection ----
let outputs;
try {
  outputs = JSON.parse(readFileSync(OUTPUTS, 'utf8'));
} catch (e) {
  console.error(`✖ Could not read/parse ${OUTPUTS}: ${e.message}`);
  process.exit(1);
}
const introspected = outputs?.data?.model_introspection?.models;
if (!introspected) {
  console.error(`✖ ${OUTPUTS} has no data.model_introspection.models block.`);
  process.exit(1);
}
const present = new Set(Object.keys(introspected));

// ---- Compare ----
const missing = defined.filter(m => !present.has(m));
if (missing.length > 0) {
  console.error(`✖ amplify_outputs.json is stale — ${missing.length} model(s) defined in`);
  console.error(`  amplify/data/resource.ts are missing from data.model_introspection:`);
  for (const m of missing) console.error(`    • ${m}`);
  console.error('');
  console.error('  client.models.<Model> will be undefined for these at runtime, so any');
  console.error('  read/write silently fails in builds. Re-sync and commit the outputs:');
  console.error('    npx ampx sandbox --identifier <id> --once --profile <name>');
  console.error('    git add amplify_outputs.json');
  process.exit(1);
}

console.log(`✓ amplify_outputs.json in sync — all ${defined.length} models present in introspection.`);
