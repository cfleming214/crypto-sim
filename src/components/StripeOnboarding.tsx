import React from 'react';
import { View, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '../theme/ThemeContext';
import { LEGAL_BASE } from '../constants/legal';

// Renders Stripe Connect embedded onboarding inside a WebView so it looks fully
// in-app (no browser chrome). The actual onboarding UI is the Connect.js page
// hosted alongside the legal pages (docs/connect-onboarding.html). We inject the
// publishable key + the Account Session client secret (from the stripeConnect
// Lambda) before the page loads, and listen for the page's exit postMessage.
//
// The hosting domain must be registered in the Stripe Dashboard's embedded
// components allowed-domains list, and the app needs a native rebuild (the
// react-native-webview native module).

const ONBOARDING_URL = `${LEGAL_BASE}/connect-onboarding.html`;

interface Props {
  /** Account Session client secret from startOnboarding(). */
  clientSecret: string;
  /** Fired when the user finishes or backs out of onboarding. */
  onExit: () => void;
}

export function StripeOnboarding({ clientSecret, onExit }: Props) {
  const { colors } = useTheme();
  const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return (
      <View style={{ padding: 20 }}>
        <Text style={{ color: colors.down }}>
          Stripe publishable key not configured (EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY).
        </Text>
      </View>
    );
  }

  // Runs before the page's own scripts, so the globals are ready when connect.js
  // initializes. Must end with `true;` per react-native-webview's contract.
  const injected = `
    window.__STRIPE_PK__ = ${JSON.stringify(publishableKey)};
    window.__STRIPE_CLIENT_SECRET__ = ${JSON.stringify(clientSecret)};
    true;
  `;

  return (
    <View style={{ flex: 1, minHeight: 520, borderRadius: 12, overflow: 'hidden' }}>
      <WebView
        source={{ uri: ONBOARDING_URL }}
        injectedJavaScriptBeforeContentLoaded={injected}
        onMessage={(event) => {
          let type = '';
          try { type = JSON.parse(event.nativeEvent.data)?.type ?? ''; } catch { /* ignore */ }
          if (type === 'exit') onExit();
        }}
        // Stripe's hosted onboarding handles its own scrolling/keyboard.
        keyboardDisplayRequiresUserAction={false}
        originWhitelist={['https://*']}
        style={{ flex: 1, backgroundColor: 'transparent' }}
      />
    </View>
  );
}
