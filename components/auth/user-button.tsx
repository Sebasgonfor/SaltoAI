'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, User as UserIcon, ChevronDown, LayoutDashboard, Building2, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

interface UserButtonProps {
  variant?: 'light' | 'dark';
  className?: string;
}

export function UserButton({ variant = 'light', className }: UserButtonProps) {
  const { user, account, loading, signInWithGoogle, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (loading) {
    return (
      <div
        className={cn(
          'h-9 w-24 rounded-md animate-pulse',
          variant === 'dark' ? 'bg-slate-800/60' : 'bg-slate-200/60',
          className
        )}
      />
    );
  }

  if (!user) {
    return (
      <Button
        size="sm"
        variant="outline"
        className={cn('gap-2', className)}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const result = await signInWithGoogle();
            if (result) router.push('/dashboard');
          } finally {
            setBusy(false);
          }
        }}
      >
        <GoogleIcon className="h-4 w-4" />
        {busy ? 'Abriendo…' : 'Iniciar sesión'}
      </Button>
    );
  }

  const initials = (user.displayName || user.email || '?')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div ref={menuRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-2 rounded-full pl-1 pr-2 py-1 transition-colors',
          variant === 'dark'
            ? 'hover:bg-slate-800 text-slate-100'
            : 'hover:bg-slate-100 text-slate-700'
        )}
      >
        {user.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoURL}
            alt={user.displayName || 'avatar'}
            referrerPolicy="no-referrer"
            className="h-8 w-8 rounded-full"
          />
        ) : (
          <span className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold flex items-center justify-center">
            {initials}
          </span>
        )}
        <span className="text-sm font-medium max-w-[120px] truncate hidden sm:inline">
          {user.displayName?.split(' ')[0] || user.email}
        </span>
        <ChevronDown size={14} className="opacity-60" />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden z-50"
          role="menu"
        >
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="text-sm font-medium text-slate-900 truncate">
              {user.displayName || 'Usuario'}
            </div>
            <div className="text-xs text-slate-500 truncate">{user.email}</div>
            {account && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-800 border-emerald-200">
                {account.role === 'joven' ? <GraduationCap size={10} /> : <Building2 size={10} />}
                {account.role}
              </div>
            )}
          </div>
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
            role="menuitem"
          >
            <LayoutDashboard size={14} /> Mi dashboard
          </Link>
          {account?.role === 'joven' && (
            <Link
              href={`/joven/perfil/${user.uid}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              role="menuitem"
            >
              <UserIcon size={14} /> Mi perfil
            </Link>
          )}
          {account?.role === 'empresa' && (
            <Link
              href="/empresa/publicar"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              role="menuitem"
            >
              <Building2 size={14} /> Publicar necesidad
            </Link>
          )}
          {!account && user && (
            <Link
              href="/onboarding/rol"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-emerald-700 hover:bg-emerald-50 font-medium"
              role="menuitem"
            >
              <UserIcon size={14} /> Elegir mi rol
            </Link>
          )}
          <button
            type="button"
            onClick={async () => {
              setOpen(false);
              await signOut();
            }}
            className="w-full text-left flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 border-t border-slate-100"
            role="menuitem"
          >
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.56c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.56-2.77c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11A6.6 6.6 0 0 1 5.48 12c0-.73.13-1.44.36-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.95l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.07.56 4.21 1.65l3.16-3.16C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
