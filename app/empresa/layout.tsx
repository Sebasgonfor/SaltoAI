import { EmpresaSidebar } from '@/components/empresa/empresa-sidebar';
import { AppFooter } from '@/components/layout/app-footer';
import { RoleGate } from '@/components/auth/role-gate';

export default function EmpresaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <EmpresaSidebar />
      {/* Offset del sidebar fijo en desktop; en móvil el topbar va en el flujo. */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        <main className="flex-1 flex flex-col w-full min-w-0">
          <RoleGate role="empresa">{children}</RoleGate>
        </main>
        <AppFooter
          left="SaltoAI · Calidad, no volumen"
          right="Barranqui-IA 2026 · Macondo Lab · GOyn · ACOPI"
        />
      </div>
    </div>
  );
}
