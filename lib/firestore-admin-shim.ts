/**
 * Shim que expone las MISMAS funciones del SDK web de Firestore
 * (doc/collection/getDoc/getDocs/setDoc/addDoc/deleteDoc/updateDoc/query/where/
 * orderBy) pero respaldadas por el Admin SDK. Así `lib/db.ts` cambia solo su
 * import y conserva sus ~95 call-sites intactos.
 *
 * El primer argumento `db` de `doc(db, ...)`/`collection(db, ...)` se ignora
 * (compat de firma); el handle real es adminDb().
 */
import type {
  CollectionReference,
  DocumentData,
  DocumentReference,
  OrderByDirection,
  Query,
  WhereFilterOp,
} from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";

/** Sentinel inerte para compat con la firma `doc(db, col, id)`. */
export const db = {} as unknown;

function fdb() {
  const d = adminDb();
  if (!d) throw new Error("Firestore admin no configurado (FIREBASE_SERVICE_ACCOUNT).");
  return d;
}

export function collection(_db: unknown, name: string): CollectionReference {
  return fdb().collection(name);
}

export function doc(_db: unknown, name: string, id: string): DocumentReference {
  return fdb().collection(name).doc(id);
}

/** Devuelve un snapshot con `.exists()` (método, como el SDK web). */
export async function getDoc(ref: DocumentReference) {
  const snap = await ref.get();
  return {
    exists: () => snap.exists,
    data: () => snap.data(),
    id: snap.id,
  };
}

/** El QuerySnapshot del Admin SDK ya expone `.docs`, `.size`, `.empty`. */
export function getDocs(q: Query | CollectionReference) {
  return q.get();
}

export function setDoc(ref: DocumentReference, data: DocumentData) {
  return ref.set(data);
}

export function addDoc(coll: CollectionReference, data: DocumentData) {
  return coll.add(data);
}

export function deleteDoc(ref: DocumentReference) {
  return ref.delete();
}

export function updateDoc(ref: DocumentReference, data: DocumentData) {
  return ref.update(data);
}

type Constraint = (q: Query) => Query;

export function where(field: string, op: WhereFilterOp, val: unknown): Constraint {
  return (q) => q.where(field, op, val);
}

export function orderBy(field: string, dir?: OrderByDirection): Constraint {
  return (q) => q.orderBy(field, dir);
}

export function query(
  coll: Query | CollectionReference,
  ...constraints: Constraint[]
): Query {
  return constraints.reduce<Query>((q, c) => c(q), coll as Query);
}
