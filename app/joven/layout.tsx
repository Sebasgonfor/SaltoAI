import Link from 'next/link';

export default function JovenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col">
      <header className="px-6 h-14 bg-white border-b border-slate-200 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center text-white font-bold font-display">S</div>
            <span className="font-display font-medium text-slate-900">Salto Joven</span>
          </Link>
        </div>
        <div className="flex gap-4 text-sm font-medium">
          <Link href="/joven/chat" className="text-slate-600 hover:text-slate-900">Mi Entrevista</Link>
          <Link href="/joven/perfil" className="text-emerald-700 hover:text-emerald-800">Mi Perfil de Evidencia</Link>
        </div>
      </header>
      <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full p-4 md:p-8">
        {children}
      </main>
    </div>
  );
}
