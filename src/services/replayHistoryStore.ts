import AsyncStorage from '@react-native-async-storage/async-storage';

// A completed solo replay run, saved locally so the eras page can show your
// replay history and the video-replay player can reconstruct the portfolio
// curve from the era's prices + your trades.
export interface ReplaySessionTrade {
  day: number;            // step index in the era's price series
  side: 'buy' | 'sell';
  amount: number;         // $ spent (buy) or received (sell)
  units: number;          // coin units traded
  price: number;          // execution price
}

export interface ReplaySession {
  id: string;
  eraId: string;          // → REPLAY_ERAS[eraId] for prices/dates
  title: string;
  coin: string;
  playedAt: number;       // ms epoch
  finalBankroll: number;
  pnlPct: number;
  trades: ReplaySessionTrade[];
}

const KEY = 'replaySessions.v1';
const MAX = 40; // keep the most recent N

export async function loadReplaySessions(): Promise<ReplaySession[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveReplaySession(session: ReplaySession): Promise<ReplaySession[]> {
  const all = await loadReplaySessions();
  const next = [session, ...all].slice(0, MAX); // newest first
  try { await AsyncStorage.setItem(KEY, JSON.stringify(next)); } catch { /* non-fatal */ }
  return next;
}

export async function getReplaySession(id: string): Promise<ReplaySession | null> {
  const all = await loadReplaySessions();
  return all.find(s => s.id === id) ?? null;
}
