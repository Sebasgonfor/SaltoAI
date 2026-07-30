import { AliadosHeader } from '@/components/aliados/aliados-header';
import { AppFooter } from '@/components/layout/app-footer';

export default function AliadosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FAFAF7] flex flex-col overflow-x-hidden">
      <AliadosHeader />
      <main className="flex-1 flex flex-col w-full min-w-0 px-4 sm:px-6">{children}</main>
      <AppFooter
        left="SaltoAI · Impacto medible, no promesas"
        right="Barranqui-IA 2026 · Macondo Lab · GOyn · ACOPI"
      />
    </div>
  );
}
