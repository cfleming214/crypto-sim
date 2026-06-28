import { defineFunction } from '@aws-amplify/backend';

// Auto-creates a fresh weekly contest on a 7-day EventBridge schedule (see
// backend.ts). Writes a real Competition row so it has a proper leaderboard and
// gets settled by close-competition — unlike the old client-only seed placeholder.
export const createWeeklyContest = defineFunction({
  name: 'create-weekly-contest',
  entry: './handler.ts',
  timeoutSeconds: 30,
});
