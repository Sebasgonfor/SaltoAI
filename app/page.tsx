import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Navbar */}
      <header className="px-6 h-16 flex items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold font-display text-xl">S</div>
          <span className="font-display font-bold text-xl tracking-tight text-slate-900">Salto</span>
        </div>
        <nav className="hidden md:flex gap-6 items-center">
          <Link href="#jovenes" className="text-sm font-medium text-slate-600 hover:text-slate-900">Para Jóvenes</Link>
          <Link href="#empresas" className="text-sm font-medium text-slate-600 hover:text-slate-900">Para Startups</Link>
          <div className="h-4 w-px bg-slate-200" />
          <Link href="/joven/chat">
            <Button variant="ghost" className="text-emerald-700">Soy Joven</Button>
          </Link>
          <Link href="/empresa/publicar">
            <Button>Soy Empresa</Button>
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="px-6 py-24 md:py-32 max-w-5xl mx-auto text-center flex flex-col items-center">
          <Badge variant="secondary" className="mb-6 py-1 px-3">
            Startup Hackathon Barranqui-IA 2026
          </Badge>
          <h1 className="text-4xl md:text-6xl font-display font-bold text-slate-900 tracking-tight leading-tight max-w-4xl text-balance">
            Tu primera oportunidad formal depende de <span className="text-emerald-600">tu potencial, no de un CV.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-slate-600 max-w-2xl text-pretty">
            La plataforma de IA que traduce la experiencia informal de los jóvenes en evidencia real, conectándolos con empresas en etapa temprana que necesitan crecer sin los riesgos de contratar mal.
          </p>
          
          <div className="mt-10 flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <Link href="/joven/chat" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto text-base h-14 px-8 bg-slate-900 hover:bg-slate-800">
                🚀 Quiero mi primera oportunidad
                <span className="block text-xs font-normal text-slate-400 mt-0.5">Traduce tu historia a un Perfil IA</span>
              </Button>
            </Link>
            <Link href="/empresa/publicar" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-base h-14 px-8 border-2 border-emerald-500 text-emerald-700 hover:bg-emerald-50">
                🏢 Necesito talento junior
                <span className="block text-xs font-normal text-emerald-600/70 mt-0.5">Matching por contexto y potencial</span>
              </Button>
            </Link>
          </div>
        </section>

        {/* The Problem Section */}
        <section className="bg-white py-24 border-y border-slate-100">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-display font-bold text-slate-900">El mercado está roto por los dos lados</h2>
              <p className="mt-4 text-slate-600">El CV tradicional elimina al mejor talento antes de llegar a la entrevista.</p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-12">
              <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100">
                <div className="text-rose-500 mb-4">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <h3 className="text-xl font-bold font-display text-slate-900 mb-3">La barrera de entrada</h3>
                <p className="text-slate-600 leading-relaxed">
                  "No me contratan porque no tengo experiencia, y no tengo experiencia porque no me contratan." Modificaste el Instagram de tu tía y triplicaste las ventas, pero un ATS te descarta por no tener "2 años corporativos".
                </p>
              </div>

              <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100">
                <div className="text-amber-500 mb-4">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <h3 className="text-xl font-bold font-display text-slate-900 mb-3">El riesgo para la Startup</h3>
                <p className="text-slate-600 leading-relaxed">
                  "Necesito contratar pero un junior es un riesgo." Tienes 3 empleados y publicas en LinkedIn. Te llegan 200 hojas de vida idénticas. No tienes equipo de RRHH para saber quién sobrevive en tu caos.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Product Demo Simulation Section */}
        <section className="py-24 bg-slate-950 text-white">
          <div className="max-w-6xl mx-auto px-6">
            <div className="mb-16 text-center">
              <h2 className="text-3xl font-display font-bold">Cómo funciona Salto</h2>
              <p className="mt-4 text-slate-400">Nuestro motor de IA extrae la evidencia de vida y la conecta con tu contexto.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              <div className="border border-slate-800 rounded-2xl p-6 bg-slate-900">
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center font-bold text-xl mb-6">1</div>
                <h3 className="text-lg font-bold mb-2">Entrevista Conversacional</h3>
                <p className="text-sm text-slate-400">No hay formularios. Cuéntale a nuestra IA tus desafíos, qué aprendiste y qué hiciste por tu cuenta. Extraemos tus habilidades invisibles.</p>
              </div>
              <div className="border border-slate-800 rounded-2xl p-6 bg-slate-900">
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center font-bold text-xl mb-6">2</div>
                <h3 className="text-lg font-bold mb-2">Perfil de Evidencia</h3>
                <p className="text-sm text-slate-400">Tu historia se transforma en un perfil estructurado y ATS-friendly (Índice de Compatibilidad). Las empresas ven pruebas, no solo palabras.</p>
              </div>
              <div className="border border-slate-800 rounded-2xl p-6 bg-slate-900">
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center font-bold text-xl mb-6">3</div>
                <h3 className="text-lg font-bold mb-2">Matching de Potencial</h3>
                <p className="text-sm text-slate-400">No buscamos palabras clave. Unimos rasgos de comportamiento con el contexto de las Startups (ej. "Tolerancia al Caos"). Recibe 3 matches perfectos.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-12 bg-slate-50 border-t border-slate-200 text-center">
        <p className="text-slate-500 text-sm">© {new Date().getFullYear()} Salto. Desarrollado para Barranqui-IA 2026. Apoyado por Macondo Lab & GOyn.</p>
      </footer>
    </div>
  );
}
