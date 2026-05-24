'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/lib/auth-context';
import { SaltoLogo } from '@/components/ui/salto-logo';
import { UserButton } from '@/components/auth/user-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Profile, MicroTask } from '@/lib/types';
import {
  LayoutDashboard,
  User,
  Network,
  Briefcase,
  Sparkles,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  Star,
  Menu,
  X,
  MessageSquareQuote,
  Layers,
  TrendingUp,
  Zap,
} from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────

function getGreeting(name: string) {
  const h = new Date().getHours();
  const prefix = h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
  return `${prefix}, ${name}`;
}

function FadeUp({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

// ─── sidebar nav config ───────────────────────────────────────────────────────

const NAV_JOVEN = [
  { icon: LayoutDashboard, label: 'Overview', href: '/dashboard' },
  { icon: User, label: 'Mi perfil', href: '/joven/perfil' },
  { icon: Network, label: 'Oportunidades', href: '/joven/conectar' },
];

// ─── sub-components ───────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  value,
  label,
  color = 'text-slate-900',
  delay = 0,
}: {
  icon: React.ElementType;
  value: number | string;
  label: string;
  color?: string;
  delay?: number;
}) {
  return (
    <FadeUp delay={delay}>
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0 text-slate-600">
          <Icon size={16} strokeWidth={1.75} />
        </div>
        <div>
          <div className={`font-display font-bold text-xl ${color} tabular-nums leading-none`}>{value}</div>
          <div className="text-xs text-slate-500 mt-0.5">{label}</div>
        </div>
      </div>
    </FadeUp>
  );
}

function TaskItem({ task }: { task: MicroTask }) {
  const statusMap = {
    pending: { label: 'Pendiente', style: 'bg-amber-100 text-amber-800' },
    in_progress: { label: 'En progreso', style: 'bg-blue-100 text-blue-800' },
    delivered: { label: 'Entregada', style: 'bg-slate-200 text-slate-700' },
    evaluated: { label: 'Evaluada', style: 'bg-emerald-100 text-emerald-800' },
    paid: { label: 'Pagada', style: 'bg-emerald-100 text-emerald-800' },
  };
  const { label, style } = statusMap[task.status] ?? { label: task.status, style: 'bg-slate-100 text-slate-700' };

  return (
    <Link href={`/joven/tareas/${task.id}`}>
      <div className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group">
        <div className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center flex-shrink-0">
          <Briefcase size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-slate-900 leading-snug truncate">{task.title}</p>
            <Badge className={`${style} border-transparent text-[10px] flex-shrink-0`}>{label}</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{task.companyName}</p>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <DollarSign size={11} className="text-emerald-600" />
              ${task.amountCOP.toLocaleString('es-CO')} COP
            </span>
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {task.deadlineHours}h
            </span>
            {task.companyRating && (
              <span className="flex items-center gap-1 text-amber-600">
                <Star size={11} fill="currentColor" />
                {task.companyRating}/5
              </span>
            )}
          </div>
        </div>
        <ArrowRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0 mt-1" />
      </div>
    </Link>
  );
}

function EmptyState({ icon: Icon, title, body, cta, href }: {
  icon: React.ElementType;
  title: string;
  body: string;
  cta: string;
  href: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
      <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mb-4">
        <Icon size={22} strokeWidth={1.5} />
      </div>
      <h3 className="text-sm font-semibold text-slate-900 mb-1">{title}</h3>
      <p className="text-xs text-slate-500 max-w-xs leading-relaxed mb-4">{body}</p>
      <Link href={href}>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs">
          {cta} <ArrowRight size={12} />
        </Button>
      </Link>
    </div>
  );
}

function SidebarNav({
  uid,
  onClose,
}: {
  uid: string;
  onClose?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-0.5 p-3">
      {NAV_JOVEN.map(({ icon: Icon, label, href }) => {
        const resolvedHref = href === '/joven/perfil' ? `/joven/perfil/${uid}` : href;
        return (
          <Link key={label} href={resolvedHref} onClick={onClose}>
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors">
              <Icon size={16} strokeWidth={1.75} />
              {label}
            </div>
          </Link>
        );
      })}

    </nav>
  );
}

// ─── AI insight generator ─────────────────────────────────────────────────────

function getInsight(profile: Profile | null, tasks: MicroTask[]): string {
  if (!profile) return 'Completa tu entrevista para que la IA detecte tus señales laborales más fuertes.';
  const active = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');
  if (active.length > 0) return `Tienes ${active.length} tarea${active.length > 1 ? 's' : ''} activa${active.length > 1 ? 's' : ''}. Entregarla a tiempo suma evidencia verificada a tu perfil.`;
  if (profile.skills.length > 0) return `Tu skill en "${profile.skills[0]}" aparece en múltiples búsquedas activas. Estás indexado y visible para empresas.`;
  return 'Cuanto más específico sea lo que cuentas en la entrevista, mejor ICS obtendrás frente a las empresas.';
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  // `/dashboard` es la home del JOVEN (sidebar con "Mi perfil", "Oportunidades", etc.).
  // Sin chequeo de rol, una empresa logueada cae acá y ve una UI que no es suya
  // (regresión introducida al lanzar el dashboard sin gating por rol).
  // Solución: si el `account.role` es `empresa`, redirigimos al hub de empresas.
  const { user, account, loading, roleLoading } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tasks, setTasks] = useState<MicroTask[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading || roleLoading) return;
    if (!user) {
      router.replace('/');
      return;
    }
    if (account?.role === 'empresa') {
      router.replace('/empresa');
    }
  }, [user, account, loading, roleLoading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [profRes, tasksRes] = await Promise.all([
          fetch(`/api/perfil?id=${encodeURIComponent(user.uid)}`),
          fetch(`/api/microtask/list?profileId=${encodeURIComponent(user.uid)}`),
        ]);
        if (profRes.ok) {
          const d = await profRes.json();
          setProfile(d.profile ?? null);
        }
        if (tasksRes.ok) {
          const d = await tasksRes.json();
          setTasks(d.tasks ?? []);
        }
      } catch {
        /* silent */
      } finally {
        setDataLoading(false);
      }
    })();
  }, [user]);

  // close sidebar on outside click
  useEffect(() => {
    if (!sidebarOpen) return;
    const handler = (e: MouseEvent) => {
      if (!sidebarRef.current?.contains(e.target as Node)) setSidebarOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sidebarOpen]);

  // Mientras se resuelve auth/rol, mostramos el loader. Si rol resolvió como
  // empresa, el useEffect ya disparó router.replace; igual mantenemos loader
  // para evitar un flash de UI joven antes del redirect.
  if (loading || roleLoading || !user || account?.role === 'empresa') {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" />
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
        </div>
      </div>
    );
  }

  const firstName = user.displayName?.split(' ')[0] || 'tú';
  const initials = (user.displayName || user.email || '?')
    .split(' ')
    .map((s: string) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const activeTasks = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');
  const completedTasks = tasks.filter((t) => t.status === 'evaluated' || t.status === 'paid');
  const insight = getInsight(profile, tasks);

  return (
    <div className="min-h-screen bg-[#FAFAF7] flex flex-col">

      {/* ── TOPBAR ── */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200 h-14 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Abrir menú"
          >
            <Menu size={18} />
          </button>
          <Link href="/" className="flex items-center gap-2">
            <SaltoLogo variant="icon" size={26} />
            <span className="font-display font-semibold text-slate-900 tracking-tight text-sm">Salto</span>
          </Link>
        </div>
        <UserButton />
      </header>

      <div className="flex flex-1">

        {/* ── SIDEBAR desktop ── */}
        <aside className="hidden md:flex flex-col w-52 border-r border-slate-200 bg-white/60 sticky top-14 self-start h-[calc(100vh-3.5rem)] overflow-y-auto flex-shrink-0">
          <SidebarNav uid={user.uid} />
        </aside>

        {/* ── SIDEBAR mobile overlay ── */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              <motion.div
                className="fixed inset-0 bg-slate-900/40 z-40 md:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSidebarOpen(false)}
              />
              <motion.div
                ref={sidebarRef}
                className="fixed top-0 left-0 bottom-0 w-64 bg-white z-50 md:hidden shadow-xl overflow-y-auto"
                initial={{ x: -264 }}
                animate={{ x: 0 }}
                exit={{ x: -264 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              >
                <div className="flex items-center justify-between p-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <SaltoLogo variant="icon" size={24} />
                    <span className="font-display font-semibold text-slate-900 text-sm">Salto</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(false)}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                    aria-label="Cerrar menú"
                  >
                    <X size={16} />
                  </button>
                </div>
                <SidebarNav uid={user.uid} onClose={() => setSidebarOpen(false)} />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ── MAIN CONTENT ── */}
        <main className="flex-1 min-w-0 px-4 md:px-8 py-8 space-y-7 max-w-4xl">

          {/* WELCOME */}
          <FadeUp>
            <div className="flex items-center gap-3">
              {user.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'avatar'}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-2xl object-cover shadow"
                />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white font-display font-bold text-lg flex items-center justify-center shadow">
                  {initials}
                </div>
              )}
              <div>
                <h1 className="text-xl md:text-2xl font-display font-bold text-slate-900 tracking-tight">
                  {getGreeting(firstName)}
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  {profile ? 'Tu perfil está activo y visible para empresas.' : 'Completa tu entrevista para empezar.'}
                </p>
              </div>
            </div>
          </FadeUp>

          {/* STAT CARDS */}
          {!dataLoading && (
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={Layers}
                value={profile?.skills.length ?? 0}
                label="Skills"
                color="text-emerald-600"
                delay={0.05}
              />
              <StatCard
                icon={MessageSquareQuote}
                value={profile?.evidence.length ?? 0}
                label="Evidencias"
                color="text-emerald-600"
                delay={0.1}
              />
            </div>
          )}

          {/* ONBOARDING — sin perfil */}
          {!dataLoading && !profile && (
            <FadeUp delay={0.1}>
              <section className="bg-gradient-to-br from-emerald-50 via-white to-amber-50/40 border border-emerald-200/60 rounded-2xl p-6 md:p-8">
                <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">
                  Por donde empezar
                </div>
                <h2 className="font-display font-bold text-xl text-slate-900 mb-6">
                  Tu camino al primer empleo formal.
                </h2>
                <div className="grid md:grid-cols-3 gap-4 mb-7">
                  {[
                    { step: '01', icon: MessageSquareQuote, title: 'Entrevista', body: '5 minutos. Cuéntanos un desafío real que hayas resuelto.' },
                    { step: '02', icon: Layers, title: 'Perfil de Evidencia', body: 'La IA extrae tus habilidades y las ancla a tus propias palabras.' },
                    { step: '03', icon: Network, title: 'Matching', body: 'Las empresas te encuentran por potencial, no por CV.' },
                  ].map(({ step, icon: Icon, title, body }) => (
                    <div key={step} className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center">
                          <Icon size={15} strokeWidth={1.75} />
                        </div>
                        <span className="font-display font-bold text-slate-200 text-xl tabular-nums">{step}</span>
                      </div>
                      <h3 className="font-semibold text-slate-900 text-sm mb-1">{title}</h3>
                      <p className="text-xs text-slate-500 leading-relaxed">{body}</p>
                    </div>
                  ))}
                </div>
                <Link href="/joven/chat">
                  <Button className="gap-2">
                    Empezar mi entrevista <ArrowRight size={14} />
                  </Button>
                </Link>
              </section>
            </FadeUp>
          )}

          {/* MAIN GRID — con perfil */}
          {!dataLoading && profile && (
            <div className="grid gap-5">

              {/* Perfil de Evidencia */}
              <FadeUp delay={0.1}>
                <section className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-emerald-200 transition-colors h-full flex flex-col">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <Badge className="bg-emerald-100 text-emerald-800 border-transparent text-[10px] mb-2">
                        <CheckCircle2 size={10} className="mr-1" />
                        Activo · visible para empresas
                      </Badge>
                      <h2 className="font-display font-bold text-lg text-slate-900 leading-tight">{profile.name}</h2>
                    </div>
                    <Link href={`/joven/perfil/${user.uid}`}>
                      <Button size="sm" variant="outline" className="gap-1 text-xs flex-shrink-0">
                        Ver <ArrowRight size={11} />
                      </Button>
                    </Link>
                  </div>

                  {profile.summary && (
                    <p className="text-xs text-slate-600 leading-relaxed mb-4 line-clamp-3">{profile.summary}</p>
                  )}

                  {profile.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {profile.skills.slice(0, 5).map((s) => (
                        <span key={s} className="text-[11px] px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full">
                          {s}
                        </span>
                      ))}
                      {profile.skills.length > 5 && (
                        <span className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                          +{profile.skills.length - 5}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      <strong className="text-slate-700 font-semibold">{profile.evidence.length}</strong> evidencias citadas
                    </span>
                    <Link href="/joven/conectar">
                      <Button size="sm" variant="ghost" className="gap-1 text-xs text-emerald-700 hover:text-emerald-800">
                        <Network size={12} /> Ver oportunidades
                      </Button>
                    </Link>
                  </div>
                </section>
              </FadeUp>

            </div>
          )}

          {/* QUICK ACTIONS */}
          <FadeUp delay={0.2}>
            <div>
              <h2 className="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold mb-3">
                Acciones rápidas
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { icon: MessageSquareQuote, label: profile ? 'Repetir entrevista' : 'Empezar entrevista', href: '/joven/chat', color: 'text-emerald-700', bg: 'bg-emerald-50' },
                  { icon: Network, label: 'Oportunidades', href: '/joven/conectar', color: 'text-slate-700', bg: 'bg-slate-50' },
                  { icon: User, label: 'Mi perfil', href: `/joven/perfil/${user.uid}`, color: 'text-slate-700', bg: 'bg-slate-50' },
                ].map(({ icon: Icon, label, href, color, bg }) => (
                  <Link key={label} href={href} className="group">
                    <div className={`${bg} border border-slate-200 rounded-xl p-4 hover:shadow-sm hover:border-slate-300 transition-all flex flex-col items-start gap-2`}>
                      <div className={`${color}`}>
                        <Icon size={18} strokeWidth={1.75} />
                      </div>
                      <span className="text-xs font-medium text-slate-800 leading-snug">{label}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </FadeUp>

          {/* AI INSIGHT */}
          {!dataLoading && (
            <FadeUp delay={0.25}>
              <div className="bg-slate-950 text-white rounded-2xl p-5 flex items-start gap-4">
                <div className="w-9 h-9 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Zap size={16} fill="currentColor" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-300 font-semibold mb-1">
                    Insight de tu cuenta
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed">{insight}</p>
                </div>
              </div>
            </FadeUp>
          )}


        </main>
      </div>
    </div>
  );
}
