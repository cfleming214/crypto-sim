import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, Animated, Easing, useWindowDimensions, StyleProp, ViewStyle } from 'react-native';
import { Text } from '../components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import {
  LineChart, Trophy, Copy, ChevronLeft, GraduationCap,
  Flame, TrendingUp, TrendingDown, Zap, Gem, Check, Target,
  Repeat, Brain, Shield,
} from 'lucide-react-native';
import { useApp } from '../store/AppContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { ACADEMY } from '../data/academy';

// Self-contained dark palette matching the design handoff tokens. The
// walkthrough renders dark regardless of system theme (it's an immersive,
// branded first-run splash), so it uses fixed values rather than useTheme().
const C = {
  bg: '#080c0a',
  surface: '#0f1410',
  card: '#131a14',
  border: '#1e2820',
  green: '#2BF06A',
  greenDark: '#13D257',
  glow: 'rgba(43,240,106,0.16)',
  text: '#e8ede9',
  muted: '#7a887c',
  down: '#FF4D6A',
  gold: '#FFD93D',
  goldSoft: 'rgba(255,200,50,0.07)',
  goldBorder: 'rgba(255,200,50,0.22)',
};

const EASE_OUT = Easing.out(Easing.cubic);
const EASE_BOUNCE = Easing.bezier(0.34, 1.3, 0.64, 1);

// ── Motion primitives ───────────────────────────────────────────────────────

type RevealFrom = 'up' | 'right' | 'scale';
function Reveal({ active, delay = 0, from = 'up', style, children }: {
  active: boolean; delay?: number; from?: RevealFrom; style?: StyleProp<ViewStyle>; children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) { p.setValue(0); return; }
    if (reduced) { p.setValue(1); return; }
    const anim = Animated.timing(p, {
      toValue: 1,
      duration: from === 'scale' ? 480 : 440,
      delay,
      easing: from === 'scale' ? EASE_BOUNCE : EASE_OUT,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [active, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  const transform =
    from === 'up' ? [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }]
    : from === 'right' ? [{ translateX: p.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) }]
    : [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }) }];
  return <Animated.View style={[style, { opacity: p, transform }]}>{children}</Animated.View>;
}

// Counts from `from` → `to` while active, easeOutCubic. Honors reduced motion.
function useCountUp(from: number, to: number, active: boolean, duration = 1700, delay = 0) {
  const reduced = useReducedMotion();
  const [val, setVal] = useState(from);
  useEffect(() => {
    if (!active) { setVal(from); return; }
    if (reduced) { setVal(to); return; }
    let raf = 0; let start = 0;
    const begin = setTimeout(() => {
      const tick = (ts: number) => {
        if (!start) start = ts;
        const e = Math.min(1, (ts - start) / duration);
        const eased = 1 - Math.pow(1 - e, 3);
        setVal(from + (to - from) * eased);
        if (e < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(begin); if (raf) cancelAnimationFrame(raf); };
  }, [active, from, to, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  return val;
}

// Animated-width progress fill (0..1). Width can't use the native driver.
function Bar({ active, to, delay = 0, height = 6, track = C.border, fill = C.green }: {
  active: boolean; to: number; delay?: number; height?: number; track?: string; fill?: string;
}) {
  const reduced = useReducedMotion();
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) { w.setValue(0); return; }
    if (reduced) { w.setValue(to); return; }
    const anim = Animated.timing(w, { toValue: to, duration: 1400, delay, easing: EASE_OUT, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [active, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  const width = w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      <Animated.View style={{ height, borderRadius: height / 2, backgroundColor: fill, width }} />
    </View>
  );
}

// ── Leaf visuals (inlined for exact fidelity on the dark canvas) ─────────────

const COIN_COLORS: Record<string, string> = { BTC: '#F7931A', ETH: '#627EEA', SOL: '#14F195', DOGE: '#C2A633' };
function CoinDot({ sym, size = 32 }: { sym: string; size?: number }) {
  const col = COIN_COLORS[sym] ?? '#888888';
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: `${col}22`, borderWidth: 1, borderColor: `${col}55`,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: col, fontWeight: '700', fontSize: size * 0.42 }}>{sym[0]}</Text>
    </View>
  );
}

let chartId = 0;
function MiniChart({ data, height = 96, active, delay = 0 }: { data: number[]; height?: number; active: boolean; delay?: number }) {
  const gid = useRef(`oc${chartId++}`).current;
  const W = 300;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * W,
    y: height - ((v - min) / range) * height * 0.82 - height * 0.09,
  }));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const cx = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * 0.5;
    d += ` C ${cx} ${pts[i - 1].y}, ${cx} ${pts[i].y}, ${pts[i].x} ${pts[i].y}`;
  }
  const area = `${d} L ${W} ${height} L 0 ${height} Z`;
  return (
    <Reveal active={active} delay={delay}>
      <View style={{ height }}>
        <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
          <Defs>
            <SvgGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={C.green} stopOpacity="0.28" />
              <Stop offset="1" stopColor={C.green} stopOpacity="0" />
            </SvgGradient>
          </Defs>
          <Path d={area} fill={`url(#${gid})`} />
          <Path d={d} stroke={C.green} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
    </Reveal>
  );
}

function SlideHead({ active, eyebrow, title, sub }: { active: boolean; eyebrow: string; title: string; sub: string }) {
  return (
    <View style={{ marginBottom: 22 }}>
      <Reveal active={active} delay={80}>
        <Text style={{ color: C.green, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' }}>{eyebrow}</Text>
      </Reveal>
      <Reveal active={active} delay={200}>
        <Text style={{ color: C.text, fontSize: 26, fontWeight: '700', lineHeight: 32, marginTop: 8 }}>{title}</Text>
      </Reveal>
      <Reveal active={active} delay={320}>
        <Text style={{ color: C.muted, fontSize: 14, lineHeight: 20, marginTop: 8 }}>{sub}</Text>
      </Reveal>
    </View>
  );
}

function uiCard(extra?: ViewStyle): ViewStyle {
  return { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: 'hidden', ...extra };
}

// A coin/lesson list row used on several slides.
function ListRow({ active, delay, left, title, sub, right }: {
  active: boolean; delay: number; left: React.ReactNode; title: string; sub: string; right: React.ReactNode;
}) {
  return (
    <Reveal active={active} delay={delay} from="right">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 }}>
        {left}
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>{title}</Text>
          <Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{sub}</Text>
        </View>
        {right}
      </View>
    </Reveal>
  );
}

// ── Slides ──────────────────────────────────────────────────────────────────

function SlideWelcome({ active }: { active: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <Reveal active={active} from="scale">
        <LinearGradient colors={['#1c2722', '#080b09']} style={{ width: 90, height: 90, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}>
          <Svg width="34" height="24" viewBox="0 0 17 12">
            <Path d="M0 5h3v7H0z" fill={C.green} fillOpacity={0.4} />
            <Path d="M4.5 3.5h3v8.5h-3z" fill={C.green} fillOpacity={0.6} />
            <Path d="M9 1.5h3v10.5H9z" fill={C.green} fillOpacity={0.8} />
            <Path d="M13.5 0h3.5v12h-3.5z" fill={C.green} />
          </Svg>
        </LinearGradient>
      </Reveal>
      <Reveal active={active} delay={280}>
        <Text style={{ fontSize: 30, letterSpacing: -1, color: C.text }}>
          <Text style={{ fontWeight: '500' }}>Crypto</Text><Text style={{ fontWeight: '700' }}>Comp</Text>
        </Text>
      </Reveal>
      <Reveal active={active} delay={440}>
        <Text style={{ fontSize: 21, fontWeight: '700', color: C.green }}>Trade. Compete. Win.</Text>
      </Reveal>
      <View style={{ width: '100%', gap: 10, marginTop: 18 }}>
        {[
          { icon: LineChart, label: 'Paper-trade on live prices', sub: 'Real market data, zero risk', delay: 640 },
          { icon: Trophy, label: 'Compete in live tournaments', sub: 'Daily sprints, weekly brackets & 1v1s', delay: 820 },
          { icon: Copy, label: "Mirror top traders' moves", sub: 'Copy trades in real time', delay: 1000 },
        ].map(f => (
          <Reveal key={f.label} active={active} delay={f.delay}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 13, paddingVertical: 13, paddingHorizontal: 15 }}>
              <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: C.glow, alignItems: 'center', justifyContent: 'center' }}>
                <f.icon color={C.green} size={18} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '600' }}>{f.label}</Text>
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 1 }}>{f.sub}</Text>
              </View>
            </View>
          </Reveal>
        ))}
      </View>
    </View>
  );
}

function SlidePortfolio({ active }: { active: boolean }) {
  const value = useCountUp(0, 12847.32, active, 1700, 850);
  const holdings = [
    { sym: 'BTC', name: 'Bitcoin', units: '0.0691', price: '6,512.40', chg: '+4.2%', up: true },
    { sym: 'ETH', name: 'Ethereum', units: '0.84', price: '2,957.10', chg: '+1.8%', up: true },
    { sym: 'SOL', name: 'Solana', units: '6.9', price: '1,353.42', chg: '−2.1%', up: false },
  ];
  return (
    <View style={{ flex: 1 }}>
      <SlideHead active={active} eyebrow="Portfolio" title="Track your P&L in real time" sub="See holdings, performance, and your overall return — all in one glance." />
      <Reveal active={active} delay={480}>
        <View style={uiCard()}>
          <View style={{ padding: 18, paddingBottom: 8 }}>
            <Text style={{ color: C.muted, fontSize: 11 }}>Total value</Text>
            <Text style={{ color: C.text, fontSize: 30, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] }}>
              ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={{ color: C.green, fontSize: 13, fontWeight: '600', marginTop: 2 }}>↑ +$2,847.32 · 28.47%</Text>
          </View>
          <MiniChart active={active} delay={860} height={96} data={[10000, 10180, 9980, 10420, 10650, 10380, 11020, 11380, 11820, 11680, 12260, 12640, 12847]} />
          <View style={{ borderTopWidth: 1, borderTopColor: C.border }}>
            {holdings.map((h, i) => (
              <ListRow
                key={h.sym} active={active} delay={1560 + i * 180}
                left={<CoinDot sym={h.sym} />}
                title={h.sym} sub={`${h.units} ${h.sym}`}
                right={
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: C.text, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>${h.price}</Text>
                    <Text style={{ color: h.up ? C.green : C.down, fontSize: 11, marginTop: 2 }}>{h.chg}</Text>
                  </View>
                }
              />
            ))}
          </View>
        </View>
      </Reveal>
    </View>
  );
}

function SlideMarkets({ active }: { active: boolean }) {
  const coins = [
    { sym: 'BTC', name: 'Bitcoin · $1.86T', price: '94,237', chg: '+2.3%', up: true },
    { sym: 'ETH', name: 'Ethereum · $432B', price: '3,584', chg: '+1.8%', up: true },
    { sym: 'SOL', name: 'Solana · $96B', price: '198.40', chg: '−2.1%', up: false },
    { sym: 'DOGE', name: 'Dogecoin · $58B', price: '0.412', chg: '+5.4%', up: true },
  ];
  return (
    <View style={{ flex: 1 }}>
      <SlideHead active={active} eyebrow="Markets" title="Stay ahead of every move" sub="Real-time prices, market caps, and trending movers across the whole crypto market." />
      <Reveal active={active} delay={480}>
        <View style={[uiCard(), { flexDirection: 'row', marginBottom: 12 }]}>
          <View style={{ flex: 1, padding: 16, borderRightWidth: 1, borderRightColor: C.border }}>
            <Text style={{ color: C.muted, fontSize: 11 }}>Total market cap</Text>
            <Text style={{ color: C.text, fontSize: 17, fontWeight: '700', marginTop: 3 }}>$3.42T</Text>
            <Text style={{ color: C.green, fontSize: 11, marginTop: 2 }}>+2.1%</Text>
          </View>
          <View style={{ flex: 1, padding: 16 }}>
            <Text style={{ color: C.muted, fontSize: 11 }}>Fear &amp; Greed</Text>
            <Text style={{ color: C.text, fontSize: 17, fontWeight: '700', marginTop: 3 }}>64</Text>
            <Text style={{ color: C.gold, fontSize: 11, marginTop: 2 }}>Greed</Text>
          </View>
        </View>
      </Reveal>
      <Reveal active={active} delay={620}>
        <View style={uiCard()}>
          {coins.map((c, i) => (
            <View key={c.sym} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.border }}>
              <ListRow
                active={active} delay={760 + i * 180}
                left={<CoinDot sym={c.sym} />}
                title={c.sym} sub={c.name}
                right={
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: C.text, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>${c.price}</Text>
                    <Text style={{ color: c.up ? C.green : C.down, fontSize: 11, marginTop: 2 }}>{c.chg}</Text>
                  </View>
                }
              />
            </View>
          ))}
        </View>
      </Reveal>
    </View>
  );
}

function SlideTrade({ active }: { active: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <SlideHead active={active} eyebrow="Trade" title="Buy or sell in seconds" sub="Pick any asset, set your size, and execute — all with simulated funds." />
      <Reveal active={active} delay={480}>
        <View style={{ marginBottom: 14 }}>
          <Text style={{ color: C.muted, fontSize: 13 }}>BTC / USD</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
            <Text style={{ color: C.text, fontSize: 34, fontWeight: '700', fontVariant: ['tabular-nums'] }}>$94,237.00</Text>
            <View style={{ backgroundColor: C.glow, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: C.green, fontSize: 12, fontWeight: '700' }}>↑ +2.34%</Text>
            </View>
            <Text style={{ color: C.muted, fontSize: 12 }}>24h</Text>
          </View>
        </View>
      </Reveal>
      <MiniChart active={active} delay={740} height={108} data={[92800, 92400, 93100, 92900, 93600, 93300, 94000, 93700, 94400, 94100, 94600, 94237]} />
      <Reveal active={active} delay={1080} style={{ marginTop: 14 }}>
        <View style={[uiCard(), { padding: 14, gap: 12 }]}>
          <View style={{ flexDirection: 'row', backgroundColor: C.surface, borderRadius: 10, padding: 3 }}>
            {['Buy', 'Sell', 'Limit'].map((t, i) => (
              <View key={t} style={{ flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center', backgroundColor: i === 0 ? C.glow : 'transparent' }}>
                <Text style={{ color: i === 0 ? C.green : C.muted, fontSize: 13, fontWeight: '700' }}>{t}</Text>
              </View>
            ))}
          </View>
          {[['Amount', '$1,000.00'], ['Est. received', '0.01061 BTC']].map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: C.muted, fontSize: 13 }}>{k}</Text>
              <Text style={{ color: C.text, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{v}</Text>
            </View>
          ))}
          <View style={{ backgroundColor: C.glow, borderWidth: 1, borderColor: `${C.green}55`, borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}>
            <Text style={{ color: C.green, fontSize: 15, fontWeight: '700' }}>Buy BTC</Text>
          </View>
        </View>
      </Reveal>
      <Reveal active={active} delay={1500} style={{ marginTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderWidth: 1, borderColor: `${C.green}44`, borderRadius: 14, padding: 14 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
            <Check color={C.green} size={20} strokeWidth={3} />
          </View>
          <View>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>Order Filled</Text>
            <Text style={{ color: C.muted, fontSize: 12, marginTop: 1 }}>Bought 0.01061 BTC · $1,000</Text>
          </View>
        </View>
      </Reveal>
    </View>
  );
}

function SlideAcademy({ active }: { active: boolean }) {
  const lessons = ACADEMY.slice(0, 3);
  const badges = [
    { icon: Flame, earned: true }, { icon: TrendingUp, earned: true }, { icon: Trophy, earned: true },
    { icon: Zap, earned: false }, { icon: Gem, earned: false },
  ];
  return (
    <View style={{ flex: 1 }}>
      <SlideHead active={active} eyebrow="Academy" title="Learn crypto, earn XP" sub="Bite-sized lessons on crypto, charts & strategy — each one earns XP and levels you up." />
      <Reveal active={active} delay={480}>
        <LinearGradient colors={['#172414', '#0f1c0f']} style={{ borderRadius: 16, borderWidth: 1, borderColor: `${C.green}44`, padding: 16, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: C.glow, alignItems: 'center', justifyContent: 'center' }}>
              <GraduationCap color={C.green} size={22} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>Crypto Academy</Text>
              <Text style={{ color: C.muted, fontSize: 12, marginTop: 1 }}>14 lessons · up to 580 XP</Text>
            </View>
          </View>
          <View style={{ marginTop: 12 }}>
            <Bar active={active} to={0.21} delay={760} track="rgba(255,255,255,0.1)" />
          </View>
        </LinearGradient>
      </Reveal>
      <Reveal active={active} delay={620}>
        <View style={uiCard()}>
          {lessons.map((l, i) => (
            <View key={l.id} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.border }}>
              <ListRow
                active={active} delay={760 + i * 160}
                left={
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: C.glow, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 17 }}>{l.emoji}</Text>
                  </View>
                }
                title={l.title} sub={`${l.minutes} min · ${l.category}`}
                right={
                  i === 2 ? (
                    <View style={{ backgroundColor: C.glow, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ color: C.green, fontSize: 11, fontWeight: '700' }}>Done</Text>
                    </View>
                  ) : (
                    <View style={{ backgroundColor: C.glow, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ color: C.green, fontSize: 11, fontWeight: '700' }}>+{l.xp} XP</Text>
                    </View>
                  )
                }
              />
            </View>
          ))}
        </View>
      </Reveal>
      <Reveal active={active} delay={1320} from="scale" style={{ marginTop: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>Achievements</Text>
          <Text style={{ color: C.muted, fontSize: 12 }}>Unlock as you play</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {badges.map((b, i) => (
            <View key={i} style={{
              width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
              backgroundColor: b.earned ? 'rgba(43,240,106,0.1)' : C.surface,
              borderWidth: 1, borderColor: b.earned ? `${C.green}66` : C.border,
              opacity: b.earned ? 1 : 0.4,
            }}>
              <b.icon color={b.earned ? C.green : C.muted} size={22} strokeWidth={2} />
            </View>
          ))}
        </View>
      </Reveal>
    </View>
  );
}

function SlideCompete({ active }: { active: boolean }) {
  const rank = useCountUp(4847, 23, active, 2000, 1100);
  return (
    <View style={{ flex: 1 }}>
      <SlideHead active={active} eyebrow="Compete" title="Climb the ranks, earn XP." sub="Join daily tournaments, build your XP, and reach Diamond league." />
      <Reveal active={active} delay={480}>
        <View style={{ backgroundColor: C.green, borderRadius: 16, padding: 18, marginBottom: 12 }}>
          <Text style={{ color: 'rgba(4,19,10,0.6)', fontSize: 11, fontWeight: '600', letterSpacing: 0.6 }}>GOLD II · DAY 12 OF 30</Text>
          <Text style={{ color: '#04130a', fontSize: 26, fontWeight: '700', marginTop: 4, fontVariant: ['tabular-nums'] }}>3,240 / 6,000 XP</Text>
          <View style={{ marginTop: 10 }}>
            <Bar active={active} to={0.54} delay={900} height={7} track="rgba(4,19,10,0.15)" fill="rgba(4,19,10,0.45)" />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12 }}>
            <Text style={{ color: 'rgba(4,19,10,0.6)', fontSize: 12, fontWeight: '600' }}>Your global rank</Text>
            <Text style={{ color: '#04130a', fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] }}>#{Math.round(rank).toLocaleString()}</Text>
          </View>
        </View>
      </Reveal>
      <Reveal active={active} delay={640}>
        <View style={[uiCard(), { padding: 16, marginBottom: 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.down }} />
            <Text style={{ color: C.muted, fontSize: 12 }}>Live · 4h 12m left</Text>
          </View>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', marginTop: 6 }}>Weekend Warriors</Text>
          <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>$10K bankroll · 1,284 players</Text>
          <View style={{ flexDirection: 'row', marginTop: 14 }}>
            {[['Your rank', '#23', C.green], ['Top prize', '5,000 XP', C.gold], ['P&L', '+18.4%', C.green]].map(([k, v, col], i) => (
              <View key={k} style={{ flex: 1, borderRightWidth: i < 2 ? 1 : 0, borderRightColor: C.border, alignItems: 'center' }}>
                <Text style={{ color: C.muted, fontSize: 11 }}>{k}</Text>
                <Text style={{ color: col as string, fontSize: 15, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] }}>{v}</Text>
              </View>
            ))}
          </View>
        </View>
      </Reveal>
      <Reveal active={active} delay={800}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.goldSoft, borderWidth: 1, borderColor: C.goldBorder, borderRadius: 12, padding: 14 }}>
          <Trophy color={C.gold} size={20} strokeWidth={2} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.muted, fontSize: 11 }}>Weekly prize pool</Text>
            <Text style={{ color: C.gold, fontSize: 19, fontWeight: '700' }}>25,000 XP</Text>
          </View>
        </View>
      </Reveal>
      <Reveal active={active} delay={980} from="scale" style={{ marginTop: 12 }}>
        <View style={{ backgroundColor: C.goldSoft, borderWidth: 1, borderColor: C.goldBorder, borderRadius: 12, padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.gold }} />
            <Text style={{ color: C.gold, fontSize: 13, fontWeight: '700' }}>💰 Real money prizes — coming soon</Text>
          </View>
          <Text style={{ color: 'rgba(255,200,50,0.65)', fontSize: 11, marginTop: 4, marginLeft: 16 }}>Cash tournaments are on the roadmap</Text>
        </View>
      </Reveal>
    </View>
  );
}

function SlideCopyTrade({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active || reduced) { glow.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.timing(glow, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ]));
    const t = setTimeout(() => loop.start(), 2100);
    return () => { clearTimeout(t); loop.stop(); };
  }, [active, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  const shadowRadius = glow.interpolate({ inputRange: [0, 1], outputRange: [10, 26] });
  const shadowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.8] });
  return (
    <View style={{ flex: 1 }}>
      <SlideHead active={active} eyebrow="Copy Trade" title="Mirror top traders automatically" sub="Follow expert traders and clone their positions in real time — no research needed." />
      <Reveal active={active} delay={480}>
        <View style={[uiCard(), { padding: 16, marginBottom: 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(98,104,143,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#b9c0e0', fontSize: 14, fontWeight: '700' }}>MO</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>@moonshot</Text>
              <Text style={{ color: C.muted, fontSize: 12, marginTop: 1 }}>388 trades · 68% win rate</Text>
            </View>
            <View style={{ backgroundColor: C.glow, borderWidth: 1, borderColor: `${C.green}66`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: C.green, fontSize: 11, fontWeight: '700' }}>Diamond</Text>
            </View>
          </View>
        </View>
      </Reveal>
      <Reveal active={active} delay={640}>
        <View style={[uiCard(), { flexDirection: 'row', marginBottom: 12 }]}>
          {[['All-time P&L', '+147.8%', C.green], ['Win rate', '68%', C.green], ['Trades', '388', C.text]].map(([k, v, col], i) => (
            <View key={k} style={{ flex: 1, padding: 14, alignItems: 'center', borderRightWidth: i < 2 ? 1 : 0, borderRightColor: C.border }}>
              <Text style={{ color: C.muted, fontSize: 11 }}>{k}</Text>
              <Text style={{ color: col as string, fontSize: 15, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] }}>{v}</Text>
            </View>
          ))}
        </View>
      </Reveal>
      <Reveal active={active} delay={800}>
        <View style={[uiCard(), { padding: 12 }]}>
          <MiniChart active={active} delay={1060} height={88} data={[100, 108, 104, 118, 126, 120, 138, 132, 150, 158, 148]} />
        </View>
      </Reveal>
      <Animated.View style={{
        marginTop: 16, borderRadius: 14, overflow: 'visible',
        shadowColor: C.green, shadowOffset: { width: 0, height: 4 }, shadowRadius, shadowOpacity,
      }}>
        <LinearGradient colors={[C.green, C.greenDark]} style={{ height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#04130a', fontSize: 16, fontWeight: '700' }}>Start Mirroring · $2,000</Text>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

function SlidePrediction({ active }: { active: boolean }) {
  const xp = useCountUp(0, 1500, active, 1200, 1960);
  return (
    <View style={{ flex: 1 }}>
      <SlideHead active={active} eyebrow="Mini-game" title="Call the next move" sub="Predict whether a coin goes up or down in 60 seconds — win XP and build a streak." />
      <Reveal active={active} delay={480}>
        <View style={[uiCard(), { padding: 18, alignItems: 'center' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <CoinDot sym="BTC" size={22} />
            <Text style={{ color: C.muted, fontSize: 13 }}>BTC · Live price</Text>
          </View>
          <Text style={{ color: C.text, fontSize: 32, fontWeight: '700', marginTop: 6, fontVariant: ['tabular-nums'] }}>$94,237</Text>
          <Text style={{ color: C.green, fontSize: 13, fontWeight: '600', marginTop: 2 }}>▲ 0.18% vs locked $94,070</Text>
          <View style={{ width: '100%', marginTop: 16, gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: C.muted, fontSize: 12 }}>Round ends in</Text>
              <Text style={{ color: C.text, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] }}>0:42</Text>
            </View>
            <Bar active={active} to={0.7} delay={760} height={7} />
          </View>
        </View>
      </Reveal>
      <Reveal active={active} delay={680}>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: 14, backgroundColor: C.glow, borderWidth: 1, borderColor: `${C.green}66` }}>
            <TrendingUp color={C.green} size={18} strokeWidth={2.4} />
            <Text style={{ color: C.green, fontSize: 15, fontWeight: '700' }}>Higher</Text>
          </View>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.border }}>
            <TrendingDown color={C.muted} size={18} strokeWidth={2.4} />
            <Text style={{ color: C.muted, fontSize: 15, fontWeight: '700' }}>Lower</Text>
          </View>
        </View>
      </Reveal>
      <Reveal active={active} delay={1960} from="scale" style={{ marginTop: 14 }}>
        <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: `${C.green}55`, borderRadius: 16, padding: 16, alignItems: 'center', gap: 6 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.glow, alignItems: 'center', justifyContent: 'center' }}>
            <Target color={C.green} size={24} strokeWidth={2} />
          </View>
          <Text style={{ color: C.green, fontSize: 18, fontWeight: '800' }}>You won! 🎯</Text>
          <Text style={{ color: C.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] }}>+{Math.round(xp).toLocaleString()} XP</Text>
          <Text style={{ color: C.green, fontSize: 12, fontWeight: '600' }}>🔥 3 in a row · +500 streak bonus</Text>
        </View>
      </Reveal>
    </View>
  );
}

function SlideRisk({ active }: { active: boolean }) {
  const Trigger = ({ delay, accent, tag, Icon, label, detail }: { delay: number; accent: string; tag: string; Icon: typeof Shield; label: string; detail: string }) => (
    <Reveal active={active} delay={delay}>
      <View style={[uiCard(), { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }]}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${accent}1A`, alignItems: 'center', justifyContent: 'center' }}>
          <Icon color={accent} size={20} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{label}</Text>
          <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{detail}</Text>
        </View>
        <View style={{ backgroundColor: `${accent}1A`, borderWidth: 1, borderColor: `${accent}66`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ color: accent, fontSize: 11, fontWeight: '800' }}>{tag}</Text>
        </View>
      </View>
    </Reveal>
  );
  return (
    <View style={{ flex: 1 }}>
      <SlideHead active={active} eyebrow="Risk tools" title="Trade with a safety net" sub="Set auto stop-losses and buy-the-dip triggers — they fire for you while the app runs." />
      <Trigger delay={480} accent={C.down} tag="SELL" Icon={Shield} label="BTC stop-loss · −10%" detail="Auto-sells your position at ≈ $57,600" />
      <Trigger delay={640} accent={C.green} tag="BUY" Icon={TrendingDown} label="ETH buy the dip · $500" detail="Buys automatically if price falls to $3,100" />
      <Reveal active={active} delay={1280} from="scale">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderWidth: 1, borderColor: `${C.green}44`, borderRadius: 14, padding: 14, marginTop: 2 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.glow, alignItems: 'center', justifyContent: 'center' }}>
            <Check color={C.green} size={18} strokeWidth={3} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>Stop-loss triggered</Text>
            <Text style={{ color: C.muted, fontSize: 12, marginTop: 1 }}>Sold 0.42 BTC at $57,600 — loss capped, hands-free.</Text>
          </View>
        </View>
      </Reveal>
    </View>
  );
}

function SlideDaily({ active }: { active: boolean }) {
  const claim = useCountUp(0, 250, active, 1000, 900);
  const quests = [
    { Icon: Repeat, title: 'Make 3 trades', sub: '2 of 3 done', xp: 60, done: false },
    { Icon: Brain, title: 'Make a price prediction', sub: 'Complete', xp: 40, done: true },
    { Icon: GraduationCap, title: 'Finish an Academy lesson', sub: '0 of 1 done', xp: 50, done: false },
  ];
  return (
    <View style={{ flex: 1 }}>
      <SlideHead active={active} eyebrow="Daily rewards" title="Show up, stack rewards" sub="Claim a daily bonus, keep your streak alive, and clear quests for XP every single day." />
      <Reveal active={active} delay={480}>
        <LinearGradient colors={['#172414', '#0f1c0f']} style={{ borderRadius: 16, borderWidth: 1, borderColor: `${C.green}44`, padding: 16, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(255,159,64,0.16)', alignItems: 'center', justifyContent: 'center' }}>
              <Flame color="#FF9F40" size={24} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>7-day streak</Text>
              <Text style={{ color: C.muted, fontSize: 12, marginTop: 1 }}>Come back daily to grow your bonus</Text>
            </View>
            <View style={{ backgroundColor: C.green, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 }}>
              <Text style={{ color: '#04130a', fontWeight: '800', fontSize: 13 }}>Claim +{Math.round(claim)}</Text>
            </View>
          </View>
        </LinearGradient>
      </Reveal>
      <Reveal active={active} delay={640}>
        <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>Today's quests</Text>
        <View style={uiCard()}>
          {quests.map((q, i) => (
            <View key={q.title} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.border }}>
              <ListRow
                active={active} delay={760 + i * 160}
                left={<View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: C.glow, alignItems: 'center', justifyContent: 'center' }}><q.Icon color={C.green} size={17} strokeWidth={2} /></View>}
                title={q.title} sub={q.sub}
                right={q.done
                  ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Check color={C.green} size={15} strokeWidth={3} /><Text style={{ color: C.green, fontSize: 11, fontWeight: '700' }}>Done</Text></View>
                  : <View style={{ backgroundColor: C.glow, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ color: C.green, fontSize: 11, fontWeight: '700' }}>+{q.xp} XP</Text></View>
                }
              />
            </View>
          ))}
        </View>
      </Reveal>
    </View>
  );
}

function SlideReplay({ active }: { active: boolean }) {
  const eras = [
    { title: 'Crypto Winter 2022', sub: 'LUNA · FTX collapse', tag: '−65%', down: true },
    { title: 'COVID Crash', sub: '5 days · March 2020', tag: '−50%', down: true },
    { title: '2017 ICO Boom', sub: 'Jul → Dec 2017', tag: '+420%', down: false },
  ];
  return (
    <View style={{ flex: 1 }}>
      <SlideHead active={active} eyebrow="Time machine" title="Replay crypto history" sub="Trade real past markets at your own speed — the 2021 bull run, the FTX crash, and more." />
      <Reveal active={active} delay={480}>
        <View style={uiCard()}>
          <View style={{ padding: 16, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>The 2021 Bull Run</Text>
              <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>Nov 2020 → May 2021 · BTC $13K → $64K</Text>
            </View>
            <View style={{ backgroundColor: C.glow, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: C.green, fontSize: 11, fontWeight: '800' }}>+393% BTC</Text>
            </View>
          </View>
          <MiniChart active={active} delay={760} height={92} data={[13000, 15500, 18000, 24000, 29000, 33000, 40000, 47000, 42000, 55000, 58000, 61500, 64000]} />
        </View>
      </Reveal>
      <Reveal active={active} delay={640}>
        <View style={[uiCard(), { marginTop: 12 }]}>
          {eras.map((e, i) => (
            <View key={e.title} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.border }}>
              <ListRow
                active={active} delay={820 + i * 160}
                left={
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: e.down ? `${C.down}1A` : C.glow, alignItems: 'center', justifyContent: 'center' }}>
                    {e.down ? <TrendingDown color={C.down} size={17} /> : <TrendingUp color={C.green} size={17} />}
                  </View>
                }
                title={e.title} sub={e.sub}
                right={<Text style={{ color: e.down ? C.down : C.green, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{e.tag}</Text>}
              />
            </View>
          ))}
        </View>
      </Reveal>
    </View>
  );
}

const SLIDES = [
  SlideWelcome, SlidePortfolio, SlideMarkets, SlideTrade, SlideRisk,
  SlideAcademy, SlideDaily, SlideCompete, SlidePrediction, SlideReplay, SlideCopyTrade,
];

// ── Root carousel ────────────────────────────────────────────────────────────

export function OnboardingWalkthrough() {
  const { width } = useWindowDimensions();
  const { dispatch } = useApp();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const goTo = (i: number) => {
    const clamped = Math.max(0, Math.min(SLIDES.length - 1, i));
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
    setIndex(clamped);
  };

  const finish = async () => {
    await AsyncStorage.setItem('hasOnboarded', 'true');
    const rewarded = await AsyncStorage.getItem('onboardingRewarded');
    if (!rewarded) {
      dispatch({ type: 'ADD_XP', amount: 50 });
      await AsyncStorage.setItem('onboardingRewarded', '1');
    }
    dispatch({ type: 'SET_ONBOARDED' });
  };

  const onCta = () => { if (index >= SLIDES.length - 1) finish(); else goTo(index + 1); };
  const isLast = index === SLIDES.length - 1;
  const ctaLabel = index === 0 ? 'Get Started' : isLast ? 'Start Trading' : 'Next';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Ambient green glow near the top */}
      <View pointerEvents="none" style={{ position: 'absolute', top: -160, alignSelf: 'center', width: 460, height: 460, borderRadius: 230, backgroundColor: C.green, opacity: 0.06 }} />

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={e => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {SLIDES.map((Slide, i) => (
          <SafeAreaView key={i} style={{ width }} edges={['top', 'bottom']}>
            {/* Only mount the current slide and its neighbours — keeps the
                initial mount light and isolates any single slide. The fixed
                width keeps paging offsets correct for the unmounted ones. */}
            {Math.abs(i - index) <= 1 ? (
              <ScrollView
                contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 190, flexGrow: 1 }}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                <Slide active={index === i} />
              </ScrollView>
            ) : (
              <View style={{ flex: 1 }} />
            )}
          </SafeAreaView>
        ))}
      </ScrollView>

      {/* Fixed bottom navigation */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <LinearGradient colors={['rgba(8,12,10,0)', C.bg]} style={{ paddingTop: 40 }}>
          <SafeAreaView edges={['bottom']} style={{ paddingHorizontal: 24, paddingBottom: 8 }}>
            {/* Dots */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
              {SLIDES.map((_, i) => (
                <View key={i} style={{ width: i === index ? 26 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? C.green : 'rgba(255,255,255,0.18)' }} />
              ))}
            </View>
            {/* Buttons */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => goTo(index - 1)}
                disabled={index === 0}
                style={{
                  width: 52, height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
                  opacity: index === 0 ? 0 : 1,
                }}
              >
                <ChevronLeft color={C.text} size={22} />
              </Pressable>
              <Pressable onPress={onCta} style={{ flex: 1 }}>
                <LinearGradient colors={[C.green, C.greenDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#03120a', fontSize: 16, fontWeight: '700' }}>{ctaLabel}</Text>
                </LinearGradient>
              </Pressable>
            </View>
            {/* Skip */}
            <Pressable onPress={finish} disabled={isLast} style={{ alignItems: 'center', paddingVertical: 12, opacity: isLast ? 0 : 1 }}>
              <Text style={{ color: C.muted, fontSize: 14 }}>Skip intro</Text>
            </Pressable>
          </SafeAreaView>
        </LinearGradient>
      </View>
    </View>
  );
}
