import React, { createContext, useContext, useEffect, useState } from 'react';
import { isAmplifyConfigured } from '../lib/amplify';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  userId: string | null;
  username: string | null;
  email: string | null;
  emailVerified: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Permanently delete the account + all cloud data, then drop to guest. */
  deleteAccount: () => Promise<void>;
  /** Refresh `email` / `emailVerified` from the current Cognito session. */
  refreshAttributes: () => Promise<void>;
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
  signUp: async () => {},
  signOut: async () => {},
  deleteAccount: async () => {},
  refreshAttributes: async () => {},
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
    } catch {
      setStatus('unauthenticated');
    }
  }

  async function loadAttributes() {
    const { fetchUserAttributes } = await import('aws-amplify/auth');
    try {
      const attrs = await fetchUserAttributes();
      setEmail(attrs.email ?? null);
      setEmailVerified(attrs.email_verified === 'true');
    } catch {
      setEmail(null);
      setEmailVerified(false);
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
  };

  const handleSignUp = async (usernameInput: string, password: string) => {
    const { signUp } = await import('aws-amplify/auth');
    // The deployed pool signs in by email (usernameAttributes = ['email']) and
    // requires the email attribute, so the input IS the email — pass it as both
    // the username and the email attribute. The preSignUp Lambda trigger
    // auto-confirms the user (autoConfirmUser + autoVerifyEmail), so there's no
    // code-entry step and we can sign them straight in. (Real email verification
    // is gated later on contest entry — see handleStartEmailVerification.)
    const email = usernameInput.trim().toLowerCase();
    await signUp({
      username: email,
      password,
      options: { userAttributes: { email } },
    });
    await doSignIn(email, password);
    await checkSession();
  };

  const handleSignOut = async () => {
    const { signOut } = await import('aws-amplify/auth');
    await signOut();
    setStatus('unauthenticated');
    setUserId(null);
    setUsername(null);
    setEmail(null);
    setEmailVerified(false);
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
