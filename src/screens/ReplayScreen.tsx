import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { CandleChart } from '../components/charts/CandleChart';
import { AreaChart } from '../components/charts/AreaChart';
import { Avatar } from '../components/ui/Avatar';
import { useTheme } from '../theme/ThemeContext';
import { Filter, Play, Plus, Flame, ChevronRight, Pause, SkipBack, SkipForward } from 'lucide-react-native';

const eras = [
  { title: 'Crypto Winter 2022',   sub: 'LUNA · FTX collapse · May → Nov 2022', tag: '−65% market', down: true  },
  { title: 'DeFi Summer',          sub: 'YFI · UNI launch · May → Sep 2020',    tag: '+180% market', down: false },
  { title: 'COVID Crash',          sub: '5 days · −50% · March 2020',           tag: 'Extreme vol',  down: true  },
  { title: '2017 ICO Boom',        sub: 'Jul → Dec 2017',                        tag: '+420% market', down: false },
];

export function ReplayScreen() {
  const { colors } = useTheme();
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <ScreenShell
      eyebrow="Time Machine"
      title="Trade the past"
      rightActions={<Filter color={colors.ink} size={20} strokeWidth={1.75} />}
    >
      <Text style={{ fontSize: 13, color: colors.ink3, lineHeight: 20 }}>
        Step into a real market moment with $10K. See how you would have played it.
      </Text>

      {/* Hero replay card */}
      <View style={{ backgroundColor: colors.brand, borderRadius: 18, overflow: 'hidden' }}>
        <View style={{ padding: 18, paddingBottom: 6 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: `${colors.brandOn}A5`, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Featured · Nov 2020 → May 2021
          </Text>
          <Text style={{ fontSize: 28, fontWeight: '700', color: colors.brandOn, marginTop: 6, letterSpacing: -0.7 }}>
            The 2021 Bull Run
          </Text>
          <Text style={{ fontSize: 13, color: `${colors.brandOn}CC`, marginTop: 4 }}>
            BTC $13K → $64K · 182 days · 5,640 players
          </Text>
        </View>
        <View style={{ marginVertical: 8 }}>
          <AreaChart height={110} style={{ opacity: 0.9 }} />
        </View>
        <View style={{ padding: 6, paddingHorizontal: 18, paddingBottom: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {['M', 'S', 'K', 'L'].map((l, i) => (
              <Avatar
                key={l}
                initials={l}
                size="sm"
                style={{ marginLeft: i === 0 ? 0 : -8, backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'transparent' }}
              />
            ))}
            <Text style={{ fontSize: 11, color: `${colors.brandOn}A5`, marginLeft: 10 }}>3 friends played</Text>
          </View>
          <Button
            variant="surface"
            size="sm"
            style={{ backgroundColor: colors.brandOn, borderColor: 'transparent', flexDirection: 'row', gap: 6 }}
            textStyle={{ color: colors.brand }}
          >
            ▶ Start
          </Button>
        </View>
      </View>

      {/* More eras */}
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>More eras</Text>
      <Card variant="noPad">
        {eras.map((e, i) => (
          <CardSection key={e.title} last={i === eras.length - 1}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: colors.ink }}>{e.title}</Text>
                <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>{e.sub}</Text>
              </View>
              <AreaChart height={28} down={e.down} showDot={false} style={{ width: 64 }} />
              <ChevronRight color={colors.ink3} size={18} strokeWidth={1.75} />
            </View>
          </CardSection>
        ))}
      </Card>

      {/* Custom range */}
      <Card variant="tinted" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: 0.7 }}>
        <View style={{ width: 32, height: 32, backgroundColor: colors.surface, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
          <Plus color={colors.ink} size={16} strokeWidth={1.75} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '600', fontSize: 13, color: colors.ink }}>Custom range</Text>
          <Text style={{ fontSize: 11, color: colors.ink3 }}>Pick any historical date range · unlocks at Level 15</Text>
        </View>
      </Card>
    </ScreenShell>
  );
}
