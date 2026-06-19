import type { UserRole } from "@/lib/auth-context";

export function isSafeNext(value: string | null): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export function defaultDestination(role: UserRole): string {
  return role === "joven" ? "/joven/chat" : "/empresa/chat";
}

/**
 * El `next` del query string se RESPETA solo si es coherente con el rol
 * resuelto. Si no, se descarta y se va al default del rol.
 */
export function resolveTarget(role: UserRole, next: string): string {
  if (next === "/") return defaultDestination(role);
  if (role === "joven" && (next === "/joven" || next.startsWith("/joven/"))) return next;
  if (role === "empresa" && (next === "/empresa" || next.startsWith("/empresa/"))) return next;
  if (!next.startsWith("/joven") && !next.startsWith("/empresa")) return next;
  return defaultDestination(role);
}
