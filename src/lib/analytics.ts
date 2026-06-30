// Product analytics (PostHog) — the funnel/retention measurement layer.
//
// Lazy + guarded exactly like src/lib/ads.ts and the Sentry init in App.tsx: the
// SDK is dynamically imported behind try/catch and EVERY export is a silent no-op
// when the key is unset (dev / Expo Go / web) or the module is absent. Analytics
// must never throw into a user flow.
//
// Key is inlined at build time via EXPO_PUBLIC_POSTHOG_KEY (eas.json), so it only
// activates in real builds. Host defaults to US cloud; override with
// EXPO_PUBLIC_POSTHOG_HOST for EU/self-host.

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

// The funnel event schema. Keeping names + property shapes in one typed map means
// call sites can't drift (a typo or wrong prop is a compile error). Events map to
// the core funnel in docs/launch-growth-plan.md: install → signup → onboarding →
// first trade → first contest → return.
type EventProps = {
  app_open: undefined;
  deep_link_opened: { url: string; screen?: string };
  signup: { method: 'email' | 'apple' };
  login: { method: 'email' | 'apple' };
  onboarding_completed: { slides?: number };
  first_trade: { side: 'buy' | 'sell'; symbol: string; amount: number };
  trade_executed: { side: 'buy' | 'sell'; symbol: string; amount: number };
  contest_joined: { contestId: string; contestType?: string; prizeXp?: number };
  email_verification_required: undefined;
  referral_code_entered: { code: string };
};
export type AnalyticsEvent = keyof EventProps;

let client: any = null;
let initStarted = false;

async function getClient(): Promise<any> {
  if (!POSTHOG_KEY) return null;
  if (client || initStarted) return client;
  initStarted = true;
  try {
    const { default: PostHog } = await import('posthog-react-native');
    client = new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST });
  } catch {
    // Native/optional deps absent (Expo Go) or init failed — stay a no-op.
    client = null;
  }
  return client;
}

/** Warm the SDK at launch. Safe to call when unconfigured (no-op). */
export function initAnalytics(): void {
  void getClient();
}

/** Capture a typed funnel event. Events with no props omit the second arg. */
export function track<E extends AnalyticsEvent>(
  name: E,
  ...args: EventProps[E] extends undefined ? [] : [EventProps[E]]
): void {
  const props = args[0];
  getClient().then(c => { try { c?.capture(name, props); } catch { /* swallow */ } });
}

/** Bind events to a signed-in account (Cognito sub). */
export function identifyUser(userId: string, traits?: Record<string, unknown>): void {
  getClient().then(c => { try { c?.identify(userId, traits); } catch { /* swallow */ } });
}

/** Drop identity on sign-out so the next (guest) session isn't attributed. */
export function resetAnalytics(): void {
  getClient().then(c => { try { c?.reset(); } catch { /* swallow */ } });
}
