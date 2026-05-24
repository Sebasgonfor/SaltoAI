'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CompanyLegal } from '@/lib/types';
import { validateDocId, validateTaxId } from '@/lib/empresa-legal-validation';
import { loadSavedEmpresaLegal, saveEmpresaLegal } from '@/lib/user-onboarding-storage';

export interface LegalEditorProps {
  uid: string;
}

export function LegalEditor({ uid }: LegalEditorProps) {
  const [legal, setLegal] = useState<CompanyLegal | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    companyName: '',
    taxId: '',
    legalRepName: '',
    legalRepDocId: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadSavedEmpresaLegal(uid);
    if (saved) {
      setLegal(saved);
      setForm({
        companyName: saved.companyName,
        taxId: saved.taxId,
        legalRepName: saved.legalRepName,
        legalRepDocId: saved.legalRepDocId,
      });
    }
  }, [uid]);

  const cancel = () => {
    if (legal) {
      setForm({
        companyName: legal.companyName,
        taxId: legal.taxId,
        legalRepName: legal.legalRepName,
        legalRepDocId: legal.legalRepDocId,
      });
    }
    setError(null);
    setEditing(false);
  };

  const save = () => {
    const companyName = form.companyName.trim();
    const repName = form.legalRepName.trim();
    if (companyName.length < 2) {
      setError('Escribe la razón social o nombre comercial de la empresa.');
      return;
    }
    const taxErr = validateTaxId(form.taxId);
    if (taxErr) {
      setError(taxErr);
      return;
    }
    if (repName.length < 2) {
      setError('Escribe el nombre completo del representante legal.');
      return;
    }
    const docErr = validateDocId(form.legalRepDocId);
    if (docErr) {
      setError(docErr);
      return;
    }

    const record: CompanyLegal = {
      companyName,
      taxId: form.taxId.trim(),
      legalRepName: repName,
      legalRepDocId: form.legalRepDocId.trim(),
      acceptedTerms: true,
      acceptedAt: legal?.acceptedAt ?? new Date().toISOString(),
    };
    saveEmpresaLegal(uid, record);
    setLegal(record);
    setEditing(false);
    setError(null);
    setSavedMsg('Datos de la empresa actualizados.');
    window.setTimeout(() => setSavedMsg(null), 4000);
  };

  if (!legal && !editing) {
    return (
      <section id="datos-empresa" className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
            <Building2 size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-semibold text-slate-900">Datos de la empresa</h2>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              Aún no tienes datos legales guardados. Complétalos al publicar tu primera búsqueda.
            </p>
            <Link href="/empresa/chat" className="inline-block mt-3">
              <Button size="sm" variant="outline">
                Ir al chat de contratación
              </Button>
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="datos-empresa" className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-1">
            Datos de la empresa
          </div>
          <h2 className="font-display font-semibold text-lg text-slate-900">
            {legal?.companyName ?? 'Información legal'}
          </h2>
          {legal && !editing && (
            <p className="text-sm text-slate-600 mt-1">
              {legal.taxId} · {legal.legalRepName}
            </p>
          )}
        </div>
        {!editing && legal && (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
            <Pencil size={14} />
            Editar
          </Button>
        )}
      </div>

      {savedMsg && <p className="text-sm text-emerald-700 mb-3">{savedMsg}</p>}

      {editing ? (
        <div className="space-y-4 max-w-lg">
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-1.5">Razón social o nombre comercial</label>
            <Input
              value={form.companyName}
              onChange={(e) => {
                setForm((f) => ({ ...f, companyName: e.target.value }));
                setError(null);
              }}
              className="h-11"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-1.5">Identificador fiscal</label>
            <Input
              value={form.taxId}
              onChange={(e) => {
                setForm((f) => ({ ...f, taxId: e.target.value }));
                setError(null);
              }}
              className="h-11"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-1.5">Representante legal</label>
            <Input
              value={form.legalRepName}
              onChange={(e) => {
                setForm((f) => ({ ...f, legalRepName: e.target.value }));
                setError(null);
              }}
              className="h-11 mb-2"
            />
            <Input
              placeholder="Documento de identidad"
              value={form.legalRepDocId}
              onChange={(e) => {
                setForm((f) => ({ ...f, legalRepDocId: e.target.value }));
                setError(null);
              }}
              className="h-11"
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={save} className="gap-1.5">
              <Check size={14} />
              Guardar
            </Button>
            <Button type="button" variant="ghost" onClick={cancel} className="gap-1.5">
              <X size={14} />
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500 leading-relaxed">
          Se usan en cada nueva búsqueda. Cambiarlos no borra tus matches ni micro-tareas activas.
        </p>
      )}
    </section>
  );
}
