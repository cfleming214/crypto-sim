import { useEffect, useRef } from 'react';
import { useApp } from '../store/AppContext';
import { useToast } from './ui/Toast';
import { Bell, Clock } from 'lucide-react-native';

// Surfaces background events that previously happened silently in TICK_PRICES:
// limit-order fills (Trade ids prefixed 'LMT-') and triggered price alerts. Each
// new one pops a toast. Manual trades already show their own success screen, and
// reward events aren't fills, so only 'LMT-' trades qualify. No haptics.
export function EventWatcher() {
  const { state } = useApp();
  const { show } = useToast();
  const seenTrades = useRef<Set<string>>(new Set());
  const seenAlerts = useRef<Set<string>>(new Set());
  const armedRef = useRef(false);

  // Seed with whatever exists at mount so only post-mount events toast.
  useEffect(() => {
    for (const t of state.trades) seenTrades.current.add(t.id);
    for (const a of state.triggeredAlerts) seenAlerts.current.add(a.id);
    armedRef.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!armedRef.current) return;
    for (const t of state.trades) {
      if (seenTrades.current.has(t.id)) continue;
      seenTrades.current.add(t.id);
      if (!t.id.startsWith('LMT-')) continue;  // background limit fills only
      show({
        title: 'Limit order filled',
        subtitle: `${t.side === 'buy' ? 'Bought' : 'Sold'} ${t.units.toFixed(4)} ${t.symbol} at $${t.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
        icon: Clock,
        variant: t.side === 'buy' ? 'up' : 'warn',
      });
    }
  }, [state.trades]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!armedRef.current) return;
    for (const a of state.triggeredAlerts) {
      if (seenAlerts.current.has(a.id)) continue;
      seenAlerts.current.add(a.id);
      show({
        title: `${a.symbol} price alert`,
        subtitle: `Price ${a.direction === 'above' ? 'rose above' : 'fell below'} your target`,
        icon: Bell,
        variant: 'warn',
      });
    }
  }, [state.triggeredAlerts]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
