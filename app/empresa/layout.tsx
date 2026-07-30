import { EmpresaAppShell } from '@/components/empresa/empresa-app-shell';

/**
 * Layout de la app de la empresa: sidebar (escritorio) + barra inferior (móvil),
 * mismo rediseño de navegación que el del joven. El EmpresaAppShell es rol-aware
 * y conserva el RoleGate role="empresa" para proteger todas las rutas /empresa/*.
 */
export default function EmpresaLayout({ children }: { children: React.ReactNode }) {
  return <EmpresaAppShell>{children}</EmpresaAppShell>;
}
