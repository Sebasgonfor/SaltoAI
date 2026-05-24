'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Check, UserCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Gender } from '@/lib/types';
import { jovenAgeErrorMessage, parseJovenAge } from '@/lib/input-validation';

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'mujer', label: 'Mujer' },
  { value: 'hombre', label: 'Hombre' },
  { value: 'otro', label: 'Otro' },
  { value: 'prefiero_no_decir', label: 'Prefiero no decir' },
];

function firstNameFrom(full: string): string {
  return full.trim().split(/\s+/)[0] || full.trim();
}

export interface BasicsWizardProps {
  formName: string;
  formAge: string;
  formGender: Gender | '';
  formError: string | null;
  step: 0 | 1 | 2;
  onStepChange: (step: 0 | 1 | 2) => void;
  onNameChange: (v: string) => void;
  onAgeChange: (v: string) => void;
  onGenderChange: (v: Gender) => void;
  onClearError: () => void;
  onComplete: () => void;
}

export function BasicsWizard({
  formName,
  formAge,
  formGender,
  formError,
  step,
  onStepChange,
  onNameChange,
  onAgeChange,
  onGenderChange,
  onClearError,
  onComplete,
}: BasicsWizardProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const [direction, setDirection] = useState(1);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const ageInputRef = useRef<HTMLInputElement>(null);

  const displayError = localError ?? formError;

  useEffect(() => {
    setLocalError(null);
  }, [step]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (step === 0) nameInputRef.current?.focus();
      if (step === 1) ageInputRef.current?.focus();
    }, 280);
    return () => window.clearTimeout(timer);
  }, [step]);

  const goNext = () => {
    if (step === 0) {
      const name = formName.trim();
      if (name.length < 2) {
        setLocalError('Escribe tu nombre completo (mínimo 2 caracteres).');
        return;
      }
      setLocalError(null);
      setDirection(1);
      onStepChange(1);
      return;
    }
    if (step === 1) {
      if (parseJovenAge(formAge) == null) {
        setLocalError(jovenAgeErrorMessage());
        return;
      }
      setLocalError(null);
      setDirection(1);
      onStepChange(2);
    }
  };

  const goBack = () => {
    if (step === 0) return;
    setLocalError(null);
    onClearError();
    setDirection(-1);
    onStepChange((step - 1) as 0 | 1 | 2);
  };

  const handleComplete = () => {
    if (!formGender) {
      setLocalError('Selecciona cómo te identificas.');
      return;
    }
    setLocalError(null);
    onComplete();
  };

  const firstName = firstNameFrom(formName);

  const stepContent = [
    {
      title: '¿Cómo te llamas?',
      subtitle: 'Así te verán las empresas en tu perfil y CV.',
      body: (
        <Input
          ref={nameInputRef}
          placeholder="Ej. Camila Silva"
          value={formName}
          onChange={(e) => {
            onNameChange(e.target.value);
            if (localError) setLocalError(null);
            if (formError) onClearError();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              goNext();
            }
          }}
          className="h-14 text-lg md:text-xl text-center border-slate-200"
          autoComplete="name"
        />
      ),
    },
    {
      title: `¿Cuántos años tienes${firstName ? `, ${firstName}` : ''}?`,
      subtitle: 'Solo para contexto — no es un filtro de edad.',
      body: (
        <Input
          ref={ageInputRef}
          type="text"
          inputMode="numeric"
          autoComplete="bday-year"
          placeholder="Ej. 21"
          value={formAge}
          onChange={(e) => {
            onAgeChange(e.target.value.replace(/\D/g, '').slice(0, 2));
            if (localError) setLocalError(null);
            if (formError) onClearError();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              goNext();
            }
          }}
          className="h-14 text-lg md:text-xl text-center border-slate-200 w-32 mx-auto"
        />
      ),
    },
    {
      title: '¿Cómo te identificas?',
      subtitle: 'Tú lo eliges. No lo inferimos por tu nombre.',
      body: (
        <motion.div
          role="radiogroup"
          aria-labelledby="gender-label"
          aria-invalid={displayError?.includes('identificas') ? true : undefined}
          className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md mx-auto"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {GENDER_OPTIONS.map((opt) => {
            const selected = formGender === opt.value;
            const inputId = `gender-${opt.value}`;
            return (
              <motion.div key={opt.value} whileTap={{ scale: 0.98 }}>
                <input
                  type="radio"
                  id={inputId}
                  name="gender"
                  value={opt.value}
                  checked={selected}
                  onChange={() => {
                    onGenderChange(opt.value);
                    if (localError) setLocalError(null);
                    if (formError?.includes('identificas')) onClearError();
                  }}
                  className="sr-only peer"
                />
                <label
                  htmlFor={inputId}
                  className={`flex items-center justify-between gap-2 px-4 py-3.5 rounded-xl border text-sm font-medium cursor-pointer transition-all ${
                    selected
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/30'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span>{opt.label}</span>
                  {selected && <Check size={18} className="text-emerald-600 flex-shrink-0" aria-hidden />}
                </label>
              </motion.div>
            );
          })}
        </motion.div>
      ),
    },
  ];

  const current = stepContent[step];

  return (
    <motion.div
      className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10 lg:py-16 w-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <header className="mb-8 text-center">
        <motion.div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <UserCircle2 size={28} strokeWidth={1.75} />
        </motion.div>
        <motion.div
          className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          Paso 1 de 2
        </motion.div>
      </header>

      <div className="mb-8 max-w-md mx-auto">
        <motion.div
          className="flex gap-2 mb-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="h-1.5 flex-1 rounded-full overflow-hidden bg-slate-200"
            >
              <motion.div
                className="h-full bg-emerald-500 rounded-full"
                initial={{ width: '0%' }}
                animate={{ width: i <= step ? '100%' : '0%' }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </motion.div>
          ))}
        </motion.div>
        <p className="text-center text-xs text-slate-500">{step + 1} de 3</p>
      </div>

      <div aria-live="polite" className="min-h-[320px] flex flex-col">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={{ opacity: 0, x: direction * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -24 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            className="flex-1 flex flex-col"
          >
            <div className="text-center mb-8">
              <h1
                id={step === 2 ? 'gender-label' : undefined}
                className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-slate-900 tracking-tight leading-tight"
              >
                {current.title}
              </h1>
              <p className="text-slate-600 mt-3 leading-relaxed max-w-md mx-auto">{current.subtitle}</p>
            </div>

            <motion.div className="flex-1 flex flex-col justify-center">{current.body}</motion.div>

            {displayError && (
              <motion.p
                className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mt-6 text-center max-w-md mx-auto"
                role="alert"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {displayError}
              </motion.p>
            )}

            <motion.div
              className="mt-10 flex flex-col gap-3 max-w-md mx-auto w-full"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              {step < 2 ? (
                <Button size="lg" className="w-full h-12 gap-2" onClick={goNext}>
                  Continuar <ArrowRight size={16} />
                </Button>
              ) : (
                <Button size="lg" className="w-full h-12 gap-2" onClick={handleComplete}>
                  Empezar mi historia <ArrowRight size={16} />
                </Button>
              )}
              {step > 0 && (
                <Button variant="ghost" className="w-full text-slate-600" onClick={goBack}>
                  ← Atrás
                </Button>
              )}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      {step === 2 && (
        <motion.p
          className="text-center text-xs text-slate-500 mt-8 max-w-sm mx-auto leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Después conversamos 3–5 minutos sobre desafíos reales que hayas vivido. Eso alimenta tu Perfil de Evidencia.
        </motion.p>
      )}
    </motion.div>
  );
}
