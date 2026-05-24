'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, User as UserIcon, ChevronDown, LayoutDashboard, Building2, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

interface UserButtonProps {
  variant?: 'light' | 'dark';
  className?: string;
}

export function UserButton({ variant = 'light', className }: UserButtonProps) {
  const { user, account, loading, signOut } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const authHref = `/auth?next=${encodeURIComponent(pathname || '/')}`;

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
      <Button size="sm" variant="outline" className={cn('gap-2', className)} asChild>
        <Link href={authHref}>Iniciar sesión</Link>
      </Button>
    );
  }

  return (
    <div ref={menuRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          // Sin avatar/foto: solo nombre + chevron. El producto no maneja
          // foto de perfil (decisión de producto, no técnica).
          'flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors',
          variant === 'dark'
            ? 'hover:bg-slate-800 text-slate-100'
            : 'hover:bg-slate-100 text-slate-700'
        )}
      >
        <span className="text-sm font-medium max-w-[160px] truncate">
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
