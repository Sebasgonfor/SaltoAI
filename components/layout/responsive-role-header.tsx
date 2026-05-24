'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { SaltoLogo } from '@/components/ui/salto-logo';

type Props = {
  logoHref?: string;
  /** Nav horizontal visible desde `md` (768px); móvil usa drawer. */
  desktopNav: React.ReactNode;
  /** Nav vertical del drawer; recibe `close` para cerrar al navegar. */
  drawerNav: (close: () => void) => React.ReactNode;
  /** Acciones a la derecha en móvil (p. ej. UserButton). */
  mobileTrailing?: React.ReactNode;
};

export function ResponsiveRoleHeader({
  logoHref = '/',
  desktopNav,
  drawerNav,
  mobileTrailing,
}: Props) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-20 px-4 sm:px-6 h-14 md:h-16 bg-white/90 backdrop-blur-md border-b border-slate-200 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="md:hidden p-2 -ml-1 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Abrir menú"
          >
            <Menu size={20} />
          </button>
          <Link href={logoHref} className="flex items-center shrink-0 min-w-0">
            <SaltoLogo variant="full" size={32} className="md:hidden max-w-[calc(100vw-7rem)]" />
            <SaltoLogo variant="full" size={48} className="hidden md:inline-flex" />
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-0.5 text-sm font-medium min-w-0 flex-1 justify-end overflow-x-auto scrollbar-thin">
          {desktopNav}
        </nav>

        {mobileTrailing ? (
          <div className="flex items-center gap-1 flex-shrink-0 md:hidden">{mobileTrailing}</div>
        ) : null}
      </header>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              className="fixed inset-0 bg-slate-900/40 z-40 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              aria-label="Cerrar menú"
              onClick={close}
            />
            <motion.aside
              className="fixed top-0 left-0 bottom-0 w-[min(100vw-3rem,18rem)] bg-white z-50 md:hidden shadow-xl overflow-y-auto flex flex-col"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
                <SaltoLogo variant="full" size={28} />
                <button
                  type="button"
                  onClick={close}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                  aria-label="Cerrar menú"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">{drawerNav(close)}</div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
