// Season Pass — a free reward track that fills as you earn XP during the season
// (28-day windows; see seasonId/seasonEndsAt in services/gamification). Each tier
// unlocks at a cumulative season-XP threshold and grants one reward: XP, bonus
// cash, or a cosmetic (title / avatar frame). All free — no purchase, no IAP.

import type { LucideIcon } from 'lucide-react-native';
import { Banknote, Zap, BadgeCheck, Square } from 'lucide-react-native';

export type SeasonRewardKind = 'xp' | 'cash' | 'title' | 'frame';

// Icon per reward type, so a cash / XP / title / frame tier reads at a glance.
export function rewardIcon(kind: SeasonRewardKind): LucideIcon {
  switch (kind) {
    case 'cash':  return Banknote;
    case 'xp':    return Zap;
    case 'title': return BadgeCheck;
    case 'frame': return Square;
  }
}

export interface SeasonTier {
  tier: number;            // 1-based
  seasonXp: number;        // cumulative season XP to unlock
  kind: SeasonRewardKind;
  value: number | string;  // xp/cash amount, or a cosmetic id
  label: string;           // display string, e.g. "+250 XP", "'Whale' title"
}

// Cosmetics catalog -----------------------------------------------------------
export interface TitleDef { id: string; label: string }          // label = the title text shown
export interface FrameDef { id: string; label: string; color: string }

export const TITLES: TitleDef[] = [
  { id: 'hodler',        label: 'HODLer' },
  { id: 'degen',         label: 'Degen' },
  { id: 'diamond-hands', label: 'Diamond Hands' },
  { id: 'whale',         label: 'Whale' },
];

export const FRAMES: FrameDef[] = [
  { id: 'bronze',  label: 'Bronze',  color: '#CD7F32' },
  { id: 'silver',  label: 'Silver',  color: '#AEB6BD' },
  { id: 'gold',    label: 'Gold',    color: '#E6B800' },
  { id: 'diamond', label: 'Diamond', color: '#6EA8FE' },
];

export const titleLabel = (id: string | null | undefined): string | null =>
  TITLES.find(t => t.id === id)?.label ?? null;
export const frameColor = (id: string | null | undefined): string | null =>
  FRAMES.find(f => f.id === id)?.color ?? null;

// The tier table -------------------------------------------------------------
export const SEASON_TIERS: SeasonTier[] = [
  { tier: 1,  seasonXp: 200,   kind: 'cash',  value: 100,             label: '+$100 cash' },
  { tier: 2,  seasonXp: 500,   kind: 'xp',    value: 250,             label: '+250 XP' },
  { tier: 3,  seasonXp: 1000,  kind: 'title', value: 'hodler',        label: "'HODLer' title" },
  { tier: 4,  seasonXp: 1800,  kind: 'cash',  value: 150,             label: '+$150 cash' },
  { tier: 5,  seasonXp: 3000,  kind: 'frame', value: 'bronze',        label: 'Bronze frame' },
  { tier: 6,  seasonXp: 4500,  kind: 'xp',    value: 500,             label: '+500 XP' },
  { tier: 7,  seasonXp: 6500,  kind: 'title', value: 'degen',         label: "'Degen' title" },
  { tier: 8,  seasonXp: 9000,  kind: 'frame', value: 'silver',        label: 'Silver frame' },
  { tier: 9,  seasonXp: 12000, kind: 'cash',  value: 300,             label: '+$300 cash' },
  { tier: 10, seasonXp: 16000, kind: 'title', value: 'diamond-hands', label: "'Diamond Hands' title" },
  { tier: 11, seasonXp: 21000, kind: 'frame', value: 'gold',          label: 'Gold frame' },
  { tier: 12, seasonXp: 28000, kind: 'title', value: 'whale',         label: "'Whale' title" },
];

// Highest tier number reached at a given season XP (0 = none yet).
export function seasonTierReached(seasonXp: number): number {
  let n = 0;
  for (const t of SEASON_TIERS) if (seasonXp >= t.seasonXp) n = t.tier;
  return n;
}
