import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from './ui/Text';
import { Card, CardSection } from './ui/Card';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../store/AuthContext';
import { fetchRecruiterCup, type CupRow } from '../services/referralService';
import { seasonEndsAt } from '../services/gamification';

// The "Recruiter Cup" standings shown in the Compete tab — top recruiters this
// season by ACTIVATED referrals. Reads the Lambda-built RecruiterCupLeaderboard,
// highlights the viewer's own row, shows the podium prize for the top spots and a
// season countdown. Prizes follow the XP-now / cash-later contest gate.
const PRIZES = ['25,000 XP + 3mo Premium', '15,000 XP + 2mo Premium', '10,000 XP + 1mo Premium', '6,000 XP', '4,000 XP'];

function countdown(ms: number): string {
  if (ms <= 0) return 'ending now';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return d > 0 ? `${d}d ${h}h left` : `${h}h left`;
}

export function RecruiterCupBoard() {
  const { colors } = useTheme();
  const { userId } = useAuth();
  const [rows, setRows] = useState<CupRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRecruiterCup().then(r => { if (!cancelled) setRows(r); }).catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, []);

  const ends = seasonEndsAt(Date.now());

  return (
    <View style={{ gap: 10 }}>
      <Card variant="tinted">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>🏆 Recruiter Cup</Text>
          <Text style={{ fontSize: 12, color: colors.ink3 }}>{countdown(ends - Date.now())}</Text>
        </View>
        <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>
          Top recruiters this season by friends who joined their first contest. Invite from your Profile.
        </Text>
      </Card>

      {rows === null ? (
        <Card variant="tinted"><Text style={{ fontSize: 13, color: colors.ink3 }}>Loading standings…</Text></Card>
      ) : rows.length === 0 ? (
        <Card variant="tinted">
          <Text style={{ fontSize: 13, color: colors.ink3 }}>
            No recruiters yet this season — be the first. Share your code from Profile to climb the board.
          </Text>
        </Card>
      ) : (
        <Card variant="noPad">
          {rows.map((r, i) => {
            const mine = !!userId && r.owner === userId;
            const prize = r.rank <= PRIZES.length ? PRIZES[r.rank - 1] : null;
            return (
              <CardSection key={r.owner || i} last={i === rows.length - 1}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ width: 26, fontSize: 14, fontWeight: '800', color: r.rank <= 3 ? colors.brand : colors.ink3, fontVariant: ['tabular-nums'] }}>
                    {r.rank}
                  </Text>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: r.avatarColor || colors.surface2 }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: mine ? '800' : '600', color: mine ? colors.brand : colors.ink }}>
                      {r.handle}{mine ? ' (you)' : ''}
                    </Text>
                    {prize && <Text numberOfLines={1} style={{ fontSize: 11, color: colors.ink3, marginTop: 1 }}>{prize}</Text>}
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>
                    {r.seasonActivated}
                  </Text>
                </View>
              </CardSection>
            );
          })}
        </Card>
      )}
    </View>
  );
}
