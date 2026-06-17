import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Trophy, TrendingUp, Copy, Rewind, Target } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';

// Auto-scrolling "what you get" hero shared by the auth landing (AuthWall) and
// the sign-in/up form (AuthScreen). Loops through the features every few
// seconds; manual swipe works too. Honors reduced motion.
const HERO_SLIDES = [
  { icon: Trophy,     title: 'Compete for prizes',   sub: 'Join daily tournaments and climb the global leaderboard.' },
  { icon: TrendingUp, title: 'Trade live markets',   sub: 'Paper-trade real crypto prices — $100K to start, zero risk.' },
  { icon: Copy,       title: 'Mirror top traders',   sub: "Copy expert traders' moves in real time." },
  { icon: Rewind,     title: 'Replay crypto history',sub: 'Trade the 2021 bull run, the FTX crash and more.' },
  { icon: Target,     title: 'Predict & earn XP',    sub: 'Call the next move, build streaks, climb the leagues.' },
];

export function FeatureHero({ colors }: { colors: ReturnType<typeof useTheme>['colors'] }) {
  const reduced = useReducedMotion();
  const ref = useRef<ScrollView>(null);
  const [w, setW] = useState(0);
  const [index, setIndex] = useState(0);
  const idxRef = useRef(0);
  idxRef.current = index;

  useEffect(() => {
    if (reduced || w === 0) return;
    const id = setInterval(() => {
      const next = (idxRef.current + 1) % HERO_SLIDES.length;
      ref.current?.scrollTo({ x: next * w, animated: true });
      setIndex(next);
    }, 3400);
    return () => clearInterval(id);
  }, [reduced, w]);

  return (
    <View>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onLayout={e => setW(e.nativeEvent.layout.width)}
        onMomentumScrollEnd={e => { if (w) setIndex(Math.round(e.nativeEvent.contentOffset.x / w)); }}
        style={{ height: 172 }}
      >
        {HERO_SLIDES.map((s, i) => (
          <View key={i} style={{ width: w || 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 10 }}>
            <View style={{ width: 66, height: 66, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
              <s.icon color={colors.brandOn} size={30} strokeWidth={1.9} />
            </View>
            <Text style={{ fontSize: 21, fontWeight: '800', color: colors.brandOn, textAlign: 'center', letterSpacing: -0.4 }}>{s.title}</Text>
            <Text style={{ fontSize: 13.5, color: `${colors.brandOn}CC`, textAlign: 'center', lineHeight: 19, paddingHorizontal: 6 }}>{s.sub}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 14 }}>
        {HERO_SLIDES.map((_, i) => (
          <View key={i} style={{ width: i === index ? 22 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? colors.brandOn : `${colors.brandOn}55` }} />
        ))}
      </View>
    </View>
  );
}
