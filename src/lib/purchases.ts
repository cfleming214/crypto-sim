import { Platform } from 'react-native';
import { useEffect, useReducer } from 'react';

// RevenueCat (react-native-purchases) wrapper. ALL IAP goes through here — call
// sites never touch the SDK directly — so configuration, the entitlement read,
// and the no-op-in-Expo-Go guard live in exactly one place.
//
// The native module only exists in a dev/production build (never Expo Go / web),
// so the SDK is lazy-required behind try/catch and every function degrades to a
// safe no-op when it's absent. Nothing here ever throws into app startup.
//
// COMPLIANCE: purchases grant VIRTUAL goods only (no-ads, play-money offline
// balance). RevenueCat is the source of truth for entitlements; the local cache
// (see the reactive store below) is convenience only and never authorizes
// anything that touches real cash.

// Entitlement identifiers configured in the RevenueCat dashboard.
//   no_ads  — granted by the No-Ads subscription AND by Premium.
//   premium — granted by Premium only.
export const ENTITLEMENT_NO_ADS = 'no_ads';
export const ENTITLEMENT_PREMIUM = 'premium';

// App Store Connect / RevenueCat product identifiers (must match both consoles).
export const PRODUCT_NO_ADS = 'com.simpledesignllc.cryptocomp.noads.monthly';
export const PRODUCT_BALANCE_5M = 'com.simpledesignllc.cryptocomp.balance5m';
export const PRODUCT_PREMIUM = 'com.simpledesignllc.cryptocomp.premium.monthly';

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

export interface Entitlements {
  noAds: boolean;
  premium: boolean;
}

// ---------------------------------------------------------------------------
// Reactive entitlement store — mirrors src/lib/adTestMode.ts so ad components
// and adManager can read `isNoAds()` synchronously without prop-drilling. The
// AppContext listener keeps this in sync with RevenueCat's customerInfo.
// ---------------------------------------------------------------------------
let cached: Entitlements = { noAds: false, premium: false };
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function setEntitlements(e: Entitlements): void {
  if (e.noAds === cached.noAds && e.premium === cached.premium) return;
  cached = e;
  notify();
}
export function getEntitlements(): Entitlements {
  return cached;
}
export function isNoAds(): boolean {
  return cached.noAds;
}
export function useEntitlements(): Entitlements {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => { listeners.add(force); return () => { listeners.delete(force); }; }, []);
  return cached;
}

// "Can the app actually transact?" — true only once the native SDK is present AND
// configured with a usable key. Lets the UI hide all purchase entry points on
// builds without the native module (e.g. an OTA pushed to an older binary) or
// when configuration was skipped (test key in a release build), so we never show
// a dead "Upgrade" button. Flips via notify() when configurePurchases() succeeds.
let ready = false;
export function isPurchasesReady(): boolean {
  return ready;
}
export function usePurchasesReady(): boolean {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => { listeners.add(force); return () => { listeners.delete(force); }; }, []);
  return ready;
}

// ---------------------------------------------------------------------------
// SDK access (lazy + guarded)
// ---------------------------------------------------------------------------
let Purchases: any = null;
let loadTried = false;
function loadSdk(): any | null {
  if (Purchases || loadTried) return Purchases;
  loadTried = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Purchases = require('react-native-purchases').default;
  } catch {
    Purchases = null; // native module absent (Expo Go / web)
  }
  return Purchases;
}

let configured = false;

// Configure the SDK once at launch. No-op without an API key or native module.
export function configurePurchases(): void {
  if (configured) return;
  const sdk = loadSdk();
  if (!sdk) return;
  const apiKey = Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;
  if (!apiKey) { console.warn('[iap] no RevenueCat API key set — purchases disabled'); return; }
  // RevenueCat FORCE-CLOSES a release build that's configured with a Test Store
  // key (`test_…`) — test keys are valid only in debug builds. So in a release
  // build we skip configuration unless a real production key (`appl_…`/`goog_…`)
  // is present: IAP simply stays unavailable (purchase sheet shows fallbacks)
  // instead of crashing the app. Debug builds may use the test key freely.
  const isTestKey = apiKey.startsWith('test_');
  if (isTestKey && !__DEV__) {
    console.warn('[iap] Test Store key in a release build — skipping RevenueCat configure to avoid the SDK force-close. Set a production appl_/goog_ key to enable IAP in release.');
    return;
  }
  try {
    sdk.configure({ apiKey });
    configured = true;
    ready = true;
    notify(); // wake any usePurchasesReady() consumers so the IAP UI can appear
  } catch (e) {
    console.warn('[iap] configure failed', e);
  }
}

// Diagnostic snapshot of the last customerInfo seen: which entitlement IDs are
// active, and which subscription product IDs are active. Lets us tell apart
// "not subscribed" from "subscribed but no entitlement attached / wrong ID".
let lastActiveEntitlementIds: string[] = [];
let lastActiveSubscriptions: string[] = [];
export function entitlementDiagnostic(): { entitlements: string[]; subscriptions: string[] } {
  return { entitlements: lastActiveEntitlementIds, subscriptions: lastActiveSubscriptions };
}

// Map a RevenueCat customerInfo into our two entitlement flags.
//
// We detect a subscriber two ways and OR them, so the app recognizes a paid user
// even when the RevenueCat ENTITLEMENTS aren't named exactly no_ads/premium (a
// common dashboard mismatch that otherwise grants nothing):
//   1. configured entitlements (active['premium'] / active['no_ads']), and
//   2. the active subscription PRODUCT ids (which are fixed + correct in code).
// Premium implies no-ads.
export function entitlementsFrom(customerInfo: any): Entitlements {
  const active = customerInfo?.entitlements?.active ?? {};
  const subs: string[] = Array.isArray(customerInfo?.activeSubscriptions) ? customerInfo.activeSubscriptions : [];
  lastActiveEntitlementIds = Object.keys(active);
  lastActiveSubscriptions = subs;
  const premium = !!active[ENTITLEMENT_PREMIUM] || subs.includes(PRODUCT_PREMIUM);
  const noAds = premium || !!active[ENTITLEMENT_NO_ADS] || subs.includes(PRODUCT_NO_ADS);
  return { noAds, premium };
}

// Fetch current entitlements (e.g. on launch). Returns null on any failure
// (SDK absent, no network) so the caller can keep the cached value rather than
// clobbering a real entitlement to false when offline.
export async function fetchEntitlements(): Promise<Entitlements | null> {
  const sdk = loadSdk();
  if (!sdk || !configured) return null;
  try {
    const info = await sdk.getCustomerInfo();
    return entitlementsFrom(info);
  } catch (e) {
    console.warn('[iap] getCustomerInfo failed', e);
    return null;
  }
}

// Identify the RevenueCat user with the signed-in app account (Cognito sub), so
// entitlements are scoped PER ACCOUNT instead of per device. Without this the SDK
// uses one anonymous device-scoped user, so every account on the device (and the
// device's Apple ID subscription) shares the same entitlements — e.g. a brand-new
// account inheriting Premium the device's Apple ID bought. Returns the now-active
// user's entitlements. NOTE: to stop a sub auto-moving to a new account, also set
// RevenueCat's transfer behavior to "Keep with original App User ID" (dashboard).
export async function loginPurchases(appUserId: string): Promise<Entitlements | null> {
  const sdk = loadSdk();
  if (!sdk || !configured || !appUserId) return null;
  try {
    const { customerInfo } = await sdk.logIn(appUserId);
    return entitlementsFrom(customerInfo);
  } catch (e) {
    console.warn('[iap] logIn failed', e);
    return null;
  }
}

// Drop back to a fresh anonymous user on sign-out, so the next account doesn't
// see the previous account's entitlements. No-op if already anonymous.
export async function logoutPurchases(): Promise<void> {
  const sdk = loadSdk();
  if (!sdk || !configured) return;
  try { await sdk.logOut(); } catch { /* already anonymous — ignore */ }
}

// Subscribe to entitlement changes (purchase, renewal, expiry, restore). Returns
// an unsubscribe fn. No-op (returns a noop) when the SDK is absent.
export function addEntitlementListener(cb: (e: Entitlements) => void): () => void {
  const sdk = loadSdk();
  if (!sdk) return () => {};
  const handler = (info: any) => cb(entitlementsFrom(info));
  try {
    sdk.addCustomerInfoUpdateListener(handler);
    return () => { try { sdk.removeCustomerInfoUpdateListener(handler); } catch { /* noop */ } };
  } catch {
    return () => {};
  }
}

export interface PurchasePackage {
  identifier: string;          // RevenueCat package id (e.g. "$rc_monthly")
  productId: string;           // store product identifier
  priceString: string;        // localized price, e.g. "$2.99"
  title: string;
  raw: any;                    // the underlying RevenueCat package, for purchasePackage()
}

// Human-readable reason the last getPackages() returned nothing — surfaced in the
// purchase sheet so a TestFlight/device tester can self-diagnose without a Mac.
let lastOfferingsDiagnostic = '';
export function offeringsDiagnostic(): string {
  return lastOfferingsDiagnostic;
}

// Load the current offering's packages, normalized for the UI. Empty on failure
// (and lastOfferingsDiagnostic explains why).
export async function getPackages(): Promise<PurchasePackage[]> {
  const sdk = loadSdk();
  if (!sdk) { lastOfferingsDiagnostic = 'Purchases module unavailable on this build.'; return []; }
  if (!configured) { lastOfferingsDiagnostic = 'Purchases not configured (missing/blocked RevenueCat key).'; return []; }
  try {
    const offerings = await sdk.getOfferings();
    const current = offerings?.current;
    const allCount = offerings?.all ? Object.keys(offerings.all).length : 0;
    const pkgs = current?.availablePackages ?? [];
    if (!current) {
      lastOfferingsDiagnostic = allCount > 0
        ? `No "Current" offering set in RevenueCat (${allCount} offering(s) exist — mark one Current).`
        : 'No offerings in RevenueCat for this app/key.';
    } else if (pkgs.length === 0) {
      lastOfferingsDiagnostic = 'Current offering has no fetchable products — check the Paid Apps agreement + that products are "Ready to Submit" (new products can take a few hours).';
    } else {
      lastOfferingsDiagnostic = '';
    }
    return pkgs.map((p: any) => ({
      identifier: p.identifier,
      productId: p.product?.identifier ?? '',
      priceString: p.product?.priceString ?? '',
      title: p.product?.title ?? '',
      raw: p,
    }));
  } catch (e: any) {
    lastOfferingsDiagnostic = e?.message ?? 'getOfferings() failed.';
    console.warn('[iap] getOfferings failed', e);
    return [];
  }
}

export interface PurchaseResult {
  ok: boolean;
  cancelled?: boolean;
  entitlements?: Entitlements;
  productId?: string;
  error?: string;
}

// Purchase a package. On success returns the updated entitlements; the productId
// lets the caller decide whether a consumable (the $5M balance) needs the
// new-or-add chooser. A user cancel is { ok:false, cancelled:true } — no alert.
export async function purchase(pkg: PurchasePackage): Promise<PurchaseResult> {
  const sdk = loadSdk();
  if (!sdk || !configured) return { ok: false, error: 'Purchases are unavailable.' };
  try {
    const { customerInfo } = await sdk.purchasePackage(pkg.raw);
    return { ok: true, entitlements: entitlementsFrom(customerInfo), productId: pkg.productId };
  } catch (e: any) {
    if (e?.userCancelled) return { ok: false, cancelled: true };
    console.warn('[iap] purchase failed', e);
    return { ok: false, error: e?.message ?? 'Purchase failed.' };
  }
}

// Restore prior purchases (Apple review requirement). Returns updated entitlements.
export async function restore(): Promise<PurchaseResult> {
  const sdk = loadSdk();
  if (!sdk || !configured) return { ok: false, error: 'Purchases are unavailable.' };
  try {
    const customerInfo = await sdk.restorePurchases();
    return { ok: true, entitlements: entitlementsFrom(customerInfo) };
  } catch (e: any) {
    console.warn('[iap] restore failed', e);
    return { ok: false, error: e?.message ?? 'Restore failed.' };
  }
}
