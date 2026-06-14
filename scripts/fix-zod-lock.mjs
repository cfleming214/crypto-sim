#!/usr/bin/env node
// Self-healing repair for a recurring lockfile desync that breaks EAS `npm ci`.
//
// package.json pins zod@3.25.17 for two Amplify constructs via `overrides`:
//   @aws-amplify/data-construct        → zod 3.25.17
//   @aws-amplify/graphql-api-construct → zod 3.25.17
// But those constructs BUNDLE zod (inBundle:true), and npm's override for a
// bundled dep is fragile: every `npm install` / `npx expo install` re-resolves
// the bundled copies back to 3.24.2, silently desyncing package-lock.json from
// the override. EAS then fails with:
//   "lock file's zod@3.24.2 does not satisfy zod@3.25.17"
//
// This script re-pins any zod lock entry stuck at 3.24.2 back to 3.25.17 (with
// the correct resolved+integrity). Wired as a `postinstall` hook so it runs
// automatically after every install — the lock self-heals before it can ever be
// committed broken. Idempotent + safe: no-ops when already correct.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCK = join(dirname(fileURLToPath(import.meta.url)), '..', 'package-lock.json');
const BAD = '3.24.2';
const GOOD = '3.25.17';
const RESOLVED = `https://registry.npmjs.org/zod/-/zod-${GOOD}.tgz`;
const INTEGRITY = 'sha512-8hQzQ/kMOIFbwOgPrm9Sf9rtFHpFUMy4HvN0yEB0spw14aYi0uT5xG5CE2DB9cd51GWNsz+DNO7se1kztHMKnw==';

let lock;
try {
  lock = JSON.parse(readFileSync(LOCK, 'utf8'));
} catch {
  process.exit(0); // no lockfile (e.g. fresh clone mid-install) — nothing to do
}

let fixed = 0;
for (const [path, entry] of Object.entries(lock.packages ?? {})) {
  if (path.endsWith('node_modules/zod') && entry?.version === BAD) {
    entry.version = GOOD;
    entry.resolved = RESOLVED;
    entry.integrity = INTEGRITY;
    fixed++;
  }
}

if (fixed > 0) {
  // Preserve npm's trailing newline so the diff stays minimal.
  writeFileSync(LOCK, JSON.stringify(lock, null, 2) + '\n');
  console.log(`fix-zod-lock: re-pinned ${fixed} bundled zod entr${fixed === 1 ? 'y' : 'ies'} ${BAD} → ${GOOD}`);
}
