import { Platform } from 'react-native';
import { isAmplifyConfigured } from '../lib/amplify';
import { getExpoPushToken, setPushTokenChangeHandler } from '../lib/notifications';

// Registers this device's ExpoPushToken with the backend so the notification-
// sending Lambdas can reach it. The PushDevice model is keyed by the token
// string (identifier(['token'])), so registration is a plain get-or-create
// upsert — re-running on every launch never creates duplicates.
//
// Mirrors portfolioService's lazy, untyped Amplify Data client so it can't
// blow up before Amplify.configure() runs.

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

let lastUserId: string | null = null;

async function upsert(client: any, token: string, userId: string) {
  const payload = {
    token,
    userId,
    platform: Platform.OS,
    active: true,
    updatedAt: new Date().toISOString(),
  };
  // Keyed by token; get-or-create avoids a list scan and is idempotent.
  const { data: existing } = await client.models.PushDevice.get({ token });
  if (existing) await client.models.PushDevice.update(payload);
  else await client.models.PushDevice.create(payload);
}

// Call after permission is granted AND the user is signed in (PushDevice is
// owner-auth — guests can't register). Safe to call repeatedly.
export async function registerDevice(userId: string): Promise<void> {
  if (!userId) return;
  const client = await getClient();
  if (!client) return;
  lastUserId = userId;
  const token = await getExpoPushToken();
  if (!token) return;
  try {
    await upsert(client, token, userId);
    // Wire token rotation: re-upsert the new token under the same user.
    setPushTokenChangeHandler((newToken) => {
      if (lastUserId) upsert(client, newToken, lastUserId).catch(() => {});
    });
  } catch (err) {
    console.warn('registerDevice failed', err);
  }
}

// Opt-out: flip this user's devices to active:false (no row deletion, mirroring
// the leaderboardVisible philosophy). The send Lambdas skip inactive tokens.
export async function deactivateDevices(): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    const { data: rows } = await client.models.PushDevice.list();
    await Promise.all(
      (rows ?? []).map((r: any) =>
        client.models.PushDevice.update({ token: r.token, active: false, updatedAt: new Date().toISOString() }),
      ),
    );
  } catch (err) {
    console.warn('deactivateDevices failed', err);
  }
}
