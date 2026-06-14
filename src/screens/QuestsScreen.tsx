import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { ProgressBar } from '../components/ui/ProgressBar';
import { FadeInUp } from '../components/ui/FadeInUp';
import { RewardModal } from '../components/ui/RewardModal';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/ui/Toast';
import { questViews, QUEST_CHEST_XP, QUEST_CHEST_CASH } from '../data/quests';
import { nextClaimAt } from '../services/gamification';
import { Gift, Check } from 'lucide-react-native';

function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function QuestsScreen() {
  const { colors } = useTheme();
  const { state, dispatch } = useApp();
  const { show, celebrate } = useToast();

  // Tick once a second for the reset countdown.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const views = questViews(state, now);
  const allComplete = views.every(v => v.complete);
  const chestClaimed = state.quests.chestClaimed;
  const [chestOpen, setChestOpen] = useState(false);

  const claimQuest = (id: string, xp: number, title: string) => {
    dispatch({ type: 'CLAIM_QUEST', questId: id, xp });
    show({ title: `Quest complete · +${xp} XP`, subtitle: title, icon: Check, variant: 'up' });
    celebrate();
  };

  const claimChest = () => {
    dispatch({ type: 'CLAIM_QUEST_CHEST', xp: QUEST_CHEST_XP, cash: QUEST_CHEST_CASH });
    setChestOpen(true);
  };

  return (
    <ScreenShell title="Daily Quests" eyebrow="Quests">
      <FadeInUp>
        <Text style={{ fontSize: 13, color: colors.ink3 }}>
          Resets in {formatCountdown(nextClaimAt(now) - now)} · complete all {views.length} for a bonus chest.
        </Text>
      </FadeInUp>

      {views.map((v, i) => {
        const Icon = v.def.icon;
        return (
          <FadeInUp key={v.def.id} index={i + 1}>
            <Card variant="tinted" style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{
                  width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: v.complete ? `${colors.up}22` : colors.accentSoft,
                }}>
                  {v.complete ? <Check color={colors.up} size={20} strokeWidth={2.5} /> : <Icon color={colors.accent} size={20} strokeWidth={2} />}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }} numberOfLines={1}>{v.def.title}</Text>
                  <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>+{v.def.xp} XP</Text>
                </View>
                {v.claimed
                  ? <Chip variant="up">Claimed</Chip>
                  : v.complete
                    ? <Button variant="accent" size="sm" onPress={() => claimQuest(v.def.id, v.def.xp, v.def.title)}>Claim</Button>
                    : <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, fontVariant: ['tabular-nums'] }}>{v.progress}/{v.def.target}</Text>}
              </View>
              <ProgressBar step={v.progress} total={v.def.target} color={v.complete ? colors.up : colors.accent} />
            </Card>
          </FadeInUp>
        );
      })}

      {/* Bonus chest */}
      <FadeInUp index={views.length + 1}>
        <Card variant={allComplete && !chestClaimed ? 'default' : 'tinted'} style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.warn}22` }}>
              <Gift color={colors.warn} size={20} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>Bonus chest</Text>
              <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>+{QUEST_CHEST_XP} XP · +${QUEST_CHEST_CASH}</Text>
            </View>
            {chestClaimed
              ? <Chip variant="up">Claimed</Chip>
              : <Button variant={allComplete ? 'brand' : 'surface'} size="sm" disabled={!allComplete} onPress={claimChest}>Open</Button>}
          </View>
        </Card>
      </FadeInUp>

      <RewardModal
        visible={chestOpen}
        onClose={() => setChestOpen(false)}
        icon={Gift}
        title="Daily quests complete!"
        subtitle="You cleared every quest today."
        rewardLabel={`+${QUEST_CHEST_XP} XP · +$${QUEST_CHEST_CASH}`}
      />
    </ScreenShell>
  );
}
