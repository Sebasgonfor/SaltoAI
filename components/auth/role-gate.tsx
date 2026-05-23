'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Lock, UserCog, Building2, GraduationCap, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth, type UserRole } from '@/lib/auth-context';

const COPY: Record<UserRole, { eyebrow: string; title: string; desc: string }> = {
  joven: {
    eyebrow: 'Tu historia, guardada',
    title: 'Inicia sesión para acceder al área de jóvenes.',
    desc:
      'Vinculamos tu Perfil de Evidencia a tu cuenta de Google para que puedas retomar la entrevista, ver tus matches y recibir tareas — sin volver a empezar.',
  },
  empresa: {
    eyebrow: 'Cuenta verificada',
    title: 'Inicia sesión para acceder al área de empresas.',
    desc:
      'Vinculamos cada necesidad a tu cuenta para que solo tú puedas editarla, ver matches y conversar con candidatos.',
  },
};

interface Props {
  role: UserRole;
  children: React.ReactNode;
}

export function RoleGate({ role, children }: Props) {
  const { user, account, loading, roleLoading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [signingIn, setSigningIn] = useState(false);

  // 1. Bootstrap de auth
  if (loading || roleLoading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-24 w-full flex items-center justify-center text-slate-500 text-sm">
        Cargando tu sesión…
      </div>
    );
  }

  // 2. Sin sesión → sign-in con rol intencionado
  if (!user) {
    const copy = COPY[role];
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 lg:py-24 w-full">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-6">
            <Lock size={22} />
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-3">
            {copy.eyebrow}
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-slate-900 tracking-tight leading-tight">
            {copy.title}
          </h1>
          <p className="text-slate-600 mt-4 leading-relaxed">{copy.desc}</p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <Button
              size="lg"
              className="h-12 px-6 gap-3"
              disabled={signingIn}
              onClick={async () => {
                setSigningIn(true);
                try {
                  await signInWithGoogle(role);
                } finally {
                  setSigningIn(false);
                }
              }}
            >
              <GoogleIcon className="h-4 w-4" />
              {signingIn ? 'Abriendo Google…' : `Continuar como ${role === 'joven' ? 'joven' : 'empresa'}`}
            </Button>
            <p className="text-xs text-slate-400">
              Si ya tenés cuenta con otro rol, te llevamos a tu área correcta.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 3. Sesión sin rol asignado → onboarding
  if (!account) {
    if (typeof window !== 'undefined' && pathname !== '/onboarding/rol') {
      router.replace(`/onboarding/rol?next=${encodeURIComponent(pathname || '/')}`);
    }
    return (
      <div className="max-w-6xl mx-auto px-6 py-24 w-full flex items-center justify-center text-slate-500 text-sm">
        Llevándote a elegir tu rol…
      </div>
    );
  }

  // 4. Sesión con rol equivocado → muro explícito (sin redirección sigilosa)
  if (account.role !== role) {
    const other = account.role;
    const otherHref = other === 'joven' ? '/joven/chat' : '/empresa/chat';
    const OtherIcon = other === 'joven' ? GraduationCap : Building2;
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 lg:py-24 w-full">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-6">
            <UserCog size={22} />
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-amber-700 font-semibold mb-3">
            Esta sección es de {role === 'joven' ? 'jóvenes' : 'empresas'}
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-slate-900 tracking-tight leading-tight">
            Tu cuenta está registrada como {other === 'joven' ? 'joven' : 'empresa'}.
          </h1>
          <p className="text-slate-600 mt-4 leading-relaxed">
            Por integridad del matching, un usuario no puede ser candidato y reclutador al mismo
            tiempo. Si necesitás cambiar de rol, escribinos a{' '}
            <a className="text-emerald-700 underline" href="mailto:soporte@salto.work">
              soporte@salto.work
            </a>
            .
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href={otherHref}>
              <Button size="lg" className="h-12 px-6 gap-3">
                <OtherIcon size={16} /> Ir a mi área ({other})
                <ArrowRight size={14} />
              </Button>
            </Link>
            <Link href="/">
              <Button size="lg" variant="outline" className="h-12 px-6">
                Volver al inicio
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 5. Todo bien → renderiza la sección
  return <>{children}</>;
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#fff"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.56c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#fff"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.56-2.77c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
    </svg>
  );
}
