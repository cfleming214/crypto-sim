import React from 'react';
import { View, Text, ScrollView, StyleSheet, ViewStyle, TouchableOpacity, RefreshControl as RNRefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
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
  brand?: boolean;
  onRefresh?: () => Promise<void>;
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
  onRefresh,
}: ScreenShellProps) {
  const { colors, isDark } = useTheme();
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = React.useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  }, [onRefresh]);
  const navigation = useNavigation();
  const canGoBack = navigation.canGoBack();
  const bg = brand ? colors.brand : colors.surface;
  const ink = brand ? colors.brandOn : colors.ink;

  const content = (
    <View style={[{ flex: 1, gap: 14, paddingHorizontal: 20, paddingBottom: 8 }, contentStyle]}>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: bg }, style]}>
      <StatusBar style={isDark || brand ? 'light' : 'dark'} />

      {/* Header */}
      {(eyebrow || title || rightActions || canGoBack) && (
        <View style={styles.header}>
          {canGoBack && (
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 4, padding: 4 }}>
              <ChevronLeft color={ink} size={26} strokeWidth={1.75} />
            </TouchableOpacity>
          )}
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
          contentContainerStyle={{ gap: 14, paddingHorizontal: 20, paddingBottom: 8, paddingTop: 4 }}
          refreshControl={onRefresh ? (
            <RNRefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          ) : undefined}
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
