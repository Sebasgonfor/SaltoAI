'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, UserCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { validatePersonName } from '@/lib/input-validation';

export interface BasicsWizardProps {
  formName: string;
  formError: string | null;
  onNameChange: (v: string) => void;
  onClearError: () => void;
  onComplete: () => void;
}

export function BasicsWizard({
  formName,
  formError,
  onNameChange,
  onClearError,
  onComplete,
}: BasicsWizardProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const displayError = localError ?? formError;

  useEffect(() => {
    const timer = window.setTimeout(() => nameInputRef.current?.focus(), 280);
    return () => window.clearTimeout(timer);
  }, []);

  const handleComplete = () => {
    const nameErr = validatePersonName(formName, { requireFullName: true, fieldLabel: 'Tu nombre' });
    if (nameErr) {
      setLocalError(nameErr);
      return;
    }
    setLocalError(null);
    onComplete();
  };

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
          Empecemos
        </motion.div>
      </header>

      <div aria-live="polite" className="min-h-[260px] flex flex-col">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: 'easeInOut' }}
          className="flex-1 flex flex-col"
        >
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-slate-900 tracking-tight leading-tight">
              ¿Cómo te llamas?
            </h1>
            <p className="text-slate-600 mt-3 leading-relaxed max-w-md mx-auto">
              Así te verán las empresas en tu perfil y CV. No pedimos edad ni género: tu perfil se
              construye solo con tu evidencia.
            </p>
          </div>

          <motion.div className="flex-1 flex flex-col justify-center">
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
                  handleComplete();
                }
              }}
              className="h-14 text-lg md:text-xl text-center border-slate-200"
              autoComplete="name"
            />
          </motion.div>

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
            <Button size="lg" className="w-full h-12 gap-2" onClick={handleComplete}>
              Empezar mi historia <ArrowRight size={16} />
            </Button>
          </motion.div>
        </motion.div>
      </div>

      <motion.p
        className="text-center text-xs text-slate-500 mt-8 max-w-sm mx-auto leading-relaxed"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        Después conversamos 3–5 minutos sobre desafíos reales que hayas vivido. Eso alimenta tu Perfil de Evidencia.
      </motion.p>
    </motion.div>
  );
}
