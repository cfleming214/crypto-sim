import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Segmented } from '../components/ui/Segmented';
import { useTheme } from '../theme/ThemeContext';
import { useCompetitions } from '../hooks/useCompetitions';
import { Clock, Trophy } from 'lucide-react-native';
import type { Competition } from '../store/types';

const TYPE_LABEL: Record<string, string> = {
  daily: 'Daily',
  featured: 'Featured',
  replay: 'Replay',
  '1v1': '1v1',
};

function CompCard({ comp, isJoined, timeRemaining, onPress }: {
  comp: Competition;
  isJoined: boolean;
  timeRemaining: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const isLive = comp.status === 'live';
  const isFinished = comp.status === 'finished';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <Card variant="compact" style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {isLive && (
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.down }} />
            )}
            <Text style={{
              fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase',
              color: isLive ? colors.down : colors.ink3,
            }}>
              {isLive ? 'Live' : isFinished ? 'Ended' : TYPE_LABEL[comp.type] ?? comp.type}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            {isJoined && !isFinished && (
              <Chip variant="brand" style={{ paddingVertical: 1, paddingHorizontal: 6 }}>Joined</Chip>
            )}
            {isFinished && (
              <Chip variant="warn" style={{ paddingVertical: 1, paddingHorizontal: 6 }}>Finished</Chip>
            )}
          </View>
        </View>

        <Text style={{ fontWeight: '700', fontSize: 15, color: colors.ink }}>{comp.name}</Text>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Clock color={colors.ink3} size={12} strokeWidth={1.75} />
            <Text style={{ fontSize: 12, color: colors.ink3 }}>{timeRemaining}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Trophy color={colors.ink3} size={12} strokeWidth={1.75} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink }}>{comp.prizePool}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.hairline }}>
          <Text style={{ fontSize: 11, color: colors.ink3 }}>
            {comp.entryCount.toLocaleString()} / {comp.maxPlayers.toLocaleString()} players
          </Text>
          <Text style={{ fontSize: 11, color: colors.ink3 }}>Stake: {comp.stake}</Text>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

export function BracketsScreen() {
  const { colors } = useTheme();
  const nav = useNavigation<any>();
  const { competitions, getLive, getOpen, isJoined, timeRemaining } = useCompetitions();
  const [tab, setTab] = useState('Open');

  const liveComps = getLive();
  const openComps = getOpen();
  const finishedComps = competitions.filter(c => c.status === 'finished');

  const visibleComps = tab === 'Live' ? liveComps
    : tab === 'Finished' ? finishedComps
    : openComps;

  const counts: Record<string, number> = {
    Open: openComps.length,
    Live: liveComps.length,
    Finished: finishedComps.length,
  };

  return (
    <ScreenShell eyebrow="Season 3 · Bull Run" title="All brackets">
      <Segmented
        options={['Open', 'Live', 'Finished']}
        value={tab}
        onChange={setTab}
      />

      {visibleComps.length === 0 ? (
        <View style={{ paddingVertical: 48, alignItems: 'center' }}>
          <Text style={{ color: colors.ink3, fontSize: 14 }}>
            No {tab.toLowerCase()} brackets right now
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {visibleComps.map(comp => (
            <CompCard
              key={comp.id}
              comp={comp}
              isJoined={isJoined(comp.id)}
              timeRemaining={timeRemaining(comp)}
              onPress={() => nav.navigate('TournamentDetail', { id: comp.id })}
            />
          ))}
        </View>
      )}
    </ScreenShell>
  );
}
