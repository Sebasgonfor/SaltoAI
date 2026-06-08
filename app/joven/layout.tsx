import { JovenAppShell } from '@/components/joven/joven-app-shell';

/**
 * El layout NO aplica RoleGate global. Cada page decide:
 *  - /joven/chat, /joven/tareas/*, /joven/conectar → wrappean con RoleGate role="joven".
 *  - /joven/perfil/[id] → PÚBLICO (las empresas necesitan ver el perfil del candidato).
 *
 * El chrome (sidebar en escritorio + barra inferior en móvil) lo da JovenAppShell,
 * que es rol-aware: a un viewer empresa/anónimo en el perfil público le muestra
 * un chrome mínimo, sin la navegación del joven.
 */
export default function JovenLayout({ children }: { children: React.ReactNode }) {
  return <JovenAppShell>{children}</JovenAppShell>;
}
