// Referral program "Recruit & Rise" — client service.
//
// Backs the two-sided loop: every user gets a permanent invite code; a new user
// who signs up with a code gets a pending Referral row; it flips to `activated`
// when they finish their first contest, which grants the invitee's welcome reward
// (client-side, idempotent) and is later credited to the referrer by the
// settle-recruiter-cup Lambda (WS4b). Models: ReferralCode (code→referrer lookup,
// authenticated-read) + Referral (per-relationship, owner=referee + auth-read).
import { isAmplifyConfigured } from '../lib/amplify';

// Same unambiguous 6-char alphabet as 1v1 duel codes (competitionService.makeInviteCode).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

let clientPromise: Promise<any> | null = null;
async function getClient(): Promise<any> {
  if (!isAmplifyConfigured) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      const { generateClient } = await import('aws-amplify/data');
      return generateClient();
    })();
  }
  return clientPromise;
}

async function currentSub(): Promise<string | null> {
  try {
    const { fetchAuthSession } = await import('aws-amplify/auth');
    const session = await fetchAuthSession();
    return (session.userSub as string | undefined) ?? null;
  } catch {
    return null;
  }
}

// Milestone tiers (cumulative ACTIVATED referrals → status + perks).
export const REFERRAL_TIERS = [
  { name: 'Scout',      min: 1,  perk: 'Referral badge' },
  { name: 'Recruiter',  min: 3,  perk: '+5 passes · profile flair' },
  { name: 'Captain',    min: 10, perk: 'Permanent +2 weekly passes' },
  { name: 'Ambassador', min: 25, perk: 'Free Premium while active' },
] as const;

export function referralTier(activated: number): { current: string | null; next: string | null; toNext: number } {
  let current: string | null = null;
  let next: string | null = null;
  let toNext = 0;
  for (const t of REFERRAL_TIERS) {
    if (activated >= t.min) current = t.name;
    else { next = t.name; toNext = t.min - activated; break; }
  }
  return { current, next, toNext };
}

/** Ensure the signed-in user has a permanent referral code (idempotent). Returns it. */
export async function ensureMyReferralCode(handle: string): Promise<string | null> {
  const client = await getClient();
  if (!client) return null;
  const sub = await currentSub();
  if (!sub) return null;
  try {
    const mine = await client.models.ReferralCode.list({ filter: { referrerUserId: { eq: sub } } });
    const existing = (mine?.data ?? [])[0];
    if (existing?.code) return existing.code;
    const code = makeCode();
    await client.models.ReferralCode.create({ code, referrerUserId: sub, referrerHandle: handle });
    return code;
  } catch (e) {
    console.warn('ensureMyReferralCode failed', e);
    return null;
  }
}

/** Resolve an invite code to its owner (any authenticated user can read). */
export async function lookupReferrer(code: string): Promise<{ referrerUserId: string; referrerHandle?: string } | null> {
  const client = await getClient();
  if (!client || !code) return null;
  try {
    const res = await client.models.ReferralCode.get({ code: code.trim().toUpperCase() });
    const r = res?.data;
    return r ? { referrerUserId: r.referrerUserId, referrerHandle: r.referrerHandle ?? undefined } : null;
  } catch {
    return null;
  }
}

/** Record a pending referral when a new user signs up with a code. Blocks self-referral
 *  and duplicates. Returns true if a new pending Referral was created. */
export async function recordReferral(code: string, refereeHandle: string): Promise<boolean> {
  const client = await getClient();
  if (!client) return false;
  const sub = await currentSub();
  if (!sub) return false;
  const ref = await lookupReferrer(code);
  if (!ref || ref.referrerUserId === sub) return false; // unknown code or self-referral
  try {
    const existing = await client.models.Referral.list({ filter: { refereeUserId: { eq: sub } } });
    if ((existing?.data ?? []).length) return false; // one referral per referee
    await client.models.Referral.create({
      code: code.trim().toUpperCase(),
      referrerUserId: ref.referrerUserId,
      referrerHandle: ref.referrerHandle,
      refereeUserId: sub,
      refereeHandle,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    return true;
  } catch (e) {
    console.warn('recordReferral failed', e);
    return false;
  }
}

/** Flip my pending referral → activated (called once the invitee finishes their
 *  first contest). Returns true if it transitioned now (drives the one-time reward). */
export async function activateMyReferral(): Promise<boolean> {
  const client = await getClient();
  if (!client) return false;
  const sub = await currentSub();
  if (!sub) return false;
  try {
    const res = await client.models.Referral.list({ filter: { refereeUserId: { eq: sub } } });
    const row = (res?.data ?? [])[0];
    if (!row || row.status === 'activated') return false;
    await client.models.Referral.update({ id: row.id, status: 'activated', activatedAt: new Date().toISOString() });
    return true;
  } catch (e) {
    console.warn('activateMyReferral failed', e);
    return false;
  }
}

export interface CupRow {
  rank: number;
  owner: string;
  handle: string;
  seasonActivated: number;
  totalActivated: number;
  avatarColor?: string;
}

/** Read the Recruiter Cup standings (top recruiters this season), rank-ascending. */
export async function fetchRecruiterCup(limit = 100): Promise<CupRow[]> {
  const client = await getClient();
  if (!client) return [];
  try {
    const res = await client.models.RecruiterCupLeaderboard.list({ limit });
    const rows = (res?.data ?? []) as any[];
    return rows
      .map(r => ({
        rank: Number(r.rank) || 9999,
        owner: String(r.owner ?? ''),
        handle: String(r.handle ?? 'Recruiter'),
        seasonActivated: Number(r.seasonActivated) || 0,
        totalActivated: Number(r.totalActivated) || 0,
        avatarColor: r.avatarColor ?? undefined,
      }))
      .sort((a, b) => a.rank - b.rank);
  } catch {
    return [];
  }
}

/** Count my ACTIVATED referrals as the referrer (drives tier display). */
export async function countMyActivatedReferrals(): Promise<number> {
  const client = await getClient();
  if (!client) return 0;
  const sub = await currentSub();
  if (!sub) return 0;
  try {
    const res = await client.models.Referral.list({
      filter: { and: [{ referrerUserId: { eq: sub } }, { status: { eq: 'activated' } }] },
    });
    return (res?.data ?? []).length;
  } catch {
    return 0;
  }
}
