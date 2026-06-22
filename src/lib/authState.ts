// Cheap, briefly-cached "is a user signed in right now" check. Every data model
// in the schema is userPool-authenticated, so firing a query/subscription while
// signed out (a guest, or during a transient token-refresh gap) throws
// NoValidAuthTokens — handled, but it spams Sentry. Authenticated fetches call
// this first and bail quietly when there's no session.

let cache: { at: number; ok: boolean } | null = null;
const TTL_MS = 3000;

export async function hasAuthSession(): Promise<boolean> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.ok;
  let ok = false;
  try {
    const { fetchAuthSession } = await import('aws-amplify/auth');
    const session = await fetchAuthSession();
    ok = !!session.tokens?.idToken;
  } catch {
    ok = false;
  }
  cache = { at: Date.now(), ok };
  return ok;
}

// Drop the cache on auth transitions (sign-in/out) so the next query re-checks
// immediately instead of waiting out the TTL.
export function clearAuthSessionCache(): void {
  cache = null;
}
