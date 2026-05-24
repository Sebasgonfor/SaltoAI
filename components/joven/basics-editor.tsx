'use client';

import { useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Gender, JovenBasics } from '@/lib/types';
import { jovenAgeErrorMessage, parseJovenAge } from '@/lib/input-validation';
import { saveJovenBasics } from '@/lib/user-onboarding-storage';

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'mujer', label: 'Mujer' },
  { value: 'hombre', label: 'Hombre' },
  { value: 'otro', label: 'Otro' },
  { value: 'prefiero_no_decir', label: 'Prefiero no decir' },
];

export interface BasicsEditorProps {
  profileId: string;
  uid: string;
  initial: JovenBasics;
  onSaved: (basics: JovenBasics) => void;
}

export function BasicsEditor({ profileId, uid, initial, onSaved }: BasicsEditorProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initial.name);
  const [age, setAge] = useState(String(initial.age));
  const [gender, setGender] = useState<Gender>(initial.gender);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cancel = () => {
    setName(initial.name);
    setAge(String(initial.age));
    setGender(initial.gender);
    setError(null);
    setEditing(false);
  };

  const save = async () => {
    const trimmedName = name.trim();
    const parsedAge = parseJovenAge(age);
    if (trimmedName.length < 2) {
      setError('Escribe tu nombre completo (mínimo 2 caracteres).');
      return;
    }
    if (parsedAge == null) {
      setError(jovenAgeErrorMessage());
      return;
    }

    const basics: JovenBasics = { name: trimmedName, age: parsedAge, gender };
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
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-1.5">Edad</label>
            <Input
              type="text"
              inputMode="numeric"
              value={age}
              onChange={(e) => {
                setAge(e.target.value.replace(/\D/g, '').slice(0, 2));
                setError(null);
              }}
              className="h-11 w-24"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Género</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {GENDER_OPTIONS.map((opt) => {
                const selected = gender === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setGender(opt.value);
                      setError(null);
                    }}
                    className={`px-3 py-2.5 rounded-xl border text-sm font-medium text-left transition-all ${
                      selected
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/30'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
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
