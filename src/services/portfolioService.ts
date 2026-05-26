import { isAmplifyConfigured } from '../lib/amplify';
import type { AppState, Trade, CompetitionEntry } from '../store/types';

// Lazily initialised so it doesn't blow up before Amplify.configure() is called
let clientPromise: Promise<any> | null = null;

async function getClient() {
  if (!isAmplifyConfigured) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      const { generateClient } = await import('aws-amplify/data');
      return generateClient();
    })();
  }
  return clientPromise;
}

// ---- Avatar S3 helpers ----

const AVATAR_FILENAME = 'profile.jpg';

async function resolveAvatarUrl(avatarKey: string): Promise<string | null> {
  if (!isAmplifyConfigured || !avatarKey) return null;
  try {
    const { getUrl } = await import('aws-amplify/storage');
    const { url } = await getUrl({
      path: ({ identityId }) => `avatars/${identityId}/${avatarKey}`,
      options: { validateObjectExistence: false },
    });
    return url.toString();
  } catch (e) {
    console.warn('resolveAvatarUrl failed:', e);
    return null;
  }
}

export async function uploadAvatarPhoto(localUri: string): Promise<{ key: string; url: string } | null> {
  if (!isAmplifyConfigured) return null;
  try {
    const { uploadData } = await import('aws-amplify/storage');
    const response = await fetch(localUri);
    const blob = await response.blob();
    await uploadData({
      path: ({ identityId }) => `avatars/${identityId}/${AVATAR_FILENAME}`,
      data: blob,
      options: { contentType: blob.type || 'image/jpeg' },
    }).result;
    const url = await resolveAvatarUrl(AVATAR_FILENAME);
    return url ? { key: AVATAR_FILENAME, url } : null;
  } catch (e) {
    console.warn('uploadAvatarPhoto failed:', e);
    return null;
  }
}

// ---- Profile ----

async function profileFromRecord(p: any): Promise<Partial<AppState>> {
  const avatarUri = p.avatarKey ? (await resolveAvatarUrl(p.avatarKey)) ?? undefined : undefined;
  return {
    user: {
      handle:      p.handle ?? 'you',
      xp:          p.xp ?? 0,
      league:      p.league ?? 'Bronze',
      division:    p.division ?? 1,
      streak:      p.streak ?? 0,
      avatarColor: p.avatarColor ?? '#6366F1',
      avatarKey:   p.avatarKey ?? undefined,
      avatarUri,
    },
    cash:      p.cash ?? 10000,
    bankroll:  p.bankroll ?? 10000,
    riskScore: p.riskScore ?? 0,
    holdings:  p.holdingsJson ? JSON.parse(p.holdingsJson) : [],
  };
}

export async function loadProfile(): Promise<Partial<AppState> | null> {
  const client = await getClient();
  if (!client) return null;
  try {
    const { data: profiles } = await client.models.UserProfile.list();
    if (!profiles.length) return null;
    return profileFromRecord(profiles[0]);
  } catch {
    return null;
  }
}

export async function saveProfile(state: AppState): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    const payload = {
      handle:       state.user.handle,
      xp:           state.user.xp,
      league:       state.user.league,
      division:     state.user.division,
      streak:       state.user.streak,
      cash:         state.cash,
      bankroll:     state.bankroll,
      riskScore:    state.riskScore,
      holdingsJson: JSON.stringify(state.holdings),
      avatarKey:    state.user.avatarKey,
      avatarColor:  state.user.avatarColor,
    };
    const { data: existing } = await client.models.UserProfile.list();
    if (existing.length) {
      await client.models.UserProfile.update({ id: existing[0].id, ...payload });
    } else {
      await client.models.UserProfile.create(payload);
    }
  } catch (e) {
    console.warn('saveProfile failed:', e);
  }
}

export async function saveTrade(trade: Trade): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    await client.models.Trade.create({
      tradeId:  trade.id,
      symbol:   trade.symbol,
      side:     trade.side,
      amount:   trade.amount,
      units:    trade.units,
      price:    trade.price,
      xpEarned: trade.xpEarned,
      slippage: trade.slippage,
    });
  } catch (e) {
    console.warn('saveTrade failed:', e);
  }
}

export async function resetDemoCloud(): Promise<void> {
  if (!isAmplifyConfigured) return;
  // Reset is handled client-side via RESET_DEMO action; cloud reset would invoke the resetDemo Lambda.
}

export async function fetchLeaderboard(tournamentId: string) {
  const client = await getClient();
  if (!client) return [];
  try {
    const { data } = await client.models.LeaderboardEntry.list({
      filter: { tournamentId: { eq: tournamentId } },
    });
    return (data as any[]).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  } catch {
    return [];
  }
}

// ---- Real-time subscriptions ----

type Unsubscribe = () => void;

/**
 * Subscribe to the current user's UserProfile record. Fires whenever the record
 * changes server-side (e.g. after an executeTrade Lambda run, or a mirrored
 * trade hitting this user's follower profile).
 */
export async function subscribeToProfile(
  onUpdate: (profile: Partial<AppState>) => void,
): Promise<Unsubscribe> {
  const client = await getClient();
  if (!client) return () => {};
  try {
    const sub = client.models.UserProfile.observeQuery().subscribe({
      next: async ({ items }: { items: any[] }) => {
        if (!items.length) return;
        const profile = await profileFromRecord(items[0]);
        onUpdate(profile);
      },
      error: (err: unknown) => console.warn('UserProfile subscription error:', err),
    });
    return () => sub.unsubscribe();
  } catch (e) {
    console.warn('subscribeToProfile failed:', e);
    return () => {};
  }
}

/**
 * Subscribe to live leaderboard updates for a competition. Fires whenever any
 * CompetitionEntry for the given competitionId changes (the tickLeaderboard
 * EventBridge cron rewrites ranks every 5 min).
 */
export async function subscribeToLeaderboard(
  competitionId: string,
  onUpdate: (entries: CompetitionEntry[]) => void,
): Promise<Unsubscribe> {
  const client = await getClient();
  if (!client) return () => {};
  try {
    const sub = client.models.CompetitionEntry.observeQuery({
      filter: { competitionId: { eq: competitionId } },
    }).subscribe({
      next: ({ items }: { items: any[] }) => {
        const entries: CompetitionEntry[] = items
          .map(i => ({
            id: i.id,
            competitionId: i.competitionId,
            handle: i.handle,
            bankroll: i.bankroll ?? 0,
            pnlPct: i.pnlPct ?? 0,
            rank: i.rank ?? 999,
            joinedAt: i.joinedAt ? new Date(i.joinedAt).getTime() : 0,
            isActive: i.isActive ?? true,
          }))
          .sort((a, b) => a.rank - b.rank);
        onUpdate(entries);
      },
      error: (err: unknown) => console.warn('Leaderboard subscription error:', err),
    });
    return () => sub.unsubscribe();
  } catch (e) {
    console.warn('subscribeToLeaderboard failed:', e);
    return () => {};
  }
}

/**
 * Subscribe to coach nudges written by the evaluate-coach Lambda. Fires after
 * each server-side trade-risk evaluation.
 */
export async function subscribeToCoachNudges(
  onUpdate: (nudges: { id: string; message: string; severity: 'info'|'warn'|'tip'; createdAt: number }[]) => void,
): Promise<Unsubscribe> {
  const client = await getClient();
  if (!client) return () => {};
  try {
    const sub = client.models.CoachNudge.observeQuery({
      filter: { dismissed: { ne: true } },
    }).subscribe({
      next: ({ items }: { items: any[] }) => {
        const nudges = items.map(i => ({
          id: i.id,
          message: i.message,
          severity: (i.severity as 'info'|'warn'|'tip') ?? 'info',
          createdAt: i.createdAt ? new Date(i.createdAt).getTime() : Date.now(),
        }));
        onUpdate(nudges);
      },
      error: (err: unknown) => console.warn('CoachNudge subscription error:', err),
    });
    return () => sub.unsubscribe();
  } catch (e) {
    console.warn('subscribeToCoachNudges failed:', e);
    return () => {};
  }
}
