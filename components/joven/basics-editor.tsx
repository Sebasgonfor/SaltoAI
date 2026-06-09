'use client';

import { useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { JovenBasics } from '@/lib/types';
import { saveJovenBasics } from '@/lib/user-onboarding-storage';

export interface BasicsEditorProps {
  profileId: string;
  uid: string;
  initial: JovenBasics;
  onSaved: (basics: JovenBasics) => void;
}

export function BasicsEditor({ profileId, uid, initial, onSaved }: BasicsEditorProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initial.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cancel = () => {
    setName(initial.name);
    setError(null);
    setEditing(false);
  };

  const save = async () => {
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError('Escribe tu nombre completo (mínimo 2 caracteres).');
      return;
    }

    const basics: JovenBasics = { name: trimmedName };
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/perfil', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: profileId, uid, basics }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No pudimos guardar los cambios.');
        return;
      }
      saveJovenBasics(uid, basics);
      onSaved(basics);
      setEditing(false);
    } catch {
      setError('Error de red. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div id="datos-personales" className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 text-slate-600 border-slate-200"
          onClick={() => setEditing(true)}
        >
          <Pencil size={14} />
          Editar datos personales
        </Button>
      </div>
    );
  }

  return (
    <section
      id="datos-personales"
      className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4"
    >
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-1">
          Datos personales
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Aparecen en tu perfil y CV. La entrevista no se reinicia al cambiarlos.
        </p>

        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-1.5">Nombre completo</label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              autoComplete="name"
              className="h-11"
            />
          </div>
        </div>

        {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}

        <div className="flex flex-wrap gap-2 pt-4">
          <Button type="button" onClick={() => void save()} disabled={saving} className="gap-1.5">
            <Check size={14} />
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
          <Button type="button" variant="ghost" onClick={cancel} disabled={saving} className="gap-1.5">
            <X size={14} />
            Cancelar
          </Button>
        </div>
      </div>
    </section>
  );
}
