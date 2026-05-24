'use client';

/**
 * Manager de documentos del joven en su perfil.
 *
 * Flujo de upload:
 *   1. Joven selecciona archivo (PDF, JPG, PNG, WEBP, ≤10MB)
 *   2. Frontend → POST /api/documentos/sign → recibe params firmados
 *   3. Frontend → POST a Cloudinary directamente con los params + archivo
 *   4. Frontend → POST /api/documentos con metadata → backend extrae skills
 *   5. Doc aparece en la lista con sus skills extraídas (si Gemini las inferió)
 *
 * El secret de Cloudinary jamás toca el cliente — solo el endpoint /sign lo usa.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { ProfileDocument } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

interface SignedUploadParams {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  publicId: string;
  resourceType: 'image' | 'raw' | 'auto';
  uploadUrl: string;
  allowedFormats: string[];
  maxBytes: number;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function getExt(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m?.[1] ?? '';
}

const KIND_LABEL: Record<string, string> = {
  certificado_curso: 'Certificado de curso',
  diploma: 'Diploma',
  titulo_universitario: 'Título universitario',
  constancia_laboral: 'Constancia laboral',
  cv_fisico: 'CV físico',
  otro: 'Documento',
};

export function DocumentsManager({ profileId }: { profileId: string }) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<ProfileDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 1. Cargar lista inicial
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/documentos?profileId=${encodeURIComponent(profileId)}`);
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) setDocuments(json.documents ?? []);
      } catch {
        /* silencio en carga inicial */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const handleFilePick = () => fileInputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset para permitir re-seleccionar el mismo archivo

    setError(null);

    // Validaciones client-side
    const ext = getExt(file.name);
    if (!ALLOWED.includes(ext)) {
      setError(`Formato no permitido: .${ext}. Solo PDF, JPG, PNG o WEBP.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`El archivo pesa ${formatBytes(file.size)}. Máximo permitido: 10 MB.`);
      return;
    }

    setUploading(true);
    setUploadProgress('Firmando upload…');

    try {
      // 2. Pedir firma al backend
      const signRes = await fetch('/api/documentos/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, fileName: file.name }),
      });
      const signed = (await signRes.json()) as SignedUploadParams & { error?: string };
      if (!signRes.ok) {
        throw new Error(signed.error || 'No pudimos firmar el upload.');
      }

      // 3. Upload directo a Cloudinary
      setUploadProgress(`Subiendo ${file.name}…`);
      const form = new FormData();
      form.append('file', file);
      form.append('api_key', signed.apiKey);
      form.append('timestamp', String(signed.timestamp));
      form.append('signature', signed.signature);
      form.append('folder', signed.folder);
      form.append('public_id', signed.publicId);

      const cloudRes = await fetch(signed.uploadUrl, {
        method: 'POST',
        body: form,
      });
      const cloudJson = await cloudRes.json();
      if (!cloudRes.ok) {
        throw new Error(
          cloudJson?.error?.message || 'Cloudinary rechazó el upload. Revisa tu conexión.',
        );
      }

      // 4. Notificar al backend para persistir + extraer skills
      setUploadProgress('Analizando documento con IA…');
      const persistRes = await fetch('/api/documentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          url: cloudJson.secure_url,
          publicId: cloudJson.public_id,
          format: cloudJson.format ?? ext,
          bytes: cloudJson.bytes ?? file.size,
          originalName: file.name,
          uploaderUid: user?.uid,
        }),
      });
      const persistJson = await persistRes.json();
      if (!persistRes.ok) {
        throw new Error(persistJson.error || 'No pudimos guardar el documento.');
      }

      setDocuments((prev) => [persistJson.document, ...prev]);
      setUploadProgress(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Borrar este documento? Las habilidades extraídas de él también se eliminan.')) {
      return;
    }
    const previous = documents;
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    try {
      const res = await fetch(`/api/documentos/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falló el borrado.');
    } catch (e) {
      setError((e as Error).message);
      setDocuments(previous);
    }
  };

  const totalExtractedSkills = useMemo(
    () =>
      documents.reduce(
        (acc, d) => acc + (d.extractedSkills?.length ?? 0),
        0,
      ),
    [documents],
  );

  return (
    <section className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-1">
            Documentos verificables
          </div>
          <h2 className="font-display font-bold text-2xl md:text-3xl text-slate-900 tracking-tight leading-tight">
            Diplomas, certificados y constancias.
          </h2>
          <p className="text-sm text-slate-600 mt-2 max-w-xl leading-relaxed">
            Sube tus certificados de cursos, diplomas o constancias laborales. SaltoAI los
            lee con IA y suma las habilidades que demuestran a tu perfil — con cita textual del
            documento para que las empresas las vean como verificadas.
          </p>
        </div>
        {documents.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-center flex-shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">
              Skills extraídas
            </div>
            <div className="font-display font-bold text-2xl text-emerald-700 tabular-nums">
              {totalExtractedSkills}
            </div>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />

      <Button
        type="button"
        onClick={handleFilePick}
        disabled={uploading}
        className="gap-2"
      >
        {uploading ? (
          <>
            <Loader2 size={14} className="animate-spin" /> {uploadProgress ?? 'Subiendo…'}
          </>
        ) : (
          <>
            <Upload size={14} /> Subir documento
          </>
        )}
      </Button>
      <p className="text-[11px] text-slate-500 mt-2">
        PDF, JPG, PNG o WEBP. Máximo 10 MB. Hasta 20 documentos por perfil.
      </p>

      {error && (
        <div className="mt-4 flex items-start gap-2.5 text-sm text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-lg">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            <X size={14} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="mt-6 space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 bg-slate-50 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="mt-6 border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-2xl p-8 text-center">
          <FileText size={28} className="text-slate-400 mx-auto mb-3" />
          <p className="text-sm text-slate-600">
            Aún no subiste ningún documento. Tus certificados sumarán habilidades verificadas a tu
            perfil.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              onDelete={() => handleDelete(doc.id!)}
              onUpdated={(updated) => {
                setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function DocumentRow({
  doc,
  onDelete,
  onUpdated,
}: {
  doc: ProfileDocument;
  onDelete: () => void;
  onUpdated: (updated: ProfileDocument) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(doc.format);

  const handleRetry = async () => {
    if (retrying || !doc.id) return;
    setRetrying(true);
    setRetryError(null);
    // Optimistic: marcamos pending mientras corre.
    onUpdated({ ...doc, extractionStatus: 'pending', extractionError: undefined });
    try {
      const res = await fetch(`/api/documentos/${doc.id}/retry`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falló el reintento.');
      if (json.document) onUpdated(json.document);
    } catch (e) {
      setRetryError((e as Error).message);
      onUpdated({ ...doc, extractionStatus: 'failed' }); // restore
    } finally {
      setRetrying(false);
    }
  };

  return (
    <article className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="w-12 h-12 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
          {isImage ? <ImageIcon size={18} /> : <FileText size={18} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-sm text-slate-900 hover:text-emerald-700 transition-colors truncate"
            >
              {doc.programTitle || doc.originalName}
            </a>
            {doc.kind && (
              <Badge variant="secondary" className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px]">
                {KIND_LABEL[doc.kind] ?? doc.kind}
              </Badge>
            )}
            {doc.extractionStatus === 'pending' && (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900 text-[10px]">
                <Loader2 size={10} className="animate-spin mr-1" /> Analizando…
              </Badge>
            )}
            {doc.extractionStatus === 'failed' && (
              <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-800 text-[10px]">
                <AlertCircle size={10} className="mr-1" /> Error de análisis
              </Badge>
            )}
            {doc.extractionStatus === 'done' && (doc.extractedSkills?.length ?? 0) > 0 && (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800 text-[10px]">
                <CheckCircle2 size={10} className="mr-1" /> {doc.extractedSkills?.length} skills verificadas
              </Badge>
            )}
          </div>
          <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-2 gap-y-0.5">
            {doc.institution && <span>{doc.institution}</span>}
            {doc.issuedAt && <span>· {doc.issuedAt}</span>}
            <span>· {formatBytes(doc.bytes)}</span>
            <span>· .{doc.format}</span>
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {(doc.extractedSkills?.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="text-[11px] text-emerald-700 hover:text-emerald-900 underline px-2 py-1"
            >
              {expanded ? 'Ocultar' : 'Ver skills'}
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="text-slate-400 hover:text-rose-600 p-1.5 rounded transition-colors"
            title="Borrar documento"
            aria-label="Borrar documento"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {expanded && (doc.extractedSkills?.length ?? 0) > 0 && (
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/40">
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2 flex items-center gap-1.5">
            <Sparkles size={11} /> Habilidades verificadas por este documento
          </div>
          <div className="space-y-2">
            {doc.extractedSkills?.map((s, i) => (
              <div key={i} className="text-sm bg-white border border-slate-100 rounded-lg p-3">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="font-semibold text-slate-900">{s.skill}</span>
                  <span className="text-[10px] text-slate-500 tabular-nums">
                    Confianza {s.confidence}%
                  </span>
                </div>
                <p className="text-xs text-slate-600 italic border-l-2 border-emerald-200 pl-2.5">
                  "{s.evidence}"
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {doc.extractionStatus === 'failed' && (
        <div className="border-t border-slate-100 px-4 py-3 bg-rose-50/40 text-xs flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 text-rose-800">
            {doc.extractionError || 'La IA no pudo leer el documento.'}
            {retryError && (
              <div className="text-rose-900 mt-1.5 italic">Reintento: {retryError}</div>
            )}
          </div>
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 disabled:opacity-50 text-[11px] font-medium transition-colors"
          >
            {retrying ? (
              <>
                <Loader2 size={11} className="animate-spin" /> Reintentando…
              </>
            ) : (
              'Reintentar análisis'
            )}
          </button>
        </div>
      )}
    </article>
  );
}

export default DocumentsManager;
