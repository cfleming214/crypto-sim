import React, { createContext, useContext, useEffect, useState } from 'react';
import { isAmplifyConfigured } from '../lib/amplify';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  userId: string | null;
  email: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ nextStep: string }>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  resendCode: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  status: 'loading',
  userId: null,
  email: null,
  signIn: async () => {},
  signUp: async () => ({ nextStep: '' }),
  confirmSignUp: async () => {},
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
    await signIn({ username: emailInput, password });
    await checkSession();
  };

  const handleSignUp = async (emailInput: string, password: string) => {
    const { signUp } = await import('aws-amplify/auth');
    const result = await signUp({
      username: emailInput,
      password,
      options: { userAttributes: { email: emailInput } },
    });
    return { nextStep: result.nextStep.signUpStep };
  };

  const handleConfirmSignUp = async (emailInput: string, code: string) => {
    const { confirmSignUp } = await import('aws-amplify/auth');
    await confirmSignUp({ username: emailInput, confirmationCode: code });
    await handleSignIn(emailInput, '');
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
