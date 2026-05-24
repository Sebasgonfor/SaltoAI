import { cn } from '@/lib/utils';

const FULL_LOGO_SRC = '/full-icon.png';
const ICON_LOGO_SRC = '/icon.png';

export function SaltoLogo({
  variant = 'full',
  size,
  className,
}: {
  /** `full` = icono + "SaltoAI". `icon` = solo el símbolo (nav compacta, etc.). */
  variant?: 'full' | 'icon';
  /** Altura en px del icono. */
  size?: number;
  className?: string;
}) {
  const iconSize = size ?? (variant === 'icon' ? 40 : 56);

  const icon = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={ICON_LOGO_SRC}
      alt="SaltoAI"
      className={cn(
        'object-contain select-none aspect-square shrink-0',
        variant === 'icon' && !size && 'h-10 w-10',
        variant === 'icon' && className
      )}
      style={{ height: iconSize, width: iconSize }}
      decoding="async"
    />
  );

  if (variant === 'icon') {
    return icon;
  }

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {icon}
      <span
        className="font-display font-bold tracking-tight text-slate-900 whitespace-nowrap"
        style={{ fontSize: iconSize * 0.55 }}
      >
        SaltoAI
      </span>
    </span>
  );
}

/** Ruta del favicon / pestaña del navegador (símbolo circular). */
export const SALTO_FAVICON = '/circle-icon.png';

/** Ruta del logo completo para metadata OG, etc. */
export const SALTO_FULL_LOGO = FULL_LOGO_SRC;
