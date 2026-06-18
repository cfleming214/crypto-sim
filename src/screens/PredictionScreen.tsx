import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, ScrollView } from 'react-native';
import { Text } from '../components/ui/Text';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { CoinGlyph } from '../components/ui/Avatar';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import {
  PREDICTION_SECONDS, PREDICTION_XP, PREDICTION_STREAK_XP,
  type PredictionDirection,
} from '../services/gamification';
import { TrendingUp, TrendingDown } from 'lucide-react-native';

function fmtPrice(p: number): string {
  return p >= 1 ? p.toLocaleString('en-US', { maximumFractionDigits: 2 }) : p.toPrecision(4);
}

export function PredictionScreen() {
  const { colors } = useTheme();
  const { state, dispatch } = useApp();

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

  const [remaining, setRemaining] = useState(() =>
    active ? Math.max(0, Math.ceil((active.expiresAt - Date.now()) / 1000)) : PREDICTION_SECONDS,
  );

  // Display-only countdown. Resolution + the result popup are owned by the
  // global PredictionWatcher (so a round settles even when this screen isn't
  // mounted); here we just tick the visible timer while a round is live.
  useEffect(() => {
    if (!active) { setRemaining(PREDICTION_SECONDS); return; }
    const tick = () => setRemaining(Math.max(0, Math.ceil((active.expiresAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [active?.expiresAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (dir: PredictionDirection) => {
    if (!coin || active) return;
    const now = Date.now();
    setRemaining(PREDICTION_SECONDS);
    dispatch({
      type: 'START_PREDICTION',
      prediction: { symbol, direction: dir, lockedPrice: coin.price, startedAt: now, expiresAt: now + PREDICTION_SECONDS * 1000 },
    });
  };

  const phase: 'idle' | 'live' = active ? 'live' : 'idle';

  const total = state.predictionWins + state.predictionLosses;
  const winRate = total > 0 ? Math.round((state.predictionWins / total) * 100) : 0;
  const streakCount = state.predictionStreak;
  const nextWinXp = PREDICTION_XP + PREDICTION_STREAK_XP * (streakCount + 1);    // what the next win would pay

  const lockedPrice = active?.lockedPrice ?? 0;
  const direction = active?.direction ?? null;
  const refPrice = price;
  const delta = lockedPrice > 0 ? refPrice - lockedPrice : 0;
  const deltaPct = lockedPrice > 0 ? (delta / lockedPrice) * 100 : 0;
  const deltaColor = delta > 0 ? colors.up : delta < 0 ? colors.down : colors.ink3;

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
              onPress={() => setPickerSymbol(c.symbol)}
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
            {phase === 'idle' ? 'Current price' : 'Live price'}
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
