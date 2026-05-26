import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { CandleChart } from '../components/charts/CandleChart';
import { AreaChart } from '../components/charts/AreaChart';
import { Avatar } from '../components/ui/Avatar';
import { useTheme } from '../theme/ThemeContext';
import { Filter, Plus, ChevronRight, Pause, SkipBack, SkipForward } from 'lucide-react-native';
import { useApp } from '../store/AppContext';

const eras = [
  { id: 'bull-run-2021',      title: 'The 2021 Bull Run',    sub: 'Nov 2020 → May 2021 · BTC $13K → $64K', tag: '+393% BTC',  down: false },
  { id: 'crypto-winter-2022', title: 'Crypto Winter 2022',   sub: 'LUNA · FTX collapse · May → Nov 2022',  tag: '−65% market', down: true  },
  { id: 'defi-summer',        title: 'DeFi Summer',          sub: 'YFI · UNI launch · May → Sep 2020',     tag: '+180% market', down: false },
  { id: 'covid-crash',        title: 'COVID Crash',          sub: '5 days · −50% · March 2020',            tag: 'Extreme vol',  down: true  },
  { id: 'ico-boom-2017',      title: '2017 ICO Boom',        sub: 'Jul → Dec 2017',                         tag: '+420% market', down: false },
];

export function ReplayScreen() {
  const { colors } = useTheme();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { state } = useApp();
  const [activeEraId, setActiveEraId] = useState<string | null>(route.params?.eraId ?? null);
  const [isPlaying, setIsPlaying] = useState(false);

  const activeEra = eras.find(e => e.id === activeEraId) ?? null;

  const handleStartEra = (eraId: string) => {
    setActiveEraId(eraId);
    setIsPlaying(true);
  };

  if (activeEra) {
    return (
      <ScreenShell
        eyebrow="Time Machine · Replay"
        title={activeEra.title}
        rightActions={
          <Chip variant={activeEra.down ? 'down' : 'up'}>{activeEra.tag}</Chip>
        }
      >
        <Text style={{ fontSize: 13, color: colors.ink3, lineHeight: 20 }}>
          {activeEra.sub}
        </Text>

        {/* Playback controls */}
        <Card style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontWeight: '600', color: colors.ink }}>Day 1 of 182</Text>
            <Chip variant={isPlaying ? 'up' : 'outline'}>{isPlaying ? '▶ Playing' : '⏸ Paused'}</Chip>
          </View>
          <View style={{ height: 4, backgroundColor: colors.surface2, borderRadius: 999 }}>
            <View style={{ height: '100%', width: '3%', backgroundColor: colors.brand, borderRadius: 999 }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20 }}>
            <TouchableOpacity style={{ padding: 8 }}>
              <SkipBack color={colors.ink} size={24} strokeWidth={1.75} />
            </TouchableOpacity>
            <TouchableOpacity
              style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}
              onPress={() => setIsPlaying(p => !p)}
            >
              {isPlaying
                ? <Pause color={colors.brandOn} size={22} strokeWidth={1.75} />
                : <Text style={{ color: colors.brandOn, fontSize: 18 }}>▶</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={{ padding: 8 }}>
              <SkipForward color={colors.ink} size={24} strokeWidth={1.75} />
            </TouchableOpacity>
          </View>
        </Card>

        <View style={{ marginHorizontal: -20 }}>
          <CandleChart height={200} />
        </View>

        {/* Simulated P&L */}
        <Card variant="noPad" style={{ flexDirection: 'row' }}>
          {[['Bankroll', '$10,000'], ['P&L', '+$0'], ['Day', '1 / 182']].map(([k, v], i) => (
            <View key={k} style={{ flex: 1, padding: 14, alignItems: 'center', borderRightWidth: i < 2 ? 1 : 0, borderRightColor: colors.hairline }}>
              <Text style={{ fontSize: 11, color: colors.ink3 }}>{k}</Text>
              <Text style={{ fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'], marginTop: 2 }}>{v}</Text>
            </View>
          ))}
        </Card>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="down" style={{ flex: 1 }} onPress={() => Alert.alert('Sell', 'Place a sell order in this era.', [{ text: 'OK' }])}>Sell</Button>
          <Button variant="up" style={{ flex: 1 }} onPress={() => Alert.alert('Buy', 'Place a buy order in this era.', [{ text: 'OK' }])}>Buy</Button>
        </View>

        <Button variant="ghost" onPress={() => { setActiveEraId(null); setIsPlaying(false); }}>
          ← Back to era list
        </Button>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      eyebrow="Time Machine"
      title="Trade the past"
      rightActions={
        <TouchableOpacity onPress={() => Alert.alert('Filter', 'Filter eras by market condition, date range, or volatility.', [{ text: 'OK' }])}>
          <Filter color={colors.ink} size={20} strokeWidth={1.75} />
        </TouchableOpacity>
      }
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
            onPress={() => handleStartEra('bull-run-2021')}
          >
            ▶ Start
          </Button>
        </View>
      </View>

      {/* More eras */}
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>More eras</Text>
      <Card variant="noPad">
        {eras.map((e, i) => (
          <TouchableOpacity key={e.title} onPress={() => handleStartEra(e.id)} activeOpacity={0.75}>
            <CardSection last={i === eras.length - 1}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: colors.ink }}>{e.title}</Text>
                  <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>{e.sub}</Text>
                </View>
                <AreaChart height={28} down={e.down} showDot={false} style={{ width: 64 }} />
                <ChevronRight color={colors.ink3} size={18} strokeWidth={1.75} />
              </View>
            </CardSection>
          </TouchableOpacity>
        ))}
      </Card>

      {/* Custom range */}
      <TouchableOpacity
        activeOpacity={0.6}
        onPress={() => Alert.alert('Custom Range', 'Pick any historical date range. This feature unlocks at Level 15!', [{ text: 'OK' }])}
      >
        <Card variant="tinted" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 32, height: 32, backgroundColor: colors.surface, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
            <Plus color={colors.ink} size={16} strokeWidth={1.75} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', fontSize: 13, color: colors.ink }}>Custom range</Text>
            <Text style={{ fontSize: 11, color: colors.ink3 }}>Pick any historical date range · unlocks at Level 15</Text>
          </View>
        </Card>
      </TouchableOpacity>
    </ScreenShell>
  );
}
