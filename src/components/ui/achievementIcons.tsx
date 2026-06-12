import React from 'react';
import {
  Star, ArrowLeftRight, Flame, Gem, Shield, Users, Trophy, Crown,
  TrendingUp, Rocket, Target, Award, GraduationCap,
} from 'lucide-react-native';

// Maps an achievement def's `icon` string key (from gamification.ts, which stays
// React-free) to a lucide component for rendering. Unknown keys fall back to a
// generic award icon.
const ICONS: Record<string, React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>> = {
  Star, ArrowLeftRight, Flame, Gem, Shield, Users, Trophy, Crown, TrendingUp, Rocket, Target, GraduationCap,
};

export function achievementIcon(key: string) {
  return ICONS[key] ?? Award;
}
