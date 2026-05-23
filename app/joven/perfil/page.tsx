import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { MessageSquareQuote, ArrowRight } from 'lucide-react';

export default function PerfilIndex() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-24 text-center">
      <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
        <MessageSquareQuote size={28} strokeWidth={1.75} />
      </div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">Aún no hay perfil</div>
      <h1 className="text-3xl md:text-4xl font-display font-bold text-slate-900 tracking-tight mb-4 leading-tight">
        Tu Perfil de Evidencia se construye después de conversar.
      </h1>
      <p className="text-slate-600 leading-relaxed mb-8">
        Sin formularios, sin redactar nada. Cuéntale a la IA un desafío que hayas resuelto y ella extrae las habilidades, rasgos y logros — cada uno anclado a una cita textual.
      </p>
      <Link href="/joven/chat">
        <Button size="lg" className="gap-2">
          Empezar mi entrevista <ArrowRight size={16} />
        </Button>
      </Link>
    </div>
  );
}
