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

// Show a rewarded ad and, only if the user earned it, grant the virtual reward.
// Lane is always 'A' — rewarded ads never run in Lane B (adManager enforces this
// too). Returns true iff the reward was granted.
export async function watchForReward(
  placement: AdPlacement,
  dispatch: AppDispatch,
  surface: string = 'rewarded',
): Promise<boolean> {
  const reward = REWARDED_REWARDS[placement];
  if (!reward) return false;
  const { earned } = await showRewarded(placement, { lane: 'A', surface });
  if (earned) reward.grant(dispatch);
  return earned;
}
