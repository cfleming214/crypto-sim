import React, { useEffect, useState } from 'react';
import { Modal, View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { gradients, gradientsDark } from '../../theme/tokens';
import { Button } from './Button';
import { ConfettiBurst } from './ConfettiBurst';

interface RewardModalProps {
  visible: boolean;
  onClose: () => void;
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  /** The reward line, e.g. "+100 XP · +$50". */
  rewardLabel: string;
  cta?: string;
}

// Full-screen claim / level-up celebration: gradient card + confetti. Shared by
// the quest chest, season-tier claims, and league promotions. Visual only.
export function RewardModal({ visible, onClose, icon: Icon, title, subtitle, rewardLabel, cta = 'Collect' }: RewardModalProps) {
  const { isDark } = useTheme();
  const grad = isDark ? gradientsDark.brandHero : gradients.brandHero;
  const [burst, setBurst] = useState(0);
  useEffect(() => { if (visible) setBurst(b => b + 1); }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <ConfettiBurst trigger={burst} />
        <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: '100%', borderRadius: 24, padding: 28, alignItems: 'center', gap: 12 }}>
          {Icon && (
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon color="#FFFFFF" size={32} strokeWidth={2} />
            </View>
          )}
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' }}>{title}</Text>
          {subtitle ? <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 20 }}>{subtitle}</Text> : null}
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF', marginTop: 2 }}>{rewardLabel}</Text>
          <Button variant="surface" fullWidth onPress={onClose} style={{ marginTop: 8 }}>{cta}</Button>
        </LinearGradient>
      </View>
    </Modal>
  );
}
