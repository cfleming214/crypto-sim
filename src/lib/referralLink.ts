// Capture an incoming referral code from a deep link — scheme-based, no Branch.
// Handles cryptocomp://r/CODE and https://<domain>/r/CODE (and a ?ref=CODE query).
// Branch (WS1 #18) will later layer DEFERRED install attribution on top; this is
// the no-native-dep path that already works with the app's existing URL scheme.
//
// The code is held in a module var (+ surfaced via a listener) until an auth'd
// session can record it server-side (see ReferralWatcher). No new dependency —
// uses React Native's built-in Linking.
import { Linking } from 'react-native';

let pendingCode: string | null = null;
const listeners = new Set<(code: string) => void>();

function extractCode(url: string | null): string | null {
  if (!url) return null;
  // Match /r/CODE (path) or ?ref=CODE / &ref=CODE (query). Code = 4–12 of our alphabet.
  const path = url.match(/\/r\/([A-Z0-9]{4,12})/i);
  const query = url.match(/[?&]ref=([A-Z0-9]{4,12})/i);
  const code = (path?.[1] ?? query?.[1])?.toUpperCase() ?? null;
  return code;
}

function setPending(code: string | null) {
  if (!code || pendingCode === code) return;
  pendingCode = code;
  listeners.forEach(l => { try { l(code); } catch { /* ignore */ } });
}

/** Manually stash a code (e.g. typed into a "have a code?" field). */
export function setPendingReferralCode(code: string): void {
  setPending(code.trim().toUpperCase());
}

export function getPendingReferralCode(): string | null {
  return pendingCode;
}

export function clearPendingReferralCode(): void {
  pendingCode = null;
}

export function onReferralCode(cb: (code: string) => void): () => void {
  listeners.add(cb);
  if (pendingCode) cb(pendingCode);
  return () => { listeners.delete(cb); };
}

/** Start listening for referral deep links (initial URL + while running). Returns
 *  an unsubscribe fn. Also returns any incoming URL via onUrl for analytics. */
export function startReferralLinkCapture(onUrl?: (url: string) => void): () => void {
  Linking.getInitialURL().then(url => {
    if (url) { onUrl?.(url); setPending(extractCode(url)); }
  }).catch(() => {});
  const sub = Linking.addEventListener('url', ({ url }) => {
    if (url) { onUrl?.(url); setPending(extractCode(url)); }
  });
  return () => { try { sub.remove(); } catch { /* ignore */ } };
}
