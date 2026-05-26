// crypto.getRandomValues polyfill — required by Amplify Cognito SRP auth on
// React Native. Must come before any aws-amplify import. Without this, sign-in
// fails with the generic "An unknown error has occurred" from Cognito.
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
