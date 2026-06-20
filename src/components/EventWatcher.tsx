import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useToast } from './ui/Toast';
import { configureNotifications, requestNotificationPermission, notifyNow } from '../lib/notifications';
import { registerDevice } from '../services/pushDeviceService';
import { navigationRef } from '../navigation/RootNavigator';
import { Bell, Clock } from 'lucide-react-native';

// Route a tapped push to the relevant screen using the data payload the sending
// Lambda attached. Guards on navigationRef readiness (cold-start taps can fire
// before the container mounts — we retry briefly).
function routeFromResponse(resp: Notifications.NotificationResponse | null) {
  const data = resp?.notification?.request?.content?.data as Record<string, any> | undefined;
  if (!data?.type) return;
  let attempts = 0;
  const go = () => {
    if (!navigationRef.isReady()) {
      if (attempts++ < 20) setTimeout(go, 300); // cap retries (~6s) so a failed mount can't loop forever
      return;
    }
    // NEVER let a tap-route throw — this runs at cold start (from a launching
    // push), so an exception here would crash the app on open. A bad/stale route
    // should be a no-op, not a launch crash.
    try {
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
    } catch (err) {
      console.warn('notification route failed', err);
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
    return () => { sub.remove(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Register this device for server-sent push once signed in (PushDevice is
  // owner-auth, so guests can't register). Re-runs on login so a guest→user
  // transition registers. Awaits permission first — getExpoPushToken returns
  // null until it's granted, so registering before the prompt resolves would
  // silently no-op until the next launch. requestNotificationPermission is
  // idempotent (checks current status), so calling it here + on mount is safe.
  useEffect(() => {
    if (!userId) return;
    requestNotificationPermission().then(granted => { if (granted) registerDevice(userId); });
  }, [userId]);

  // NOTE: the old league promotion/relegation toast was removed. League/division
  // are now a pure function of lifetime XP (assignLeague → levelForXp), so they
  // shift on routine XP gains (every trade, quest claim, etc.) — the toast fired
  // on each of those (and flapped against the cloud value), reading as a spurious
  // "Promoted!" pop-up. Deliberate reward celebrations still live in RewardModal
  // (Quests / Season claims). Reintroduce a real promotion banner only behind an
  // explicit settle-season signal, not the live XP ladder.

  useEffect(() => {
    if (!armedRef.current) return;
    for (const t of state.trades) {
      if (seenTrades.current.has(t.id)) continue;
      seenTrades.current.add(t.id);
      // Background auto-fills only: limit orders, stop-losses, buy-stops. Manual
      // trades show their own success screen; reward events aren't fills.
      const kind = t.id.startsWith('LMT-') ? 'Limit order filled'
        : t.id.startsWith('STP-') ? 'Stop-loss triggered'
        : t.id.startsWith('BYS-') ? 'Buy trigger filled'
        : null;
      if (!kind) continue;
      const body = `${t.side === 'buy' ? 'Bought' : 'Sold'} ${t.units.toFixed(4)} ${t.symbol} at $${t.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
      show({ title: kind, subtitle: body, icon: Clock, variant: t.side === 'buy' ? 'up' : 'warn' });
      notifyNow(kind, body);
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
