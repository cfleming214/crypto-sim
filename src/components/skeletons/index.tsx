import React from 'react';
import { View } from 'react-native';
import { Skeleton, SkeletonText, SkeletonRow, SkeletonCircle, SkeletonCard } from '../ui/Skeleton';
import { radius } from '../../theme/tokens';

// Per-screen loading skeletons.
//
// Each one mirrors the real screen's structure — same card chrome, same row
// heights, same spacing — so content swaps in without the page jumping. A
// generic spinner tells you "something is happening"; these tell you *what's
// coming*, and make the wait feel shorter for it.
//
// Counts are deliberately a few rows short of a full screen: placeholder rows
// running past the fold imply more content than may actually arrive.

// News feed — mirrors NewsCard exactly: 92px thumbnail on the left, source +
// timestamp line, then the headline. Same padding/radius as the real card so the
// list doesn't reflow when articles land.
export function NewsListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 4, gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} style={{ flexDirection: 'row', gap: 12, padding: 12, borderRadius: 16 }}>
          <Skeleton width={92} height={92} br={12} />
          <View style={{ flex: 1, justifyContent: 'space-between', paddingVertical: 2 }}>
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Skeleton width={56} height={10} />
                <Skeleton width={38} height={10} />
              </View>
              <SkeletonText lines={2} height={13} gap={5} lastLineWidth="75%" />
            </View>
            <Skeleton width="55%" height={11} />
          </View>
        </SkeletonCard>
      ))}
    </View>
  );
}

// News stats strip — the tiles above the feed (see NewsStats).
export function NewsStatsSkeleton() {
  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingBottom: 12 }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <SkeletonCard key={i} style={{ flex: 1, padding: 12, gap: 8 }}>
          <Skeleton width={40} height={20} />
          <Skeleton width="80%" height={9} />
        </SkeletonCard>
      ))}
    </View>
  );
}

// Leaderboard / top traders — a "your standing" card, the sort toggle, then rows.
export function LeaderboardSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={{ gap: 12 }}>
      <SkeletonCard>
        <SkeletonRow avatarSize={44} />
      </SkeletonCard>
      <Skeleton height={34} br={radius.sm} />
      <SkeletonCard style={{ padding: 0, gap: 0 }}>
        {Array.from({ length: count }).map((_, i) => (
          <View key={i} style={{ paddingHorizontal: 14, paddingVertical: 13 }}>
            <SkeletonRow avatarSize={32} />
          </View>
        ))}
      </SkeletonCard>
    </View>
  );
}

// A trader/public profile — identity header, stat trio, chart, then holdings.
export function TraderProfileSkeleton() {
  return (
    <View style={{ gap: 14 }}>
      <SkeletonCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <SkeletonCircle size={56} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton height={15} width="45%" />
            <Skeleton height={11} width="30%" />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <View key={i} style={{ flex: 1, gap: 7 }}>
              <Skeleton height={16} width="70%" />
              <Skeleton height={9} width="55%" />
            </View>
          ))}
        </View>
      </SkeletonCard>
      <SkeletonCard>
        <Skeleton height={11} width={90} />
        <Skeleton height={140} br={radius.md} />
      </SkeletonCard>
      <SkeletonCard style={{ padding: 0, gap: 0 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={{ paddingHorizontal: 14, paddingVertical: 13 }}>
            <SkeletonRow avatarSize={30} />
          </View>
        ))}
      </SkeletonCard>
    </View>
  );
}

// Contest portfolio popup on the contest detail — cash line then holdings.
export function ContestPortfolioSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={{ paddingHorizontal: 20, paddingVertical: 6, gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Skeleton width={70} height={12} />
        <Skeleton width={90} height={12} />
      </View>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} avatarSize={28} />
      ))}
    </View>
  );
}

// Payouts / earnings list on Activity.
export function PayoutsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={{ gap: 0 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ paddingHorizontal: 14, paddingVertical: 14 }}>
          <SkeletonRow avatar={false} />
        </View>
      ))}
    </View>
  );
}

// Chart placeholder, sized to the chart it stands in for. Used as an overlay
// while history loads behind an already-mounted chart.
export function ChartSkeleton({ height = 170 }: { height?: number }) {
  return <Skeleton height={height} br={radius.md} />;
}

// Generic full-page fallback: a title block and a few cards. Used by screens
// whose loaded layout varies too much to mirror precisely.
export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <View style={{ gap: 14 }}>
      {Array.from({ length: cards }).map((_, i) => (
        <SkeletonCard key={i}>
          <Skeleton height={13} width="45%" />
          <SkeletonText lines={2} height={11} />
        </SkeletonCard>
      ))}
    </View>
  );
}
