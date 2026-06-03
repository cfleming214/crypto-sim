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

  const handleSignIn = async (usernameInput: string, password: string) => {
    const { signIn } = await import('aws-amplify/auth');
    await signIn({
      username: usernameInput,
      password,
      // USER_PASSWORD_AUTH avoids the SRP challenge that's flaky on React
      // Native (BigInt + crypto.getRandomValues under Hermes). Cognito
      // accepts plaintext password over TLS — same security surface area.
      options: { authFlowType: 'USER_PASSWORD_AUTH' },
    });
    await checkSession();
  };

  const handleSignUp = async (usernameInput: string, password: string) => {
    const { signUp, signIn } = await import('aws-amplify/auth');
    await signUp({ username: usernameInput, password });
    // Pool has no required attributes and no login alias, so the user is
    // CONFIRMED immediately — sign them in directly without a verification step.
    await signIn({
      username: usernameInput,
      password,
      options: { authFlowType: 'USER_PASSWORD_AUTH' },
    });
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
