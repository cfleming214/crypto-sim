import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { Card } from './Card';
import { Button } from './Button';
import { PressableScale } from './PressableScale';
import { FadeInUp } from './FadeInUp';
import { useTheme } from '../../theme/ThemeContext';
import { Check, X } from 'lucide-react-native';
import type { QuizQuestion } from '../../data/academy';

// Quick end-of-lesson check. Steps through one question at a time; tapping an
// option reveals the answer + explanation, then "Continue". Learning-first: you
// can continue after seeing the answer even if you missed it.
export function Quiz({ questions, onComplete }: { questions: QuizQuestion[]; onComplete: () => void }) {
  const { colors } = useTheme();
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const q = questions[idx];
  const answered = picked !== null;
  const last = idx + 1 >= questions.length;

  const next = () => {
    if (last) { onComplete(); return; }
    setIdx(idx + 1);
    setPicked(null);
  };

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Quick check{questions.length > 1 ? ` · ${idx + 1}/${questions.length}` : ''}
      </Text>
      <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink, lineHeight: 24 }}>{q.question}</Text>

      <View style={{ gap: 8 }}>
        {q.options.map((opt, i) => {
          const correct = i === q.correctIndex;
          const showCorrect = answered && correct;
          const showWrong = answered && i === picked && !correct;
          const bg = showCorrect ? `${colors.up}1A` : showWrong ? `${colors.down}1A` : colors.surface;
          const border = showCorrect ? colors.up : showWrong ? colors.down : colors.hairline;
          return (
            <PressableScale
              key={i}
              disabled={answered}
              onPress={() => setPicked(i)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: border, backgroundColor: bg,
              }}
            >
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.ink }}>{opt}</Text>
              {showCorrect && <Check color={colors.up} size={18} strokeWidth={2.5} />}
              {showWrong && <X color={colors.down} size={18} strokeWidth={2.5} />}
            </PressableScale>
          );
        })}
      </View>

      {answered && (
        <FadeInUp distance={6} style={{ gap: 12 }}>
          <Card variant="tinted">
            <Text style={{ fontSize: 12, fontWeight: '700', color: picked === q.correctIndex ? colors.up : colors.warn }}>
              {picked === q.correctIndex ? 'Correct!' : 'Not quite.'}
            </Text>
            <Text style={{ fontSize: 13, color: colors.ink2, marginTop: 4, lineHeight: 20 }}>{q.explain}</Text>
          </Card>
          <Button variant="brand" onPress={next}>{last ? 'Finish lesson' : 'Next question'}</Button>
        </FadeInUp>
      )}
    </View>
  );
}
