import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { Text } from './Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { ConfettiBurst } from './ConfettiBurst';

// App-wide toast + confetti host. Mount <ToastProvider> once near the root; any
// screen calls useToast().show({...}) for a transient banner, or celebrate()
// for a confetti burst. No haptics. Built on RN Animated (no extra deps).

type ToastVariant = 'brand' | 'up' | 'warn';

export interface ToastInput {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  variant?: ToastVariant;
}

interface ToastItem extends ToastInput { id: number; }

interface ToastCtx {
  show: (t: ToastInput) => void;
  celebrate: () => void;
}

const Ctx = createContext<ToastCtx>({ show: () => {}, celebrate: () => {} });
export const useToast = () => useContext(Ctx);

let counter = 1;
const TOAST_MS = 3400;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [confetti, setConfetti] = useState(0);

  const dismiss = useCallback((id: number) => {
    setItems(prev => prev.filter(x => x.id !== id));
  }, []);

  const show = useCallback((t: ToastInput) => {
    const id = counter++;
    setItems(prev => [...prev, { ...t, id }]);
    setTimeout(() => dismiss(id), TOAST_MS);
  }, [dismiss]);

  const celebrate = useCallback(() => setConfetti(c => c + 1), []);

  return (
    <Ctx.Provider value={{ show, celebrate }}>
      {children}
      <ToastHost items={items} onDismiss={dismiss} />
      <ConfettiBurst trigger={confetti} />
    </Ctx.Provider>
  );
}

function ToastHost({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  const insets = useSafeAreaInsets();
  if (items.length === 0) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + 6, left: 0, right: 0, alignItems: 'center', gap: 8 }}
    >
      {items.map(item => (
        <ToastCard key={item.id} item={item} onDismiss={() => onDismiss(item.id)} />
      ))}
    </View>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [anim]);

  const variant = item.variant ?? 'brand';
  const accent = variant === 'up' ? colors.up : variant === 'warn' ? colors.warn : colors.brand;
  const Icon = item.icon;

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] });

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY }],
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        maxWidth: 380,
        width: '90%',
        backgroundColor: colors.elevated ?? colors.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.hairline,
        paddingVertical: 12,
        paddingHorizontal: 14,
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
      }}
    >
      {Icon && (
        <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: `${accent}1A`, alignItems: 'center', justifyContent: 'center' }}>
          <Icon color={accent} size={18} strokeWidth={1.9} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }} numberOfLines={1}>{item.title}</Text>
        {!!item.subtitle && (
          <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 1 }} numberOfLines={2}>{item.subtitle}</Text>
        )}
      </View>
    </Animated.View>
  );
}
