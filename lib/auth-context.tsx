'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from './firebase';
import { getUserAccount, setUserRole, type UserAccount, type UserRole } from './accounts';
import { isAuthCancellation } from './auth-errors';

interface AuthContextValue {
  user: User | null;
  account: UserAccount | null;
  loading: boolean;
  /** True mientras se resuelve el rol después del sign-in. */
  roleLoading: boolean;
  configured: boolean;
  signInWithGoogle: (intendedRole?: UserRole) => Promise<User | null>;
  signInWithEmail: (email: string, password: string, intendedRole?: UserRole) => Promise<User | null>;
  signUpWithEmail: (
    email: string,
    password: string,
    displayName: string | undefined,
    intendedRole?: UserRole
  ) => Promise<User | null>;
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

  const setPendingRole = useCallback((intendedRole?: UserRole) => {
    if (intendedRole) pendingRoleRef.current = intendedRole;
  }, []);

  const signInWithGoogle = useCallback(
    async (intendedRole?: UserRole) => {
      if (!configured) {
        alert(
          'Firebase no está configurado. Define NEXT_PUBLIC_FIREBASE_* en .env.local para habilitar el inicio de sesión.'
        );
        return null;
      }
      setPendingRole(intendedRole);
      try {
        const cred = await signInWithPopup(auth, googleProvider);
        return cred.user;
      } catch (err: unknown) {
        if (isAuthCancellation(err)) return null;
        console.error('[auth] signInWithGoogle failed', err);
        throw err;
      }
    },
    [configured, setPendingRole]
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string, intendedRole?: UserRole) => {
      if (!configured) {
        alert(
          'Firebase no está configurado. Define NEXT_PUBLIC_FIREBASE_* en .env.local para habilitar el inicio de sesión.'
        );
        return null;
      }
      setPendingRole(intendedRole);
      try {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        return cred.user;
      } catch (err: unknown) {
        console.error('[auth] signInWithEmail failed', err);
        throw err;
      }
    },
    [configured, setPendingRole]
  );

  const signUpWithEmail = useCallback(
    async (
      email: string,
      password: string,
      displayName: string | undefined,
      intendedRole?: UserRole
    ) => {
      if (!configured) {
        alert(
          'Firebase no está configurado. Define NEXT_PUBLIC_FIREBASE_* en .env.local para habilitar el registro.'
        );
        return null;
      }
      setPendingRole(intendedRole);
      try {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const name = displayName?.trim();
        if (name) {
          await updateProfile(cred.user, { displayName: name });
        }
        return cred.user;
      } catch (err: unknown) {
        console.error('[auth] signUpWithEmail failed', err);
        throw err;
      }
    },
    [configured, setPendingRole]
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
        signInWithEmail,
        signUpWithEmail,
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
