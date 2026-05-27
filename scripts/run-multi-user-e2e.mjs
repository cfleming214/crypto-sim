#!/usr/bin/env node
/**
 * Spawns N maestro test processes, one per simulated user, each running
 * .maestro/scenarios/full-user-journey.yaml. Each invocation gets its own
 * random email so the users don't collide.
 *
 * Defaults to 5 users, sequential execution. Pass `--parallel` for true
 * concurrent runs (requires N attached devices / N Maestro Cloud devices).
 *
 * Usage:
 *   node scripts/run-multi-user-e2e.mjs                  # 5 sequential users on the default device
 *   node scripts/run-multi-user-e2e.mjs --users 3        # 3 users
 *   node scripts/run-multi-user-e2e.mjs --parallel       # all 5 in parallel
 *   node scripts/run-multi-user-e2e.mjs --cloud          # run on Maestro Cloud instead of local
 *   node scripts/run-multi-user-e2e.mjs --cleanup        # also wipe test data when done
 *
 * Each run's stdout/stderr is written to .maestro-runs/<email>.log so you
 * can pinpoint failures without sifting through interleaved output.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const ARGS = process.argv.slice(2);
const USERS = parseInt(ARGS[ARGS.indexOf('--users') + 1] ?? '5', 10);
const PARALLEL = ARGS.includes('--parallel');
const CLOUD = ARGS.includes('--cloud');
const CLEANUP = ARGS.includes('--cleanup');
const FLOW = resolve('.maestro/scenarios/full-user-journey.yaml');

mkdirSync('.maestro-runs', { recursive: true });

function makeEmail() {
  return `test-${randomBytes(4).toString('hex')}@example.com`;
}

function runOne(email) {
  return new Promise(resolve => {
    const args = CLOUD
      ? ['cloud', FLOW]
      : ['test', FLOW];

    const env = {
      ...process.env,
      // Maestro substitutes ${MAESTRO_TEST_EMAIL} into flow files via env interpolation.
      // The sign-up-fresh helper generates its own emails via evalScript, but we
      // also expose this for any flow that wants a fixed identity.
      MAESTRO_TEST_EMAIL: email,
      MAESTRO_TEST_PASSWORD: 'Test1234!',
    };

    const logPath = resolve('.maestro-runs', `${email.replace(/[@.]/g, '_')}.log`);
    const log = createWriteStream(logPath, { flags: 'w' });
    log.write(`# maestro ${args.join(' ')}\n# email=${email}\n# started=${new Date().toISOString()}\n\n`);

    const proc = spawn('maestro', args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.pipe(log, { end: false });
    proc.stderr.pipe(log, { end: false });

    proc.on('close', code => {
      log.write(`\n# exited with code ${code} at ${new Date().toISOString()}\n`);
      log.end();
      resolve({ email, code, logPath });
    });

    proc.on('error', err => {
      log.write(`\n# spawn error: ${err.message}\n`);
      log.end();
      resolve({ email, code: -1, logPath, error: err.message });
    });
  });
}

async function main() {
  console.log(`Running ${USERS} simulated users ${PARALLEL ? 'in parallel' : 'sequentially'} via ${CLOUD ? 'Maestro Cloud' : 'local Maestro'}.`);
  console.log(`Flow: ${FLOW}`);
  console.log(`Logs: ./.maestro-runs/\n`);

  const emails = Array.from({ length: USERS }, makeEmail);
  console.log(`Emails:`);
  for (const e of emails) console.log(`  ${e}`);
  console.log();

  const results = PARALLEL
    ? await Promise.all(emails.map(runOne))
    : await emails.reduce(async (prev, email) => {
        const acc = await prev;
        process.stdout.write(`→ ${email} ... `);
        const r = await runOne(email);
        console.log(r.code === 0 ? 'OK' : `FAIL (exit ${r.code})`);
        return [...acc, r];
      }, Promise.resolve([]));

  const passed = results.filter(r => r.code === 0);
  const failed = results.filter(r => r.code !== 0);

  console.log(`\n────────────────────────────────────────`);
  console.log(`Result: ${passed.length} passed, ${failed.length} failed (${results.length} total)`);
  for (const r of failed) {
    console.log(`  ✗ ${r.email}   logs → ${r.logPath}`);
  }

  if (CLEANUP) {
    console.log(`\nRunning cleanup...`);
    await new Promise(res => {
      const c = spawn('node', ['scripts/cleanup-test-data.mjs', '--yes'], { stdio: 'inherit' });
      c.on('close', res);
    });
  } else if (passed.length === results.length) {
    console.log(`\nTo wipe the ${USERS} test accounts run:`);
    console.log(`  node scripts/cleanup-test-data.mjs --yes`);
  }

  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
