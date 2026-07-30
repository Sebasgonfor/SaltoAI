'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import { AuthForm } from '@/components/auth/auth-form';
import { SaltoLogo } from '@/components/ui/salto-logo';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useAuth, type UserRole } from '@/lib/auth-context';

function isSafeNext(value: string | null): string {
  if (!value) return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

function parseRole(value: string | null): UserRole | undefined {
  if (value === 'joven' || value === 'empresa') return value;
  return undefined;
}

/**
 * Mismo workaround que en /onboarding/rol: el `next` se respeta solo si
 * es coherente con el rol resuelto. Sino, default del rol. Sin esto, un
 * user joven con `?next=/empresa/chat` (heredado de un flow anterior)
 * aterriza en el muro de RoleGate de empresa.
 */
function resolveTarget(role: UserRole, next: string): string {
  if (next === '/') return role === 'joven' ? '/joven/chat' : '/empresa/chat';
  if (role === 'joven' && (next === '/joven' || next.startsWith('/joven/'))) return next;
  if (role === 'empresa' && (next === '/empresa' || next.startsWith('/empresa/'))) return next;
  if (!next.startsWith('/joven') && !next.startsWith('/empresa')) return next;
  return role === 'joven' ? '/joven/chat' : '/empresa/chat';
}

function AuthPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, account, loading } = useAuth();
  const next = isSafeNext(params.get('next'));
  const role = parseRole(params.get('role'));

  useEffect(() => {
    if (loading || !user) return;
    if (account) {
      router.replace(resolveTarget(account.role, next));
      return;
    }
    router.replace(`/onboarding/rol?next=${encodeURIComponent(next)}`);
  }, [user, account, loading, next, router]);

  if (loading || user) {
    return <LoadingSpinner variant="full" />;
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] flex flex-col">
      <header className="px-6 h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center sticky top-0 z-20">
        <Link href="/" className="flex items-center shrink-0">
          <SaltoLogo variant="full" size={56} />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 md:p-10 shadow-sm">
          <div className="w-12 h-12 mx-auto mb-5 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <Lock size={20} />
          </div>
          <AuthForm
            intendedRole={role}
            title="Entra a SaltoAI"
            subtitle="Regístrate o inicia sesión con email y contraseña, o usa Google."
            onSuccess={() => {
              /* onAuthStateChanged + useEffect redirigen */
            }}
          />
        </div>
      </main>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<LoadingSpinner variant="full" />}>
      <AuthPageInner />
    </Suspense>
  );
}
