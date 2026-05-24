'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Lock, X } from 'lucide-react';
import type { CompanyNeed } from '@/lib/types';
import { isNeedClosed } from '@/lib/need-status';

type Props = {
  need: CompanyNeed;
  companyId: string;
  /** Compacto para cards del listado. */
  variant?: 'panel' | 'button';
  onClosed?: (need: CompanyNeed) => void;
};

export function CloseNeedControl({ need, companyId, variant = 'panel', onClosed }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hired, setHired] = useState<'yes' | 'no' | 'skip' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!need.id || isNeedClosed(need)) return null;

  const submit = async () => {
    if (hired === null) {
      setError('Indica si contrataste a alguien de esta búsqueda (o elige «Aún no / cerramos sin contratar»).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/necesidad/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          needId: need.id,
          companyId,
          ...(hired !== 'skip' && { hired: hired === 'yes' }),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'No pudimos cerrar la vacante.');
        return;
      }
      setOpen(false);
      onClosed?.(json.need as CompanyNeed);
      router.refresh();
    } catch {
      setError('Error de red.');
    } finally {
      setLoading(false);
    }
  };

  if (variant === 'button' && !open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 text-slate-700"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Lock size={13} />
        Cerrar vacante
      </Button>
    );
  }

  if (variant === 'button' && open) {
    return (
      <div
        className="mt-3 p-4 border border-slate-200 rounded-xl bg-slate-50 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        {panelContent()}
      </div>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 border-rose-200 text-rose-800 hover:bg-rose-50"
        onClick={() => setOpen(true)}
      >
        <Lock size={14} />
        Cerrar vacante
      </Button>
    );
  }

  return (
    <div className="rounded-2xl border border-rose-200/80 bg-rose-50/50 p-5 space-y-4">
      {panelContent()}
    </div>
  );

  function panelContent() {
    return (
      <>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Cerrar esta vacante</div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed max-w-lg">
              Dejará de aparecer para nuevos candidatos. El shortlist actual se conserva solo para
              tu consulta — no habrá más matching automático.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setHired(null);
              setError(null);
            }}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-white"
            aria-label="Cancelar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-800">
            ¿Contrataste a alguien de esta búsqueda?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={hired === 'yes' ? 'default' : 'outline'}
              onClick={() => setHired('yes')}
            >
              Sí, contraté
            </Button>
            <Button
              type="button"
              size="sm"
              variant={hired === 'no' ? 'default' : 'outline'}
              onClick={() => setHired('no')}
            >
              No / cerramos sin contratar
            </Button>
            <Button
              type="button"
              size="sm"
              variant={hired === 'skip' ? 'secondary' : 'ghost'}
              onClick={() => setHired('skip')}
            >
              Prefiero no decir
            </Button>
          </div>
        </div>

        {error && (
          <p className="text-xs text-rose-700 bg-rose-100 border border-rose-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <Button
          type="button"
          className="w-full sm:w-auto bg-rose-700 hover:bg-rose-800"
          disabled={loading}
          onClick={() => void submit()}
        >
          {loading ? 'Cerrando…' : 'Confirmar cierre'}
        </Button>
      </>
    );
  }
}
