'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SaltoLogo } from '@/components/ui/salto-logo';
import { UserButton } from '@/components/auth/user-button';
import { RoleCTA } from '@/components/auth/role-cta';
import { ArrowRight, Sparkles, MessageSquareQuote, Layers, Network } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useRedirectIfAuthed } from '@/lib/hooks/use-redirect-if-authed';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function LandingPage() {
  // La landing es marketing: un usuario logueado no debe quedarse aquí.
  // Lo mandamos a su home (o a elegir rol). Anónimos ven la landing al instante.
  const holding = useRedirectIfAuthed();
  const { account } = useAuth();
  const isLoggedIn = !!account;
  if (holding) return <LoadingSpinner variant="full" />;
  const isJoven = account?.role === 'joven';
  const isEmpresa = account?.role === 'empresa';

  return (
    <div className="flex flex-col min-h-screen bg-[#FAFAF7] text-slate-900">
      {/* NAV */}
      <header className="px-6 h-20 flex items-center justify-between border-b border-slate-200/60 bg-[#FAFAF7]/80 backdrop-blur-md sticky top-0 z-50">
        <Link href="/" className="flex items-center shrink-0">
          <SaltoLogo variant="full" size={64} />
        </Link>
        <nav className="hidden md:flex gap-1 items-center text-sm font-medium">
          <Link href="#problema" className="px-3 py-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100/60 transition-colors">El problema</Link>
          <Link href="#flujo" className="px-3 py-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100/60 transition-colors">Cómo funciona</Link>
          <Link href="#ia" className="px-3 py-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100/60 transition-colors">La IA</Link>
          {/* Botones "Soy joven" / "Soy empresa" SOLO para usuarios anónimos.
              Cuando hay sesión, el UserButton (dropdown a la derecha) ya
              tiene "Mi dashboard" + "Publicar necesidad" + "Cerrar sesión",
              así que estos botones eran ruido visual y producían el reporte
              "los 4 botones llevan al mismo destino". */}
          {!isLoggedIn && (
            <>
              <div className="h-5 w-px bg-slate-200 mx-2" />
              <RoleCTA
                role="joven"
                href="/joven/chat"
                variant="outline"
                className="h-9 px-3 text-sm border-0 bg-transparent text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
              >
                Soy joven
              </RoleCTA>
              <RoleCTA role="empresa" href="/empresa/chat" className="h-9 px-3 text-sm">
                Soy empresa
              </RoleCTA>
            </>
          )}
          <div className="h-5 w-px bg-slate-200 mx-2" />
          <UserButton />
        </nav>
      </header>

      <main className="flex-1">
        {/* HERO */}
        <section className="relative px-4 sm:px-6 pt-14 pb-20 sm:pt-24 sm:pb-32 md:pt-32 md:pb-40 overflow-hidden">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-8">
                <Badge variant="secondary" className="mb-8 py-1.5 px-3 bg-emerald-100 text-emerald-800 border-emerald-200/50">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2 animate-pulse" />
                  Barranqui-IA 2026 · Macondo Lab · GOyn · ACOPI
                </Badge>
                <h1 className="text-3xl sm:text-5xl md:text-7xl lg:text-[5.5rem] font-display font-bold tracking-tight leading-[0.95] text-balance">
                  Tu primer empleo formal{' '}
                  <span className="text-emerald-600">no debería depender</span>{' '}
                  de un CV que aún no puedes tener.
                </h1>
                <p className="mt-10 text-lg md:text-xl text-slate-600 max-w-2xl leading-relaxed text-pretty">
                  SaltoAI es la plataforma de IA que <strong className="text-slate-900 font-semibold">traduce experiencia informal en evidencia laboral real</strong>, y emparenta jóvenes con empresas tempranas por <strong className="text-slate-900 font-semibold">potencial</strong>, no por años en un papel.
                </p>

                {/* Hero CTAs: ambos para anónimos, solo el rol activo si hay sesión. */}
                <div className="mt-8 sm:mt-12 flex flex-col sm:flex-row gap-3">
                  {(!isLoggedIn || isJoven) && (
                    <RoleCTA
                      role="joven"
                      href="/joven/chat"
                      className="h-14 px-7 text-base bg-slate-900 hover:bg-slate-800 gap-3 transition-all"
                    >
                      <div className="text-left">
                        <div className="font-semibold">
                          {isJoven ? 'Continuar mi entrevista' : 'Quiero mi primera oportunidad'}
                        </div>
                        <div className="text-xs font-normal text-slate-400">
                          {isJoven ? 'Retomá donde quedaste' : 'Cuenta tu historia · 5 minutos'}
                        </div>
                      </div>
                      <ArrowRight size={18} />
                    </RoleCTA>
                  )}
                  {(!isLoggedIn || isEmpresa) && (
                    <RoleCTA
                      role="empresa"
                      href="/empresa/chat"
                      variant="outline"
                      className="h-14 px-7 text-base border-2 border-emerald-500 bg-emerald-50/40 text-emerald-800 hover:bg-emerald-50 gap-3 transition-all"
                    >
                      <div className="text-left">
                        <div className="font-semibold">
                          {isEmpresa ? 'Publicar otra necesidad' : 'Necesito talento junior'}
                        </div>
                        <div className="text-xs font-normal text-emerald-700/70">
                          {isEmpresa ? 'Hasta 10 candidatos por necesidad' : 'Hasta 10 candidatos · no 200 CVs'}
                        </div>
                      </div>
                      <ArrowRight size={18} />
                    </RoleCTA>
                  )}
                </div>

                <div className="mt-14 flex items-center gap-6 text-sm text-slate-500">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-emerald-500" />
                    <span>Powered by Gemini</span>
                  </div>
                  <div className="h-4 w-px bg-slate-200" />
                  <span>Sin formularios. Sin keywords. Sin 200 CVs.</span>
                </div>
              </div>

              <aside className="hidden lg:block lg:col-span-4 lg:pl-4 lg:pt-4">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/40 p-5 rotate-1">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-xs text-slate-500 uppercase tracking-wider font-medium">Match en vivo</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="font-display font-bold text-2xl text-slate-900">Camila Silva</div>
                      <div className="text-sm text-slate-500">↔ Arepas El Primo</div>
                    </div>
                    <div className="text-right">
                      <div className="font-display font-bold text-4xl text-emerald-600 tabular-nums">96<span className="text-xl">%</span></div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">ICS</div>
                    </div>
                  </div>
                  <div className="mt-5 space-y-2">
                    {[
                      ['Skills', 95],
                      ['Conducta', 95],
                      ['Aprendizaje', 98],
                      ['Contexto', 97],
                    ].map(([label, val]) => (
                      <div key={label as string} className="flex items-center gap-2 text-xs">
                        <span className="w-20 text-slate-500">{label}</span>
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${val}%` }} />
                        </div>
                        <span className="w-7 text-right text-slate-700 tabular-nums">{val}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-600 italic leading-relaxed">
                    "Triplicó las ventas del local de su tía manejando pedidos por Instagram y resolvió reclamos sin protocolos definidos."
                  </div>
                </div>
              </aside>
            </div>
          </div>

          {/* ambient bg */}
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-emerald-200/30 rounded-full blur-3xl -z-10" aria-hidden />
          <div className="absolute top-1/2 -left-32 w-96 h-96 bg-amber-200/20 rounded-full blur-3xl -z-10" aria-hidden />
        </section>

        {/* PROBLEMA — LA TIJERA */}
        <section id="problema" className="bg-white border-y border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
            <div className="max-w-2xl mb-10 sm:mb-16">
              <div className="text-xs uppercase tracking-[0.18em] text-emerald-600 font-semibold mb-4">El problema</div>
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-display font-bold text-slate-900 tracking-tight leading-tight">
                Dos lados rotos que se necesitan mutuamente y no se encuentran.
              </h2>
            </div>

            <div className="grid md:grid-cols-2 gap-px bg-slate-200 border border-slate-200 rounded-2xl overflow-hidden">
              {/* Soy joven */}
              <div className="bg-white p-6 sm:p-10 flex flex-col">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="text-xs uppercase tracking-wider font-semibold text-rose-700">Soy joven</span>
                </div>
                <blockquote className="font-display text-xl sm:text-2xl md:text-3xl text-slate-900 font-medium leading-snug mb-6">
                  "No me contratan porque no tengo experiencia, y no tengo experiencia porque no me contratan."
                </blockquote>
                <p className="text-slate-600 leading-relaxed">
                  Camila, 21. Le manejó las redes y triplicó las ventas del negocio de su tía durante 2 años. Su CV está vacío. Los filtros ATS la descartan antes de que un humano la vea. <strong className="text-slate-900">Su experiencia más valiosa es invisible para el mercado.</strong>
                </p>
              </div>

              {/* Soy empresa */}
              <div className="bg-slate-50 p-6 sm:p-10 flex flex-col">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-xs uppercase tracking-wider font-semibold text-amber-700">Soy empresa</span>
                </div>
                <blockquote className="font-display text-xl sm:text-2xl md:text-3xl text-slate-900 font-medium leading-snug mb-6">
                  "Necesito contratar, pero un junior es un riesgo carísimo."
                </blockquote>
                <p className="text-slate-600 leading-relaxed">
                  Andrés, founder de un local que recién abre. Equipo de 3. Sin RRHH. Publica en LinkedIn y le llegan 200 CVs sin señal. <strong className="text-slate-900">Una mala contratación lo retrasa semanas y plata que no tiene.</strong>
                </p>
              </div>
            </div>

            <div className="mt-12 flex items-center justify-center gap-3 text-sm text-slate-500">
              <div className="h-px w-12 bg-slate-300" />
              <span>El mercado optimiza para lo fácil de medir, no para lo que predice desempeño.</span>
              <div className="h-px w-12 bg-slate-300" />
            </div>
          </div>
        </section>

        {/* FLUJO — CÓMO FUNCIONA */}
        <section id="flujo" className="bg-slate-950 text-white relative overflow-hidden">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
            <div className="max-w-2xl mb-10 sm:mb-16">
              <div className="text-xs uppercase tracking-[0.18em] text-emerald-400 font-semibold mb-4">Cómo funciona</div>
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-display font-bold tracking-tight leading-tight">
                Historia → Evidencia → Match con desglose explicable.
              </h2>
              <p className="mt-6 text-lg text-slate-300 leading-relaxed">
                No es un portal de empleo. Es un sistema de IA que <strong className="text-white">extrae evidencia citada</strong> de la historia del joven, la vectoriza y la compara con el contexto real de cada empresa.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  step: '01',
                  icon: MessageSquareQuote,
                  title: 'Entrevista conversacional',
                  body: 'El joven no llena un CV. Conversa 3-5 turnos con un agente que pregunta por desafíos concretos: qué hizo, cómo, qué resultado.',
                  detail: '"¿Cuál fue el desafío más grande que resolviste en el último año, aunque nadie te pagara?"',
                },
                {
                  step: '02',
                  icon: Layers,
                  title: 'Perfil de Evidencia',
                  body: 'Gemini extrae habilidades, rasgos y logros — cada uno anclado a una cita textual de la conversación. Sin evidencia, no entra.',
                  detail: 'Anti-alucinación: las skills sin cita literal se descartan.',
                },
                {
                  step: '03',
                  icon: Network,
                  title: 'Matching de potencial',
                  body: 'Embeddings hacen shortlist semántico → LLM rankea con desglose ICS: skills · conducta · aprendizaje · contexto.',
                  detail: 'El score es matemática auditable, no "preguntale a la IA".',
                },
              ].map(({ step, icon: Icon, title, body, detail }) => (
                <div key={step} className="border border-slate-800 rounded-2xl p-7 bg-slate-900/50 hover:bg-slate-900 transition-colors group">
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-11 h-11 bg-emerald-500/15 text-emerald-400 rounded-xl flex items-center justify-center">
                      <Icon size={20} strokeWidth={1.75} />
                    </div>
                    <div className="font-display text-3xl font-bold text-slate-700 tabular-nums">{step}</div>
                  </div>
                  <h3 className="font-display font-semibold text-xl mb-3">{title}</h3>
                  <p className="text-sm text-slate-300 leading-relaxed mb-5">{body}</p>
                  <p className="text-xs text-emerald-400/80 italic border-l-2 border-emerald-500/30 pl-3 leading-relaxed">{detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="absolute top-1/3 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -z-0" aria-hidden />
        </section>

        {/* IA — NO ES UN WRAPPER */}
        <section id="ia" className="bg-white border-y border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
            <div className="grid lg:grid-cols-12 gap-8 sm:gap-12 items-start">
              <div className="lg:col-span-5">
                <div className="text-xs uppercase tracking-[0.18em] text-emerald-600 font-semibold mb-4">La IA, en serio</div>
                <h2 className="text-2xl sm:text-3xl md:text-5xl font-display font-bold text-slate-900 tracking-tight leading-tight mb-6 sm:mb-8">
                  Esto no es un wrapper de ChatGPT.
                </h2>
                <p className="text-lg text-slate-600 leading-relaxed mb-6">
                  Si le quitas la IA, SaltoAI deja de existir. El núcleo —extraer evidencia de una historia desordenada y matchear por potencial con un score explicable— es matemáticamente imposible sin extracción estructurada, embeddings y un motor de compatibilidad multifactor.
                </p>
                <ul className="space-y-4 text-slate-600">
                  <li className="flex gap-3">
                    <span className="text-emerald-500 font-bold mt-0.5">·</span>
                    <span>El LLM <strong className="text-slate-900">extrae evidencia citada</strong>, no calcula el score.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-emerald-500 font-bold mt-0.5">·</span>
                    <span>El score lo calcula un motor <strong className="text-slate-900">determinista y auditable</strong>.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-emerald-500 font-bold mt-0.5">·</span>
                    <span>Cada contratación reentrena los pesos: <strong className="text-slate-900">data flywheel propietario</strong>.</span>
                  </li>
                </ul>
              </div>

              <div className="lg:col-span-7">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8">
                  <div className="font-mono text-sm text-slate-500 mb-6 leading-relaxed">
                    <span className="text-slate-400">// Índice de Compatibilidad Salto</span><br />
                    <span className="text-emerald-600 font-semibold">ICS</span> = <span className="text-amber-700">w₁</span>·skillsFit + <span className="text-amber-700">w₂</span>·conducta + <span className="text-amber-700">w₃</span>·aprendizaje + <span className="text-amber-700">w₄</span>·contexto − penalizaciones
                  </div>
                  <div className="space-y-3">
                    {[
                      { label: 'Ajuste semántico de skills', weight: 35, color: 'bg-emerald-500' },
                      { label: 'Compatibilidad conductual', weight: 30, color: 'bg-emerald-400' },
                      { label: 'Señal de aprendizaje', weight: 20, color: 'bg-amber-400' },
                      { label: 'Ajuste de contexto operativo', weight: 15, color: 'bg-amber-300' },
                    ].map(({ label, weight, color }) => (
                      <div key={label} className="flex items-center gap-4">
                        <span className="w-32 sm:w-56 text-sm text-slate-700">{label}</span>
                        <div className="flex-1 h-3 bg-white border border-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full ${color} rounded-full`} style={{ width: `${weight * 2}%` }} />
                        </div>
                        <span className="w-12 text-right text-sm font-mono tabular-nums text-slate-700">{weight}%</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-6 pt-6 border-t border-slate-200 text-xs text-slate-500 italic">
                    Pesos calibrados a mano para el MVP · se reentrenan con resultados reales de contratación.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PARTNERS */}
        <section className="bg-[#FAFAF7] border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-6 py-16">
            <p className="text-center text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold mb-8">
              Apoyado por el ecosistema que ya agrega a nuestros dos usuarios
            </p>
            <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-4 text-slate-400 font-display font-bold text-2xl">
              <span>Macondo Lab</span>
              <span className="text-slate-200">·</span>
              <span>GOyn</span>
              <span className="text-slate-200">·</span>
              <span>ACOPI</span>
              <span className="text-slate-200">·</span>
              <span>Barranqui-IA</span>
            </div>
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="bg-emerald-950 text-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
            <h2 className="text-2xl sm:text-4xl md:text-6xl font-display font-bold tracking-tight leading-tight">
              Empresas tempranas y jóvenes tempranos,{' '}
              <span className="text-emerald-400">creciendo juntos.</span>
            </h2>
            <p className="mt-6 text-lg text-emerald-100/80 max-w-2xl mx-auto">
              El primer empleo no debería depender de un CV que aún no puedes tener. SaltoAI hace que dependa de tu potencial.
            </p>
            {/* CTA final: igual al hero, oculta el rol opuesto con sesión. */}
            <div className="mt-12 flex flex-col sm:flex-row gap-3 justify-center">
              {(!isLoggedIn || isJoven) && (
                <RoleCTA
                  role="joven"
                  href="/joven/chat"
                  className="h-14 px-8 text-base bg-white text-slate-900 hover:bg-slate-100 gap-3"
                >
                  {isJoven ? 'Volver a mi entrevista' : 'Empezar mi entrevista'} <ArrowRight size={18} />
                </RoleCTA>
              )}
              {(!isLoggedIn || isEmpresa) && (
                <RoleCTA
                  role="empresa"
                  href="/empresa/chat"
                  variant="outline"
                  className="h-14 px-8 text-base bg-transparent border-2 border-emerald-400/40 text-emerald-50 hover:bg-emerald-900/40 hover:border-emerald-400 gap-3"
                >
                  {isEmpresa ? 'Publicar otra necesidad' : 'Publicar mi necesidad'} <ArrowRight size={18} />
                </RoleCTA>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="py-10 border-t border-slate-200 bg-[#FAFAF7]">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row gap-4 justify-between items-center text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <SaltoLogo variant="full" size={44} />
            <span>© {new Date().getFullYear()} · Tu primer salto al empleo formal.</span>
          </div>
          <span>Desarrollado para Barranqui-IA 2026 · Macondo Lab · GOyn · ACOPI</span>
        </div>
      </footer>
    </div>
  );
}
