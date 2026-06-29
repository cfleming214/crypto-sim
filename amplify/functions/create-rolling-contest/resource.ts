import { defineFunction } from '@aws-amplify/backend';

// Auto-creates a rolling 6-hour XP contest on a 6-hour EventBridge schedule (see
// backend.ts). Each run ensures the current window's contest (live) and the next
// window's (scheduled) both exist, so there's always one running and one queued.
// 20-player cap, 5000 XP prize, free entry (Lane A).
export const createRollingContest = defineFunction({
  name: 'create-rolling-contest',
  entry: './handler.ts',
  timeoutSeconds: 30,
});
