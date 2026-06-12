import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { CoinGlyph } from '../components/ui/Avatar';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/ui/Toast';
import {
  resolvePrediction, PREDICTION_SECONDS, PREDICTION_XP, PREDICTION_STREAK_XP,
  type PredictionDirection, type PredictionOutcome,
} from '../services/gamification';
import { TrendingUp, TrendingDown, Target } from 'lucide-react-native';

function fmtPrice(p: number): string {
  return p >= 1 ? p.toLocaleString('en-US', { maximumFractionDigits: 2 }) : p.toPrecision(4);
}

interface Settled {
  symbol: string;
  direction: PredictionDirection;
  lockedPrice: number;
  finalPrice: number;
  outcome: PredictionOutcome;
}

export function PredictionScreen() {
  const { colors } = useTheme();
  const { state, dispatch } = useApp();
  const { celebrate, show } = useToast();

  const active = state.activePrediction ?? null;
  const tradeable = state.coins.filter(c => c.symbol !== 'USDC');

  // The picker symbol only matters when idle; during a live round we follow the
  // active prediction's symbol.
  const [pickerSymbol, setPickerSymbol] = useState(
    state.tradeSymbol !== 'USDC' ? state.tradeSymbol : (tradeable[0]?.symbol ?? 'BTC'),
  );
  const symbol = active?.symbol ?? pickerSymbol;
  const coin = state.coins.find(c => c.symbol === symbol);
  const price = coin?.price ?? 0;

  // The just-resolved round, kept locally to render the result card (the active
  // prediction itself is cleared from global state on settle).
  const [settled, setSettled] = useState<Settled | null>(null);
  const [remaining, setRemaining] = useState(() =>
    active ? Math.max(0, Math.ceil((active.expiresAt - Date.now()) / 1000)) : PREDICTION_SECONDS,
  );

  // Latest price for the active symbol, in a ref so resolution reads it without
  // a stale closure.
  const priceRef = useRef(price);
  priceRef.current = price || priceRef.current;

  // Drive the live round: tick the countdown, and settle when it expires — which
  // also handles "returned after expiry" (resolves immediately against the
  // latest price). Re-subscribes when a new prediction starts (expiresAt change).
  useEffect(() => {
    if (!active) return;
    let resolved = false;
    const resolve = () => {
      if (resolved) return;
      resolved = true;
      const fp = priceRef.current;
      const oc = resolvePrediction(active.direction, active.lockedPrice, fp);
      setSettled({ symbol: active.symbol, direction: active.direction, lockedPrice: active.lockedPrice, finalPrice: fp, outcome: oc });
      dispatch({ type: 'SETTLE_PREDICTION', outcome: oc });

      // Result toast (uses pre-settle streak: a win awards base + bonus × the
      // streak it's about to become).
      const pct = active.lockedPrice > 0 ? ((fp - active.lockedPrice) / active.lockedPrice) * 100 : 0;
      const moved = `${active.symbol} ${pct >= 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(2)}%`;
      if (oc === 'win') {
        const wonXp = PREDICTION_XP + PREDICTION_STREAK_XP * (state.predictionStreak + 1);
        celebrate();
        show({
          title: 'Prediction won! 🎯',
          subtitle: `+${wonXp.toLocaleString()} XP · ${moved}`,
          variant: 'up',
          icon: Target,
        });
      } else if (oc === 'loss') {
        show({ title: 'Prediction missed', subtitle: moved, variant: 'warn', icon: Target });
      } else {
        show({ title: 'Push — no move', subtitle: moved, variant: 'brand', icon: Target });
      }
    };
    const tick = () => {
      const left = Math.ceil((active.expiresAt - Date.now()) / 1000);
      if (left > 0) setRemaining(left);
      else resolve();
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [active?.expiresAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (dir: PredictionDirection) => {
    if (!coin || active) return;
    const now = Date.now();
    setSettled(null);
    setRemaining(PREDICTION_SECONDS);
    dispatch({
      type: 'START_PREDICTION',
      prediction: { symbol, direction: dir, lockedPrice: coin.price, startedAt: now, expiresAt: now + PREDICTION_SECONDS * 1000 },
    });
  };

  const phase: 'idle' | 'live' | 'done' = active ? 'live' : settled ? 'done' : 'idle';

  const total = state.predictionWins + state.predictionLosses;
  const winRate = total > 0 ? Math.round((state.predictionWins / total) * 100) : 0;
  // After a settle, predictionStreak holds the just-resolved streak, so on a win
  // it reflects the awarded bonus (base + 500 × streak).
  const streakCount = state.predictionStreak;
  const awardedXp = PREDICTION_XP + PREDICTION_STREAK_XP * streakCount;          // what a just-won round paid
  const nextWinXp = PREDICTION_XP + PREDICTION_STREAK_XP * (streakCount + 1);    // what the next win would pay

  const lockedPrice = active?.lockedPrice ?? settled?.lockedPrice ?? 0;
  const direction = active?.direction ?? settled?.direction ?? null;
  const outcome = settled?.outcome ?? null;
  const refPrice = phase === 'done' ? (settled?.finalPrice ?? price) : price;
  const delta = lockedPrice > 0 ? refPrice - lockedPrice : 0;
  const deltaPct = lockedPrice > 0 ? (delta / lockedPrice) * 100 : 0;
  const deltaColor = delta > 0 ? colors.up : delta < 0 ? colors.down : colors.ink3;

  const outcomeColor = outcome === 'win' ? colors.up : outcome === 'loss' ? colors.down : colors.ink3;
  const outcomeLabel = outcome === 'win' ? 'You won!' : outcome === 'loss' ? 'Not this time' : 'Push — no move';

  return (
    <ScreenShell eyebrow="Mini-game" title="Price prediction">
      {/* Coin picker (locked during a live round) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        {tradeable.map(c => {
          const isActive = c.symbol === symbol;
          return (
            <TouchableOpacity
              key={c.symbol}
              disabled={phase === 'live'}
              onPress={() => { setPickerSymbol(c.symbol); setSettled(null); }}
              activeOpacity={0.8}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999,
                borderWidth: 1,
                borderColor: isActive ? colors.brand : colors.hairline,
                backgroundColor: isActive ? colors.brand : 'transparent',
                opacity: phase === 'live' && !isActive ? 0.4 : 1,
              }}
            >
              <CoinGlyph symbol={c.symbol} size={18} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: isActive ? colors.brandOn : colors.ink }}>{c.symbol}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Price + delta */}
      <Card>
        <View style={{ alignItems: 'center', gap: 6, paddingVertical: 8 }}>
          <Text style={{ fontSize: 12, color: colors.ink3 }}>
            {phase === 'idle' ? 'Current price' : phase === 'live' ? 'Live price' : 'Final price'}
          </Text>
          <Text style={{ fontSize: 32, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>
            ${fmtPrice(refPrice)}
          </Text>
          {phase !== 'idle' && lockedPrice > 0 && (
            <Text style={{ fontSize: 14, fontWeight: '600', color: deltaColor, fontVariant: ['tabular-nums'] }}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(deltaPct).toFixed(2)}% vs locked ${fmtPrice(lockedPrice)}
            </Text>
          )}
        </View>
      </Card>

      {phase === 'idle' && (
        <>
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.ink, textAlign: 'center', marginTop: 4 }}>
            Will {symbol} be higher or lower in {PREDICTION_SECONDS}s?
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="up" style={{ flex: 1 }} onPress={() => start('up')}>↑ Higher</Button>
            <Button variant="down" style={{ flex: 1 }} onPress={() => start('down')}>↓ Lower</Button>
          </View>
          <Text style={{ fontSize: 12, color: colors.ink3, textAlign: 'center' }}>
            Win to earn +{PREDICTION_XP.toLocaleString()} XP, plus a +{PREDICTION_STREAK_XP} streak bonus for each call in a row.
            {streakCount > 0 ? ` 🔥 ${streakCount} in a row — a win now is +${nextWinXp.toLocaleString()} XP.` : ''}
          </Text>
        </>
      )}

      {phase === 'live' && (
        <Card>
          <View style={{ alignItems: 'center', gap: 12, paddingVertical: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {direction === 'up'
                ? <TrendingUp color={colors.up} size={20} />
                : <TrendingDown color={colors.down} size={20} />}
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>
                You picked {direction === 'up' ? 'Higher' : 'Lower'}
              </Text>
            </View>
            <Text style={{ fontSize: 40, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>{remaining}s</Text>
            <View style={{ height: 8, width: '100%', backgroundColor: colors.surface2, borderRadius: 999, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${(remaining / PREDICTION_SECONDS) * 100}%`, backgroundColor: colors.brand, borderRadius: 999 }} />
            </View>
          </View>
        </Card>
      )}

      {phase === 'done' && (
        <>
          <Card style={{ borderWidth: 1, borderColor: `${outcomeColor}55` }}>
            <View style={{ alignItems: 'center', gap: 8, paddingVertical: 10 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: `${outcomeColor}1A`, alignItems: 'center', justifyContent: 'center' }}>
                <Target color={outcomeColor} size={28} strokeWidth={2} />
              </View>
              <Text style={{ fontSize: 20, fontWeight: '700', color: outcomeColor }}>{outcomeLabel}</Text>
              <Text style={{ fontSize: 13, color: colors.ink3 }}>
                {symbol} moved {delta >= 0 ? 'up' : 'down'} {Math.abs(deltaPct).toFixed(2)}% — you picked {direction === 'up' ? 'Higher' : 'Lower'}
              </Text>
              {outcome === 'win' && (
                <>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.up }}>+{awardedXp.toLocaleString()} XP</Text>
                  {streakCount > 1 && (
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.up }}>
                      🔥 {streakCount} in a row · +{(PREDICTION_STREAK_XP * streakCount).toLocaleString()} streak bonus
                    </Text>
                  )}
                </>
              )}
            </View>
          </Card>
          <Button variant="brand" onPress={() => setSettled(null)}>Play again</Button>
        </>
      )}

      {/* Lifetime stats */}
      <Card variant="noPad" style={{ flexDirection: 'row' }}>
        {[
          ['Wins', String(state.predictionWins)],
          ['Losses', String(state.predictionLosses)],
          ['Win rate', `${winRate}%`],
          ['Streak', streakCount > 0 ? `🔥${streakCount}` : '0'],
        ].map(([k, v], i, arr) => (
          <View key={k} style={{ flex: 1, padding: 14, alignItems: 'center', borderRightWidth: i < arr.length - 1 ? 1 : 0, borderRightColor: colors.hairline }}>
            <Text style={{ fontSize: 11, color: colors.ink3 }}>{k}</Text>
            <Text style={{ fontWeight: '700', fontSize: 16, color: colors.ink, fontVariant: ['tabular-nums'], marginTop: 2 }}>{v}</Text>
          </View>
        ))}
      </Card>
    </ScreenShell>
  );
}
