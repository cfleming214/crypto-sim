import { useEffect, useReducer } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// AdMob test mode = show Google's TEST ad units instead of the real ones. Two
// sources, OR'd together:
//   1. Build/OTA flag — EXPO_PUBLIC_ADMOB_TEST_MODE (set in EAS env, flippable via
//      `eas update` without a rebuild). Forces test mode on for everyone.
//   2. In-app dev toggle — a persisted per-device override (QA can flip it in
//      Profile → More options without any deploy).
// When either is on, AD_UNITS resolves to undefined so the ad code falls back to
// TestIds. Test ads work with the real App ID, so nothing native is involved.

const KEY = 'adTestMode.v1';
const ENV_TEST_MODE = process.env.EXPO_PUBLIC_ADMOB_TEST_MODE === 'true';

let override = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function isAdTestMode(): boolean {
  return ENV_TEST_MODE || override;
}

// True when the OTA/build flag forces test mode — the in-app toggle can't turn it
// off in that case (the env/OTA flag wins).
export function isAdTestModeForcedByEnv(): boolean {
  return ENV_TEST_MODE;
}

export function setAdTestMode(on: boolean): void {
  override = on;
  AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => {});
  notify();
}

// Load the persisted override once at app start.
export async function loadAdTestMode(): Promise<void> {
  try { override = (await AsyncStorage.getItem(KEY)) === '1'; } catch { /* keep default */ }
  notify();
}

// Reactive hook for UI (badge + the toggle row).
export function useAdTestMode(): boolean {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => { listeners.add(force); return () => { listeners.delete(force); }; }, []);
  return isAdTestMode();
}
