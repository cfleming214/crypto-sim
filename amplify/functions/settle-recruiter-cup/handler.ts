import { DynamoDBClient, ScanCommand, PutItemCommand, DeleteItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

// Season math — MUST match src/services/gamification.ts (28-day seasons from the
// same UTC anchor) so the cup window lines up with the app's seasons.
const DAY_MS = 24 * 60 * 60 * 1000;
const SEASON_MS = 28 * DAY_MS;
const SEASON_ANCHOR = Date.UTC(2026, 0, 5);
const seasonId = (now: number) => Math.floor((now - SEASON_ANCHOR) / SEASON_MS);
const seasonStartAt = (now: number) => SEASON_ANCHOR + seasonId(now) * SEASON_MS;

const TOP_N = 100;

// Scheduled every 5 min (EventBridge, see backend.ts). Aggregates activated
// Referral rows per referrer, rebuilds the bounded RecruiterCupLeaderboard, and
// credits each referrer's lifetime activatedReferrals onto their UserProfile.
export const handler = async (): Promise<{ ranked: number }> => {
  const referralTable = process.env.REFERRAL_TABLE_NAME;
  const profileTable = process.env.USER_PROFILE_TABLE_NAME;
  const boardTable = process.env.RECRUITER_CUP_LEADERBOARD_TABLE_NAME;
  if (!referralTable || !profileTable || !boardTable) throw new Error('table env vars not set');

  const now = Date.now();
  const seasonStart = seasonStartAt(now);
  const sid = seasonId(now);

  // 1. Aggregate activated referrals per referrer (lifetime + this season).
  const agg: Record<string, { total: number; season: number; handle?: string }> = {};
  for await (const raw of scanAll(referralTable)) {
    const r = unmarshall(raw) as { referrerUserId?: string; referrerHandle?: string; status?: string; activatedAt?: string };
    if (r.status !== 'activated' || !r.referrerUserId) continue;
    const a = (agg[r.referrerUserId] ||= { total: 0, season: 0 });
    a.total += 1;
    if (r.referrerHandle && !a.handle) a.handle = r.referrerHandle;
    const at = r.activatedAt ? Date.parse(r.activatedAt) : NaN;
    if (Number.isFinite(at) && at >= seasonStart) a.season += 1;
  }

  // 2. Map referrer sub → UserProfile row (id, handle, avatarColor) so we can
  // resolve display fields + write activatedReferrals back. owner = "sub::...".
  const profileBySub: Record<string, { id: string; handle?: string; avatarColor?: string; activatedReferrals?: number }> = {};
  for await (const raw of scanAll(profileTable)) {
    const p = unmarshall(raw) as { id?: string; owner?: string; handle?: string; avatarColor?: string; activatedReferrals?: number };
    const sub = (p.owner || '').split('::')[0];
    if (p.id && sub) profileBySub[sub] = { id: p.id, handle: p.handle, avatarColor: p.avatarColor, activatedReferrals: p.activatedReferrals };
  }

  // 3. Rank by season activations (tiebreak: lifetime), keep those with ≥1.
  const ranked = Object.entries(agg)
    .filter(([, a]) => a.season > 0 || a.total > 0)
    .map(([sub, a]) => ({ sub, ...a, prof: profileBySub[sub] }))
    .sort((x, y) => (y.season - x.season) || (y.total - x.total))
    .slice(0, TOP_N);

  // 4. Write the bounded board (id = rank "1".."N").
  const nowIso = new Date(now).toISOString();
  await Promise.all(ranked.map((r, i) =>
    ddb.send(new PutItemCommand({
      TableName: boardTable,
      Item: marshall({
        id: String(i + 1),
        __typename: 'RecruiterCupLeaderboard',
        rank: i + 1,
        owner: r.sub,
        handle: r.prof?.handle ?? r.handle ?? 'Recruiter',
        seasonActivated: r.season,
        totalActivated: r.total,
        avatarColor: r.prof?.avatarColor ?? null,
        seasonId: sid,
        createdAt: nowIso,
        updatedAt: nowIso,
      }, { removeUndefinedValues: true }),
    })),
  ));

  // 5. Delete stale rows beyond the current count.
  const stale: string[] = [];
  for await (const row of scanAll(boardTable)) {
    const id = (row.id as { S?: string })?.S;
    if (id && Number(id) > ranked.length) stale.push(id);
  }
  await Promise.all(stale.map(id =>
    ddb.send(new DeleteItemCommand({ TableName: boardTable, Key: marshall({ id }) })),
  ));

  // 6. Write lifetime activatedReferrals back onto each referrer's UserProfile
  // (drives the milestone tiers) — only when it changed, to limit writes.
  await Promise.all(ranked.map(r => {
    if (!r.prof?.id || r.prof.activatedReferrals === r.total) return Promise.resolve();
    return ddb.send(new UpdateItemCommand({
      TableName: profileTable,
      Key: marshall({ id: r.prof.id }),
      UpdateExpression: 'SET activatedReferrals = :n',
      ExpressionAttributeValues: marshall({ ':n': r.total }),
    })).catch(() => {});
  }));

  return { ranked: ranked.length };
};

async function* scanAll(table: string) {
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const out = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey }));
    for (const item of out.Items ?? []) yield item;
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
};
