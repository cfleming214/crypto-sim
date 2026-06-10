import React from 'react';
import { View, Text, ViewStyle } from 'react-native';

// Metallic colors per league so the badge reads as Bronze/Silver/Gold/etc.
// (the old badge used the brand color for all leagues, so Bronze looked black).
const LEAGUE_COLORS: Record<string, { bg: string; fg: string }> = {
  Bronze:   { bg: '#CD7F32', fg: '#FFFFFF' },
  Silver:   { bg: '#AEB6BD', fg: '#1A1A1A' },
  Gold:     { bg: '#E6B800', fg: '#1A1A1A' },
  Platinum: { bg: '#8FD4DA', fg: '#0A3D44' },
  Diamond:  { bg: '#6EA8FE', fg: '#0A2A6E' },
};

export function leagueColor(league: string): { bg: string; fg: string } {
  return LEAGUE_COLORS[league] ?? { bg: '#CD7F32', fg: '#FFFFFF' };
}

export function LeagueBadge({ league, division, style }: { league: string; division?: number; style?: ViewStyle }) {
  const { bg, fg } = leagueColor(league);
  // division = level within the tier (1 or 2), shown as a plain number: "Bronze 2".
  const numeral = division && division > 0 ? ` ${division}` : '';
  return (
    <View style={[{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: bg, alignSelf: 'flex-start' }, style]}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: fg }}>
        {league}{numeral}
      </Text>
    </View>
  );
}
