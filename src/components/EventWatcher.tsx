import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useToast } from './ui/Toast';
import { configureNotifications, requestNotificationPermission, notifyNow } from '../lib/notifications';
import { registerDevice } from '../services/pushDeviceService';
import { navigationRef } from '../navigation/RootNavigator';
import { leagueRank } from '../services/gamification';
import { Bell, Clock, Award } from 'lucide-react-native';

// Route a tapped push to the relevant screen using the data payload the sending
// Lambda attached. Guards on navigationRef readiness (cold-start taps can fire
// before the container mounts — we retry briefly).
function routeFromResponse(resp: Notifications.NotificationResponse | null) {
  const data = resp?.notification?.request?.content?.data as Record<string, any> | undefined;
  if (!data?.type) return;
  const go = () => {
    if (!navigationRef.isReady()) { setTimeout(go, 300); return; }
    switch (data.type) {
      case 'contest_result':
        if (data.competitionId) navigationRef.navigate('TournamentDetail', { id: String(data.competitionId) });
        break;
      case 'rank_change':
        navigationRef.navigate('TopTraders');
        break;
      case 'price_alert':
      case 'limit_fill':
        if (data.symbol) navigationRef.navigate('Trade', { symbol: String(data.symbol) });
        break;
      case 'announcement':
      default:
        navigationRef.navigate('Notifications');
        break;
    }
  };
  go();
}

// Surfaces background events that previously happened silently in TICK_PRICES:
// limit-order fills (Trade ids prefixed 'LMT-') and triggered price alerts. Each
// new one pops a toast. Manual trades already show their own success screen, and
// reward events aren't fills, so only 'LMT-' trades qualify. No haptics.
export function EventWatcher() {
  const { state } = useApp();
  const { userId } = useAuth();
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
    // Route a tap that opened/foregrounded the app from a push.
    const sub = Notifications.addNotificationResponseReceivedListener(routeFromResponse);
    // Cold start: app launched directly from a notification tap.
    Notifications.getLastNotificationResponseAsync().then(routeFromResponse).catch(() => {});
    // Delay-arm league toasts so the initial cloud profile load (which sets the
    // league for the first time) doesn't read as a promotion.
    const t = setTimeout(() => { leagueArmedRef.current = true; }, 4000);
    return () => { clearTimeout(t); sub.remove(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Register this device for server-sent push once signed in (PushDevice is
  // owner-auth, so guests can't register). Re-runs on login so a guest→user
  // transition registers. Requires permission, which the mount effect requests.
  useEffect(() => {
    if (!userId) return;
    registerDevice(userId);
  }, [userId]);

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
      subtitle: `${cur.league} ${cur.division}`.trim(),
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
