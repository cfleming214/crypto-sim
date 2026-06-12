import { defineFunction } from '@aws-amplify/backend';

// Sends admin-authored push campaigns when they come due. Runs every minute:
// claims each scheduled campaign whose scheduledAt has passed, resolves its
// audience from the saved criteria, pushes via Expo, and writes back send stats.
export const notificationDispatcher = defineFunction({
  name: 'notification-dispatcher',
  entry: './handler.ts',
  timeoutSeconds: 120,
});
