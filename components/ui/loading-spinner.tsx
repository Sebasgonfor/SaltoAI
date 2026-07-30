import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const SIZE_PX = { sm: 18, md: 32, lg: 44, xl: 52 } as const;

type LoadingSpinnerProps = {
  label?: string;
  /** full = pantalla completa; section = bloque centrado; block = área media; inline = en línea */
  variant?: 'full' | 'section' | 'block' | 'inline';
  size?: keyof typeof SIZE_PX;
  className?: string;
  containerClassName?: string;
};

export function LoadingSpinner({
  label,
  variant = 'section',
  size = 'md',
  className,
  containerClassName,
}: LoadingSpinnerProps) {
  const spinner = (
    <Loader2
      size={SIZE_PX[size]}
      className={cn('animate-spin text-emerald-500', className)}
      strokeWidth={2.25}
      aria-hidden
    />
  );

  if (variant === 'inline') {
    return (
      <span
        className="inline-flex items-center justify-center gap-2"
        role="status"
        aria-live="polite"
        aria-label={label ?? 'Cargando'}
      >
        {spinner}
        {label ? <span className="text-sm text-slate-500">{label}</span> : null}
      </span>
    );
  }

  const layout =
    variant === 'full'
      ? 'min-h-screen w-full'
      : variant === 'block'
        ? 'min-h-[28vh] w-full py-12'
        : 'w-full py-16 sm:py-24 min-h-[32vh]';

  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3', layout, containerClassName)}
      role="status"
      aria-live="polite"
      aria-label={label ?? 'Cargando'}
    >
      {spinner}
      {label ? <p className="text-sm text-slate-500 text-center">{label}</p> : null}
    </div>
  );
}
