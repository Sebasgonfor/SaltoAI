'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth, type UserRole } from '@/lib/auth-context';
import { getAuthErrorMessage } from '@/lib/auth-errors';
import { GoogleIcon } from '@/components/auth/google-icon';
import { cn } from '@/lib/utils';

type AuthMode = 'signin' | 'signup';

interface AuthFormProps {
  intendedRole?: UserRole;
  title?: string;
  subtitle?: string;
  /** Tras login/registro exitoso (p. ej. redirigir). */
  onSuccess?: () => void;
  className?: string;
}

export function AuthForm({
  intendedRole,
  title,
  subtitle,
  onSuccess,
  className,
}: AuthFormProps) {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'google' | 'email' | null>(null);

  const roleLabel =
    intendedRole === 'joven' ? 'joven' : intendedRole === 'empresa' ? 'empresa' : null;

  const handleGoogle = async () => {
    setError(null);
    setBusy('google');
    try {
      const user = await signInWithGoogle(intendedRole);
      if (user) onSuccess?.();
    } catch (err) {
      const msg = getAuthErrorMessage(err);
      if (msg) setError(msg);
    } finally {
      setBusy(null);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Completa correo y contraseña.');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (mode === 'signup' && displayName.trim().length < 2) {
      setError('Escribe tu nombre (mínimo 2 caracteres).');
      return;
    }

    setBusy('email');
    try {
      const user =
        mode === 'signup'
          ? await signUpWithEmail(trimmedEmail, password, displayName.trim(), intendedRole)
          : await signInWithEmail(trimmedEmail, password, intendedRole);
      if (user) onSuccess?.();
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn('w-full text-left', className)}>
      {(title || subtitle) && (
        <div className="text-center mb-6">
          {title && (
            <h2 className="text-xl md:text-2xl font-display font-bold text-slate-900 tracking-tight leading-tight">
              {title}
            </h2>
          )}
          {subtitle && <p className="text-slate-600 mt-2 text-sm leading-relaxed">{subtitle}</p>}
        </div>
      )}

      <div className="flex rounded-xl border border-slate-200 p-1 mb-6 bg-slate-50">
        <button
          type="button"
          onClick={() => {
            setMode('signin');
            setError(null);
          }}
          className={cn(
            'flex-1 py-2 text-sm font-medium rounded-lg transition-colors',
            mode === 'signin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          )}
        >
          Iniciar sesión
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('signup');
            setError(null);
          }}
          className={cn(
            'flex-1 py-2 text-sm font-medium rounded-lg transition-colors',
            mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          )}
        >
          Crear cuenta
        </button>
      </div>

      <form onSubmit={handleEmailSubmit} className="space-y-4">
        {mode === 'signup' && (
          <div>
            <label htmlFor="auth-name" className="block text-sm font-medium text-slate-900 mb-1.5">
              Nombre
            </label>
            <Input
              id="auth-name"
              type="text"
              autoComplete="name"
              placeholder="Ej. Camila Silva"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="h-11"
              disabled={busy !== null}
            />
          </div>
        )}

        <div>
          <label htmlFor="auth-email" className="block text-sm font-medium text-slate-900 mb-1.5">
            Correo electrónico
          </label>
          <Input
            id="auth-email"
            type="email"
            autoComplete={mode === 'signup' ? 'email' : 'username'}
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11"
            disabled={busy !== null}
          />
        </div>

        <div>
          <label htmlFor="auth-password" className="block text-sm font-medium text-slate-900 mb-1.5">
            Contraseña
          </label>
          <Input
            id="auth-password"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder={mode === 'signup' ? 'Mínimo 6 caracteres' : 'Tu contraseña'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11"
            disabled={busy !== null}
          />
        </div>

        {error && (
          <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full h-11" disabled={busy !== null}>
          {busy === 'email'
            ? mode === 'signup'
              ? 'Creando cuenta…'
              : 'Entrando…'
            : mode === 'signup'
            ? 'Registrarme con email'
            : 'Entrar con email'}
        </Button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-wider">
          <span className="bg-white px-2 text-slate-400">o</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full h-11 gap-3"
        disabled={busy !== null}
        onClick={() => void handleGoogle()}
      >
        <GoogleIcon className="h-4 w-4" />
        {busy === 'google'
          ? 'Abriendo Google…'
          : roleLabel
          ? `Continuar con Google como ${roleLabel}`
          : 'Continuar con Google'}
      </Button>
    </div>
  );
}
