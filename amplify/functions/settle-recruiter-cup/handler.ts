import { DynamoDBClient, ScanCommand, PutItemCommand, DeleteItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { assertPrizePoolWithinCap } from '../lib/contestCompliance';

const ddb = new DynamoDBClient({});

// Season math — MUST match src/services/gamification.ts (28-day seasons from the
// same UTC anchor) so the cup window lines up with the app's seasons.
const DAY_MS = 24 * 60 * 60 * 1000;
const SEASON_MS = 28 * DAY_MS;
const SEASON_ANCHOR = Date.UTC(2026, 0, 5);
const seasonId = (now: number) => Math.floor((now - SEASON_ANCHOR) / SEASON_MS);
const seasonStartAt = (now: number) => SEASON_ANCHOR + seasonId(now) * SEASON_MS;

const TOP_N = 100;

// Top-5 cash prizes (dollars) — only paid when CONTEST_CASH_PRIZES is on (WS6,
// gated OFF at launch). Pool = $575 < the $4,999 sweepstakes-registration cap.
const CUP_PRIZES_USD = [250, 150, 100, 50, 25];
const W9_THRESHOLD_CENTS = 60_000;

// Scheduled every 5 min (EventBridge, see backend.ts). (1) Rebuilds the bounded
// RecruiterCupLeaderboard for the current season + writes lifetime
// activatedReferrals onto UserProfile; (2) when cash prizes are enabled, settles
// the just-completed season's top-5 into Payout rows (idempotent), reusing the
// same payout/1099 rails as contest prizes.
export const handler = async (): Promise<{ ranked: number; settled: number }> => {
  const referralTable = process.env.REFERRAL_TABLE_NAME;
  const profileTable = process.env.USER_PROFILE_TABLE_NAME;
  const boardTable = process.env.RECRUITER_CUP_LEADERBOARD_TABLE_NAME;
  if (!referralTable || !profileTable || !boardTable) throw new Error('table env vars not set');
  const cashMode = process.env.CONTEST_CASH_PRIZES === 'true';

  const now = Date.now();
  const seasonStart = seasonStartAt(now);
  const sid = seasonId(now);
  const prevStart = seasonStart - SEASON_MS; // previous (just-completed) season window
  const prevSid = sid - 1;

  // 1. Aggregate activated referrals per referrer: lifetime, this season, prev season.
  const agg: Record<string, { total: number; season: number; prev: number; handle?: string }> = {};
  for await (const raw of scanAll(referralTable)) {
    const r = unmarshall(raw) as { referrerUserId?: string; referrerHandle?: string; status?: string; activatedAt?: string };
    if (r.status !== 'activated' || !r.referrerUserId) continue;
    const a = (agg[r.referrerUserId] ||= { total: 0, season: 0, prev: 0 });
    a.total += 1;
    if (r.referrerHandle && !a.handle) a.handle = r.referrerHandle;
    const at = r.activatedAt ? Date.parse(r.activatedAt) : NaN;
    if (Number.isFinite(at)) {
      if (at >= seasonStart) a.season += 1;
      else if (at >= prevStart && at < seasonStart) a.prev += 1;
    }
  }

  // 2. Map referrer sub → UserProfile (id, owner, handle, avatarColor, count).
  const profileBySub: Record<string, { id: string; owner?: string; handle?: string; avatarColor?: string; activatedReferrals?: number }> = {};
  for await (const raw of scanAll(profileTable)) {
    const p = unmarshall(raw) as { id?: string; owner?: string; handle?: string; avatarColor?: string; activatedReferrals?: number };
    const sub = (p.owner || '').split('::')[0];
    if (p.id && sub) profileBySub[sub] = { id: p.id, owner: p.owner, handle: p.handle, avatarColor: p.avatarColor, activatedReferrals: p.activatedReferrals };
  }

  // 3. Current-season standings (ranking metric = season activations).
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

  // 7. Cash settlement of the just-completed season's top-5 (WS6 — gated OFF by
  // default). Idempotent: Payout id = "recruiter-cup-<prevSeason>#<userId>" with a
  // conditional put, so re-runs never double-pay. XP-mode settlement is handled by
  // the per-referral referrer rewards + the live leaderboard, not here.
  let settled = 0;
  if (cashMode) {
    assertPrizePoolWithinCap(JSON.stringify(CUP_PRIZES_USD)); // $575 < $4,999 cap
    const prevTop = Object.entries(agg)
      .filter(([, a]) => a.prev > 0)
      .map(([sub, a]) => ({ sub, prev: a.prev, prof: profileBySub[sub] }))
      .sort((x, y) => y.prev - x.prev)
      .slice(0, CUP_PRIZES_USD.length);
    for (let i = 0; i < prevTop.length; i++) {
      const r = prevTop[i];
      const amountCents = CUP_PRIZES_USD[i] * 100;
      const ok = await settleCupPayout(r.sub, r.prof?.owner, prevSid, i + 1, amountCents);
      if (ok) { await bumpAnnualWinnings(r.sub, r.prof?.owner, amountCents); settled++; }
    }
  }

  return { ranked: ranked.length, settled };
};

// Idempotent unclaimed Payout for a cup winner (mirrors close-competition.settleWinner).
async function settleCupPayout(userId: string, owner: string | undefined, season: number, rank: number, amountCents: number): Promise<boolean> {
  const payoutTable = process.env.PAYOUT_TABLE_NAME;
  if (!payoutTable || !userId || !(amountCents > 0)) return false;
  const id = `recruiter-cup-${season}#${userId}`;
  const now = new Date().toISOString();
  try {
    await ddb.send(new PutItemCommand({
      TableName: payoutTable,
      Item: marshall({
        id,
        __typename: 'Payout',
        owner: owner ?? `${userId}::${userId}`,
        userId,
        competitionId: `recruiter-cup-${season}`,
        competitionName: `Recruiter Cup — Season ${season}`,
        rank,
        amountCents,
        status: 'unclaimed',
        claimed: false,
        withdrawn: false,
        createdAt: now,
        updatedAt: now,
      }, { removeUndefinedValues: true }),
      ConditionExpression: 'attribute_not_exists(id)',
    }));
    return true;
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return false; // already settled
    throw err;
  }
}

// Per-tax-year 1099 rollup (mirrors close-competition.bumpAnnualWinnings).
async function bumpAnnualWinnings(userId: string, owner: string | undefined, amountCents: number) {
  const table = process.env.ANNUAL_WINNINGS_TABLE_NAME;
  if (!table || !userId || !(amountCents > 0)) return;
  const taxYear = new Date().getUTCFullYear();
  const id = `${userId}#${taxYear}`;
  const now = new Date().toISOString();
  try {
    const res = await ddb.send(new UpdateItemCommand({
      TableName: table,
      Key: marshall({ id }),
      UpdateExpression:
        'SET userId = :u, taxYear = :y, updatedAt = :n, #tn = :tn, #o = if_not_exists(#o, :o), createdAt = if_not_exists(createdAt, :n) ADD totalCents :c',
      ExpressionAttributeNames: { '#tn': '__typename', '#o': 'owner' },
      ExpressionAttributeValues: marshall({ ':u': userId, ':y': taxYear, ':n': now, ':tn': 'AnnualWinnings', ':o': owner ?? userId, ':c': amountCents }),
      ReturnValues: 'UPDATED_NEW',
    }));
    const total = res.Attributes ? Number(unmarshall(res.Attributes).totalCents ?? 0) : 0;
    if (total >= W9_THRESHOLD_CENTS) {
      await ddb.send(new UpdateItemCommand({
        TableName: table, Key: marshall({ id }),
        UpdateExpression: 'SET w9Required = :t', ExpressionAttributeValues: marshall({ ':t': true }),
      }));
    }
  } catch (err) {
    console.error('cup annual-winnings rollup failed for', id, err); // never block settlement
  }
}

async function* scanAll(table: string) {
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const out = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey }));
    for (const item of out.Items ?? []) yield item;
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
};
