/**
 * Capa de Firestore para el backend. Expone el MISMO API del SDK web
 * (doc/collection/getDoc/getDocs/setDoc/addDoc/deleteDoc/updateDoc/query/where/
 * orderBy) y DESPACHA al backend correcto:
 *
 *   - Si hay service account (FIREBASE_SERVICE_ACCOUNT) → Admin SDK: persiste
 *     SIEMPRE, salta las reglas. Es el camino recomendado en prod.
 *   - Si NO la hay → SDK web (firebase/firestore) con el `db` de cliente, igual
 *     que antes. Así nunca caemos a memoria por error si Firestore web ya
 *     funcionaba (no rompemos lo que ya persistía: profiles, needs, accounts…).
 *
 * El backend (lib/db.ts) cae a memoria solo cuando NINGÚN backend está
 * disponible. Así, agregar la service account "mejora" la persistencia sin ser
 * un requisito para que prod siga leyendo lo que ya existe.
 */
import * as web from "firebase/firestore";
import type {
  CollectionReference,
  DocumentData,
  DocumentReference,
  OrderByDirection,
  Query,
  WhereFilterOp,
} from "firebase-admin/firestore";
import { db as clientDb } from "./firebase";
import { adminConfigured, adminDb } from "./firebase-admin";

// El backend se fija una sola vez por proceso (la env no cambia en runtime).
let _useAdmin: boolean | undefined;
function useAdmin(): boolean {
  if (_useAdmin === undefined) {
    try {
      _useAdmin = adminConfigured();
    } catch {
      _useAdmin = false;
    }
  }
  return _useAdmin;
}

function fdb() {
  const d = adminDb();
  if (!d) throw new Error("Firestore admin no disponible.");
  return d;
}

/** Sentinel inerte (compat con `doc(db, col, id)`); en modo web es el clientDb. */
export const db: unknown = clientDb;

export function collection(_db: unknown, name: string): unknown {
  return useAdmin() ? fdb().collection(name) : web.collection(clientDb, name);
}

export function doc(_db: unknown, name: string, id: string): unknown {
  return useAdmin() ? fdb().collection(name).doc(id) : web.doc(clientDb, name, id);
}

/** Snapshot con `.exists()` (método), igual en ambos backends. */
export async function getDoc(ref: unknown) {
  if (useAdmin()) {
    const snap = await (ref as DocumentReference).get();
    return { exists: () => snap.exists, data: () => snap.data(), id: snap.id };
  }
  // El snapshot web ya expone .exists()/.data()/.id.
  return web.getDoc(ref as Parameters<typeof web.getDoc>[0]);
}

export function getDocs(q: unknown) {
  if (useAdmin()) return (q as Query | CollectionReference).get();
  return web.getDocs(q as Parameters<typeof web.getDocs>[0]);
}

export function setDoc(ref: unknown, data: DocumentData) {
  if (useAdmin()) return (ref as DocumentReference).set(data);
  return web.setDoc(ref as Parameters<typeof web.setDoc>[0], data);
}

export function addDoc(coll: unknown, data: DocumentData) {
  if (useAdmin()) return (coll as CollectionReference).add(data);
  return web.addDoc(coll as Parameters<typeof web.addDoc>[0], data);
}

export function deleteDoc(ref: unknown) {
  if (useAdmin()) return (ref as DocumentReference).delete();
  return web.deleteDoc(ref as Parameters<typeof web.deleteDoc>[0]);
}

export function updateDoc(ref: unknown, data: DocumentData) {
  if (useAdmin()) return (ref as DocumentReference).update(data);
  return web.updateDoc(ref as Parameters<typeof web.updateDoc>[0], data as never);
}

// Las "constraints" tienen forma distinta por backend, pero como `useAdmin()`
// es fijo, las que produce where/orderBy SIEMPRE casan con el query() del mismo
// modo. Por eso el tipo es laxo (unknown).
export function where(field: string, op: WhereFilterOp, val: unknown): unknown {
  if (useAdmin()) return (q: Query) => q.where(field, op, val);
  return web.where(field, op as web.WhereFilterOp, val);
}

export function orderBy(field: string, dir?: OrderByDirection): unknown {
  if (useAdmin()) return (q: Query) => q.orderBy(field, dir);
  return web.orderBy(field, dir as web.OrderByDirection | undefined);
}

export function query(coll: unknown, ...constraints: unknown[]): unknown {
  if (useAdmin()) {
    return (constraints as Array<(q: Query) => Query>).reduce(
      (q, c) => c(q),
      coll as Query
    );
  }
  return web.query(
    coll as Parameters<typeof web.query>[0],
    ...(constraints as web.QueryConstraint[])
  );
}
