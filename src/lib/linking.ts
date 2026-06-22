import { Linking, Alert } from 'react-native';

// Open an external URL without ever throwing. Linking.openURL rejects with
// "Unable to open URL" transiently on iOS (e.g. while the app is mid-transition),
// and our legal links called it bare — so a tap could throw and surface in Sentry.
// Swallow it with a friendly fallback instead.
export async function openExternal(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Couldn’t open the link', `Please try again, or open it in your browser:\n\n${url}`);
  }
}
