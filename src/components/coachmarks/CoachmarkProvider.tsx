import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, type LayoutRectangle } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../theme/ThemeContext';
import { Lightbulb } from 'lucide-react-native';

// Live in-app coachmarks: a contextual spotlight tip overlaid on a real screen
// element, shown once and never repeated. Toggleable in Settings (Profile).
//
// A screen attaches a ref via useCoachmark(id, text); when focused (and tips are
// enabled + this id is unseen) the hook measures the target and the provider
// dims the screen, cuts a spotlight around it, and shows a tooltip with the tip.

type Rect = { x: number; y: number; w: number; h: number };
interface Mark { id: string; text: string; title?: string; rect: Rect }

interface CoachmarkCtx {
  enabled: boolean;
  ready: boolean;
  request: (m: Mark) => void;
  hasSeen: (id: string) => boolean;
  setEnabled: (b: boolean) => void;
  resetSeen: () => void;
}

const Ctx = createContext<CoachmarkCtx | null>(null);

const ENABLED_KEY = 'coachmarksEnabled';
const SEEN_KEY = 'coachmarksSeen';

export function CoachmarkProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState(true);
  const [ready, setReady] = useState(false);
  const seen = useRef<Set<string>>(new Set());
  const [active, setActive] = useState<Mark | null>(null);

  // Load persisted prefs once.
  useEffect(() => {
    (async () => {
      try {
        const [e, s] = await Promise.all([AsyncStorage.getItem(ENABLED_KEY), AsyncStorage.getItem(SEEN_KEY)]);
        if (e !== null) setEnabledState(e === '1');
        if (s) { const arr = JSON.parse(s); if (Array.isArray(arr)) seen.current = new Set(arr.filter((x: any) => typeof x === 'string')); }
      } catch { /* defaults */ }
      setReady(true);
    })();
  }, []);

  const persistSeen = () => AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seen.current])).catch(() => {});

  const request = (m: Mark) => {
    if (!enabled || active || seen.current.has(m.id)) return;
    if (!(m.rect.w > 0 && m.rect.h > 0)) return;
    setActive(m);
  };
  const dismiss = () => {
    if (active) { seen.current.add(active.id); persistSeen(); }
    setActive(null);
  };
  const setEnabled = (b: boolean) => {
    setEnabledState(b);
    AsyncStorage.setItem(ENABLED_KEY, b ? '1' : '0').catch(() => {});
    if (!b) setActive(null);
  };
  const resetSeen = () => { seen.current = new Set(); persistSeen(); };

  const value = useMemo<CoachmarkCtx>(() => ({
    enabled, ready, request, hasSeen: (id) => seen.current.has(id), setEnabled, resetSeen,
  }), [enabled, ready, active]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1 }}>
      <Ctx.Provider value={value}>{children}</Ctx.Provider>
      {active && <CoachmarkOverlay mark={active} onDismiss={dismiss} onDisable={() => setEnabled(false)} />}
    </View>
  );
}

function CoachmarkOverlay({ mark, onDismiss, onDisable }: { mark: Mark; onDismiss: () => void; onDisable: () => void }) {
  const { colors } = useTheme();
  const { width: SW, height: SH } = Dimensions.get('window');
  const r = mark.rect;
  const pad = 6;
  const hole = { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), w: r.w + pad * 2, h: r.h + pad * 2 };
  const dim = 'rgba(8,9,11,0.72)';
  const below = hole.y + hole.h < SH * 0.6;
  const tipTop = below ? hole.y + hole.h + 12 : undefined;
  const tipBottom = below ? undefined : SH - hole.y + 12;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Four dim panels around the spotlight (a tap anywhere dismisses) */}
      <TouchableOpacity activeOpacity={1} onPress={onDismiss} style={{ position: 'absolute', left: 0, top: 0, width: SW, height: hole.y, backgroundColor: dim }} />
      <TouchableOpacity activeOpacity={1} onPress={onDismiss} style={{ position: 'absolute', left: 0, top: hole.y + hole.h, width: SW, height: SH - (hole.y + hole.h), backgroundColor: dim }} />
      <TouchableOpacity activeOpacity={1} onPress={onDismiss} style={{ position: 'absolute', left: 0, top: hole.y, width: hole.x, height: hole.h, backgroundColor: dim }} />
      <TouchableOpacity activeOpacity={1} onPress={onDismiss} style={{ position: 'absolute', left: hole.x + hole.w, top: hole.y, width: SW - (hole.x + hole.w), height: hole.h, backgroundColor: dim }} />

      {/* Spotlight ring */}
      <View pointerEvents="none" style={{ position: 'absolute', left: hole.x, top: hole.y, width: hole.w, height: hole.h, borderRadius: 12, borderWidth: 2, borderColor: colors.brand }} />

      {/* Tooltip */}
      <View style={{ position: 'absolute', left: 16, right: 16, top: tipTop, bottom: tipBottom }}>
        <View style={{ backgroundColor: colors.elevated, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.hairline, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Lightbulb color={colors.brand} size={16} strokeWidth={2} />
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.ink }}>{mark.title ?? 'Tip'}</Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.ink2, lineHeight: 20 }}>{mark.text}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <TouchableOpacity onPress={onDisable} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 12, color: colors.ink3 }}>Turn off tips</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ backgroundColor: colors.brand, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.brandOn }}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

// Settings access (Profile toggle + reset).
export function useCoachmarkSettings() {
  const ctx = useContext(Ctx);
  return {
    enabled: ctx?.enabled ?? true,
    setEnabled: (b: boolean) => ctx?.setEnabled(b),
    resetSeen: () => ctx?.resetSeen(),
  };
}

// Attach the returned ref to a target View; when the screen focuses (and tips are
// enabled + this id unseen) a spotlight tip points at it. No-op without a provider.
export function useCoachmark(id: string, text: string, title?: string) {
  const ctx = useContext(Ctx);
  const ref = useRef<View>(null);

  useFocusEffect(useCallbackSafe(() => {
    if (!ctx || !ctx.ready || !ctx.enabled || ctx.hasSeen(id)) return;
    const t = setTimeout(() => {
      const node = ref.current as any;
      node?.measureInWindow?.((x: number, y: number, w: number, h: number) => {
        ctx.request({ id, text, title, rect: { x, y, w, h } });
      });
    }, 650);
    return () => clearTimeout(t);
  }, [ctx?.ready, ctx?.enabled, id, text, title]));

  return ref;
}

// Local alias so we don't shadow React's useCallback import name above.
function useCallbackSafe<T extends (...a: any[]) => any>(fn: T, deps: any[]): T {
  return React.useCallback(fn, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
