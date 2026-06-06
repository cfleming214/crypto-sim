import { isAmplifyConfigured } from '../lib/amplify';

// User-content moderation + account deletion. Kept separate from
// portfolioService so the App-Store-compliance surface (report / block / delete)
// is easy to audit in one place.

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

async function getCurrentOwnerId(): Promise<string | null> {
  try {
    const { fetchAuthSession } = await import('aws-amplify/auth');
    const session = await fetchAuthSession();
    return (session.userSub as string | undefined) ?? null;
  } catch {
    return null;
  }
}

// Amplify Gen 2 stores owner as "{sub}::{username}". Match by prefix.
function ownedByMe(record: any, ownerId: string | null): boolean {
  if (!ownerId) return false;
  const owner: string | undefined = record?.owner;
  return typeof owner === 'string' && owner.startsWith(ownerId);
}

export type ReportContext = 'trader_profile' | 'leaderboard' | 'duel';
export type ReportReason = 'block' | 'spam' | 'harassment' | 'inappropriate' | 'other';

export interface ReportInput {
  reportedOwner: string;
  reportedHandle?: string;
  context: ReportContext;
  reason: ReportReason;
  note?: string;
  reporterHandle?: string;
}

/**
 * File a content report. Written for both an explicit "Report" action and as
 * part of "Block" (reason: 'block'), per App Store guideline 1.2 — blocking
 * must also notify the developer. Returns true if the row was written.
 * Best-effort: never throws (a failed report shouldn't break the UI).
 */
export async function submitReport(input: ReportInput): Promise<boolean> {
  const client = await getClient();
  // Report model only exists after the backend deploy that adds it; until then
  // (or offline) this no-ops gracefully.
  if (!client?.models?.Report) return false;
  try {
    await client.models.Report.create({
      reportedOwner:  input.reportedOwner,
      reportedHandle: input.reportedHandle ?? null,
      context:        input.context,
      reason:         input.reason,
      note:           input.note ?? null,
      reporterHandle: input.reporterHandle ?? null,
      status:         'open',
    });
    return true;
  } catch (e) {
    console.warn('submitReport failed:', e);
    return false;
  }
}

// AsyncStorage keys that hold per-device user data, purged on account deletion.
// Kept in sync with the constants in src/store/AppContext.tsx.
const LOCAL_KEYS = ['offlinePortfolio.v1', 'gamification.v1', 'blocked.v1'];

async function deleteAllOwned(client: any, modelName: string, ownerId: string | null, filterToOwner: boolean) {
  const model = client?.models?.[modelName];
  if (!model) return;
  try {
    let nextToken: string | null | undefined = undefined;
    do {
      const page: any = await model.list({ limit: 1000, nextToken });
      const rows: any[] = page?.data ?? [];
      for (const r of rows) {
        // Owner-scoped models return only the caller's rows; the read-shared
        // ones (PublicProfile, CompetitionEntry) return everyone's, so narrow.
        if (filterToOwner && !ownedByMe(r, ownerId)) continue;
        try { await model.delete({ id: r.id }); } catch { /* best-effort */ }
      }
      nextToken = page?.nextToken;
    } while (nextToken);
  } catch (e) {
    console.warn(`deleteAllOwned(${modelName}) failed:`, e);
  }
}

/**
 * Permanently delete the signed-in user's account and all associated data.
 * Order matters: cloud data and the avatar are removed FIRST, because
 * Cognito's deleteUser invalidates the session and would block any further
 * authenticated calls. Returns true once the Cognito user is deleted.
 */
export async function deleteAccount(): Promise<boolean> {
  const client = await getClient();
  const ownerId = await getCurrentOwnerId();

  if (client) {
    // Owner-only models: list returns just my rows.
    await deleteAllOwned(client, 'Trade', ownerId, false);
    await deleteAllOwned(client, 'UserProfile', ownerId, false);
    await deleteAllOwned(client, 'Mirror', ownerId, false);
    await deleteAllOwned(client, 'CoachNudge', ownerId, false);
    // Read-shared models: narrow to my own rows before deleting.
    await deleteAllOwned(client, 'PublicProfile', ownerId, true);
    await deleteAllOwned(client, 'CompetitionEntry', ownerId, true);
  }

  // Best-effort: remove the avatar object from S3.
  try {
    const { remove } = await import('aws-amplify/storage');
    await remove({ path: ({ identityId }) => `avatars/${identityId}/profile.jpg` });
  } catch {
    // No avatar or already gone — ignore.
  }

  // Purge per-device local stores so a new guest session starts clean.
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.multiRemove(LOCAL_KEYS);
  } catch {
    // Ignore storage errors.
  }

  // Finally delete the Cognito user. After this the session is invalid.
  const { deleteUser } = await import('aws-amplify/auth');
  await deleteUser();
  return true;
}
