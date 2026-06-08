import { JovenAppShell } from '@/components/joven/joven-app-shell';

/**
 * Layout compartido de la app del Joven. Renderiza JovenAppShell UNA sola vez
 * para `/dashboard` y todas las rutas `/joven/*`, así el shell (sidebar + logo)
 * PERSISTE al navegar entre secciones — no se re-monta, no re-prefetch, y el
 * indicador activo se desliza también hacia/desde Inicio. Es un route group:
 * los paréntesis NO afectan las URLs (`/dashboard`, `/joven/...` siguen igual).
 *
 * JovenAppShell es rol-aware: a un viewer empresa/anónimo en el perfil público
 * (`/joven/perfil/[id]`) le da chrome mínimo, sin la navegación del joven.
 * Cada page sigue decidiendo su propio RoleGate.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <JovenAppShell>{children}</JovenAppShell>;
}
