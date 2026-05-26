import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Avatar } from '../components/ui/Avatar';
import { useTheme } from '../theme/ThemeContext';
import { fetchTopTraders, type PublicTrader } from '../services/portfolioService';
import { isAmplifyConfigured } from '../lib/amplify';

export function TopTradersScreen() {
  const { colors } = useTheme();
  const nav = useNavigation<any>();
  const [traders, setTraders] = useState<PublicTrader[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await fetchTopTraders(50);
    setTraders(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <ScreenShell title="Top traders" eyebrow="Discover" onRefresh={refresh}>
      {!isAmplifyConfigured && (
        <Card variant="tinted">
          <Text style={{ color: colors.ink3, fontSize: 13 }}>
            Sign in to a deployed sandbox to discover real traders.
          </Text>
        </Card>
      )}

      {loading && traders.length === 0 && (
        <View style={{ paddingTop: 40, alignItems: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      )}

      {!loading && traders.length === 0 && isAmplifyConfigured && (
        <Card variant="tinted">
          <Text style={{ color: colors.ink, fontWeight: '600', marginBottom: 4 }}>No traders yet</Text>
          <Text style={{ color: colors.ink3, fontSize: 13 }}>
            Make some trades — your public profile shows up here for other users to copy.
          </Text>
        </Card>
      )}

      {traders.length > 0 && (
        <Card variant="noPad">
          {traders.map((t, i) => (
            <TouchableOpacity
              key={t.id}
              onPress={() => nav.navigate('CopyTrade', { traderId: t.id })}
              activeOpacity={0.7}
            >
              <CardSection last={i === traders.length - 1}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Text style={{
                    width: 24, textAlign: 'center',
                    fontWeight: '700', fontVariant: ['tabular-nums'], fontSize: 13,
                    color: i < 3 ? colors.up : colors.ink3,
                  }}>
                    {i + 1}
                  </Text>
                  <Avatar
                    initials={t.handle.slice(0, 2).toUpperCase()}
                    size="default"
                    uri={t.avatarUrl}
                    style={t.avatarColor && !t.avatarUrl ? { backgroundColor: t.avatarColor } : undefined}
                  />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontWeight: '700', fontSize: 14, color: colors.ink }}>
                        @{t.handle}
                      </Text>
                      <Chip variant="brand">{t.league}</Chip>
                    </View>
                    <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>
                      {t.tradeCount} trades · {t.winRate.toFixed(0)}% win rate
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{
                      fontWeight: '700',
                      fontVariant: ['tabular-nums'],
                      color: t.pnlPct >= 0 ? colors.up : colors.down,
                    }}>
                      {t.pnlPct >= 0 ? '+' : ''}{t.pnlPct.toFixed(1)}%
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.ink3, fontVariant: ['tabular-nums'] }}>
                      ${Math.round(t.bankroll).toLocaleString()}
                    </Text>
                  </View>
                </View>
              </CardSection>
            </TouchableOpacity>
          ))}
        </Card>
      )}
    </ScreenShell>
  );
}
