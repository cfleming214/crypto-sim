import React from 'react';
import { View, ViewStyle } from 'react-native';
import { Text } from './Text';
import { useTheme } from '../../theme/ThemeContext';
import { radius } from '../../theme/tokens';
import { PressableScale } from './PressableScale';

interface SegmentedProps {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  variant?: 'pill' | 'tabs';
  style?: ViewStyle;
}

export function Segmented({ options, value, onChange, variant = 'pill', style }: SegmentedProps) {
  const { colors } = useTheme();

  if (variant === 'tabs') {
    return (
      <View
        style={[
          {
            flexDirection: 'row',
            borderBottomWidth: 1,
            borderBottomColor: colors.hairline,
            gap: 22,
          },
          style,
        ]}
      >
        {options.map(opt => {
          const active = opt === value;
          return (
            <PressableScale key={opt} onPress={() => onChange(opt)} style={{ paddingVertical: 10, position: 'relative' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: active ? colors.ink : colors.ink3 }}>{opt}</Text>
              {active && (
                <View
                  style={{
                    position: 'absolute',
                    bottom: -1,
                    left: 0,
                    right: 0,
                    height: 2,
                    backgroundColor: colors.ink,
                  }}
                />
              )}
            </PressableScale>
          );
        })}
      </View>
    );
  }

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          backgroundColor: colors.surface2,
          borderRadius: radius.pill,
          padding: 3,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      {options.map(opt => {
        const active = opt === value;
        return (
          <PressableScale
            key={opt}
            onPress={() => onChange(opt)}
            style={[
              {
                paddingVertical: 6,
                paddingHorizontal: 14,
                borderRadius: radius.pill,
                backgroundColor: active ? colors.surface : 'transparent',
              },
              active && {
                shadowColor: '#141414',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 1,
                elevation: 1,
              },
            ]}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: active ? colors.ink : colors.ink3, whiteSpace: 'nowrap' } as any}>{opt}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
