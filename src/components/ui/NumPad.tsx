import React from 'react';
import { View, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { Delete } from 'lucide-react-native';

interface NumPadProps {
  value: string;
  onChange: (v: string) => void;
  maxValue?: number;
  style?: ViewStyle;
}

const KEYS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['.', '0', 'DEL'],
];

export function NumPad({ value, onChange, maxValue, style }: NumPadProps) {
  const { colors } = useTheme();

  const handleKey = (key: string) => {
    if (key === 'DEL') {
      onChange(value.slice(0, -1) || '');
      return;
    }
    if (key === '.' && value.includes('.')) return;
    if (key === '.' && value === '') { onChange('0.'); return; }
    const next = value + key;
    if (maxValue !== undefined && parseFloat(next) > maxValue) return;
    // Limit to 2 decimal places
    const parts = next.split('.');
    if (parts[1] && parts[1].length > 2) return;
    onChange(next);
  };

  return (
    <View style={[{ gap: 8 }, style]}>
      {KEYS.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: 8 }}>
          {row.map(key => (
            <TouchableOpacity
              key={key}
              testID={`numpad-key-${key === '.' ? 'dot' : key === 'DEL' ? 'del' : key}`}
              style={{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 }}
              onPress={() => handleKey(key)}
              activeOpacity={0.7}
            >
              {key === 'DEL' ? (
                <Delete color={colors.ink} size={18} strokeWidth={1.75} />
              ) : (
                <Text style={{ fontSize: 20, fontWeight: '600', color: colors.ink }}>{key}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}
