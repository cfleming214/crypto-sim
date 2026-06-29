import React from 'react';
import { View, Text } from 'react-native';
import { useAdTestMode } from '../lib/adTestMode';

// QA-only overlay. Renders nothing in real-ad mode; when AdMob test mode is on
// (OTA build flag or the in-app dev toggle) it shows a small non-interactive
// "ADS: TEST" tag so it's obvious at a glance which ad mode a build is running.
// Reactive — appears/disappears the moment the toggle flips. Never blocks touches.
export function AdsTestBadge() {
  const testMode = useAdTestMode();
  if (!testMode) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        bottom: 96,
        left: 8,
        zIndex: 9999,
        backgroundColor: 'rgba(217,119,6,0.92)',
        borderRadius: 6,
        paddingHorizontal: 7,
        paddingVertical: 3,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>ADS: TEST</Text>
    </View>
  );
}
