// Keychain/Keystore-backed token storage for Amplify (Cognito ID/access/refresh
// tokens), replacing the default UNENCRYPTED AsyncStorage. Closes the real
// device-compromise / unencrypted-backup risk (there is no web-XSS surface in RN).
//
// Guarded like ads.ts/purchases.ts: expo-secure-store is a NATIVE module, so it's
// lazy-required and this returns null when it's absent (Expo Go, or an OTA on a
// binary built before it was added) — the caller then keeps the AsyncStorage
// default, so the JS bundle never breaks. Takes effect once a native build ships.

// SecureStore keys allow only [A-Za-z0-9._-]; Amplify keys can contain '@' (email
// usernames) etc., so encode disallowed chars. Deterministic; no reverse needed.
function safeKey(key: string): string {
  return 'ak_' + key.replace(/[^A-Za-z0-9._-]/g, (c) => '-' + c.charCodeAt(0).toString(16));
}
const INDEX_KEY = 'ak_index'; // JSON array of the raw keys, so clear() can wipe all

let mod: any = null;
let tried = false;
function load(): any {
  if (tried) return mod;
  tried = true;
  try { mod = require('expo-secure-store'); } catch { mod = null; }
  return mod;
}

// Amplify's KeyValueStorageInterface: async getItem/setItem/removeItem/clear.
export function createSecureTokenStorage() {
  const s = load();
  if (!s) return null; // native module absent → caller keeps the AsyncStorage default

  const readIndex = async (): Promise<string[]> => {
    try { const raw = await s.getItemAsync(INDEX_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
  };
  const writeIndex = async (keys: string[]) => { try { await s.setItemAsync(INDEX_KEY, JSON.stringify(keys)); } catch { /* best effort */ } };

  const setItem = async (key: string, value: string): Promise<void> => {
    await s.setItemAsync(safeKey(key), value);
    const idx = await readIndex();
    if (!idx.includes(key)) { idx.push(key); await writeIndex(idx); }
  };

  return {
    setItem,
    async getItem(key: string): Promise<string | null> {
      const v = await s.getItemAsync(safeKey(key));
      if (v != null) return v;
      // One-time migration: pull a token previously in plaintext AsyncStorage into
      // the Keychain (and delete the plaintext copy) so existing sessions survive.
      try {
        const AS = require('@react-native-async-storage/async-storage').default;
        const old = await AS.getItem(key);
        if (old != null) { await setItem(key, old); await AS.removeItem(key); return old; }
      } catch { /* no async-storage / not migrated */ }
      return null;
    },
    async removeItem(key: string): Promise<void> {
      await s.deleteItemAsync(safeKey(key));
      const idx = (await readIndex()).filter((k) => k !== key);
      await writeIndex(idx);
    },
    async clear(): Promise<void> {
      const idx = await readIndex();
      await Promise.all(idx.map((k) => s.deleteItemAsync(safeKey(k)).catch(() => {})));
      await s.deleteItemAsync(INDEX_KEY).catch(() => {});
    },
  };
}
