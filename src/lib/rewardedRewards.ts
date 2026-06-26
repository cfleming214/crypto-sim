import type { AppDispatch } from '../store/AppContext';
import { showRewarded, type AdPlacement } from './adManager';

// The catalog of things a rewarded ad can grant. EVERY reward is virtual — it can
// only dispatch actions that touch play-money / passes / cosmetics, never cash,
// payouts, contest odds, or Lane-B entry. The `tag: 'virtual'` field + this being
// the only place rewarded grants are defined is the firewall: there is no way to
// express a cash reward here.
//
// Keyed by the rewarded AdPlacement so a call site does one thing: watchForReward.

export interface RewardedReward {
  tag: 'virtual';
  label: string; // CTA shown to the user, e.g. "Watch to earn a contest pass"
  grant: (dispatch: AppDispatch) => void;
}

const TOPUP_CASH = 10_000; // virtual play-money top-up when busted
const DAILY_DOUBLE_CASH = 50; // a small virtual bonus, on the daily-reward scale

export const REWARDED_REWARDS: Partial<Record<AdPlacement, RewardedReward>> = {
  rewardedPass: {
    tag: 'virtual',
    label: 'Watch to earn a contest pass',
    grant: (d) => d({ type: 'ADD_PASS', amount: 1 }),
  },
  rewardedReset: {
    tag: 'virtual',
    label: 'Watch to reset your practice portfolio',
    grant: (d) => d({ type: 'RESET_DEMO' }),
  },
  rewardedTopup: {
    tag: 'virtual',
    label: 'Watch for a virtual cash top-up',
    grant: (d) => d({ type: 'GRANT_BONUS_CASH', amount: TOPUP_CASH }),
  },
  rewardedDailyDouble: {
    tag: 'virtual',
    label: 'Watch to double your daily bonus',
    grant: (d) => d({ type: 'GRANT_BONUS_CASH', amount: DAILY_DOUBLE_CASH }),
  },
  // rewardedPrediction / rewardedQuestReroll: reserved — add once their reducer
  // actions exist. They must stay virtual (an extra prediction / a quest reroll),
  // never anything cash-linked.
};

// Show a rewarded ad and grant the virtual reward. Lane is always 'A' — rewarded
// ads never run in Lane B (adManager enforces this too).
//
// Result:
//   granted — the reward was given (earned the ad, OR graceful fallback below).
//   shown   — an ad actually displayed.
//
// graceful fallback (opts.grantOnUnavailable): when AdMob has no ad to show
// (no-fill / error / native module absent — i.e. shown === false), grant anyway
// so the user isn't blocked by something outside their control. We still withhold
// the reward when an ad WAS shown but the user dismissed it early (a real decline).
export async function watchForReward(
  placement: AdPlacement,
  dispatch: AppDispatch,
  opts: { surface?: string; grantOnUnavailable?: boolean } = {},
): Promise<{ granted: boolean; shown: boolean }> {
  const reward = REWARDED_REWARDS[placement];
  if (!reward) return { granted: false, shown: false };
  const { earned, shown } = await showRewarded(placement, { lane: 'A', surface: opts.surface ?? 'rewarded' });
  const granted = earned || (!!opts.grantOnUnavailable && !shown);
  if (granted) reward.grant(dispatch);
  return { granted, shown };
}
