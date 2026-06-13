// Presence derivation — a single place that turns a "last active" timestamp into
// an online/away/offline status, so the dot thresholds stay consistent across the
// leaderboard, copy-trade, and anywhere else a trader avatar appears.

export type PresenceStatus = 'online' | 'away' | 'offline';

const ONLINE_MS = 15 * 60_000;  // active in the last 15 min → online (green)
const AWAY_MS = 45 * 60_000;    // 15–45 min idle → away (yellow), else offline (red)

/** Map an ISO `lastActiveAt` to a presence status. Missing/unparseable → offline. */
export function presenceStatus(lastActiveAt?: string | null): PresenceStatus {
  if (!lastActiveAt) return 'offline';
  const t = Date.parse(lastActiveAt);
  if (Number.isNaN(t)) return 'offline';
  const age = Date.now() - t;
  if (age < ONLINE_MS) return 'online';
  if (age < AWAY_MS) return 'away';
  return 'offline';
}
