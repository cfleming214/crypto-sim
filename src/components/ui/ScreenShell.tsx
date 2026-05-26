import React from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar, SafeAreaView, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, fontSize } from '../../theme/tokens';

interface ScreenShellProps {
  eyebrow?: string;
  title?: string;
  rightActions?: React.ReactNode;
  children?: React.ReactNode;
  scrollable?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  brand?: boolean; // dark background splash
}

export function ScreenShell({
  eyebrow,
  title,
  rightActions,
  children,
  scrollable = true,
  style,
  contentStyle,
  brand = false,
}: ScreenShellProps) {
  const { colors, isDark } = useTheme();
  const bg = brand ? colors.brand : colors.surface;
  const ink = brand ? colors.brandOn : colors.ink;

  const content = (
    <View style={[{ flex: 1, gap: 14, paddingHorizontal: 20, paddingBottom: 20 }, contentStyle]}>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: bg }, style]}>
      <StatusBar barStyle={isDark || brand ? 'light-content' : 'dark-content'} backgroundColor={bg} />

      {/* Header */}
      {(eyebrow || title || rightActions) && (
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            {eyebrow && (
              <Text style={[styles.eyebrow, { color: brand ? `${colors.brandOn}99` : colors.ink3 }]}>
                {eyebrow.toUpperCase()}
              </Text>
            )}
            {title && (
              <Text style={[styles.title, { color: ink }]}>{title}</Text>
            )}
          </View>
          {rightActions && <View style={styles.rightActions}>{rightActions}</View>}
        </View>
      )}

      {scrollable ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 14, paddingHorizontal: 20, paddingBottom: 32, paddingTop: 4 }}
        >
          {children}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.44,
    marginBottom: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.44,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
