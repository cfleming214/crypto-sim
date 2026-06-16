import React from 'react';
import { View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { X } from 'lucide-react-native';
import { WalkthroughNavigator } from '../navigation/WalkthroughNavigator';

// Replays the original W1–W8 guided-trade walkthrough on demand (from the
// Profile "Old walkthrough" row). The old flow's finish/skip only flip the
// onboarding flag (already true here), so they don't dismiss anything — we
// overlay our own close button that pops this modal back to Profile.
export function OldWalkthroughScreen() {
  const nav = useNavigation<any>();
  return (
    <View style={{ flex: 1 }}>
      <WalkthroughNavigator />
      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, right: 0 }}>
        <Pressable
          onPress={() => nav.goBack()}
          hitSlop={10}
          style={{
            margin: 12, width: 36, height: 36, borderRadius: 18,
            backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X color="#FFFFFF" size={20} />
        </Pressable>
      </SafeAreaView>
    </View>
  );
}
