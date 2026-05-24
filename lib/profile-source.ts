/**
 * Helpers para distinguir perfiles "demo / no-accionables" de perfiles
 * de usuarios reales autenticados.
 *
 * Por qué importa:
 *   El motor de matching mezcla perfiles del SEED (Camila Silva, Andrés
 *   Bermejo, etc.) con perfiles REALES de jóvenes autenticados. Si un
 *   founder le deja feedback (`company_feedback_to_youth`) o le propone
 *   una microtask a un perfil del seed, ese feedback queda colgado en
 *   un targetId que ningún user real abre — el "joven destino" no
 *   existe. El founder cree que mandó feedback "a Camila Silva", pero
 *   Camila no es un user.
 *
 * Reglas de identificación:
 *   - id.startsWith("seed_")  → seed (perfiles demo cargados por /api/seed)
 *   - id.startsWith("local_") → legacy memoria (sesiones sin auth, pre-rebrand)
 *   - Cualquier otro          → real (Firebase UID o id custom de usuario)
 *
 * Estos prefijos son contractuales con `lib/db.ts` (makeLocalId y los
 * IDs del seed en `app/api/seed/route.ts`). Si cambian, actualizar acá.
 */

export type ProfileSource = "real" | "seed" | "legacy";

export function classifyProfileId(id: string | undefined | null): ProfileSource {
  if (!id) return "real";
  if (id.startsWith("seed_")) return "seed";
  if (id.startsWith("local_")) return "legacy";
  return "real";
}

/** ¿Este perfil es "demo" (no corresponde a un usuario real autenticado)?
 *  Equivalente a seed || legacy — usado para ocultar CTAs de acción que
 *  no llegarían a un destinatario real. */
export function isDemoProfile(id: string | undefined | null): boolean {
  const src = classifyProfileId(id);
  return src === "seed" || src === "legacy";
}
