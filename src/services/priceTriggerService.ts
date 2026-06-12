import { isAmplifyConfigured } from '../lib/amplify';
import type { PriceAlert, PendingOrder } from '../store/types';

// Cloud persistence for price alerts + limit orders so the server-side
// price-watch cron can evaluate them while the app is closed. Rows are keyed by
// the client-generated id ('ALT-...' / 'LMT-...'), so create/delete is a keyed
// upsert. Mirrors portfolioService's lazy, untyped client; every call no-ops
// cleanly when Amplify isn't configured (guest / offline).

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

export async function createCloudAlert(a: PriceAlert): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    await client.models.PriceAlert.create({
      alertId: a.id, symbol: a.symbol, targetPrice: a.targetPrice,
      direction: a.direction, active: true, createdAt: new Date(a.createdAt).toISOString(),
    });
  } catch (e) { console.warn('createCloudAlert failed', e); }
}

export async function deleteCloudAlert(alertId: string): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try { await client.models.PriceAlert.delete({ alertId }); }
  catch (e) { console.warn('deleteCloudAlert failed', e); }
}

export async function createCloudOrder(o: PendingOrder): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    await client.models.LimitOrder.create({
      orderId: o.id, symbol: o.symbol, side: o.side, amount: o.amount,
      limitPrice: o.limitPrice, active: true, createdAt: new Date(o.createdAt).toISOString(),
    });
  } catch (e) { console.warn('createCloudOrder failed', e); }
}

export async function deleteCloudOrder(orderId: string): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try { await client.models.LimitOrder.delete({ orderId }); }
  catch (e) { console.warn('deleteCloudOrder failed', e); }
}

// Load this user's still-active alerts + orders to seed local state on launch.
export async function hydratePriceTriggers(): Promise<{ alerts: PriceAlert[]; orders: PendingOrder[] }> {
  const client = await getClient();
  if (!client) return { alerts: [], orders: [] };
  try {
    const [{ data: aRows }, { data: oRows }] = await Promise.all([
      client.models.PriceAlert.list({ filter: { active: { eq: true } } }),
      client.models.LimitOrder.list({ filter: { active: { eq: true } } }),
    ]);
    const alerts: PriceAlert[] = (aRows ?? []).map((r: any) => ({
      id: r.alertId, symbol: r.symbol, targetPrice: r.targetPrice,
      direction: r.direction as 'above' | 'below',
      createdAt: r.createdAt ? new Date(r.createdAt).getTime() : Date.now(),
    }));
    const orders: PendingOrder[] = (oRows ?? []).map((r: any) => ({
      id: r.orderId, symbol: r.symbol, side: r.side as 'buy' | 'sell',
      amount: r.amount, limitPrice: r.limitPrice,
      createdAt: r.createdAt ? new Date(r.createdAt).getTime() : Date.now(),
    }));
    return { alerts, orders };
  } catch (e) {
    console.warn('hydratePriceTriggers failed', e);
    return { alerts: [], orders: [] };
  }
}
