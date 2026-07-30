'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Lock, UserCog, Building2, GraduationCap, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthForm } from '@/components/auth/auth-form';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useAuth, type UserRole } from '@/lib/auth-context';

const COPY: Record<UserRole, { eyebrow: string; title: string; desc: string }> = {
  joven: {
    eyebrow: 'Tu historia, guardada',
    title: 'Inicia sesión para acceder al área de jóvenes.',
    desc:
      'Vinculamos tu Perfil de Evidencia a tu cuenta para que puedas retomar la entrevista, ver tus matches y recibir tareas — sin volver a empezar.',
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
  const { user, account, loading, roleLoading, chooseRole } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const assigningRef = useRef(false);

  useEffect(() => {
    if (loading || roleLoading) return;
    if (!user || account) return;
    if (pathname === '/onboarding/rol') return;
    if (assigningRef.current) return;
    // El usuario se autenticó en una página gateada y todavía no tiene rol: su
    // intención es inequívoca (está intentando entrar a ESTA área), así que le
    // asignamos el rol de la página en vez de mandarlo a /onboarding/rol. La
    // señal es la página real, NO un ?role= de la URL — por eso no reintroduce
    // el bug histórico de "rol contaminado por un link viejo". Si la asignación
    // falla, caemos al onboarding como antes.
    assigningRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        await chooseRole(role);
      } catch {
        if (!cancelled) {
          router.replace(`/onboarding/rol?next=${encodeURIComponent(pathname || '/')}`);
        }
      } finally {
        if (!cancelled) assigningRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, account, loading, roleLoading, role, chooseRole, pathname, router]);

  if (loading || roleLoading) {
    return <LoadingSpinner variant="full" label="Cargando tu sesión…" />;
  }

  if (!user) {
    const copy = COPY[role];
    return (
      <div className="max-w-md mx-auto px-6 py-16 lg:py-24 w-full">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 md:p-10">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-5">
            <Lock size={20} />
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2 text-center">
            {copy.eyebrow}
          </div>
          <AuthForm
            intendedRole={role}
            title={copy.title}
            subtitle={copy.desc}
            onSuccess={() => {}}
          />
          <p className="text-xs text-slate-400 text-center mt-6">
            Si ya tienes cuenta con otro rol, te llevamos a tu área correcta.
          </p>
        </div>
      </div>
    );
  }

  if (!account) {
    return <LoadingSpinner variant="full" label="Preparando tu cuenta…" />;
  }

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
            tiempo. Si necesitas cambiar de rol, escribinos a{' '}
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

  return <>{children}</>;
}
