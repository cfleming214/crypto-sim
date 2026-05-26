import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { W1Screen } from '../screens/walkthrough/W1Screen';
import { W2Screen } from '../screens/walkthrough/W2Screen';
import { W3Screen } from '../screens/walkthrough/W3Screen';
import { W4Screen } from '../screens/walkthrough/W4Screen';
import { W5Screen } from '../screens/walkthrough/W5Screen';
import { W6Screen } from '../screens/walkthrough/W6Screen';
import { W7Screen } from '../screens/walkthrough/W7Screen';
import { W8Screen } from '../screens/walkthrough/W8Screen';

export type WalkthroughParamList = {
  W1: undefined;
  W2: undefined;
  W3: undefined;
  W4: undefined;
  W5: undefined;
  W6: undefined;
  W7: undefined;
  W8: undefined;
};

const Stack = createNativeStackNavigator<WalkthroughParamList>();

export function WalkthroughNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="W1" component={W1Screen} />
      <Stack.Screen name="W2" component={W2Screen} />
      <Stack.Screen name="W3" component={W3Screen} />
      <Stack.Screen name="W4" component={W4Screen} />
      <Stack.Screen name="W5" component={W5Screen} />
      <Stack.Screen name="W6" component={W6Screen} />
      <Stack.Screen name="W7" component={W7Screen} />
      <Stack.Screen name="W8" component={W8Screen} />
    </Stack.Navigator>
  );
}
