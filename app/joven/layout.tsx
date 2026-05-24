import { JovenHeader } from '@/components/joven/joven-header';
import { AppFooter } from '@/components/layout/app-footer';

/**
 * El layout NO aplica RoleGate global. Cada page decide:
 *  - /joven/chat, /joven/tareas/*, /joven/conectar → wrappean con RoleGate role="joven".
 *  - /joven/perfil/[id] → PÚBLICO (las empresas necesitan ver el perfil del candidato).
 */
export default function JovenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FAFAF7] flex flex-col overflow-x-hidden">
      <JovenHeader />
      <main className="flex-1 flex flex-col w-full min-w-0">{children}</main>
      <AppFooter
        left="SaltoAI · Tu primer salto al empleo formal"
        right="Barranqui-IA 2026 · Macondo Lab · GOyn · ACOPI"
      />
    </div>
  );
}
