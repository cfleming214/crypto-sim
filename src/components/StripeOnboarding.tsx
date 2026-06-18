import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '../theme/ThemeContext';

// Opens Stripe-hosted Connect onboarding (an Account Link URL from the
// stripeConnect Lambda) inside a WebView so it looks in-app. Because Stripe
// hosts the page, there's NO embedded-components domain to allow-list and no
// publishable key to inject — we just load the URL and close when Stripe
// redirects back to our return_url. Still needs the react-native-webview native
// module, so a native build is required.

// Stripe redirects here (return_url / refresh_url, set in the Lambda) when the
// user finishes or the link expires — both mean "leave the WebView".
const RETURN_MATCH = '/payouts-return.html';

interface Props {
  /** Stripe-hosted Account Link URL from startOnboarding(). */
  url: string;
  /** Fired when the user finishes or backs out of onboarding. */
  onExit: () => void;
}

export function StripeOnboarding({ url, onExit }: Props) {
  const { colors } = useTheme();
  const handled = React.useRef(false);
  const finish = () => { if (!handled.current) { handled.current = true; onExit(); } };

  return (
    <View style={{ flex: 1, minHeight: 520, borderRadius: 12, overflow: 'hidden' }}>
      <WebView
        source={{ uri: url }}
        // Catch the return/refresh redirect before it loads (the page may not
        // exist) and close instead — onNavigationStateChange is the fallback.
        onShouldStartLoadWithRequest={(req) => {
          if (req.url.includes(RETURN_MATCH)) { finish(); return false; }
          return true;
        }}
        onNavigationStateChange={(nav) => {
          if (nav.url.includes(RETURN_MATCH)) finish();
        }}
        startInLoadingState
        renderLoading={() => (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
            <ActivityIndicator color={colors.brand} />
          </View>
        )}
        keyboardDisplayRequiresUserAction={false}
        originWhitelist={['https://*']}
        style={{ flex: 1, backgroundColor: 'transparent' }}
      />
    </View>
  );
}
