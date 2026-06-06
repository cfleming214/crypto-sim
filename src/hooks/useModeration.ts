import { Alert } from 'react-native';
import { useApp } from '../store/AppContext';
import { submitReport, type ReportContext, type ReportReason } from '../services/moderationService';

export interface ModerationTarget {
  // PublicProfile owner (Cognito sub) when available; falls back to the handle
  // for leaderboard rows that don't expose an owner.
  owner: string;
  handle: string;
  context: ReportContext;
}

const REASONS: { key: ReportReason; label: string }[] = [
  { key: 'spam',          label: 'Spam' },
  { key: 'harassment',    label: 'Harassment or hate' },
  { key: 'inappropriate', label: 'Inappropriate content' },
  { key: 'other',         label: 'Something else' },
];

/**
 * Report / block flow shared by every user-content surface (top traders,
 * leaderboards, copy-trade). Block files a report too (App Store guideline 1.2)
 * and removes the user from every feed instantly via BLOCK_USER.
 */
export function useModeration() {
  const { state, dispatch } = useApp();

  const isBlocked = (owner: string) => state.blockedUsers.some(b => b.owner === owner);

  const doReport = (target: ModerationTarget, reason: ReportReason) => {
    submitReport({
      reportedOwner:  target.owner,
      reportedHandle: target.handle,
      context:        target.context,
      reason,
      reporterHandle: state.user.handle,
    });
    Alert.alert(
      'Report received',
      `Thanks for flagging @${target.handle}. Our team reviews reports and acts on objectionable content within 24 hours.`,
      [{ text: 'OK' }],
    );
  };

  const promptReason = (target: ModerationTarget) => {
    Alert.alert(
      `Report @${target.handle}`,
      'Why are you reporting this user?',
      [
        ...REASONS.map(r => ({ text: r.label, onPress: () => doReport(target, r.key) })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  const doBlock = (target: ModerationTarget, onBlocked?: () => void) => {
    // Filing a report on block notifies the developer, per guideline 1.2.
    submitReport({
      reportedOwner:  target.owner,
      reportedHandle: target.handle,
      context:        target.context,
      reason:         'block',
      reporterHandle: state.user.handle,
    });
    dispatch({ type: 'BLOCK_USER', user: { owner: target.owner, handle: target.handle } });
    Alert.alert(
      'User blocked',
      `You won't see @${target.handle} anymore. You can unblock them from Profile → Blocked users.`,
      [{ text: 'OK', onPress: onBlocked }],
    );
  };

  /** Show the Report / Block action sheet for a target. */
  const openMenu = (target: ModerationTarget, onBlocked?: () => void) => {
    Alert.alert(
      `@${target.handle}`,
      undefined,
      [
        { text: 'Report content',  onPress: () => promptReason(target) },
        { text: 'Block user', style: 'destructive', onPress: () => doBlock(target, onBlocked) },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  return { isBlocked, openMenu, blockedUsers: state.blockedUsers };
}
