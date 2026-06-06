import React from 'react';
import { View, Text } from 'react-native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';

export function BlockedUsersScreen() {
  const { colors } = useTheme();
  const { state, dispatch } = useApp();
  const blocked = state.blockedUsers;

  return (
    <ScreenShell eyebrow="Safety" title="Blocked users">
      {blocked.length === 0 ? (
        <Card variant="tinted">
          <Text style={{ color: colors.ink, fontWeight: '600', marginBottom: 4 }}>No blocked users</Text>
          <Text style={{ color: colors.ink3, fontSize: 13, lineHeight: 19 }}>
            When you block someone from a trader profile or leaderboard, they'll appear here. Blocked
            users are hidden from every feed across the app.
          </Text>
        </Card>
      ) : (
        <Card variant="noPad">
          {blocked.map((b, i) => (
            <CardSection key={b.owner} last={i === blocked.length - 1}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar initials={b.handle.slice(0, 2).toUpperCase()} size="default" />
                <Text style={{ flex: 1, fontWeight: '700', fontSize: 14, color: colors.ink }}>
                  @{b.handle}
                </Text>
                <Button
                  testID={`unblock-${b.owner}`}
                  variant="ghost"
                  size="sm"
                  onPress={() => dispatch({ type: 'UNBLOCK_USER', owner: b.owner })}
                >
                  Unblock
                </Button>
              </View>
            </CardSection>
          ))}
        </Card>
      )}
    </ScreenShell>
  );
}
