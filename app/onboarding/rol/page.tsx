'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { GraduationCap, Building2, ArrowRight, Lock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth, type UserRole } from '@/lib/auth-context';
import { SaltoLogo } from '@/components/ui/salto-logo';

function isSafeNext(value: string | null): string {
  if (!value) return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

function defaultDestination(role: UserRole): string {
  return role === 'joven' ? '/joven/chat' : '/empresa/chat';
}

/**
 * Si la URL `next` apunta a un área cuyo rol es inequívoco (/empresa/* o
 * /joven/*), no tiene sentido preguntar de nuevo: el usuario ya eligió al
 * hacer click desde la landing. Devolvemos el rol implícito para auto-
 * resolver el onboarding y mandar directo al destino.
 */
function roleFromNext(next: string): UserRole | null {
  if (next.startsWith('/empresa/') || next === '/empresa') return 'empresa';
  if (next.startsWith('/joven/') || next === '/joven') return 'joven';
  return null;
}

function OnboardingRolInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, account, loading, chooseRole, signInWithGoogle } = useAuth();
  const [submitting, setSubmitting] = useState<UserRole | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const next = isSafeNext(params.get('next'));
  const impliedRole = roleFromNext(next);
  const autoResolvedRef = useRef(false);

  const choose = async (role: UserRole) => {
    if (!user) return;
    setSubmitting(role);
    try {
      const acc = await chooseRole(role);
      if (!acc) return;
      const target = next !== '/' ? next : defaultDestination(acc.role);
      router.push(target);
    } finally {
      setSubmitting(null);
    }
  };

  // Auto-resolución: si el destino implica el rol (vino de "Soy empresa" /
  // "Soy joven" en la landing), no preguntamos de nuevo. Lo elegimos en
  // background y mandamos al destino. El ref evita disparar el efecto dos
  // veces durante el ciclo de render.
  useEffect(() => {
    if (!user || account || !impliedRole || autoResolvedRef.current) return;
    autoResolvedRef.current = true;
    void choose(impliedRole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, account, impliedRole]);

  // Si ya hay rol asignado, sacarlo de aquí inmediatamente.
  // El router.replace tiene que vivir en useEffect, no en el render:
  // si no, React tira "Cannot update a component while rendering a different
  // component" porque cambiar la URL es un setState side-effect.
  useEffect(() => {
    if (!account) return;
    const target = next !== '/' ? next : defaultDestination(account.role);
    router.replace(target);
  }, [account, next, router]);

  if (account) {
    return null;
  }

  // Auto-resolviendo: el efecto ya disparó choose(impliedRole); mostramos
  // un loader honesto en vez de la pantalla de selección.
  if (user && impliedRole) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
        <span className="inline-flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" />
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
          <span className="ml-2">Llevándote a {impliedRole === 'empresa' ? 'tu panel de empresa' : 'tu entrevista'}…</span>
        </span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
        Cargando…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center px-6 py-16">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-sm">
            <div className="w-14 h-14 mx-auto mb-6 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Lock size={22} />
            </div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-slate-900 tracking-tight leading-tight">
              Inicia sesión para elegir tu rol.
            </h1>
            <p className="text-slate-600 mt-3 leading-relaxed">
              Necesitamos saber si vas a usar Salto como joven buscando oportunidades o como empresa contratando.
            </p>
            <Button
              size="lg"
              className="h-12 px-6 mt-8 gap-3"
              disabled={signingIn}
              onClick={async () => {
                setSigningIn(true);
                try {
                  await signInWithGoogle();
                } finally {
                  setSigningIn(false);
                }
              }}
            >
              {signingIn ? 'Abriendo Google…' : 'Continuar con Google'}
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] flex flex-col">
      <Header />
      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 py-8 sm:py-12 lg:py-20">
        <div className="max-w-3xl w-full">
          <header className="text-center mb-12">
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-3">
              Hola, {user.displayName?.split(' ')[0] || 'bienvenido'}
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-5xl font-display font-bold text-slate-900 tracking-tight leading-tight">
              ¿Cómo vas a usar Salto?
            </h1>
            <p className="text-slate-600 mt-4 max-w-xl mx-auto leading-relaxed">
              Elegí una vez. Por integridad del matching, no se puede ser candidato y reclutador con
              la misma cuenta.
            </p>
          </header>

          <div className="grid md:grid-cols-2 gap-3 sm:gap-4">
            <RoleCard
              role="joven"
              icon={GraduationCap}
              title="Soy joven"
              tagline="Busco mi primera oportunidad."
              bullets={[
                'Cuento mi historia en 5 minutos',
                'IA arma mi Perfil de Evidencia',
                'Recibo matches y micro-tareas pagadas',
              ]}
              accent="emerald"
              busy={submitting === 'joven'}
              disabled={submitting !== null}
              onChoose={() => choose('joven')}
            />
            <RoleCard
              role="empresa"
              icon={Building2}
              title="Soy empresa"
              tagline="Necesito talento junior."
              bullets={[
                'Describo mi necesidad real con mis palabras',
                'IA estructura el rol y rankea candidatos',
                'Pruebo con micro-tareas antes de contratar',
              ]}
              accent="slate"
              busy={submitting === 'empresa'}
              disabled={submitting !== null}
              onChoose={() => choose('empresa')}
            />
          </div>

          <p className="text-center text-xs text-slate-500 mt-10 max-w-md mx-auto leading-relaxed">
            <Sparkles size={11} className="inline mr-1 text-emerald-500" />
            ¿Te equivocaste? Cambiar de rol después requiere soporte —
            escribinos a <a className="underline" href="mailto:soporte@salto.work">soporte@salto.work</a>.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function OnboardingRolPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
          Cargando…
        </div>
      }
    >
      <OnboardingRolInner />
    </Suspense>
  );
}

function Header() {
  return (
    <header className="px-6 h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center sticky top-0 z-20">
      <Link href="/" className="flex items-center gap-2.5">
        <SaltoLogo variant="light" size={32} />
        <span className="font-display font-semibold text-slate-900 tracking-tight">Salto</span>
      </Link>
    </header>
  );
}

interface RoleCardProps {
  role: UserRole;
  icon: typeof GraduationCap;
  title: string;
  tagline: string;
  bullets: string[];
  accent: 'emerald' | 'slate';
  busy: boolean;
  disabled: boolean;
  onChoose: () => void;
}

function RoleCard({ icon: Icon, title, tagline, bullets, accent, busy, disabled, onChoose }: RoleCardProps) {
  const accentClasses =
    accent === 'emerald'
      ? {
          icon: 'bg-emerald-100 text-emerald-700',
          button: 'bg-emerald-600 hover:bg-emerald-700 text-white',
          ring: 'hover:border-emerald-300',
        }
      : {
          icon: 'bg-slate-900 text-white',
          button: 'bg-slate-900 hover:bg-slate-800 text-white',
          ring: 'hover:border-slate-400',
        };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChoose}
      className={`group text-left bg-white border border-slate-200 rounded-3xl p-5 sm:p-7 transition-all shadow-sm hover:shadow-md ${accentClasses.ring} disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 ${accentClasses.icon}`}>
        <Icon size={22} />
      </div>
      <h2 className="text-2xl font-display font-bold text-slate-900 tracking-tight">{title}</h2>
      <p className="text-slate-500 mt-1">{tagline}</p>
      <ul className="mt-5 space-y-2">
        {bullets.map((b) => (
          <li key={b} className="text-sm text-slate-600 flex gap-2">
            <span className="text-emerald-500 font-bold">·</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <div className={`mt-7 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium ${accentClasses.button}`}>
        {busy ? 'Asignando rol…' : `Elegir ${title.toLowerCase()}`}
        {!busy && <ArrowRight size={14} />}
      </div>
    </button>
  );
}
