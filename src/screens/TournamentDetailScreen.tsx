import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { AreaChart } from '../components/charts/AreaChart';
import { EmailVerificationModal } from '../components/EmailVerificationModal';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useCompetitions } from '../hooks/useCompetitions';
import { Bell, MoreHorizontal } from 'lucide-react-native';


export function TournamentDetailScreen() {
  const { colors } = useTheme();
  const { state } = useApp();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { getById, isJoined, join, leave, timeRemaining, refreshLeaderboard, leaderboard } = useCompetitions();
  const { emailVerified } = useAuth();
  const [verifyOpen, setVerifyOpen] = useState(false);

  const competitionId: string = route.params?.id ?? '';
  const competition = getById(competitionId);

  if (!competition) {
    return (
      <ScreenShell title="Contest not found">
        <Card variant="tinted">
          <Text style={{ color: colors.ink, fontWeight: '600', marginBottom: 4 }}>
            This contest doesn't exist
          </Text>
          <Text style={{ color: colors.ink3, fontSize: 13 }}>
            It may have been removed. Head back to Compete to see what's live.
          </Text>
        </Card>
      </ScreenShell>
    );
  }

  const joined = isJoined(competitionId);
  const entries = leaderboard[competitionId] ?? [];

  // Pull the contest portfolio: active state if currently selected, else
  // the stashed slice from state.portfolios. Falls back to a fresh $10K
  // shape for not-yet-joined contests so the chart still renders something.
  const contestPortfolio = state.activePortfolioId === competitionId
    ? { cash: state.cash, holdings: state.holdings, trades: state.trades }
    : (state.portfolios[competitionId] ?? { cash: 10000, holdings: [], trades: [] });
  const contestBankroll = contestPortfolio.cash + contestPortfolio.holdings.reduce((s, h) => {
    const c = state.coins.find(x => x.symbol === h.symbol);
    return s + (c ? c.price * h.units : 0);
  }, 0);
  const pnlPct = ((contestBankroll - 10000) / 10000) * 100;

  // Live player count derives from the subscribed leaderboard rather than the
  // cached competition.entryCount (which was snapshotted at fetch time).
  const playerCount = entries.length || competition.entryCount || 0;

  // Top performer's P&L from the leaderboard. Empty when no entries yet.
  const leaderEntry = [...entries].sort((a, b) => b.pnlPct - a.pnlPct)[0];
  const leaderPct = leaderEntry?.pnlPct ?? 0;

  // Determine the user's rank from the live leaderboard.
  const meEntry = entries.find(e => e.handle === state.user.handle);
  const userRank: number | string | null = meEntry?.rank ?? (joined ? '—' : null);

  // Derive a real equity-since-start chart from this contest's trade
  // history. Walks trades chronologically, using each trade's price as the
  // last-known price for that symbol; snapshots bankroll at each trade.
  const { chartData, chartTimestamps } = React.useMemo(() => {
    const sorted = [...contestPortfolio.trades].sort((a, b) => a.timestamp - b.timestamp);
    let cash = 10000;
    const holdings = new Map<string, { units: number; avgCost: number }>();
    const lastPrice = new Map<string, number>();
    // Anchor the series at the contest start (or first trade) and walk forward.
    const startTs = sorted[0]?.timestamp ?? competition.startAt;
    const snaps: number[]  = [10000];
    const stamps: number[] = [startTs];
    for (const tr of sorted) {
      lastPrice.set(tr.symbol, tr.price);
      if (tr.side === 'buy') {
        cash -= tr.amount;
        const ex = holdings.get(tr.symbol);
        if (ex) {
          const u = ex.units + tr.units;
          holdings.set(tr.symbol, { units: u, avgCost: (ex.avgCost * ex.units + tr.amount) / u });
        } else {
          holdings.set(tr.symbol, { units: tr.units, avgCost: tr.price });
        }
      } else {
        cash += tr.amount;
        const ex = holdings.get(tr.symbol);
        if (ex) {
          const u = ex.units - tr.units;
          if (u <= 1e-6) holdings.delete(tr.symbol);
          else holdings.set(tr.symbol, { units: u, avgCost: ex.avgCost });
        }
      }
      let bankroll = cash;
      for (const [sym, h] of holdings) {
        const price = lastPrice.get(sym) ?? state.coins.find(c => c.symbol === sym)?.price ?? 0;
        bankroll += h.units * price;
      }
      snaps.push(bankroll);
      stamps.push(tr.timestamp);
    }
    snaps.push(contestBankroll);
    stamps.push(Date.now());
    if (snaps.length < 2) {
      return {
        chartData:       [10000, contestBankroll],
        chartTimestamps: [competition.startAt, Date.now()],
      };
    }
    return { chartData: snaps, chartTimestamps: stamps };
  }, [contestPortfolio.trades, contestBankroll, state.coins, competition.startAt]);

  useEffect(() => {
    refreshLeaderboard(competitionId);
  }, [competitionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleJoinLeave = () => {
    if (joined) {
      Alert.alert(
        'Leave competition?',
        'Your progress will be lost.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => leave(competitionId) },
        ],
      );
    } else {
      Alert.alert(
        `Join ${competition.name}`,
        `Stake: ${competition.stake}\nPrize: ${competition.prizePool}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Join',
            onPress: () => {
              if (!emailVerified) {
                setVerifyOpen(true);
                return;
              }
              join(competitionId);
            },
          },
        ],
      );
    }
  };

  const timeLabel = competition.status === 'finished'
    ? 'Finished'
    : `${competition.status === 'live' ? 'Live · ' : ''}${timeRemaining(competition)}`;

  return (
    <ScreenShell
      eyebrow={competition.name}
      title={timeLabel}
      rightActions={
        <>
          <TouchableOpacity
            style={{ padding: 8 }}
            onPress={() => Alert.alert('Alerts', 'You will be notified when your rank changes significantly.', [{ text: 'OK' }])}
          >
            <Bell color={colors.ink} size={20} strokeWidth={1.75} />
          </TouchableOpacity>
          <TouchableOpacity
            style={{ padding: 8 }}
            onPress={() => Alert.alert('Share', 'Invite friends to compete!', [{ text: 'Close' }])}
          >
            <MoreHorizontal color={colors.ink} size={20} strokeWidth={1.75} />
          </TouchableOpacity>
        </>
      }
    >
      {/* Stats row */}
      <Card variant="noPad" style={{ flexDirection: 'row' }}>
        {[
          ['Prize pool', competition.prizePool],
          ['Players', playerCount.toLocaleString()],
          ['Your rank', userRank !== null ? `#${userRank}` : '—'],
        ].map(([label, value], i) => (
          <View
            key={label}
            style={{ flex: 1, padding: 14, alignItems: 'center', borderRightWidth: i < 2 ? 1 : 0, borderRightColor: colors.hairline }}
          >
            <Text style={{ fontSize: 11, color: colors.ink3 }}>{label}</Text>
            <Text style={{ fontWeight: '700', fontSize: 15, color: colors.ink, fontVariant: ['tabular-nums'], marginTop: 2 }}>{value}</Text>
          </View>
        ))}
      </Card>

      {/* Equity chart */}
      <Card variant="noPad">
        <CardSection>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Equity since start</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 8, height: 2, backgroundColor: colors.ink }} />
                  <Text style={{ fontSize: 11 }}>You {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%</Text>
                </View>
                {leaderEntry && leaderEntry.handle !== state.user.handle && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 2, backgroundColor: colors.up }} />
                    <Text style={{ fontSize: 11, color: colors.ink3 }}>
                      Leader {leaderPct >= 0 ? '+' : ''}{leaderPct.toFixed(1)}%
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <Text style={{ fontWeight: '700', fontSize: 15, color: colors.ink, fontVariant: ['tabular-nums'] }}>${contestBankroll.toFixed(0)}</Text>
          </View>
          <View style={{ marginTop: 10 }}>
            <AreaChart height={110} data={chartData} timestamps={chartTimestamps} down={pnlPct < 0} />
          </View>
        </CardSection>
      </Card>

      {/* Rules */}
      <Card style={{ gap: 8 }}>
        <Text style={{ fontWeight: '700', color: colors.ink }}>Rules</Text>
        {[
          ['Starting bankroll', '$10,000'],
          ['Leverage', 'Off'],
          ['Eligible markets', state.coins.filter(c => c.symbol !== 'USDC').map(c => c.symbol).join(', ')],
          ['Final standing', 'Highest equity wins'],
          ['Entry fee', competition.stake],
        ].map(([k, v], i, arr) => (
          <View key={k}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: colors.ink3 }}>{k}</Text>
              <Text style={{ fontWeight: '600', fontSize: 13, color: colors.ink }}>{v}</Text>
            </View>
            {i < arr.length - 1 && <View style={{ height: 1, backgroundColor: colors.hairline, marginTop: 8, opacity: 0.6 }} />}
          </View>
        ))}
      </Card>

      {/* Payouts */}
      {competition.prizes.length > 0 && (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontWeight: '700', color: colors.ink }}>Payouts</Text>
            <Text style={{ fontSize: 11, color: colors.ink3 }}>
              Top {competition.numberOfPrizes} paid
            </Text>
          </View>
          {competition.prizes.map((amount, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: i < competition.prizes.length - 1 ? 1 : 0, borderBottomColor: colors.hairline }}>
              <Text style={{ fontSize: 13, color: colors.ink }}>#{i + 1}</Text>
              <Text style={{ fontWeight: '700', fontSize: 13, color: colors.ink, fontVariant: ['tabular-nums'] }}>
                ${amount.toLocaleString()}
              </Text>
            </View>
          ))}
        </Card>
      )}

      {/* Live leaderboard */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontWeight: '700', color: colors.ink }}>Leaderboard</Text>
          <Text style={{ fontSize: 11, color: colors.ink3 }}>
            {entries.length === 0
              ? 'No players yet'
              : `${entries.length} ${entries.length === 1 ? 'player' : 'players'} · live`}
          </Text>
        </View>
        {entries.length === 0 ? (
          <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 8 }}>
            Join the contest and rankings will appear here.
          </Text>
        ) : (
          [...entries]
            .sort((a, b) => b.bankroll - a.bankroll)
            .map((e, idx, arr) => {
              const liveRank = idx + 1;
              const prize = liveRank <= competition.prizes.length
                ? competition.prizes[liveRank - 1]
                : 0;
              const isMe = e.handle === state.user.handle;
              return (
                <View
                  key={e.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    borderBottomWidth: idx < arr.length - 1 ? 1 : 0,
                    borderBottomColor: colors.hairline,
                    backgroundColor: isMe ? colors.surface2 : 'transparent',
                    marginHorizontal: -12,
                    paddingHorizontal: 12,
                  }}
                >
                  <Text style={{
                    width: 28,
                    fontWeight: '700',
                    color: liveRank <= 3 ? colors.up : colors.ink3,
                    fontVariant: ['tabular-nums'],
                    fontSize: 13,
                  }}>
                    {liveRank}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600', fontSize: 13, color: colors.ink }}>
                      @{e.handle}{isMe ? ' (you)' : ''}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.ink3, fontVariant: ['tabular-nums'] }}>
                      ${Math.round(e.bankroll).toLocaleString()} · {e.pnlPct >= 0 ? '+' : ''}{e.pnlPct.toFixed(1)}%
                    </Text>
                  </View>
                  <Text style={{
                    fontWeight: '700',
                    fontSize: 13,
                    color: prize > 0 ? colors.up : colors.ink3,
                    fontVariant: ['tabular-nums'],
                  }}>
                    {prize > 0 ? `$${prize.toLocaleString()}` : '—'}
                  </Text>
                </View>
              );
            })
        )}
      </Card>

      {/* Footer */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          testID={joined ? 'tournament-leave-btn' : 'tournament-join-btn'}
          variant="ghost"
          style={{ flex: 1 }}
          onPress={handleJoinLeave}
        >
          {joined ? 'Leave' : 'Join'}
        </Button>
        <Button
          variant="brand"
          style={{ flex: 1 }}
          onPress={() => nav.navigate('Trade')}
        >
          Trade now
        </Button>
      </View>
      <EmailVerificationModal
        visible={verifyOpen}
        reason="Verify your email to join this contest. We use it for prize notifications and account recovery."
        onClose={() => setVerifyOpen(false)}
        onVerified={() => {
          setVerifyOpen(false);
          join(competitionId);
        }}
      />
    </ScreenShell>
  );
}
