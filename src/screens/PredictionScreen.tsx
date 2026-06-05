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
  resolvePrediction, PREDICTION_SECONDS, PREDICTION_XP,
  type PredictionDirection, type PredictionOutcome,
} from '../services/gamification';
import { TrendingUp, TrendingDown, Target } from 'lucide-react-native';

type Phase = 'idle' | 'live' | 'done';

function fmtPrice(p: number): string {
  return p >= 1 ? p.toLocaleString('en-US', { maximumFractionDigits: 2 }) : p.toPrecision(4);
}

export function PredictionScreen() {
  const { colors } = useTheme();
  const { state, dispatch } = useApp();
  const { celebrate } = useToast();

  const tradeable = state.coins.filter(c => c.symbol !== 'USDC');
  const [symbol, setSymbol] = useState(
    state.tradeSymbol !== 'USDC' ? state.tradeSymbol : (tradeable[0]?.symbol ?? 'BTC'),
  );
  const coin = state.coins.find(c => c.symbol === symbol);
  const price = coin?.price ?? 0;

  const [phase, setPhase] = useState<Phase>('idle');
  const [direction, setDirection] = useState<PredictionDirection | null>(null);
  const [lockedPrice, setLockedPrice] = useState(0);
  const [finalPrice, setFinalPrice] = useState(0);
  const [outcome, setOutcome] = useState<PredictionOutcome | null>(null);
  const [remaining, setRemaining] = useState(PREDICTION_SECONDS);

  // Latest price, kept in a ref so the timer's resolution reads it without
  // depending on stale closure state.
  const priceRef = useRef(price);
  priceRef.current = price || priceRef.current;
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => () => clearInterval(timerRef.current), []);

  const start = (dir: PredictionDirection) => {
    if (!coin) return;
    const locked = coin.price;
    setDirection(dir);
    setLockedPrice(locked);
    setOutcome(null);
    setFinalPrice(0);
    setRemaining(PREDICTION_SECONDS);
    setPhase('live');
    const endAt = Date.now() + PREDICTION_SECONDS * 1000;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const left = Math.ceil((endAt - Date.now()) / 1000);
      if (left > 0) { setRemaining(left); return; }
      clearInterval(timerRef.current);
      setRemaining(0);
      const fp = priceRef.current;
      const oc = resolvePrediction(dir, locked, fp);
      setFinalPrice(fp);
      setOutcome(oc);
      setPhase('done');
      dispatch({ type: 'RECORD_PREDICTION', outcome: oc });
      if (oc === 'win') celebrate();
    }, 250);
  };

  const reset = () => {
    clearInterval(timerRef.current);
    setPhase('idle');
    setDirection(null);
    setOutcome(null);
  };

  const total = state.predictionWins + state.predictionLosses;
  const winRate = total > 0 ? Math.round((state.predictionWins / total) * 100) : 0;

  // Live delta vs the locked price during a round / at resolution.
  const refPrice = phase === 'done' ? finalPrice : price;
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
          const active = c.symbol === symbol;
          return (
            <TouchableOpacity
              key={c.symbol}
              disabled={phase === 'live'}
              onPress={() => { setSymbol(c.symbol); reset(); }}
              activeOpacity={0.8}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? colors.brand : colors.hairline,
                backgroundColor: active ? colors.brand : 'transparent',
                opacity: phase === 'live' && !active ? 0.4 : 1,
              }}
            >
              <CoinGlyph symbol={c.symbol} size={18} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: active ? colors.brandOn : colors.ink }}>{c.symbol}</Text>
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
            Win to earn +{PREDICTION_XP} XP. No stake, just bragging rights.
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
              {outcome === 'win' && <Text style={{ fontSize: 14, fontWeight: '700', color: colors.up }}>+{PREDICTION_XP} XP</Text>}
            </View>
          </Card>
          <Button variant="brand" onPress={reset}>Play again</Button>
        </>
      )}

      {/* Lifetime stats */}
      <Card variant="noPad" style={{ flexDirection: 'row' }}>
        {[
          ['Wins', String(state.predictionWins)],
          ['Losses', String(state.predictionLosses)],
          ['Win rate', `${winRate}%`],
        ].map(([k, v], i) => (
          <View key={k} style={{ flex: 1, padding: 14, alignItems: 'center', borderRightWidth: i < 2 ? 1 : 0, borderRightColor: colors.hairline }}>
            <Text style={{ fontSize: 11, color: colors.ink3 }}>{k}</Text>
            <Text style={{ fontWeight: '700', fontSize: 16, color: colors.ink, fontVariant: ['tabular-nums'], marginTop: 2 }}>{v}</Text>
          </View>
        ))}
      </Card>
    </ScreenShell>
  );
}
