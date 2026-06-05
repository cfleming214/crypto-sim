import { useEffect, useRef } from 'react';
import { useApp } from '../store/AppContext';
import { useToast } from './ui/Toast';
import { configureNotifications, requestNotificationPermission, notifyNow } from '../lib/notifications';
import { leagueRank } from '../services/gamification';
import { Bell, Clock, Award } from 'lucide-react-native';

const DIV_ROMAN = ['', 'I', 'II', 'III'];

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
  const prevLeagueRef = useRef<{ league: string; division: number } | null>(null);
  const leagueArmedRef = useRef(false);

  // Seed with whatever exists at mount so only post-mount events toast; also
  // set up OS notifications + request permission (no-ops until a native rebuild).
  useEffect(() => {
    for (const t of state.trades) seenTrades.current.add(t.id);
    for (const a of state.triggeredAlerts) seenAlerts.current.add(a.id);
    armedRef.current = true;
    configureNotifications();
    requestNotificationPermission();
    // Delay-arm league toasts so the initial cloud profile load (which sets the
    // league for the first time) doesn't read as a promotion.
    const t = setTimeout(() => { leagueArmedRef.current = true; }, 4000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // League promotion / relegation (set by the weekly settle-season cron, arrives
  // via LOAD_PROFILE). Toast the change once the warm-up has passed.
  useEffect(() => {
    const cur = { league: state.user.league, division: state.user.division };
    const prev = prevLeagueRef.current;
    prevLeagueRef.current = cur;
    if (!leagueArmedRef.current || !prev) return;
    if (prev.league === cur.league && prev.division === cur.division) return;
    const promoted = leagueRank(cur.league, cur.division) > leagueRank(prev.league, prev.division);
    show({
      title: promoted ? 'Promoted!' : 'League updated',
      subtitle: `${cur.league} ${DIV_ROMAN[cur.division] ?? ''}`.trim(),
      icon: Award,
      variant: promoted ? 'up' : 'warn',
    });
  }, [state.user.league, state.user.division]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!armedRef.current) return;
    for (const t of state.trades) {
      if (seenTrades.current.has(t.id)) continue;
      seenTrades.current.add(t.id);
      if (!t.id.startsWith('LMT-')) continue;  // background limit fills only
      const body = `${t.side === 'buy' ? 'Bought' : 'Sold'} ${t.units.toFixed(4)} ${t.symbol} at $${t.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
      show({ title: 'Limit order filled', subtitle: body, icon: Clock, variant: t.side === 'buy' ? 'up' : 'warn' });
      notifyNow('Limit order filled', body);
    }
  }, [state.trades]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!armedRef.current) return;
    for (const a of state.triggeredAlerts) {
      if (seenAlerts.current.has(a.id)) continue;
      seenAlerts.current.add(a.id);
      const body = `Price ${a.direction === 'above' ? 'rose above' : 'fell below'} your target`;
      show({ title: `${a.symbol} price alert`, subtitle: body, icon: Bell, variant: 'warn' });
      notifyNow(`${a.symbol} price alert`, body);
    }
  }, [state.triggeredAlerts]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
