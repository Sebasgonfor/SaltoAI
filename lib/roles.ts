import type { UserRole } from "./accounts";

/**
 * Home canónico de cada rol — la "página de inicio" de la zona app.
 * Fuente única: la usan el hook de redirect de zona, el RoleCTA y el shell.
 */
export const ROLE_DASHBOARD: Record<UserRole, string> = {
  joven: "/dashboard",
  empresa: "/empresa",
};
