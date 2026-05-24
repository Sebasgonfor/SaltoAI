import { cn } from '@/lib/utils';

type MatchPulseLoaderProps = {
  label?: string;
  /** section = bloque centrado; overlay = sobre contenido; fullscreen = pantalla completa */
  variant?: 'section' | 'overlay' | 'fullscreen';
  className?: string;
};

function PulseOrb() {
  return (
    <div
      className="relative w-28 h-28 sm:w-36 sm:h-36 flex items-center justify-center"
      aria-hidden
    >
      <div className="absolute inset-0 rounded-full bg-emerald-400/30 blur-3xl animate-match-glow" />
      <div className="absolute w-[72%] h-[72%] rounded-full bg-emerald-500/40 blur-2xl animate-match-glow [animation-delay:0.55s]" />
      <div className="absolute w-[44%] h-[44%] rounded-full bg-emerald-400/55 blur-xl animate-match-glow [animation-delay:1.1s]" />
    </div>
  );
}

export function MatchPulseLoader({
  label,
  variant = 'section',
  className,
}: MatchPulseLoaderProps) {
  const content = (
    <>
      <PulseOrb />
      {label ? (
        <p className="mt-6 text-sm text-slate-600 text-center font-medium max-w-xs leading-relaxed">
          {label}
        </p>
      ) : null}
    </>
  );

  if (variant === 'overlay' || variant === 'fullscreen') {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center z-50 pointer-events-auto',
          variant === 'fullscreen'
            ? 'fixed inset-0 bg-[#FAFAF7]/85 backdrop-blur-sm'
            : 'absolute inset-0 bg-white/75 backdrop-blur-[3px] rounded-2xl',
          className
        )}
        role="status"
        aria-live="polite"
        aria-label={label ?? 'Calculando matches'}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center w-full py-16 sm:py-24 min-h-[32vh]',
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={label ?? 'Calculando matches'}
    >
      {content}
    </div>
  );
}
