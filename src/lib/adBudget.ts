import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Per-day ad budget.
//
// The existing frequency caps in adManager are SESSION-scoped and live in module
// memory, so force-quitting resets them — a user could take the same four
// interstitials again a second later, and rewarded ads were deliberately
// uncapped entirely ("opt-in, so no frequency cap"). Opt-in stops it being a UX
// problem; it does not stop it being an INVALID TRAFFIC problem. AdMob doesn't
// publish a numeric daily ceiling, but its Invalid Traffic policy covers any
// pattern that artificially inflates impressions, and an account can be
// suspended for it — so a device that can serve unlimited rewarded ads is an
// account risk, not just a taste question.
//
// Counts are persisted per UTC day so they survive relaunch, and the day key
// rolls over on its own with no cleanup job.
// ---------------------------------------------------------------------------

const KEY = 'adBudget.v1';

// Deliberately generous — this is an anti-abuse ceiling, not a monetisation
// throttle. A normal session takes a handful; only automation-like use reaches
// these numbers.
export const MAX_REWARDED_PER_DAY = 20;
export const MAX_ADS_PER_DAY = 30;         // rewarded + interstitial combined
export const REWARDED_COOLDOWN_MS = 60_000;

interface Budget {
  day: string;        // UTC YYYY-MM-DD
  rewarded: number;
  total: number;
  lastRewardedAt: number;
}

const utcDay = (now: number): string => new Date(now).toISOString().slice(0, 10);
const fresh = (now: number): Budget => ({ day: utcDay(now), rewarded: 0, total: 0, lastRewardedAt: 0 });

// In-memory mirror so the synchronous gate in canShowAd can consult it. Hydrated
// once at startup; every write updates both.
let cached: Budget = fresh(Date.now());

/** Load the persisted budget. Call once during ad init, before any gate runs. */
export async function hydrateAdBudget(now: number = Date.now()): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Budget>) : null;
    cached = parsed && parsed.day === utcDay(now)
      ? {
          day: parsed.day,
          rewarded: Number(parsed.rewarded) || 0,
          total: Number(parsed.total) || 0,
          lastRewardedAt: Number(parsed.lastRewardedAt) || 0,
        }
      : fresh(now);   // absent, corrupt, or a previous day → start clean
  } catch {
    cached = fresh(now);
  }
}

/** Roll the day over in-place if the clock has crossed UTC midnight. */
function current(now: number): Budget {
  if (cached.day !== utcDay(now)) cached = fresh(now);
  return cached;
}

export type AdBudgetVerdict =
  | { ok: true }
  | { ok: false; reason: 'daily-rewarded' | 'daily-total' | 'cooldown'; retryAfterMs?: number };

/**
 * May another ad run right now? Synchronous so it can sit inside canShowAd.
 * `rewarded` distinguishes the two ceilings; both formats share the total.
 */
export function checkAdBudget(rewarded: boolean, now: number = Date.now()): AdBudgetVerdict {
  const b = current(now);
  if (b.total >= MAX_ADS_PER_DAY) return { ok: false, reason: 'daily-total' };
  if (rewarded) {
    if (b.rewarded >= MAX_REWARDED_PER_DAY) return { ok: false, reason: 'daily-rewarded' };
    const since = now - b.lastRewardedAt;
    if (b.lastRewardedAt > 0 && since < REWARDED_COOLDOWN_MS) {
      return { ok: false, reason: 'cooldown', retryAfterMs: REWARDED_COOLDOWN_MS - since };
    }
  }
  return { ok: true };
}

/**
 * Record an ad that actually PRESENTED. Only presented ads count — a no-fill
 * costs the user nothing and generates no impression, so charging it against
 * the budget would punish them for AdMob's inventory.
 */
export async function noteAdShown(rewarded: boolean, now: number = Date.now()): Promise<void> {
  const b = current(now);
  b.total += 1;
  if (rewarded) { b.rewarded += 1; b.lastRewardedAt = now; }
  try { await AsyncStorage.setItem(KEY, JSON.stringify(b)); } catch { /* memory mirror still holds */ }
}

/** Test/diagnostic view of the live counters. */
export function adBudgetSnapshot(now: number = Date.now()): Readonly<Budget> {
  return { ...current(now) };
}
