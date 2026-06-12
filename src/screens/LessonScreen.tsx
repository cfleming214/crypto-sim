import React, { useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Quiz } from '../components/ui/Quiz';
import { RiskMeter } from '../components/ui/RiskMeter';
import { CandleChart } from '../components/charts/CandleChart';
import { AreaChart } from '../components/charts/AreaChart';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/ui/Toast';
import { ACADEMY, lessonById, type LessonVisual, type TryIt } from '../data/academy';
import { Sparkles } from 'lucide-react-native';

// Render **bold** spans inline.
function RichText({ text, color }: { text: string; color: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text style={{ fontSize: 15, color, lineHeight: 23 }}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <Text key={i} style={{ fontWeight: '800', color }}>{p.slice(2, -2)}</Text>
          : <Text key={i}>{p}</Text>,
      )}
    </Text>
  );
}

function Visual({ kind }: { kind: LessonVisual }) {
  const { colors } = useTheme();
  if (kind === 'candles') return <View style={{ marginHorizontal: -8 }}><CandleChart height={150} timeframe="24H" basePrice={64000} /></View>;
  if (kind === 'chart')   return <View style={{ marginHorizontal: -8 }}><AreaChart height={120} /></View>;
  if (kind === 'risk')    return <RiskMeter score={78} />;
  if (kind === 'feargreed') {
    const bands = [['Extreme fear', colors.up], ['Fear', colors.warn], ['Neutral', colors.ink3], ['Greed', colors.warn], ['Extreme greed', colors.down]] as const;
    return (
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {bands.map(([label, c]) => (
          <View key={label} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <View style={{ height: 6, alignSelf: 'stretch', borderRadius: 3, backgroundColor: c }} />
            <Text style={{ fontSize: 8.5, color: colors.ink3, textAlign: 'center' }}>{label}</Text>
          </View>
        ))}
      </View>
    );
  }
  if (kind === 'leagues') {
    const tiers = [['Bronze', '#A97142'], ['Silver', '#9AA0A6'], ['Gold', '#E0B85E'], ['Diamond', '#5AC8E8'], ['Platinum', '#B39DDB']] as const;
    return (
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {tiers.map(([t, c]) => (
          <View key={t} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: `${c}22`, borderWidth: 1, borderColor: c }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: c }}>{t}</Text>
          </View>
        ))}
      </View>
    );
  }
  return null;
}

type Step = { type: 'section'; index: number } | { type: 'try' } | { type: 'quiz' };

export function LessonScreen() {
  const { colors } = useTheme();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { state, dispatch } = useApp();
  const { show, celebrate } = useToast();

  const lessonId: string = route.params?.lessonId;
  const lesson = useMemo(() => lessonById(lessonId), [lessonId]);

  const steps: Step[] = useMemo(() => {
    if (!lesson) return [];
    const out: Step[] = lesson.sections.map((_, i) => ({ type: 'section', index: i }));
    if (lesson.tryIt) out.push({ type: 'try' });
    out.push({ type: 'quiz' });
    return out;
  }, [lesson]);

  const [i, setI] = useState(0);
  const [tryDone, setTryDone] = useState(false);

  // Baseline for auto-detecting that the user actually did the "try it" action.
  const baseline = useRef<number | string | null>(null);
  const metric = useCallback((check?: TryIt['check']): number | string | null => {
    switch (check) {
      case 'trade':     return state.trades.length;
      case 'alert':     return state.priceAlerts.length + state.triggeredAlerts.length;
      case 'limit':     return state.pendingOrders.length;
      case 'stop':      return Object.keys(state.stopLosses).length;
      case 'watchlist': return state.watchlist.length;
      case 'daily':     return state.lastClaimDay ?? '';
      default:          return null;
    }
  }, [state]);

  // On returning to the lesson, see if the try-it metric advanced.
  useFocusEffect(useCallback(() => {
    const cur = steps[i];
    if (cur?.type === 'try' && lesson?.tryIt?.check) {
      const now = metric(lesson.tryIt.check);
      if (baseline.current !== null && now !== baseline.current) setTryDone(true);
    }
  }, [i, steps, lesson, metric]));

  if (!lesson) {
    return <ScreenShell title="Lesson"><Text style={{ color: colors.ink3 }}>Lesson not found.</Text></ScreenShell>;
  }

  const cur = steps[i];
  const advance = () => setI(n => Math.min(n + 1, steps.length - 1));

  const completeLesson = () => {
    const wasDone = state.academyCompleted.includes(lesson.id);
    dispatch({ type: 'COMPLETE_LESSON', lessonId: lesson.id, xp: lesson.xp, total: ACADEMY.length });
    if (!wasDone) {
      show({ title: `Lesson complete · +${lesson.xp} XP`, subtitle: lesson.title, icon: Sparkles, variant: 'up' });
      celebrate();
    }
    nav.goBack();
  };

  const openTryIt = () => {
    baseline.current = metric(lesson.tryIt!.check);
    nav.navigate(lesson.tryIt!.target.name, lesson.tryIt!.target.params);
  };

  return (
    <ScreenShell eyebrow={`${lesson.emoji}  ${lesson.category}`} title={lesson.title} scrollable={false} style={{ flex: 1 }}>
      <View style={{ flex: 1, paddingHorizontal: 20, gap: 16 }}>
        <ProgressBar step={i + 1} total={steps.length} />

        <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 16 }} showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          {cur.type === 'section' && (() => {
            const s = lesson.sections[cur.index];
            return (
              <View style={{ gap: 14 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 }}>{s.heading}</Text>
                {s.visual && <Visual kind={s.visual} />}
                <RichText text={s.body} color={colors.ink2} />
              </View>
            );
          })()}

          {cur.type === 'try' && lesson.tryIt && (
            <Card variant="tinted" style={{ gap: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.brand, textTransform: 'uppercase', letterSpacing: 0.5 }}>Try it</Text>
              <Text style={{ fontSize: 15, color: colors.ink, lineHeight: 22 }}>{lesson.tryIt.hint}</Text>
              <Button variant="brand" onPress={openTryIt}>{lesson.tryIt.cta}</Button>
              {tryDone && (
                <Text style={{ fontSize: 12, color: colors.up, fontWeight: '700' }}>✓ Nice — you did it!</Text>
              )}
            </Card>
          )}

          {cur.type === 'quiz' && <Quiz questions={lesson.quiz} onComplete={completeLesson} />}
        </ScrollView>

        {/* Footer controls (the quiz renders its own continue button) */}
        {cur.type !== 'quiz' && (
          <View style={{ flexDirection: 'row', gap: 10, paddingBottom: 16 }}>
            {i > 0 && <Button variant="ghost" style={{ flex: 1 }} onPress={() => setI(n => n - 1)}>Back</Button>}
            {cur.type === 'section' && (
              <Button variant="brand" style={{ flex: 2 }} onPress={advance}>
                Continue
              </Button>
            )}
            {cur.type === 'try' && (
              <Button variant={tryDone ? 'brand' : 'surface'} style={{ flex: 2 }} onPress={advance}>
                {tryDone ? 'Continue' : 'Skip for now'}
              </Button>
            )}
          </View>
        )}
      </View>
    </ScreenShell>
  );
}
