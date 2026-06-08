'use client';

import { Lock } from 'lucide-react';
import DocumentsManager from '@/components/documents-manager';
import InterviewTranscript from '@/components/interview-transcript';
import { useProfile } from '../profile-context';

/**
 * Módulo "Documentos": respaldos verificables (diplomas, certificados) y la
 * transcripción de la entrevista. Es información privada del candidato — la
 * empresa no la ve.
 */
export default function DocumentosPage() {
  const { id, perfil, viewerIsEmpresa } = useProfile();

  if (viewerIsEmpresa) {
    return (
      <div className="border-2 border-dashed border-slate-200 bg-slate-50 rounded-2xl p-12 text-center">
        <Lock size={28} className="text-slate-400 mx-auto mb-3" />
        <p className="text-sm text-slate-500 max-w-sm mx-auto">
          Esta sección es privada del candidato. Las habilidades verificadas por documento ya
          aparecen marcadas en su evidencia.
        </p>
      </div>
    );
  }

  return (
    <>
      <DocumentsManager profileId={id} />

      {perfil.interviewTranscript && perfil.interviewTranscript.length > 0 && (
        <InterviewTranscript transcript={perfil.interviewTranscript} />
      )}
    </>
  );
}
