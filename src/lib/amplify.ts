import '@aws-amplify/react-native';
import { Amplify } from 'aws-amplify';
import { createSecureTokenStorage } from './secureTokenStorage';

export let isAmplifyConfigured = false;

export function configureAmplify() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const outputs = require('../../amplify_outputs.json');
    if (outputs?.auth?.user_pool_id) {
      Amplify.configure(outputs);
      // Store Cognito tokens in the Keychain/Keystore (encrypted) instead of the
      // default plaintext AsyncStorage. Guarded: no-op until a native build
      // includes expo-secure-store (createSecureTokenStorage() returns null in
      // Expo Go / older binaries), so the AsyncStorage default keeps working over OTA.
      try {
        const secure = createSecureTokenStorage();
        if (secure) {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { cognitoUserPoolsTokenProvider } = require('aws-amplify/auth/cognito');
          cognitoUserPoolsTokenProvider.setKeyValueStorage(secure);
        }
      } catch { /* secure store unavailable → keep the AsyncStorage default */ }
      isAmplifyConfigured = true;
    }
  } catch {
    // amplify_outputs.json not deployed yet — running in offline mode
  }
}
