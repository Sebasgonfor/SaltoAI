'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { GraduationCap, Building2, ArrowRight, Sparkles } from 'lucide-react';
import { AuthForm } from '@/components/auth/auth-form';
import { useAuth, type UserRole, type UserAccount } from '@/lib/auth-context';
import { SaltoLogo } from '@/components/ui/salto-logo';

function isSafeNext(value: string | null): string {
  if (!value) return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

function defaultDestination(role: UserRole, interviewCompleted?: boolean): string {
  if (interviewCompleted) {
    return role === 'joven' ? '/dashboard' : '/empresa';
  }
  return role === 'joven' ? '/joven/chat' : '/empresa/chat';
}

/**
 * El `next` del query string se RESPETA solo si es coherente con el rol
 * resuelto. Si no, lo descartamos y vamos al default del rol. Sin esto,
 * un user que elige "joven" pero entró al onboarding con `?next=/empresa/chat`
 * (heredado de un flow anterior) termina chocando contra el RoleGate de
 * empresa, viendo "Tu cuenta está registrada como joven". El rol elegido
 * manda, no el query.
 */
function resolveTarget(account: UserAccount, next: string): string {
  const { role, interviewCompleted } = account;
  if (next === '/') return defaultDestination(role, interviewCompleted);
  // Coherente: el next apunta al área del rol elegido.
  if (role === 'joven' && (next === '/joven' || next.startsWith('/joven/'))) return next;
  if (role === 'empresa' && (next === '/empresa' || next.startsWith('/empresa/'))) return next;
  // Neutro (no /joven/* ni /empresa/*): respetamos.
  if (!next.startsWith('/joven') && !next.startsWith('/empresa')) return next;
  // Conflicto (next del rol opuesto): default del rol elegido.
  return defaultDestination(role, interviewCompleted);
}

function OnboardingRolInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, account, loading, chooseRole } = useAuth();
  const [submitting, setSubmitting] = useState<UserRole | null>(null);
  const next = isSafeNext(params.get('next'));

  const choose = async (role: UserRole) => {
    if (!user) return;
    setSubmitting(role);
    try {
      const acc = await chooseRole(role);
      if (!acc) return;
      // El destino se calcula con el rol REAL devuelto por chooseRole, no
      // con `role` literal — si ya había account (set-once), chooseRole
      // devuelve el rol existente, no el clickeado.
      router.push(resolveTarget(acc, next));
    } finally {
      setSubmitting(null);
    }
  };

  // ANTES había una "auto-resolución" que inferia el rol del `next`
  // (ej: next=/empresa/chat → asignaba empresa sin preguntar). Esto era
  // útil cuando el `next` venía directamente del click "Soy empresa" en
  // la landing, pero generaba un bug grave: si el `next` quedaba
  // contaminado de un flow anterior (signup por email que heredaba
  // `next=/empresa/chat` de una visita previa), el sistema asignaba
  // empresa a un usuario llamado "Juan Joven" sin mostrarle el picker.
  //
  // La auto-resolución era redundante con el feature de `pendingRoleRef`
  // del AuthProvider — cuando el user clickea "Soy X" + Google, el role
  // se aplica DENTRO de onAuthStateChanged antes de aterrizar acá.
  //
  // Sin auto-resolución, la única forma de salir de esta página sin
  // elegir es: (1) el AuthProvider asignó el rol vía pendingRole (caso
  // Google + click "Soy X") — entonces account != null y el useEffect
  // abajo redirige; o (2) el user clickea uno de los RoleCard.

  // Si ya hay rol asignado, sacarlo de aquí inmediatamente.
  // resolveTarget descarta el `next` si es del rol opuesto — sin esto
  // un user joven con `?next=/empresa/chat` aterriza en el muro de
  // RoleGate de empresa.
  useEffect(() => {
    if (!account) return;
    router.replace(resolveTarget(account, next));
  }, [account, next, router]);

  if (account) {
    return null;
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
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 md:p-10 shadow-sm">
            <AuthForm
              title="Inicia sesión para elegir tu rol"
              subtitle="Necesitamos saber si vas a usar Salto como joven buscando oportunidades o como empresa contratando."
            />
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
              Elige una vez. Por integridad del matching, no se puede ser candidato y reclutador con
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
    <header className="px-6 h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center sticky top-0 z-20">
      <Link href="/" className="flex items-center shrink-0">
        <SaltoLogo variant="full" size={56} />
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
