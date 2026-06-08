'use client';

/**
 * Paso final OPCIONAL tras la entrevista: invita a subir un certificado/diploma
 * para que sus habilidades aparezcan como VERIFICADAS, sin presionar ni mostrar
 * mensajes que desmotiven. Reutiliza el uploader de DocumentsManager y deja
 * siempre visible el CTA para continuar al perfil.
 */
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { DocumentsManager } from '@/components/documents-manager';

export function InterviewDoneStep({
  profileId,
  firstName,
  onContinue,
}: {
  profileId: string;
  firstName?: string;
  onContinue: () => void;
}) {
  const hi = firstName?.trim() ? `, ${firstName.trim()}` : '';
  return (
    <div className="min-h-[calc(100vh-5rem)] overflow-y-auto bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14 space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em] font-semibold">
            <CheckCircle2 size={13} /> Perfil construido
          </div>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-slate-900 tracking-tight leading-tight">
            ¡Listo{hi}! Tu Perfil de Evidencia ya está armado.
          </h1>
          <p className="text-slate-600 text-base leading-relaxed max-w-xl mx-auto">
            Un último paso <strong>opcional</strong>: si tienes algún certificado, diploma o
            constancia, súbelo y esas habilidades aparecerán <strong>verificadas</strong> ante las
            empresas. Si no tienes ahora, no pasa nada — también puedes subirlos cuando quieras
            desde tu perfil.
          </p>
        </div>

        <DocumentsManager profileId={profileId} />

        <div className="flex flex-col items-center gap-2 pt-2">
          <Button onClick={onContinue} size="lg" className="gap-2">
            Ver mi perfil <ArrowRight size={16} />
          </Button>
          <span className="text-xs text-slate-500">Puedes volver a subir documentos en cualquier momento.</span>
        </div>
      </div>
    </div>
  );
}

export default InterviewDoneStep;
