import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { FadeInUp } from '../components/ui/FadeInUp';
import { useTheme } from '../theme/ThemeContext';
import { categoryColors, categoryColorsDark, gradients, gradientsDark } from '../theme/tokens';
import { useApp } from '../store/AppContext';
import { ACADEMY, ACADEMY_CATEGORIES, CATEGORY_META } from '../data/academy';
import { Check, ChevronRight, GraduationCap } from 'lucide-react-native';

export function LearnScreen() {
  const { colors, isDark } = useTheme();
  const nav = useNavigation<any>();
  const { state } = useApp();
  const cats = isDark ? categoryColorsDark : categoryColors;
  const heroGrad = isDark ? gradientsDark.brandHero : gradients.brandHero;

  const done = new Set(state.academyCompleted);
  const total = ACADEMY.length;
  const doneCount = ACADEMY.filter(l => done.has(l.id)).length;
  const earnedXp = ACADEMY.filter(l => done.has(l.id)).reduce((s, l) => s + l.xp, 0);
  const totalXp = ACADEMY.reduce((s, l) => s + l.xp, 0);
  const graduated = doneCount >= total;
  const nextId = ACADEMY.find(l => !done.has(l.id))?.id;
  const pct = total ? doneCount / total : 0;

  // Animate the hero progress fill on mount / when progress changes.
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fill, { toValue: pct, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [pct, fill]);
  const fillWidth = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <ScreenShell title="Learn" eyebrow="Crypto Academy">
      {/* Gradient hero */}
      <FadeInUp>
        <Card gradient={heroGrad} style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <GraduationCap color="#FFFFFF" size={24} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF' }}>
                {graduated ? 'Graduate 🎓' : 'Learn crypto, earn XP'}
              </Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
                {doneCount}/{total} lessons · {earnedXp}/{totalXp} XP
              </Text>
            </View>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
            <Animated.View style={{ height: 6, borderRadius: 3, backgroundColor: '#FFFFFF', width: fillWidth }} />
          </View>
          {!graduated && (
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', lineHeight: 18 }}>
              Bite-sized lessons on crypto and the app. Each one: a quick read, a hands-on try, and a check — then XP.
            </Text>
          )}
        </Card>
      </FadeInUp>

      {/* Lessons by category */}
      {ACADEMY_CATEGORIES.map((category, ci) => {
        const lessons = ACADEMY.filter(l => l.category === category);
        const cat = cats[category];
        const CatIcon = CATEGORY_META[category]?.icon;
        return (
          <FadeInUp key={category} index={ci + 1} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: cat.soft, alignItems: 'center', justifyContent: 'center' }}>
                {CatIcon && <CatIcon color={cat.color} size={14} strokeWidth={2.2} />}
              </View>
              <Text style={{ fontSize: 13, fontWeight: '800', color: cat.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {category}
              </Text>
            </View>
            <Card variant="noPad">
              {lessons.map((l, idx) => {
                const isDone = done.has(l.id);
                const isNext = l.id === nextId;
                return (
                  <CardSection key={l.id} last={idx === lessons.length - 1} onPress={() => nav.navigate('Lesson', { lessonId: l.id })}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{
                        width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: isDone ? `${colors.up}22` : cat.soft,
                        borderWidth: isDone ? 0 : 1,
                        borderColor: isDone ? 'transparent' : `${cat.color}55`,
                      }}>
                        {isDone ? <Check color={colors.up} size={20} strokeWidth={2.5} /> : <Text style={{ fontSize: 18 }}>{l.emoji}</Text>}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }} numberOfLines={1}>{l.title}</Text>
                        <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>{l.minutes} min · +{l.xp} XP</Text>
                      </View>
                      {isNext && <Chip variant="accent">Next</Chip>}
                      {isDone && !isNext && <Chip variant="up">Done</Chip>}
                      <ChevronRight color={colors.ink3} size={18} strokeWidth={1.75} />
                    </View>
                  </CardSection>
                );
              })}
            </Card>
          </FadeInUp>
        );
      })}
    </ScreenShell>
  );
}
