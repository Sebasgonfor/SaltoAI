import type { CompanyNeed } from "@/lib/types";

/** Necesidades legacy sin `status` se tratan como abiertas. */
export function isNeedOpen(need: CompanyNeed): boolean {
  return need.status !== "closed";
}

export function isNeedClosed(need: CompanyNeed): boolean {
  return need.status === "closed";
}
