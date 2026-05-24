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
import { isAuthCancellation, isExpectedAuthError } from './auth-errors';

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

  // IMPORTANTE: cuando intendedRole es undefined, LIMPIAMOS el ref. Sin esto,
  // un valor de un flow anterior contaminaba el siguiente: si el user clickeaba
  // "Soy empresa" (popup Google → setea pendingRole='empresa'), cancelaba el
  // popup, y después iba a /auth a registrarse con email sin ?role= → el
  // signUp aplicaba 'empresa' contra la voluntad del user. Resultado:
  // alguien llamado "Juan Joven" se registraba con email y quedaba como empresa.
  const setPendingRole = useCallback((intendedRole?: UserRole) => {
    pendingRoleRef.current = intendedRole ?? null;
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
        // Solo loggeamos errores INESPERADOS. Los "esperables" (user
        // typeó mal, cuenta no existe, etc.) ya los muestra el form
        // al usuario; logearlos genera ruido en el dev overlay de Next.
        if (!isExpectedAuthError(err)) {
          console.error('[auth] signInWithGoogle failed', err);
        }
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
        // Credenciales inválidas / cuenta no existente NO son bugs.
        // El form ya muestra el mensaje user-friendly via
        // getAuthErrorMessage. Solo loggeamos errores inesperados.
        if (!isExpectedAuthError(err)) {
          console.error('[auth] signInWithEmail failed', err);
        }
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
      _intendedRole?: UserRole
    ) => {
      if (!configured) {
        alert(
          'Firebase no está configurado. Define NEXT_PUBLIC_FIREBASE_* en .env.local para habilitar el registro.'
        );
        return null;
      }
      // El registro por email NO confía en `intendedRole` para auto-asignar
      // el rol. Razón: el `?role=` puede venir de un link viejo, una sesión
      // anterior cancelada, o un share. No hay garantía de que coincide con
      // la intención real del user. Forzamos que /onboarding/rol lo pregunte
      // explícitamente (escenario donde alguien llamado "Juan Joven" se
      // registraba por email y terminaba marcado como empresa).
      //
      // En Google sí confiamos en intendedRole porque el clic en "Soy X" +
      // popup es un acto deliberado y visualmente claro. Email = no.
      setPendingRole(undefined);
      try {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const name = displayName?.trim();
        if (name) {
          await updateProfile(cred.user, { displayName: name });
        }
        return cred.user;
      } catch (err: unknown) {
        // "Email ya registrado" / "weak password" son user mistakes,
        // no bugs — el form ya muestra el mensaje en español. Solo
        // loggeamos errores inesperados (network, configuration).
        if (!isExpectedAuthError(err)) {
          console.error('[auth] signUpWithEmail failed', err);
        }
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
