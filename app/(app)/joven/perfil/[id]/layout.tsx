'use client';

import { use, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import {
  Sparkles,
  TrendingUp,
  FileText,
  FolderOpen,
  CheckCircle2,
  Building2,
  ArrowRight,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { BasicsEditor } from '@/components/joven/basics-editor';
import { profileToJovenBasics } from '@/lib/user-onboarding-storage';
import type { Gender, JovenBasics } from '@/lib/types';
import { ProfileProvider, useProfile } from './profile-context';

const GENDER_LABEL: Record<Gender, string> = {
  mujer: 'Mujer',
  hombre: 'Hombre',
  otro: 'Otro',
  prefiero_no_decir: '',
};

interface ModuleDef {
  seg: string; // '' = Resumen
  label: string; // etiqueta para el dueño
  empresaLabel?: string; // etiqueta cuando el viewer es empresa
  icon: LucideIcon;
  empresa: boolean; // ¿visible para empresa?
}

const MODULES: ModuleDef[] = [
  { seg: '', label: 'Resumen', empresaLabel: 'Evaluar', icon: Sparkles, empresa: true },
  { seg: 'hoja-de-vida', label: 'Hoja de vida', empresaLabel: 'Evidencia', icon: FileText, empresa: true },
  { seg: 'documentos', label: 'Documentos', icon: FolderOpen, empresa: false },
  { seg: 'potencial', label: 'Potencial', icon: TrendingUp, empresa: true },
];

/**
 * Chrome compartido del módulo "Mi Perfil": banner contextual (empresa),
 * encabezado fijo (nombre, resumen, editar, actualizar) y sub-navegación por
 * páginas reales. El contenido de cada módulo entra por {children}.
 */
function ProfileChrome({ children }: { children: ReactNode }) {
  const { id, perfil, setPerfil, storage, viewerIsEmpresa, viewerIsOwner, regenerating, handleRegenerate } =
    useProfile();
  const { user } = useAuth();
  const pathname = usePathname() ?? '';
  const reduce = useReducedMotion();
  const base = `/joven/perfil/${id}`;

  const modules = MODULES.filter((m) => (viewerIsEmpresa ? m.empresa : true));
  // El encabezado completo (nombre, resumen, editar, actualizar) solo va en la
  // página principal "Resumen". Los sub-módulos entran directo a su contenido.
  const isMainRoute = pathname === base;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-10 sm:space-y-14">
      {/* Banner contextual para empresas que llegan desde sus matches. */}
      {viewerIsEmpresa && (
        <div className="bg-gradient-to-r from-emerald-50 to-emerald-50/30 border border-emerald-200/60 rounded-2xl px-5 py-3.5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 text-sm text-slate-700">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
              <Building2 size={14} />
            </div>
            <div className="leading-snug">
              <span className="font-semibold text-slate-900">Estás viendo el perfil de un candidato</span>
              <span className="text-slate-600 hidden md:inline">
                {' '}
                · SaltoAI te muestra evidencia citada, no un CV.
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/empresa">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowRight size={13} className="rotate-180" /> Mis matches
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* HERO — solo en la página principal "Resumen". Los sub-módulos entran
          directo a su contenido (su propio título encabeza cada uno). */}
      {isMainRoute && (
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 animate-fade-up">
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-transparent">
            <CheckCircle2 size={12} className="mr-1" />
            Perfil de Evidencia · Verificado por SaltoAI
          </Badge>
          <Badge variant="outline" className="border-slate-200 text-slate-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
            Indexado para matching
          </Badge>
          {storage === 'firestore' ? (
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50/50 text-emerald-800">
              Guardado en la nube
            </Badge>
          ) : storage === 'memory' ? (
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50/50 text-emerald-900">
              Solo en esta sesión · configura Firebase
            </Badge>
          ) : null}
        </div>
        <h1
          className="text-3xl sm:text-4xl md:text-6xl font-display font-bold text-slate-900 tracking-tight leading-[1.05] animate-fade-up"
          style={{ animationDelay: '0.06s' }}
        >
          {perfil.name}
        </h1>
        <p className="text-slate-600">
          {perfil.age ?? '—'} años
          {perfil.gender && perfil.gender !== 'prefiero_no_decir' && GENDER_LABEL[perfil.gender]
            ? ` · ${GENDER_LABEL[perfil.gender]}`
            : ''}
        </p>
        {perfil.summary && (
          <p
            className="text-base sm:text-lg md:text-xl text-slate-700 leading-relaxed max-w-3xl animate-fade-up"
            style={{ animationDelay: '0.12s' }}
          >
            {perfil.summary}
          </p>
        )}
        {viewerIsOwner && profileToJovenBasics(perfil) && (
          <div className="pt-2">
            <BasicsEditor
              key={`${perfil.name}-${perfil.age}-${perfil.gender}`}
              profileId={id}
              uid={user!.uid}
              initial={profileToJovenBasics(perfil)!}
              onSaved={(basics: JovenBasics) =>
                setPerfil((p) => (p ? { ...p, name: basics.name, age: basics.age, gender: basics.gender } : p))
              }
            />
          </div>
        )}
        {viewerIsOwner && (perfil.interviewTranscript?.length ?? 0) > 0 && (
          <div className="pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-slate-600"
              onClick={handleRegenerate}
              disabled={regenerating}
            >
              <RefreshCw size={14} className={regenerating ? 'animate-spin' : ''} />
              {regenerating ? 'Actualizando…' : 'Actualizar perfil con la última versión'}
            </Button>
          </div>
        )}
      </header>
      )}

      {/* Sub-navegación entre módulos. En escritorio, el dueño ya la tiene en el
          sidebar, así que aquí solo se muestra en móvil; la empresa (sin
          sidebar) la ve siempre. */}
      <nav
        className={`-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto border-b border-slate-200 ${
          viewerIsEmpresa ? '' : 'md:hidden'
        }`}
      >
        <div className="flex gap-1 min-w-max">
          {modules.map((m) => {
            const href = m.seg ? `${base}/${m.seg}` : base;
            const isActive = pathname === href;
            const Icon = m.icon;
            const label = viewerIsEmpresa && m.empresaLabel ? m.empresaLabel : m.label;
            return (
              <Link
                key={m.seg || 'resumen'}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon size={15} strokeWidth={1.9} />
                {label}
                {isActive && (
                  <motion.span
                    layoutId={reduce ? undefined : 'perfil-subnav-underline'}
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-emerald-600"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {children}
    </div>
  );
}

export default function ProfileLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <ProfileProvider id={id}>
      <ProfileChrome>{children}</ProfileChrome>
    </ProfileProvider>
  );
}
