import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { ProgressBar } from '../components/ui/ProgressBar';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { ACADEMY, ACADEMY_CATEGORIES } from '../data/academy';
import { Check, ChevronRight, GraduationCap } from 'lucide-react-native';

export function LearnScreen() {
  const { colors } = useTheme();
  const nav = useNavigation<any>();
  const { state } = useApp();

  const done = new Set(state.academyCompleted);
  const total = ACADEMY.length;
  const doneCount = ACADEMY.filter(l => done.has(l.id)).length;
  const earnedXp = ACADEMY.filter(l => done.has(l.id)).reduce((s, l) => s + l.xp, 0);
  const totalXp = ACADEMY.reduce((s, l) => s + l.xp, 0);
  const graduated = doneCount >= total;
  // First not-yet-done lesson (the "next up").
  const nextId = ACADEMY.find(l => !done.has(l.id))?.id;

  return (
    <ScreenShell title="Learn" eyebrow="Crypto Academy">
      {/* Summary */}
      <Card variant="tinted" style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: graduated ? `${colors.up}22` : colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <GraduationCap color={graduated ? colors.up : colors.ink} size={24} strokeWidth={1.75} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>
              {graduated ? 'Graduate 🎓' : 'Learn crypto, earn XP'}
            </Text>
            <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
              {doneCount}/{total} lessons · {earnedXp}/{totalXp} XP
            </Text>
          </View>
        </View>
        <ProgressBar step={doneCount} total={total} />
        {!graduated && (
          <Text style={{ fontSize: 12, color: colors.ink3 }}>
            Bite-sized lessons on crypto and the app. Each one: a quick read, a hands-on try, and a check — then XP.
          </Text>
        )}
      </Card>

      {/* Lessons by category */}
      {ACADEMY_CATEGORIES.map(category => {
        const lessons = ACADEMY.filter(l => l.category === category);
        return (
          <View key={category} style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>
              {category}
            </Text>
            <Card variant="noPad">
              {lessons.map((l, idx) => {
                const isDone = done.has(l.id);
                const isNext = l.id === nextId;
                return (
                  <TouchableOpacity key={l.id} activeOpacity={0.7} onPress={() => nav.navigate('Lesson', { lessonId: l.id })}>
                    <CardSection last={idx === lessons.length - 1}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={{
                          width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: isDone ? `${colors.up}22` : colors.surface2,
                        }}>
                          {isDone ? <Check color={colors.up} size={20} strokeWidth={2.5} /> : <Text style={{ fontSize: 18 }}>{l.emoji}</Text>}
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }} numberOfLines={1}>{l.title}</Text>
                          <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>{l.minutes} min · +{l.xp} XP</Text>
                        </View>
                        {isNext && <Chip variant="brand">Next</Chip>}
                        {isDone && !isNext && <Chip variant="up">Done</Chip>}
                        <ChevronRight color={colors.ink3} size={18} strokeWidth={1.75} />
                      </View>
                    </CardSection>
                  </TouchableOpacity>
                );
              })}
            </Card>
          </View>
        );
      })}
    </ScreenShell>
  );
}
