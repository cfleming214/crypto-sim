import React, { createContext, useContext, useEffect, useState } from 'react';
import { isAmplifyConfigured } from '../lib/amplify';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  userId: string | null;
  email: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ nextStep: string }>;
  confirmSignUp: (email: string, code: string) => Promise<{ autoSignedIn: boolean }>;
  resendCode: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  status: 'loading',
  userId: null,
  email: null,
  signIn: async () => {},
  signUp: async () => ({ nextStep: '' }),
  confirmSignUp: async () => ({ autoSignedIn: false }),
  resendCode: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!isAmplifyConfigured) {
      setStatus('authenticated');
      return;
    }
    checkSession();
  }, []);

  async function checkSession() {
    try {
      const { getCurrentUser, fetchAuthSession } = await import('aws-amplify/auth');
      const user = await getCurrentUser();
      setUserId(user.userId);
      const session = await fetchAuthSession();
      setEmail((session.tokens?.idToken?.payload.email as string) ?? null);
      setStatus('authenticated');
    } catch {
      setStatus('unauthenticated');
    }
  }

  const handleSignIn = async (emailInput: string, password: string) => {
    const { signIn } = await import('aws-amplify/auth');
    await signIn({
      username: emailInput,
      password,
      // USER_PASSWORD_AUTH avoids the SRP challenge that's flaky on React
      // Native (BigInt + crypto.getRandomValues under Hermes). Cognito
      // accepts plaintext password over TLS — same security surface area.
      options: { authFlowType: 'USER_PASSWORD_AUTH' },
    });
    await checkSession();
  };

  const handleSignUp = async (emailInput: string, password: string) => {
    const { signUp } = await import('aws-amplify/auth');
    const result = await signUp({
      username: emailInput,
      password,
      options: {
        userAttributes: { email: emailInput },
        autoSignIn: true,
      },
    });
    return { nextStep: result.nextStep.signUpStep };
  };

  const handleConfirmSignUp = async (emailInput: string, code: string): Promise<{ autoSignedIn: boolean }> => {
    const { confirmSignUp, autoSignIn } = await import('aws-amplify/auth');
    const result = await confirmSignUp({ username: emailInput, confirmationCode: code });
    // If signUp was called with autoSignIn: true, Cognito staged a one-time
    // sign-in token alongside the confirmation. autoSignIn() consumes it and
    // returns a real session without needing the password again.
    if (result.nextStep.signUpStep === 'COMPLETE_AUTO_SIGN_IN') {
      try {
        await autoSignIn();
        await checkSession();
        return { autoSignedIn: true };
      } catch {
        // autoSignIn token expired or session pool changed — fall through to manual sign-in
      }
    }
    return { autoSignedIn: false };
  };

  const handleResendCode = async (emailInput: string) => {
    const { resendSignUpCode } = await import('aws-amplify/auth');
    await resendSignUpCode({ username: emailInput });
  };

  const handleSignOut = async () => {
    const { signOut } = await import('aws-amplify/auth');
    await signOut();
    setStatus('unauthenticated');
    setUserId(null);
    setEmail(null);
  };

  return (
    <AuthContext.Provider value={{
      status,
      userId,
      email,
      signIn: handleSignIn,
      signUp: handleSignUp,
      confirmSignUp: handleConfirmSignUp,
      resendCode: handleResendCode,
      signOut: handleSignOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
