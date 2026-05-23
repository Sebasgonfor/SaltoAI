'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from './firebase';
import { getUserAccount, setUserRole, type UserAccount, type UserRole } from './accounts';

interface AuthContextValue {
  user: User | null;
  account: UserAccount | null;
  loading: boolean;
  /** True mientras se resuelve el rol después del sign-in. */
  roleLoading: boolean;
  configured: boolean;
  signInWithGoogle: (intendedRole?: UserRole) => Promise<User | null>;
  /** Setea el rol por primera vez. No-op si ya tiene rol. */
  chooseRole: (role: UserRole) => Promise<UserAccount | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);
  const configured = isFirebaseConfigured();
  // El sign-in handler puede recibir un rol "intencionado" (ej. el usuario hizo
  // click en "Soy joven" en la landing). Si el doc no existe aún, se aplica.
  const pendingRoleRef = useRef<UserRole | null>(null);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setAccount(null);
        setLoading(false);
        return;
      }
      setRoleLoading(true);
      try {
        let existing = await getUserAccount(u.uid);
        if (!existing && pendingRoleRef.current) {
          existing = await setUserRole(
            u.uid,
            pendingRoleRef.current,
            u.email,
            u.displayName
          );
          pendingRoleRef.current = null;
        }
        setAccount(existing);
      } catch (err) {
        console.error('[auth] load account failed', err);
        setAccount(null);
      } finally {
        setRoleLoading(false);
        setLoading(false);
      }
    });
    return unsub;
  }, [configured]);

  const signInWithGoogle = useCallback(
    async (intendedRole?: UserRole) => {
      if (!configured) {
        alert(
          'Firebase no está configurado. Define NEXT_PUBLIC_FIREBASE_* en .env.local para habilitar el inicio de sesión.'
        );
        return null;
      }
      if (intendedRole) pendingRoleRef.current = intendedRole;
      try {
        const cred = await signInWithPopup(auth, googleProvider);
        return cred.user;
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
          return null;
        }
        console.error('[auth] signInWithGoogle failed', err);
        throw err;
      }
    },
    [configured]
  );

  const chooseRole = useCallback(
    async (role: UserRole) => {
      if (!user) return null;
      const acc = await setUserRole(user.uid, role, user.email, user.displayName);
      setAccount(acc);
      return acc;
    },
    [user]
  );

  const signOut = useCallback(async () => {
    if (!configured) return;
    await fbSignOut(auth);
    setAccount(null);
  }, [configured]);

  return (
    <AuthContext.Provider
      value={{
        user,
        account,
        loading,
        roleLoading,
        configured,
        signInWithGoogle,
        chooseRole,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export type { UserRole, UserAccount };
