import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, Alert, ScrollView, Pressable, Modal, ActivityIndicator, Linking } from 'react-native';
import { Text } from '../components/ui/Text';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Avatar, CoinGlyph } from '../components/ui/Avatar';
import { AreaChart } from '../components/charts/AreaChart';
import { EmailVerificationModal } from '../components/EmailVerificationModal';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useToast } from '../components/ui/Toast';
import { useCompetitions } from '../hooks/useCompetitions';
import { fetchEntryPortfolio, type ContestPortfolio } from '../services/competitionService';
import { fetchUnclaimed, claimPrize, type UnclaimedPrize } from '../services/walletService';
import { CONTEST_CASH_PRIZES, STARTING_CASH } from '../constants/featureFlags';
import { contestXpForRank } from '../services/gamification';
import type { Competition } from '../store/types';
import { LEGAL_URLS } from '../constants/legal';
import { Bell, MoreHorizontal, Trophy, X } from 'lucide-react-native';


export function TournamentDetailScreen() {
  const { colors } = useTheme();
  const { state, dispatch } = useApp();
  const { celebrate } = useToast();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { getById, isJoined, join, leave, timeRemaining, refreshLeaderboard, leaderboard } = useCompetitions();
  const { emailVerified, refreshAttributes } = useAuth();
  const [verifyOpen, setVerifyOpen] = useState(false);
  // Leaderboard balance popup: the tapped player's portfolio within this contest.
  const [portfolioView, setPortfolioView] = useState<{ handle: string; data: ContestPortfolio | null; loading: boolean } | null>(null);

  // Tap a player's name → their public profile (own row → own Profile tab).
  const openProfile = (handle: string) => {
    if (handle === state.user.handle) { nav.navigate('MainTabs', { screen: 'Profile' }); return; }
    nav.navigate('PublicProfile', { handle });
  };
  // Tap a player's balance → their contest holdings (fetched from their entry).
  const openBalance = async (handle: string) => {
    setPortfolioView({ handle, data: null, loading: true });
    const data = await fetchEntryPortfolio(competitionId, handle);
    setPortfolioView(prev => (prev?.handle === handle ? { handle, data, loading: false } : prev));
  };

  const competitionId: string = route.params?.id ?? '';
  const realCompetition = getById(competitionId);
  // Fallback keeps EVERY hook below unconditional even when the contest is
  // missing — e.g. opened from a stale "you won" push for a contest that's since
  // been removed. The not-found UI renders AFTER all hooks (just before the main
  // return), so the hook count never changes between renders (an early return
  // here would drop the hooks below and crash with "rendered fewer hooks").
  const competition: Competition = realCompetition ?? ({
    id: competitionId, name: '', type: 'featured', status: 'finished',
    prizePool: '', maxPlayers: 0, stake: 'Free', startAt: Date.now(), endAt: Date.now(),
    entryCount: 0, numberOfPrizes: 0, prizes: [], prizeXp: 0, lockAfterStart: false,
  } as unknown as Competition);

  const joined = isJoined(competitionId);
  // A lock-after-start contest that's already begun no longer accepts new
  // players — viewable read-only, but the Join CTA is hidden for non-members.
  const lockedOut = !joined && !!competition.lockAfterStart && Date.now() >= competition.startAt;
  // Blocked users are removed from the live leaderboard instantly.
  const entries = (leaderboard[competitionId] ?? [])
    .filter(e => !state.blockedUsers.some(b => b.handle === e.handle));

  // Pull the contest portfolio: active state if currently selected, else
  // the stashed slice from state.portfolios. Falls back to a fresh $100K
  // shape for not-yet-joined contests so the chart still renders something.
  const contestPortfolio = state.activePortfolioId === competitionId
    ? { cash: state.cash, holdings: state.holdings, trades: state.trades }
    : (state.portfolios[competitionId] ?? { cash: STARTING_CASH, holdings: [], trades: [] });
  const contestBankroll = contestPortfolio.cash + contestPortfolio.holdings.reduce((s, h) => {
    const c = state.coins.find(x => x.symbol === h.symbol);
    return s + (c ? c.price * h.units : 0);
  }, 0);
  const pnlPct = ((contestBankroll - STARTING_CASH) / STARTING_CASH) * 100;

  // Live player count derives from the subscribed leaderboard rather than the
  // cached competition.entryCount (which was snapshotted at fetch time).
  const playerCount = entries.length || competition.entryCount || 0;

  // Top performer's P&L from the leaderboard. Empty when no entries yet.
  const leaderEntry = [...entries].sort((a, b) => b.pnlPct - a.pnlPct)[0];
  const leaderPct = leaderEntry?.pnlPct ?? 0;

  // Determine the user's rank from the live leaderboard.
  const meEntry = entries.find(e => e.handle === state.user.handle);
  const userRank: number | string | null = meEntry?.rank ?? (joined ? '—' : null);

  // XP-prize claim (when cash prizes are off). The winner's final rank comes from
  // the leaderboard sorted by bankroll; the podium splits prizeXp 100/50/25%.
  const myFinalRank = [...entries].sort((a, b) => b.bankroll - a.bankroll)
    .findIndex(e => e.handle === state.user.handle) + 1;
  const myPrizeXp = contestXpForRank(competition.prizeXp, myFinalRank);
  const contestXpClaimed = state.claimedContestIds.includes(competition.id);
  const canClaimXp = !CONTEST_CASH_PRIZES && competition.status === 'finished'
    && myFinalRank >= 1 && myPrizeXp > 0 && !contestXpClaimed;
  const claimContestXp = () => {
    if (!canClaimXp) return;
    dispatch({ type: 'CLAIM_CONTEST_XP', contestId: competition.id, xp: myPrizeXp });
    celebrate();
  };
  // Podium XP rows shown in the Prizes card (ranks that earn > 0).
  const xpPodium = [1, 2, 3]
    .map(rank => ({ rank, xp: contestXpForRank(competition.prizeXp, rank) }))
    .filter(p => p.xp > 0);

  // Derive a real equity-since-start chart from this contest's trade
  // history. Walks trades chronologically, using each trade's price as the
  // last-known price for that symbol; snapshots bankroll at each trade.
  const { chartData, chartTimestamps } = React.useMemo(() => {
    const sorted = [...contestPortfolio.trades].sort((a, b) => a.timestamp - b.timestamp);
    let cash = STARTING_CASH;
    const holdings = new Map<string, { units: number; avgCost: number }>();
    const lastPrice = new Map<string, number>();
    // Anchor the series at the contest start (or first trade) and walk forward.
    const startTs = sorted[0]?.timestamp ?? competition.startAt;
    const snaps: number[]  = [STARTING_CASH];
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
        chartData:       [STARTING_CASH, contestBankroll],
        chartTimestamps: [competition.startAt, Date.now()],
      };
    }
    return { chartData: snaps, chartTimestamps: stamps };
  }, [contestPortfolio.trades, contestBankroll, state.coins, competition.startAt]);

  useEffect(() => {
    refreshLeaderboard(competitionId);
  }, [competitionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cash-prize claim: if this contest has an unclaimed Payout for the user, show
  // a Claim CTA here too (not just the Compete "Unclaimed" pill) — that's where a
  // "you won" push lands. Claiming credits the in-app balance.
  const [wonPrize, setWonPrize] = useState<UnclaimedPrize | null>(null);
  const [claimingPrize, setClaimingPrize] = useState(false);
  useEffect(() => {
    if (!CONTEST_CASH_PRIZES || !competitionId) return;
    let cancelled = false;
    fetchUnclaimed()
      .then(list => { if (!cancelled) setWonPrize(list.find(p => p.competitionId === competitionId) ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [competitionId]);
  const handleClaimCash = async () => {
    if (!wonPrize || claimingPrize) return;
    setClaimingPrize(true);
    const res = await claimPrize(wonPrize.payoutId);
    setClaimingPrize(false);
    if (res.ok) {
      const amt = (wonPrize.amountCents / 100).toFixed(2);
      setWonPrize(null);
      celebrate();
      Alert.alert('Prize claimed 🎉', `$${amt} was added to your balance. Withdraw it from Profile once your payout details are set up.`);
    } else {
      Alert.alert('Could not claim', res.error ?? 'Please try again in a moment.');
    }
  };

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
    } else if (competition.status === 'finished' || Date.now() >= competition.endAt) {
      Alert.alert('Contest ended', 'This contest is over — you can no longer join it.');
    } else if (competition.lockAfterStart && Date.now() >= competition.startAt) {
      Alert.alert('Contest locked', 'This contest already started and isn’t accepting new players.');
    } else {
      Alert.alert(
        `Join ${competition.name}`,
        `Stake: ${competition.stake}\nPrize: ${competition.prizePool}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Join',
            onPress: async () => {
              // Re-check live before gating: the cached flag can lag a
              // server-side change, which would wrongly pop the verify sheet
              // at an already-verified user.
              const verified = emailVerified || (await refreshAttributes());
              if (!verified) {
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

  // Contest genuinely missing (deleted / not yet synced) — render after all the
  // hooks above so the hook count is stable and React never crashes.
  if (!realCompetition) {
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
        {wonPrize && (
          <Card style={{ gap: 10, borderWidth: 1, borderColor: colors.up, marginTop: 12 }}>
            <Text style={{ fontWeight: '700', color: colors.ink }}>You have an unclaimed ${(wonPrize.amountCents / 100).toFixed(2)} prize</Text>
            <Button variant="brand" loading={claimingPrize} disabled={claimingPrize} onPress={handleClaimCash}>
              {claimingPrize ? 'Claiming…' : `Claim $${(wonPrize.amountCents / 100).toFixed(2)} to balance`}
            </Button>
          </Card>
        )}
      </ScreenShell>
    );
  }

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
          [CONTEST_CASH_PRIZES ? 'Prize pool' : 'Top prize',
           CONTEST_CASH_PRIZES ? competition.prizePool : `${competition.prizeXp.toLocaleString()} XP`],
          ['Players', `${playerCount.toLocaleString()} / ${competition.maxPlayers.toLocaleString()}`],
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

      {/* Won an unclaimed cash prize → claim it straight from the contest. */}
      {CONTEST_CASH_PRIZES && wonPrize && (
        <Card style={{ gap: 10, borderWidth: 1, borderColor: colors.up }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.upSoft }}>
              <Trophy color={colors.up} size={20} strokeWidth={1.75} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>You won this contest! 🏆</Text>
              <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
                ${(wonPrize.amountCents / 100).toFixed(2)} prize ready to claim
              </Text>
            </View>
          </View>
          <Button
            testID="contest-claim-prize"
            variant="brand"
            fullWidth
            loading={claimingPrize}
            disabled={claimingPrize}
            onPress={handleClaimCash}
          >
            {claimingPrize ? 'Claiming…' : `Claim $${(wonPrize.amountCents / 100).toFixed(2)} to balance`}
          </Button>
        </Card>
      )}

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
          ['Starting bankroll', `$${STARTING_CASH.toLocaleString()}`],
          ['Leverage', 'Off'],
          ['Eligible markets', state.coins.filter(c => c.symbol !== 'USDC').map(c => c.symbol).join(', ')],
          ['Final standing', 'Highest equity wins'],
          ['Entry fee', competition.stake],
        ].map(([k, v], i, arr) => (
          <View key={k}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <Text style={{ fontSize: 13, color: colors.ink3, flexShrink: 0 }}>{k}</Text>
              <Text
                style={{ fontWeight: '600', fontSize: 13, color: colors.ink, flex: 1, textAlign: 'right' }}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {v}
              </Text>
            </View>
            {i < arr.length - 1 && <View style={{ height: 1, backgroundColor: colors.hairline, marginTop: 8, opacity: 0.6 }} />}
          </View>
        ))}
        {CONTEST_CASH_PRIZES && (
          <TouchableOpacity
            onPress={() => Linking.openURL(LEGAL_URLS.rules)}
            style={{ marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.hairline }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.brand }}>
              Official contest rules & eligibility ›
            </Text>
            <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>
              Free to enter · no purchase necessary · 18+ · void where prohibited
            </Text>
          </TouchableOpacity>
        )}
      </Card>

      {/* Cash payouts (only when cash prizes are enabled) */}
      {CONTEST_CASH_PRIZES && competition.prizes.length > 0 && (
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

      {/* XP prizes (when cash prizes are off) */}
      {!CONTEST_CASH_PRIZES && xpPodium.length > 0 && (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontWeight: '700', color: colors.ink }}>XP prizes</Text>
            <Text style={{ fontSize: 11, color: colors.ink3 }}>Winner takes {competition.prizeXp.toLocaleString()} XP</Text>
          </View>
          {xpPodium.map((p, i) => (
            <View key={p.rank} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: i < xpPodium.length - 1 ? 1 : 0, borderBottomColor: colors.hairline }}>
              <Text style={{ fontSize: 13, color: colors.ink }}>#{p.rank}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Trophy color={colors.up} size={14} strokeWidth={2} />
                <Text style={{ fontWeight: '700', fontSize: 13, color: colors.up, fontVariant: ['tabular-nums'] }}>
                  {p.xp.toLocaleString()} XP
                </Text>
              </View>
            </View>
          ))}
          {canClaimXp && (
            <Button variant="brand" style={{ marginTop: 12 }} onPress={claimContestXp}>
              Claim {myPrizeXp.toLocaleString()} XP
            </Button>
          )}
          {!CONTEST_CASH_PRIZES && competition.status === 'finished' && contestXpClaimed && myPrizeXp > 0 && (
            <Text style={{ marginTop: 10, textAlign: 'center', fontSize: 13, fontWeight: '700', color: colors.up }}>
              ✓ Claimed +{myPrizeXp.toLocaleString()} XP
            </Text>
          )}
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
        ) : (() => {
          const rows = [...entries]
            .sort((a, b) => b.bankroll - a.bankroll)
            .map((e, idx, arr) => {
              const liveRank = idx + 1;
              const prize = liveRank <= competition.prizes.length
                ? competition.prizes[liveRank - 1]
                : 0;
              const prizeXp = contestXpForRank(competition.prizeXp, liveRank);
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
                  {/* Name → public profile */}
                  <Pressable
                    onPress={() => openProfile(e.handle)}
                    hitSlop={6}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    <Avatar initials={e.handle.slice(0, 2).toUpperCase()} size="sm" />
                    <Text numberOfLines={1} style={{ fontWeight: '600', fontSize: 13, color: colors.ink, flexShrink: 1 }}>
                      @{e.handle}{isMe ? ' (you)' : ''}
                    </Text>
                  </Pressable>
                  {/* Balance → contest portfolio popup */}
                  <Pressable
                    onPress={() => openBalance(e.handle)}
                    hitSlop={6}
                    style={{ alignItems: 'flex-end', paddingHorizontal: 8 }}
                  >
                    <Text style={{ fontWeight: '700', fontSize: 13, color: colors.ink, fontVariant: ['tabular-nums'] }}>
                      ${Math.round(e.bankroll).toLocaleString()}
                    </Text>
                    <Text style={{ fontSize: 11, color: e.pnlPct >= 0 ? colors.up : colors.down, fontVariant: ['tabular-nums'] }}>
                      {e.pnlPct >= 0 ? '+' : ''}{e.pnlPct.toFixed(1)}%
                    </Text>
                  </Pressable>
                  <Text style={{
                    width: 56,
                    textAlign: 'right',
                    fontWeight: '700',
                    fontSize: 13,
                    color: (CONTEST_CASH_PRIZES ? prize : prizeXp) > 0 ? colors.up : colors.ink3,
                    fontVariant: ['tabular-nums'],
                  }}>
                    {CONTEST_CASH_PRIZES
                      ? (prize > 0 ? `$${prize.toLocaleString()}` : '—')
                      : (prizeXp > 0 ? `${prizeXp.toLocaleString()} XP` : '—')}
                  </Text>
                </View>
              );
            });
          // Show 6 players at a time; the rest scroll within the leaderboard
          // itself (nestedScrollEnabled so it works inside the screen's scroll).
          return entries.length > 6 ? (
            <ScrollView style={{ maxHeight: 330 }} nestedScrollEnabled showsVerticalScrollIndicator>
              {rows}
            </ScrollView>
          ) : <>{rows}</>;
        })()}
      </Card>

      {/* Footer */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {lockedOut ? (
          <View
            style={{
              flex: 1, alignItems: 'center', justifyContent: 'center',
              borderRadius: 14, borderWidth: 1, borderColor: colors.hairline,
              backgroundColor: colors.surface2, paddingVertical: 14,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink3 }}>Locked</Text>
          </View>
        ) : (
          <Button
            testID={joined ? 'tournament-leave-btn' : 'tournament-join-btn'}
            variant="ghost"
            style={{ flex: 1 }}
            onPress={handleJoinLeave}
          >
            {joined ? 'Leave' : 'Join'}
          </Button>
        )}
        <Button
          variant="brand"
          style={{ flex: 1 }}
          onPress={() => {
            // Switch into this contest's portfolio so trades use its $100K buying
            // power, then go to Markets to pick a coin to trade.
            if (joined && state.activePortfolioId !== competitionId) {
              dispatch({ type: 'SWITCH_PORTFOLIO', portfolioId: competitionId });
            }
            nav.navigate('MainTabs', { screen: 'Markets' });
          }}
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

      {/* Contest-portfolio popup for a tapped player's balance */}
      <Modal visible={!!portfolioView} transparent animationType="fade" onRequestClose={() => setPortfolioView(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
          onPress={() => setPortfolioView(null)}
        >
          <Pressable
            style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingBottom: 28 }}
            onPress={() => {}}
          >
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.hairline, marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 10 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>
                @{portfolioView?.handle}'s portfolio
              </Text>
              <TouchableOpacity onPress={() => setPortfolioView(null)} hitSlop={8}>
                <X color={colors.ink3} size={20} />
              </TouchableOpacity>
            </View>
            {portfolioView?.loading ? (
              <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : !portfolioView?.data ? (
              <Text style={{ paddingHorizontal: 20, fontSize: 13, color: colors.ink3 }}>
                Couldn't load this player's contest portfolio.
              </Text>
            ) : (() => {
              const d = portfolioView.data;
              const holdingsValue = d.holdings.reduce((s, h) => {
                const c = state.coins.find(x => x.symbol === h.symbol);
                return s + (c ? c.price * h.units : 0);
              }, 0);
              const total = d.cash + holdingsValue;
              const pnl = ((total - STARTING_CASH) / STARTING_CASH) * 100;
              return (
                <View style={{ paddingHorizontal: 20 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
                    <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] }}>
                      ${total.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: pnl >= 0 ? colors.up : colors.down, fontVariant: ['tabular-nums'] }}>
                      {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
                    </Text>
                  </View>
                  <ScrollView style={{ maxHeight: 340 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink }}>Cash</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] }}>
                        ${d.cash.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                    {d.holdings.length === 0 ? (
                      <Text style={{ fontSize: 12, color: colors.ink3, paddingVertical: 12 }}>
                        All cash — no open positions.
                      </Text>
                    ) : (
                      [...d.holdings]
                        .map(h => {
                          const c = state.coins.find(x => x.symbol === h.symbol);
                          const value = c ? c.price * h.units : 0;
                          return { h, value };
                        })
                        .sort((a, b) => b.value - a.value)
                        .map(({ h, value }, i, arr) => (
                          <View key={h.symbol} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.hairline }}>
                            <CoinGlyph symbol={h.symbol} size={32} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontWeight: '600', color: colors.ink }}>{h.symbol}</Text>
                              <Text style={{ fontSize: 12, color: colors.ink3, fontVariant: ['tabular-nums'] }}>
                                {h.units < 1 ? h.units.toFixed(4) : h.units.toFixed(2)} units · {total > 0 ? Math.round((value / total) * 100) : 0}%
                              </Text>
                            </View>
                            <Text style={{ fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>
                              ${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                            </Text>
                          </View>
                        ))
                    )}
                  </ScrollView>
                </View>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenShell>
  );
}
