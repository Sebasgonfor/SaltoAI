'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileText,
  Mail,
  MapPin,
  Phone,
  Quote,
  Linkedin,
  Printer,
  AlertCircle,
} from 'lucide-react';
import type { Match, MatchDecision, Profile, ProfileDocument } from '@/lib/types';
import { isNotASkill } from '@/lib/skill-classification';
import { MatchDecisionBar } from '@/components/empresa/match-decision-bar';

interface CandidateDetailProps {
  profileId: string;
  needId: string;
  companyId: string;
  match?: Match | null;
}

export function CandidateDetail({ profileId, needId, companyId, match }: CandidateDetailProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [documents, setDocuments] = useState<ProfileDocument[]>([]);
  const [decision, setDecision] = useState<MatchDecision | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [profileRes, docsRes, decisionRes] = await Promise.all([
          fetch(`/api/perfil?id=${encodeURIComponent(profileId)}`),
          fetch(`/api/documentos?profileId=${encodeURIComponent(profileId)}`),
          fetch(`/api/match/decision?needId=${encodeURIComponent(needId)}`),
        ]);

        if (!profileRes.ok) {
          if (!cancelled) setError('Este candidato ya no está disponible.');
          return;
        }

        const profileData = await profileRes.json();
        const docsData = docsRes.ok ? await docsRes.json() : { documents: [] };
        const decisionData = decisionRes.ok ? await decisionRes.json() : { decisions: [] };

        if (cancelled) return;
        setProfile(profileData.profile);
        setDocuments(docsData.documents ?? []);
        const mine = (decisionData.decisions as MatchDecision[] | undefined)?.find(
          (d) => d.profileId === profileId
        );
        setDecision(mine ?? null);
      } catch {
        if (!cancelled) setError('Error cargando el candidato.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId, needId]);

  // Sin needId (abierto desde "Mis candidatos") mostramos el perfil igual; solo
  // se ocultan los elementos atados a una necesidad.
  const hasNeed = !!needId;
  const backHref = hasNeed ? `/empresa/matches/${needId}` : '/empresa/candidatos';
  const backLabel = hasNeed ? 'Volver a matches' : 'Volver a mis candidatos';

  const cvStyle = profile?.contact?.cvStyle ?? 'hybrid';
  const cvPreviewUrl = useMemo(
    () =>
      `/api/cv?profileId=${encodeURIComponent(profileId)}&style=${cvStyle}` +
      (needId ? `&needId=${encodeURIComponent(needId)}` : ''),
    [profileId, needId, cvStyle]
  );
  const cvPrintUrl = `${cvPreviewUrl}&autoprint=1`;
  const cvDownloadUrl = `${cvPreviewUrl}&download=1`;

  if (loading) {
    if (match) {
      return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
          <div className="sticky top-14 z-20 bg-white border border-slate-200 rounded-2xl p-4 shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link href={backHref}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ArrowLeft size={14} /> {backLabel}
                </Button>
              </Link>
              <Badge className="bg-emerald-600 text-white font-mono tabular-nums">
                ICS {match.ics}%
              </Badge>
            </div>
            <h1 className="text-2xl font-display font-bold text-slate-900 mt-3">{match.profileName}</h1>
            <LoadingSpinner variant="inline" label="Cargando CV y evidencia…" />
          </div>
        </div>
      );
    }
    return (
      <LoadingSpinner
        variant="section"
        label="Cargando candidato…"
        containerClassName="max-w-5xl mx-auto px-6"
      />
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center">
        <AlertCircle size={32} className="text-rose-500 mx-auto mb-4" />
        <h2 className="text-xl font-display font-medium mb-2">
          {error || 'Candidato no encontrado'}
        </h2>
        <p className="text-sm text-slate-600 mb-6">
          El perfil pudo haber sido eliminado o aún no está sincronizado.
        </p>
        <Link href={backHref}>
          <Button className="gap-2">
            <ArrowLeft size={14} /> {backLabel}
          </Button>
        </Link>
      </div>
    );
  }

  const contact = profile.contact;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
      <div className="sticky top-14 z-20 bg-white border border-slate-200 rounded-2xl p-4 shadow-md space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href={backHref}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowLeft size={14} /> {backLabel}
              </Button>
            </Link>
            {hasNeed && (
              <Link href={`/empresa/probar/${profileId}?needId=${needId}`}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  Proponer micro-tarea
                </Button>
              </Link>
            )}
          </div>
          {hasNeed && (
            <MatchDecisionBar
              needId={needId}
              profileId={profileId}
              companyId={companyId}
              icsAtTime={match?.ics}
              initialStatus={decision?.status}
            />
          )}
      </div>

      <header className="space-y-4">
        <div className="text-xs uppercase tracking-[0.18em] text-emerald-600 font-semibold">
          Candidato · Perfil de Evidencia
        </div>
        <h1 className="text-3xl sm:text-4xl font-display font-bold text-slate-900 tracking-tight">
          {profile.name}
        </h1>
        {match && (
          <div className="flex flex-wrap items-center gap-3 text-slate-600">
            <Badge className="bg-emerald-600 text-white border-transparent text-base px-3 py-1">
              ICS {match.ics}%
            </Badge>
          </div>
        )}
        {match && (
          <div className="flex flex-wrap gap-1.5">
            {match.topSkills.map((s) => {
              const verified = match.verifiedSkills?.find(
                (v) => v.skill.toLowerCase() === s.toLowerCase()
              );
              return verified ? (
                <Badge
                  key={s}
                  className="bg-emerald-600 text-white border-transparent gap-1"
                  title={`Verificada — "${verified.evidence}"`}
                >
                  <CheckCircle2 size={11} /> {s}
                </Badge>
              ) : (
                <Badge key={s} variant="secondary">
                  {s}
                </Badge>
              );
            })}
          </div>
        )}
        {profile.summary && (
          <p className="text-lg text-slate-700 leading-relaxed max-w-3xl">{profile.summary}</p>
        )}
        {match?.reason && (
          <div className="bg-emerald-50/60 border border-emerald-200/60 rounded-2xl p-5 relative">
            <Quote
              size={18}
              className="absolute -top-2 left-5 bg-white border border-emerald-200 rounded-full p-1 text-emerald-600"
            />
            <p className="text-slate-800 leading-relaxed pl-1">{match.reason}</p>
          </div>
        )}
      </header>

      <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <h2 className="font-display font-semibold text-xl text-slate-900">Contacto</h2>
        {contact?.email || contact?.phone || contact?.city || contact?.linkedin ? (
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            {contact.email && (
              <div className="flex items-center gap-2 text-slate-700">
                <Mail size={16} className="text-emerald-600" />
                <a href={`mailto:${contact.email}`} className="hover:underline">
                  {contact.email}
                </a>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-2 text-slate-700">
                <Phone size={16} className="text-emerald-600" />
                <a href={`tel:${contact.phone}`} className="hover:underline">
                  {contact.phone}
                </a>
              </div>
            )}
            {contact.city && (
              <div className="flex items-center gap-2 text-slate-700">
                <MapPin size={16} className="text-emerald-600" />
                {contact.city}
              </div>
            )}
            {contact.linkedin && (
              <div className="flex items-center gap-2 text-slate-700">
                <Linkedin size={16} className="text-emerald-600" />
                <a
                  href={
                    contact.linkedin.startsWith('http')
                      ? contact.linkedin
                      : `https://${contact.linkedin}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline truncate"
                >
                  {contact.linkedin}
                </a>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            El candidato aún no guardó datos de contacto en su perfil.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display font-semibold text-xl text-slate-900">CV</h2>
          <div className="flex flex-wrap gap-2">
            <a href={cvPrintUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Printer size={14} /> Imprimir
              </Button>
            </a>
            <a href={cvDownloadUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download size={14} /> Descargar
              </Button>
            </a>
          </div>
        </div>
        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50">
          <iframe
            title={`CV de ${profile.name}`}
            src={cvPreviewUrl}
            className="w-full min-h-[720px] bg-white"
          />
        </div>
      </section>

      {profile.evidence.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display font-semibold text-xl text-slate-900">Evidencia citada</h2>
          <div className="grid gap-3">
            {profile.evidence.map((e, i) => (
              <div
                key={`${e.skill}-${i}`}
                className="bg-white border border-slate-200 rounded-xl p-4"
              >
                <div className="font-semibold text-slate-900 mb-1">{e.skill}</div>
                <p className="text-sm text-slate-700 leading-relaxed">{e.quote}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid md:grid-cols-2 gap-6">
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Skills
          </h3>
          {(() => {
            // Skills verificadas por documentos subidos → cita textual como tooltip.
            const verified = new Map<string, { label: string; evidence: string }>();
            for (const doc of documents) {
              for (const sk of doc.extractedSkills ?? []) {
                const label = sk.skill.trim();
                const key = label.toLowerCase();
                // Carrera/título ≠ habilidad (filtra docs antiguos con el grado como skill).
                // `derived` = competencia inferida del programa, NO citada: no se
                // muestra como "Verificada por documento" al empleador.
                if (key && !sk.derived && !isNotASkill(label) && !verified.has(key)) {
                  verified.set(key, { label, evidence: sk.evidence ?? '' });
                }
              }
            }
            const profileKeys = new Set(profile.skills.map((s) => s.trim().toLowerCase()));
            const docOnly = Array.from(verified.values()).filter(
              (v) => !profileKeys.has(v.label.toLowerCase())
            );
            return (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {profile.skills.map((s) => {
                    const v = verified.get(s.trim().toLowerCase());
                    return v ? (
                      <Badge
                        key={s}
                        className="bg-emerald-600 text-white border-transparent gap-1"
                        title={v.evidence ? `Verificada por documento — "${v.evidence}"` : 'Verificada por documento'}
                      >
                        <CheckCircle2 size={11} /> {s}
                      </Badge>
                    ) : (
                      <Badge key={s} variant="secondary">
                        {s}
                      </Badge>
                    );
                  })}
                  {docOnly.map((v, i) => (
                    <Badge
                      key={`doc-${i}`}
                      className="bg-emerald-600 text-white border-transparent gap-1"
                      title={v.evidence ? `Verificada por documento — "${v.evidence}"` : 'Verificada por documento'}
                    >
                      <CheckCircle2 size={11} /> {v.label}
                    </Badge>
                  ))}
                </div>
                {verified.size > 0 && (
                  <p className="mt-3 text-[11px] text-slate-500 flex items-center gap-1.5">
                    <CheckCircle2 size={11} className="text-emerald-600" /> Verificada por documento del candidato
                  </p>
                )}
              </>
            );
          })()}
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Rasgos
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {profile.traits.map((t) => (
              <Badge key={t} variant="outline" className="border-emerald-200 text-emerald-800">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      {profile.taskStats && profile.taskStats.totalCompleted > 0 && (
        <section className="bg-amber-50/60 border border-amber-200/60 rounded-2xl p-5 text-sm text-slate-700">
          <strong className="text-slate-900">{profile.taskStats.totalCompleted}</strong> micro-tareas
          completadas · rating promedio{' '}
          <strong className="text-slate-900">{profile.taskStats.averageRating.toFixed(1)}</strong>/5
        </section>
      )}

      <section className="space-y-4">
        <h2 className="font-display font-semibold text-xl text-slate-900">
          Documentos verificables
        </h2>
        {documents.length === 0 ? (
          <p className="text-sm text-slate-500">Sin documentos subidos.</p>
        ) : (
          <div className="grid gap-3">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex flex-wrap items-start justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4"
              >
                  <div className="flex items-start gap-3 min-w-0">
                    <FileText size={18} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">{doc.originalName}</div>
                      {doc.programTitle && (
                        <div className="text-xs text-slate-600">{doc.programTitle}</div>
                      )}
                      {doc.extractedSkills && doc.extractedSkills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {doc.extractedSkills.slice(0, 5).map((sk) => (
                            <Badge key={sk.skill} variant="secondary" className="text-[10px]">
                              {sk.skill}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <a href={doc.url} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="gap-1.5">
                      Ver <ArrowRight size={12} />
                    </Button>
                  </a>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}

