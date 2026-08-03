import { defineFunction } from '@aws-amplify/backend';

// Server-side Season Pass close-out. Runs on an EventBridge schedule (see
// backend.ts) so a season advances for EVERY account, not only the ones whose
// owner happened to open the app.
export const closeSeason = defineFunction({
  name: 'close-season',
  entry: './handler.ts',
  timeoutSeconds: 300,
});
