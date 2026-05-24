'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export function LegalBackButton() {
  const params = useSearchParams();
  const router = useRouter();
  const raw = params.get('from');

  // Solo aceptamos rutas relativas propias para evitar open-redirect
  const destination =
    raw && raw.startsWith('/') && !raw.startsWith('//')
      ? raw
      : '/';

  return (
    <button
      type="button"
      onClick={() => router.push(destination)}
      className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors"
    >
      <ArrowLeft size={14} strokeWidth={2} />
      <span className="hidden sm:inline font-medium">Volver a Salto</span>
    </button>
  );
}
