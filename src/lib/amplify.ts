import '@aws-amplify/react-native';
import { Amplify } from 'aws-amplify';

export let isAmplifyConfigured = false;

export function configureAmplify() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const outputs = require('../../amplify_outputs.json');
    if (outputs?.auth?.user_pool_id) {
      Amplify.configure(outputs);
      isAmplifyConfigured = true;
    }
  } catch {
    // amplify_outputs.json not deployed yet — running in offline mode
  }
}
