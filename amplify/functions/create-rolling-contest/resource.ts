import { defineFunction } from '@aws-amplify/backend';

// Auto-creates rolling XP contests on 2h/3h/6h cadences, on an EventBridge
// schedule (see backend.ts). Each run ensures the current window's contest (live)
// and the next window's (scheduled) both exist, so there's always one running and
// one queued — and opens an overflow room for any window whose latest room has
// filled, so a full contest never leaves players with nothing to join.
// 20-player cap per room, 5000 XP prize, free entry (Lane A).
export const createRollingContest = defineFunction({
  name: 'create-rolling-contest',
  entry: './handler.ts',
  timeoutSeconds: 30,
});
