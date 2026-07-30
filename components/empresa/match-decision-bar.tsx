'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react';
import type { MatchDecisionStatus } from '@/lib/types';

interface MatchDecisionBarProps {
  needId: string;
  profileId: string;
  companyId: string;
  icsAtTime?: number;
  initialStatus?: MatchDecisionStatus | null;
  redirectOnDiscard?: boolean;
  compact?: boolean;
}

function Banner({
  variant,
  compact,
  children,
}: {
  variant: 'interested' | 'discarded' | 'actions';
  compact?: boolean;
  children: React.ReactNode;
}) {
  const styles =
    variant === 'interested'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
      : variant === 'discarded'
        ? 'bg-slate-100 border-slate-200 text-slate-700'
        : 'bg-white border-slate-200 text-slate-800';

  return (
    <div className={`rounded-xl border px-4 py-3 ${styles} ${compact ? 'text-xs' : 'text-sm'}`}>
      {children}
    </div>
  );
}

export function MatchDecisionBar({
  needId,
  profileId,
  companyId,
  icsAtTime,
  initialStatus,
  redirectOnDiscard = true,
  compact = false,
}: MatchDecisionBarProps) {
  const router = useRouter();
  const [status, setStatus] = useState<MatchDecisionStatus | 'pending'>(
    initialStatus && initialStatus !== 'pending' ? initialStatus : 'pending'
  );
  const [loading, setLoading] = useState<'interested' | 'discarded' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(next: 'interested' | 'discarded') {
    if (loading) return;
    setLoading(next);
    setError(null);
    const prev = status;
    setStatus(next);

    try {
      const res = await fetch('/api/match/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          needId,
          profileId,
          companyId,
          status: next,
          ...(typeof icsAtTime === 'number' && { icsAtTime }),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(prev);
        setError(typeof json.error === 'string' ? json.error : 'No pudimos guardar la decisión.');
        return;
      }
      if (next === 'discarded' && redirectOnDiscard) {
        router.push(`/empresa/matches/${needId}`);
      }
    } catch {
      setStatus(prev);
      setError('Error de red.');
    } finally {
      setLoading(null);
    }
  }

  if (status === 'interested') {
    return (
      <Banner variant="interested" compact={compact}>
        Marcaste a este candidato como <strong>interesado</strong>. El aplicante verá el estado en
        Oportunidades.
      </Banner>
    );
  }

  if (status === 'discarded') {
    return (
      <Banner variant="discarded" compact={compact}>
        Descartaste a este candidato para esta búsqueda. Puedes recuperarlo desde la sección
        Descartados.
      </Banner>
    );
  }

  return (
    <Banner variant="actions" compact={compact}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`text-slate-700 ${compact ? 'text-xs' : 'text-sm'}`}>
          ¿Quieres avanzar con este candidato?
        </span>
        <div className="flex flex-wrap gap-2">
          <Button
            size={compact ? 'sm' : 'default'}
            className="gap-1.5"
            disabled={!!loading}
            onClick={() => void decide('interested')}
          >
            {loading === 'interested' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ThumbsUp size={14} />
            )}
            Me interesa
          </Button>
          <Button
            size={compact ? 'sm' : 'default'}
            variant="outline"
            className="gap-1.5 border-slate-300"
            disabled={!!loading}
            onClick={() => void decide('discarded')}
          >
            {loading === 'discarded' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ThumbsDown size={14} />
            )}
            Descartar
          </Button>
        </div>
      </div>
      {error && (
        <p className="text-xs text-rose-700 mt-2" role="alert">
          {error}
        </p>
      )}
    </Banner>
  );
}
