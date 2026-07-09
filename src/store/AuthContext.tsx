import React, { createContext, useContext, useEffect, useState } from 'react';
import { isAmplifyConfigured } from '../lib/amplify';
import { identifyUser, resetAnalytics, track } from '../lib/analytics';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  userId: string | null;
  username: string | null;
  email: string | null;
  emailVerified: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  /** Register a new account. Returns `{ needsConfirmation: true }` when Cognito
   *  emailed a verification code — the caller must then call confirmSignUp with
   *  the code to finish. `false` means the account was signed in directly (e.g. a
   *  pool still configured to auto-confirm). No sign-in happens until confirmed. */
  signUp: (username: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  /** Confirm a pending sign-up with the emailed code, then sign in. */
  confirmSignUp: (username: string, code: string, password: string) => Promise<void>;
  /** Re-send the sign-up verification code to a pending (unconfirmed) account. */
  resendSignUpCode: (username: string) => Promise<void>;
  /** Federated Sign in with Apple via Cognito hosted UI. Requires the Cognito
   *  Apple provider + OAuth config; gated behind APPLE_SIGNIN_ENABLED in the UI. */
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Permanently delete the account + all cloud data, then drop to guest. */
  deleteAccount: () => Promise<void>;
  /** Refresh `email` / `emailVerified` from the current Cognito session.
   * Returns the live `email_verified` value so callers can gate on fresh
   * state instead of the cached flag (which can lag a server-side change). */
  refreshAttributes: () => Promise<boolean>;
  /** Start email-attribute update. Cognito sends a verification code to `email`. */
  startEmailVerification: (email: string) => Promise<void>;
  /** Confirm the code Cognito sent. On success, `emailVerified` flips to true. */
  confirmEmail: (code: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  status: 'loading',
  userId: null,
  username: null,
  email: null,
  emailVerified: false,
  signIn: async () => {},
  signUp: async () => ({ needsConfirmation: false }),
  confirmSignUp: async () => {},
  resendSignUpCode: async () => {},
  signInWithApple: async () => {},
  signOut: async () => {},
  deleteAccount: async () => {},
  refreshAttributes: async () => false,
  startEmailVerification: async () => {},
  confirmEmail: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);

  useEffect(() => {
    if (!isAmplifyConfigured) {
      setStatus('authenticated');
      return;
    }
    checkSession();
  }, []);

  async function checkSession() {
    try {
      const { getCurrentUser } = await import('aws-amplify/auth');
      const user = await getCurrentUser();
      setUserId(user.userId);
      setUsername(user.username);
      await loadAttributes();
      setStatus('authenticated');
      // Bind analytics events to this account (Cognito sub). Covers launch with an
      // existing session AND post sign-in/up (both funnel through checkSession).
      identifyUser(user.userId);
    } catch {
      setStatus('unauthenticated');
    }
  }

  async function loadAttributes(): Promise<boolean> {
    const { fetchUserAttributes } = await import('aws-amplify/auth');
    try {
      const attrs = await fetchUserAttributes();
      setEmail(attrs.email ?? null);
      const verified = attrs.email_verified === 'true';
      setEmailVerified(verified);
      return verified;
    } catch {
      setEmail(null);
      setEmailVerified(false);
      return false;
    }
  }

  // Sign in, tolerating a stale session already present on the device. Amplify
  // v6 throws UserAlreadyAuthenticatedException ("There is already a signed in
  // user.") if signIn is called while ANY session exists — e.g. a previous
  // tester's account, a half-finished sign-up, or a token that outlived its
  // checkSession. Left unhandled it strands the user on the login screen with a
  // confusing error (this is what blocked the App Store reviewer). Clear the old
  // session and retry so the new credentials always win.
  // USER_PASSWORD_AUTH avoids the SRP challenge that's flaky on React Native
  // (BigInt + crypto.getRandomValues under Hermes). Cognito accepts the
  // plaintext password over TLS — same security surface area.
  const doSignIn = async (username: string, password: string) => {
    const { signIn, signOut } = await import('aws-amplify/auth');
    const params = { username, password, options: { authFlowType: 'USER_PASSWORD_AUTH' as const } };
    try {
      await signIn(params);
    } catch (e: any) {
      if (e?.name === 'UserAlreadyAuthenticatedException') {
        await signOut();
        await signIn(params);
      } else {
        throw e;
      }
    }
  };

  const handleSignIn = async (usernameInput: string, password: string) => {
    // The pool uses email as the username (usernameAttributes = ['email']).
    // Normalize case/whitespace so "AppleReviewer@…" matches the stored
    // "applereviewer@…" — the same normalization sign-up already does.
    await doSignIn(usernameInput.trim().toLowerCase(), password);
    await checkSession();
    track('login', { method: 'email' });
  };

  // Federated Sign in with Apple through the Cognito hosted UI. On success the
  // redirect returns and Amplify's Hub establishes the session (checkSession picks
  // it up). Throws if the Apple provider / OAuth domain isn't configured yet — the
  // UI only shows this behind APPLE_SIGNIN_ENABLED, so that can't be hit by users.
  const handleSignInWithApple = async () => {
    const { signInWithRedirect } = await import('aws-amplify/auth');
    track('login', { method: 'apple' });
    await signInWithRedirect({ provider: 'Apple' });
  };

  const handleSignUp = async (usernameInput: string, password: string): Promise<{ needsConfirmation: boolean }> => {
    const { signUp } = await import('aws-amplify/auth');
    // The deployed pool signs in by email (usernameAttributes = ['email']) and
    // requires the email attribute, so the input IS the email — pass it as both
    // the username and the email attribute. The preSignUp trigger no longer
    // auto-confirms, so Cognito emails a verification code and the account stays
    // unconfirmed (unusable) until confirmSignUp succeeds — see handleConfirmSignUp.
    const email = usernameInput.trim().toLowerCase();
    const { nextStep } = await signUp({
      username: email,
      password,
      options: { userAttributes: { email } },
    });
    if (nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
      // Do NOT sign in — wait for the code. The account isn't active yet.
      return { needsConfirmation: true };
    }
    // A pool still set to auto-confirm returns COMPLETE → sign straight in.
    await doSignIn(email, password);
    await checkSession();
    track('signup', { method: 'email' });
    return { needsConfirmation: false };
  };

  const handleConfirmSignUp = async (usernameInput: string, code: string, password: string) => {
    const { confirmSignUp } = await import('aws-amplify/auth');
    const email = usernameInput.trim().toLowerCase();
    await confirmSignUp({ username: email, confirmationCode: code.trim() });
    // Only now — after the code is authenticated — is the account real; sign in.
    await doSignIn(email, password);
    await checkSession();
    track('signup', { method: 'email' });
  };

  const handleResendSignUpCode = async (usernameInput: string) => {
    const { resendSignUpCode } = await import('aws-amplify/auth');
    await resendSignUpCode({ username: usernameInput.trim().toLowerCase() });
  };

  const handleSignOut = async () => {
    const { signOut } = await import('aws-amplify/auth');
    await signOut();
    setStatus('unauthenticated');
    setUserId(null);
    setUsername(null);
    setEmail(null);
    setEmailVerified(false);
    resetAnalytics();   // drop identity so the next (guest) session isn't attributed
  };

  const handleDeleteAccount = async () => {
    const { deleteAccount } = await import('../services/moderationService');
    await deleteAccount();
    // deleteAccount() already called Cognito deleteUser + purged local stores.
    // Drop to guest; AppContext's unauthenticated effect runs CLEAR_USER_DATA.
    setStatus('unauthenticated');
    setUserId(null);
    setUsername(null);
    setEmail(null);
    setEmailVerified(false);
  };

  const handleStartEmailVerification = async (emailInput: string) => {
    const { updateUserAttribute } = await import('aws-amplify/auth');
    const result = await updateUserAttribute({
      userAttribute: { attributeKey: 'email', value: emailInput },
    });
    // Cognito staged a code if the next step is CONFIRM_ATTRIBUTE_WITH_CODE.
    // If DONE, the attribute was accepted as-is (shouldn't happen for email,
    // but harmless to refresh).
    if (result.nextStep.updateAttributeStep === 'DONE') {
      await loadAttributes();
    } else {
      setEmail(emailInput);
      setEmailVerified(false);
    }
  };

  const handleConfirmEmail = async (code: string) => {
    const { confirmUserAttribute } = await import('aws-amplify/auth');
    await confirmUserAttribute({ userAttributeKey: 'email', confirmationCode: code });
    await loadAttributes();
  };

  return (
    <AuthContext.Provider value={{
      status,
      userId,
      username,
      email,
      emailVerified,
      signIn: handleSignIn,
      signUp: handleSignUp,
      confirmSignUp: handleConfirmSignUp,
      resendSignUpCode: handleResendSignUpCode,
      signInWithApple: handleSignInWithApple,
      signOut: handleSignOut,
      deleteAccount: handleDeleteAccount,
      refreshAttributes: loadAttributes,
      startEmailVerification: handleStartEmailVerification,
      confirmEmail: handleConfirmEmail,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
