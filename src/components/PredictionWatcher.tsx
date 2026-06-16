import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text } from 'react-native';
import { Target, TrendingUp, TrendingDown } from 'lucide-react-native';
import { useApp } from '../store/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { useToast } from './ui/Toast';
import { Button } from './ui/Button';
import { ConfettiBurst } from './ui/ConfettiBurst';
import {
  resolvePrediction, PREDICTION_XP, PREDICTION_STREAK_XP,
  type PredictionDirection, type PredictionOutcome,
} from '../services/gamification';

interface ResultData {
  symbol: string;
  direction: PredictionDirection;
  lockedPrice: number;
  finalPrice: number;
  outcome: PredictionOutcome;
  xp: number;       // XP awarded (0 on loss/push)
  streak: number;   // streak length after this round (for the win bonus line)
}

function fmtPrice(p: number): string {
  return p >= 1 ? p.toLocaleString('en-US', { maximumFractionDigits: 2 }) : p.toPrecision(4);
}

// Resolves the price-prediction round globally — independent of whether the
// PredictionScreen is mounted — so a round started then navigated away from
// still settles on time. On settle it dispatches SETTLE_PREDICTION (the single
// authority; the screen no longer resolves) and pops a result modal. Visual
// only, no haptics. Mounted once at the app root next to the other watchers.
export function PredictionWatcher() {
  const { state, dispatch } = useApp();
  const { celebrate } = useToast();
  const { colors } = useTheme();
  const active = state.activePrediction ?? null;

  const [result, setResult] = useState<ResultData | null>(null);
  const [burst, setBurst] = useState(0);

  // Latest prices + streak in refs so resolution reads fresh values without
  // re-subscribing the timer on every tick.
  const coinsRef = useRef(state.coins);
  coinsRef.current = state.coins;
  const streakRef = useRef(state.predictionStreak);
  streakRef.current = state.predictionStreak;

  useEffect(() => {
    if (!active) return;
    let resolved = false;
    const resolve = () => {
      if (resolved) return;
      resolved = true;
      const fp = coinsRef.current.find(c => c.symbol === active.symbol)?.price ?? active.lockedPrice;
      const oc = resolvePrediction(active.direction, active.lockedPrice, fp);
      const nextStreak = oc === 'win' ? streakRef.current + 1 : 0;
      const xp = oc === 'win' ? PREDICTION_XP + PREDICTION_STREAK_XP * nextStreak : 0;
      dispatch({ type: 'SETTLE_PREDICTION', outcome: oc });
      if (oc === 'win') { celebrate(); setBurst(b => b + 1); }
      setResult({
        symbol: active.symbol, direction: active.direction, lockedPrice: active.lockedPrice,
        finalPrice: fp, outcome: oc, xp, streak: nextStreak,
      });
    };
    // Resolve immediately if we're already past expiry (e.g. returned after the
    // round ended), otherwise poll until it does.
    const tick = () => { if (Date.now() >= active.expiresAt) resolve(); };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [active?.expiresAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!result) return null;

  const { outcome, symbol, direction, lockedPrice, finalPrice, xp, streak } = result;
  const movePct = lockedPrice > 0 ? ((finalPrice - lockedPrice) / lockedPrice) * 100 : 0;
  const color = outcome === 'win' ? colors.up : outcome === 'loss' ? colors.down : colors.ink3;
  const label = outcome === 'win' ? 'You won! 🎯' : outcome === 'loss' ? 'Not this time' : 'Push — no move';
  const DirIcon = direction === 'up' ? TrendingUp : TrendingDown;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setResult(null)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <ConfettiBurst trigger={burst} />
        <View style={{ width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: 24, padding: 24, alignItems: 'center', gap: 10, borderWidth: 1, borderColor: `${color}55` }}>
          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: `${color}1A`, alignItems: 'center', justifyContent: 'center' }}>
            <Target color={color} size={32} strokeWidth={2} />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color, textAlign: 'center' }}>{label}</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <DirIcon color={colors.ink3} size={16} />
            <Text style={{ fontSize: 13, color: colors.ink3 }}>
              You picked {direction === 'up' ? 'Higher' : 'Lower'}
            </Text>
          </View>

          <Text style={{ fontSize: 14, color: colors.ink, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
            {symbol} {movePct >= 0 ? '▲' : '▼'} {Math.abs(movePct).toFixed(2)}%
          </Text>
          <Text style={{ fontSize: 12, color: colors.ink3, fontVariant: ['tabular-nums'] }}>
            ${fmtPrice(lockedPrice)} → ${fmtPrice(finalPrice)}
          </Text>

          {outcome === 'win' && (
            <>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.up, marginTop: 2 }}>+{xp.toLocaleString()} XP</Text>
              {streak > 1 && (
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.up }}>
                  🔥 {streak} in a row · +{(PREDICTION_STREAK_XP * streak).toLocaleString()} streak bonus
                </Text>
              )}
            </>
          )}

          <Button variant="brand" fullWidth onPress={() => setResult(null)} style={{ marginTop: 10 }}>
            {outcome === 'win' ? 'Collect' : 'Done'}
          </Button>
        </View>
      </View>
    </Modal>
  );
}
