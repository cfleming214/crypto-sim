import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from '../components/ui/Text';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { FadeInUp } from '../components/ui/FadeInUp';
import { RewardModal } from '../components/ui/RewardModal';
import { useTheme } from '../theme/ThemeContext';
import { gradients, gradientsDark } from '../theme/tokens';
import { useApp } from '../store/AppContext';
import { seasonId, seasonEndsAt } from '../services/gamification';
import { SEASON_TIERS, seasonTierReached, rewardIcon, frameColor, type SeasonTier } from '../data/season';
import { Sparkles, Lock, Check } from 'lucide-react-native';

function fmtDays(ms: number): string {
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

export function SeasonScreen() {
  const { colors, isDark } = useTheme();
  const { state, dispatch } = useApp();
  const grad = isDark ? gradientsDark.brandHero : gradients.brandHero;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const onCurrentSeason = state.season.id === seasonId(now);
  const seasonXp = onCurrentSeason ? Math.max(0, state.user.xp - state.season.baselineXp) : 0;
  const tierReached = seasonTierReached(seasonXp);
  const maxTier = SEASON_TIERS[SEASON_TIERS.length - 1].tier;
  const claimed = new Set(state.season.claimedTiers);
  // Next tier not yet reached + XP remaining to it (null once maxed).
  const nextTier = SEASON_TIERS.find(t => seasonXp < t.seasonXp) ?? null;
  const xpToNext = nextTier ? nextTier.seasonXp - seasonXp : 0;

  const [reward, setReward] = useState<SeasonTier | null>(null);
  const claim = (t: SeasonTier) => {
    dispatch({ type: 'CLAIM_SEASON_TIER', tier: t.tier, kind: t.kind, value: t.value });
    setReward(t);
  };

  return (
    <ScreenShell title="Season Pass" eyebrow={`Season ${seasonId(now) + 1}`}>
      <FadeInUp>
        <Card gradient={grad} style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles color="#FFFFFF" size={24} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF' }}>Tier {tierReached} of {maxTier}</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
                {seasonXp.toLocaleString()} season XP · ends in {fmtDays(seasonEndsAt(now) - now)}
              </Text>
            </View>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: '#FFFFFF', width: `${Math.round((tierReached / maxTier) * 100)}%` }} />
          </View>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', lineHeight: 18 }}>
            {nextTier
              ? `${xpToNext.toLocaleString()} XP to Tier ${nextTier.tier} (${nextTier.label}). Earn XP anywhere — every tier is free.`
              : 'Top tier reached 🎉 Every tier is free.'}
          </Text>
        </Card>
      </FadeInUp>

      {SEASON_TIERS.map((t, i) => {
        const unlocked = seasonXp >= t.seasonXp;
        const isClaimed = claimed.has(t.tier);
        const isNext = nextTier?.tier === t.tier;
        const RIcon = rewardIcon(t.kind);
        const rColor = t.kind === 'frame' ? (frameColor(t.value as string) ?? colors.accent) : colors.accent;
        return (
          <FadeInUp key={t.tier} index={Math.min(i + 1, 8)}>
            <Card variant="tinted" style={{ gap: 10, ...(isNext ? { borderWidth: 1, borderColor: colors.accent } : {}) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{
                  width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isClaimed ? `${colors.up}22` : unlocked ? `${rColor}22` : colors.surface2,
                }}>
                  {isClaimed ? <Check color={colors.up} size={20} strokeWidth={2.5} />
                    : unlocked ? <RIcon color={rColor} size={20} strokeWidth={2} />
                    : <Lock color={colors.ink3} size={18} strokeWidth={2} />}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>Tier {t.tier}</Text>
                  <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>{t.label}</Text>
                </View>
                {isClaimed
                  ? <Chip variant="up">Claimed</Chip>
                  : unlocked
                    ? <Button variant="accent" size="sm" onPress={() => claim(t)}>Claim</Button>
                    : <Text style={{ fontSize: 11, color: colors.ink3, fontVariant: ['tabular-nums'] }}>{t.seasonXp.toLocaleString()} XP</Text>}
              </View>
              {!unlocked && (
                <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surface2, overflow: 'hidden' }}>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.accent, width: `${Math.min(100, Math.round((seasonXp / t.seasonXp) * 100))}%` }} />
                </View>
              )}
            </Card>
          </FadeInUp>
        );
      })}

      <RewardModal
        visible={!!reward}
        onClose={() => setReward(null)}
        icon={reward ? rewardIcon(reward.kind) : Sparkles}
        title={`Tier ${reward?.tier ?? ''} unlocked!`}
        rewardLabel={reward?.label ?? ''}
      />
    </ScreenShell>
  );
}
