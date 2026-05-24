import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  query,
  where,
  orderBy,
  updateDoc,
} from "firebase/firestore";
import type {
  Profile,
  CompanyNeed,
  FeedbackEntry,
  MicroTask,
  LatentProfile,
  ProfileDocument,
  TaskOutcomeStat,
  MatchDecision,
  MatchDecisionStatus,
  NeedMatchSnapshot,
} from "./types";

const PROFILES = "profiles";
const NEEDS = "needs";
const FEEDBACK = "feedback";
const MICROTASKS = "microtasks";
const DOCUMENTS = "documents";
const MATCH_DECISIONS = "match_decisions";
const NEED_MATCHES = "need_matches";

export type StorageMode = "firestore" | "memory";

export function storageFromId(id: string): StorageMode {
  return id.startsWith("local_") ? "memory" : "firestore";
}

function isFirestoreConfigured(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "dummy"
  );
}

// En Next dev cada route handler puede recibir su propia copia del módulo
// (HMR / route isolation). Si los stores fueran simples `const` locales, lo
// que escribe `/api/seed` no lo ve `/api/perfil` ni `/api/cv`. Anclamos las
// Maps a globalThis para que sobrevivan a la recarga y compartan estado
// entre todas las rutas en el mismo proceso. En prod no cambia nada: hay un
// único módulo y la indirección es invisible.
type DbGlobals = {
  memProfiles: Map<string, Profile>;
  memNeeds: Map<string, CompanyNeed>;
  memFeedback: FeedbackEntry[];
  memMicroTasks: Map<string, MicroTask>;
  memDocuments: Map<string, ProfileDocument>;
  memMatchDecisions: Map<string, MatchDecision>;
  memNeedMatches: Map<string, NeedMatchSnapshot>;
};
const g = globalThis as unknown as { __saltoDb?: DbGlobals };
if (!g.__saltoDb) {
  g.__saltoDb = {
    memProfiles: new Map(),
    memNeeds: new Map(),
    memFeedback: [],
    memMicroTasks: new Map(),
    memDocuments: new Map(),
    memMatchDecisions: new Map(),
    memNeedMatches: new Map(),
  };
}
// Backfill por si el globalThis fue creado por una versión anterior sin
// memDocuments. Sin esto, HMR en dev deja la prop como undefined → crash.
if (!g.__saltoDb.memDocuments) g.__saltoDb.memDocuments = new Map();
if (!g.__saltoDb.memMatchDecisions) g.__saltoDb.memMatchDecisions = new Map();
if (!g.__saltoDb.memNeedMatches) g.__saltoDb.memNeedMatches = new Map();
const memProfiles = g.__saltoDb.memProfiles;
const memNeeds = g.__saltoDb.memNeeds;
const memFeedback = g.__saltoDb.memFeedback;
const memMicroTasks = g.__saltoDb.memMicroTasks;
const memDocuments = g.__saltoDb.memDocuments;
const memMatchDecisions = g.__saltoDb.memMatchDecisions;
const memNeedMatches = g.__saltoDb.memNeedMatches;

// Antes había un único flag global `firestoreDisabled` que se prendía con
// el PRIMER error y dejaba el proceso entero en modo memoria — un permiso
// faltante en `feedback` tiraba abajo profiles/needs también. Ahora
// trackeamos el bypass por colección: el resto sigue tocando Firestore.
const firestoreDisabledFor = new Set<string>();
function disableFirestoreWithWarning(err: unknown, op: string, collection: string) {
  if (!firestoreDisabledFor.has(collection)) {
    firestoreDisabledFor.add(collection);
    console.warn(
      `[db] Firestore unavailable for collection "${collection}" during ${op}; fallback a memoria SOLO para esa colección. Reason:`,
      (err as Error)?.message ?? err
    );
  }
}

function useFirestore(collection?: string): boolean {
  if (!isFirestoreConfigured()) return false;
  if (collection && firestoreDisabledFor.has(collection)) return false;
  return true;
}

function makeLocalId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Firestore no acepta valores `undefined`. Stripamos antes de escribir
 * para que un campo opcional sin completar no rompa el addDoc/setDoc.
 */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

export async function createProfile(
  p: Omit<Profile, "id" | "createdAt">
): Promise<{ id: string; storage: StorageMode }> {
  const data: Profile = { ...p, createdAt: Date.now() };
  if (useFirestore(PROFILES)) {
    try {
      const ref = await addDoc(
        collection(db, PROFILES),
        stripUndefined(data as unknown as Record<string, unknown>)
      );
      const saved = { ...data, id: ref.id };
      memProfiles.set(ref.id, saved);
      return { id: ref.id, storage: "firestore" };
    } catch (e) {
      disableFirestoreWithWarning(e, "createProfile", PROFILES);
    }
  }
  const id = makeLocalId();
  memProfiles.set(id, { ...data, id });
  return { id, storage: "memory" };
}

export async function getProfile(id: string): Promise<Profile | null> {
  if (useFirestore(PROFILES)) {
    try {
      const snap = await getDoc(doc(db, PROFILES, id));
      if (!snap.exists()) return memProfiles.get(id) ?? null;
      const profile = { id: snap.id, ...(snap.data() as Omit<Profile, "id">) };
      memProfiles.set(id, profile);
      return profile;
    } catch (e) {
      disableFirestoreWithWarning(e, "getProfile", PROFILES);
    }
  }
  return memProfiles.get(id) ?? null;
}

export async function getAllProfiles(): Promise<Profile[]> {
  if (useFirestore(PROFILES)) {
    try {
      const snap = await getDocs(collection(db, PROFILES));
      const remote = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Profile, "id">) }));
      return remote.length > 0 ? remote : Array.from(memProfiles.values());
    } catch (e) {
      disableFirestoreWithWarning(e, "getAllProfiles", PROFILES);
    }
  }
  return Array.from(memProfiles.values());
}

export async function upsertProfileWithId(id: string, p: Omit<Profile, "id">): Promise<void> {
  const profile = { ...p, id };
  memProfiles.set(id, profile);
  if (useFirestore(PROFILES)) {
    try {
      await setDoc(doc(db, PROFILES, id), stripUndefined(p as unknown as Record<string, unknown>));
      return;
    } catch (e) {
      disableFirestoreWithWarning(e, "upsertProfileWithId", PROFILES);
    }
  }
}

export async function createNeed(
  n: Omit<CompanyNeed, "id" | "createdAt">
): Promise<{ id: string; storage: StorageMode }> {
  const data: CompanyNeed = { ...n, createdAt: Date.now() };
  if (useFirestore(NEEDS)) {
    try {
      const ref = await addDoc(
        collection(db, NEEDS),
        stripUndefined(data as unknown as Record<string, unknown>)
      );
      return { id: ref.id, storage: "firestore" };
    } catch (e) {
      disableFirestoreWithWarning(e, "createNeed", NEEDS);
    }
  }
  const id = makeLocalId();
  memNeeds.set(id, { ...data, id });
  return { id, storage: "memory" };
}

/**
 * Lista necesidades publicadas por un founder específico (filtra por
 * `ownerUid`). Es lo que alimenta el dashboard de empresa (`/empresa`).
 *
 * En Firestore usamos `where("ownerUid", "==", uid)`. En modo memoria
 * filtramos el array. Devuelve ordenado por `createdAt` desc (más nuevas
 * primero) — el dashboard las muestra como lista cronológica reversa.
 */
export async function listNeedsByOwner(ownerUid: string): Promise<CompanyNeed[]> {
  if (!ownerUid) return [];
  if (useFirestore(NEEDS)) {
    try {
      const q = query(collection(db, NEEDS), where("ownerUid", "==", ownerUid));
      const snap = await getDocs(q);
      const remote = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<CompanyNeed, "id">),
      }));
      remote.sort((a, b) => b.createdAt - a.createdAt);
      return remote;
    } catch (e) {
      disableFirestoreWithWarning(e, "listNeedsByOwner", NEEDS);
    }
  }
  // Fallback memoria: no tenemos `ownerUid` indexado, hacemos linear scan.
  const inMem = Array.from(memNeeds.values()).filter((n) => {
    const o = (n as CompanyNeed & { ownerUid?: string }).ownerUid;
    return o === ownerUid;
  });
  inMem.sort((a, b) => b.createdAt - a.createdAt);
  return inMem;
}

export async function getAllNeeds(): Promise<CompanyNeed[]> {
  if (useFirestore()) {
    try {
      const snap = await getDocs(collection(db, NEEDS));
      const remote = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CompanyNeed, "id">) }));
      return remote.length > 0 ? remote : Array.from(memNeeds.values());
    } catch (e) {
      disableFirestoreWithWarning(e, "getAllNeeds", NEEDS);
    }
  }
  return Array.from(memNeeds.values());
}

export async function deleteNeed(id: string): Promise<boolean> {
  let deleted = false;
  if (useFirestore(NEEDS)) {
    try {
      await deleteDoc(doc(db, NEEDS, id));
      deleted = true;
    } catch (e) {
      disableFirestoreWithWarning(e, "deleteNeed", NEEDS);
    }
  }
  if (memNeeds.delete(id)) deleted = true;
  return deleted;
}

/**
 * Borra un perfil + su entrada en memoria. Usado por el endpoint admin
 * de cleanup de mocks. NO toca colecciones relacionadas (microtasks,
 * documentos, feedback) — eso lo hace el endpoint llamador con los
 * helpers específicos.
 */
export async function deleteProfile(id: string): Promise<boolean> {
  let deleted = false;
  if (useFirestore(PROFILES)) {
    try {
      await deleteDoc(doc(db, PROFILES, id));
      deleted = true;
    } catch (e) {
      disableFirestoreWithWarning(e, "deleteProfile", PROFILES);
    }
  }
  if (memProfiles.delete(id)) deleted = true;
  return deleted;
}

/** Borra una microtask por id. */
export async function deleteMicroTask(id: string): Promise<boolean> {
  let deleted = false;
  if (useFirestore(MICROTASKS)) {
    try {
      await deleteDoc(doc(db, MICROTASKS, id));
      deleted = true;
    } catch (e) {
      disableFirestoreWithWarning(e, "deleteMicroTask", MICROTASKS);
    }
  }
  if (memMicroTasks.delete(id)) deleted = true;
  return deleted;
}

/** Borra un feedback por id. */
export async function deleteFeedback(id: string): Promise<boolean> {
  let deleted = false;
  if (useFirestore(FEEDBACK)) {
    try {
      await deleteDoc(doc(db, FEEDBACK, id));
      deleted = true;
    } catch (e) {
      disableFirestoreWithWarning(e, "deleteFeedback", FEEDBACK);
    }
  }
  const idx = memFeedback.findIndex((f) => f.id === id);
  if (idx >= 0) {
    memFeedback.splice(idx, 1);
    deleted = true;
  }
  return deleted;
}

export async function getNeed(id: string): Promise<CompanyNeed | null> {
  if (useFirestore(NEEDS)) {
    try {
      const snap = await getDoc(doc(db, NEEDS, id));
      if (!snap.exists()) return memNeeds.get(id) ?? null;
      return { id: snap.id, ...(snap.data() as Omit<CompanyNeed, "id">) };
    } catch (e) {
      disableFirestoreWithWarning(e, "getNeed", NEEDS);
    }
  }
  return memNeeds.get(id) ?? null;
}

export async function updateNeed(
  id: string,
  patch: Partial<Omit<CompanyNeed, "id">>
): Promise<CompanyNeed | null> {
  const existing = await getNeed(id);
  if (!existing) return null;
  const next: CompanyNeed = { ...existing, ...patch, id };
  memNeeds.set(id, next);
  if (useFirestore(NEEDS)) {
    try {
      const { id: _id, ...data } = next;
      await updateDoc(
        doc(db, NEEDS, id),
        stripUndefined(data as unknown as Record<string, unknown>)
      );
      return next;
    } catch (e) {
      disableFirestoreWithWarning(e, "updateNeed", NEEDS);
    }
  }
  return next;
}

export async function recordFeedback(
  entry: Omit<FeedbackEntry, "id" | "timestamp">
): Promise<string> {
  const data: FeedbackEntry = { ...entry, timestamp: Date.now() };
  if (useFirestore(FEEDBACK)) {
    try {
      // stripUndefined es clave aquí: `note`, `needId`, `profileId` y
      // `source` son opcionales. Sin esto, Firestore rechaza el addDoc
      // con "Unsupported field value: undefined".
      const ref = await addDoc(
        collection(db, FEEDBACK),
        stripUndefined(data as unknown as Record<string, unknown>)
      );
      return ref.id;
    } catch (e) {
      disableFirestoreWithWarning(e, "recordFeedback", FEEDBACK);
    }
  }
  // Aun sin Firestore, guardamos el dato propietario en memoria — el foso
  // defensivo (PRD §8.6) arranca el día 1, no cuando haya backend "real".
  const id = makeLocalId();
  memFeedback.push({ ...data, id });
  return id;
}

export async function listFeedback(): Promise<FeedbackEntry[]> {
  if (useFirestore(FEEDBACK)) {
    try {
      const snap = await getDocs(collection(db, FEEDBACK));
      const remote = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FeedbackEntry, "id">) }));
      return remote.length > 0 ? remote : [...memFeedback];
    } catch (e) {
      disableFirestoreWithWarning(e, "listFeedback", FEEDBACK);
    }
  }
  return [...memFeedback];
}

export async function updateProfileLatent(id: string, latent: LatentProfile): Promise<void> {
  if (useFirestore(PROFILES)) {
    try {
      await updateDoc(doc(db, PROFILES, id), { latent });
      return;
    } catch (e) {
      disableFirestoreWithWarning(e, "updateProfileLatent", PROFILES);
    }
  }
  const existing = memProfiles.get(id);
  if (existing) memProfiles.set(id, { ...existing, latent });
}

export async function updateProfileTaskStats(
  id: string,
  taskStats: TaskOutcomeStat
): Promise<void> {
  if (useFirestore(PROFILES)) {
    try {
      await updateDoc(doc(db, PROFILES, id), { taskStats });
      return;
    } catch (e) {
      disableFirestoreWithWarning(e, "updateProfileTaskStats", PROFILES);
    }
  }
  const existing = memProfiles.get(id);
  if (existing) memProfiles.set(id, { ...existing, taskStats });
}

export async function createMicroTask(
  t: Omit<MicroTask, "id" | "createdAt">
): Promise<string> {
  const data: MicroTask = { ...t, createdAt: Date.now() };
  if (useFirestore(MICROTASKS)) {
    try {
      const ref = await addDoc(
        collection(db, MICROTASKS),
        stripUndefined(data as unknown as Record<string, unknown>)
      );
      return ref.id;
    } catch (e) {
      disableFirestoreWithWarning(e, "createMicroTask", MICROTASKS);
    }
  }
  const id = makeLocalId();
  memMicroTasks.set(id, { ...data, id });
  return id;
}

export async function getMicroTask(id: string): Promise<MicroTask | null> {
  if (useFirestore(MICROTASKS)) {
    try {
      const snap = await getDoc(doc(db, MICROTASKS, id));
      if (!snap.exists()) return memMicroTasks.get(id) ?? null;
      return { id: snap.id, ...(snap.data() as Omit<MicroTask, "id">) };
    } catch (e) {
      disableFirestoreWithWarning(e, "getMicroTask", MICROTASKS);
    }
  }
  return memMicroTasks.get(id) ?? null;
}

export async function updateMicroTask(id: string, patch: Partial<MicroTask>): Promise<void> {
  if (useFirestore(MICROTASKS)) {
    try {
      await updateDoc(
        doc(db, MICROTASKS, id),
        stripUndefined(patch as unknown as Record<string, unknown>)
      );
      return;
    } catch (e) {
      disableFirestoreWithWarning(e, "updateMicroTask", MICROTASKS);
    }
  }
  const existing = memMicroTasks.get(id);
  if (existing) memMicroTasks.set(id, { ...existing, ...patch });
}

export async function listMicroTasksByProfile(profileId: string): Promise<MicroTask[]> {
  // CRÍTICO: Firestore exige un compound index cuando combinás `where` con
  // `orderBy` sobre campos distintos (profileId + createdAt). Si el index
  // no está creado, la query throw → fallback a memoria que está VACÍO
  // porque la microtask se persistió en Firestore.
  //
  // Resultado del bug: empresa crea task → backend OK → joven no la ve
  // porque la query del joven cae a memoria con 0 entries.
  //
  // Fix: NO usar orderBy en Firestore. Ordenamos in-memory post-fetch.
  // Una tarea por joven raramente excede 50 docs → sort O(n log n) en
  // cliente es despreciable y evita necesitar índices compuestos.
  if (useFirestore(MICROTASKS)) {
    try {
      const q = query(
        collection(db, MICROTASKS),
        where("profileId", "==", profileId),
      );
      const snap = await getDocs(q);
      const remote = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MicroTask, "id">),
      }));
      return remote.sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) {
      disableFirestoreWithWarning(e, "listMicroTasksByProfile", MICROTASKS);
    }
  }
  return Array.from(memMicroTasks.values())
    .filter((t) => t.profileId === profileId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Une tareas de varios profileIds (p. ej. uid + local_* previo al link). */
export async function listMicroTasksForProfileIds(profileIds: string[]): Promise<MicroTask[]> {
  const uniq = [...new Set(profileIds.map((id) => id.trim()).filter(Boolean))];
  if (uniq.length === 0) return [];
  if (uniq.length === 1) return listMicroTasksByProfile(uniq[0]);
  const batches = await Promise.all(uniq.map((id) => listMicroTasksByProfile(id)));
  const byId = new Map<string, MicroTask>();
  for (const t of batches.flat()) {
    if (t.id) byId.set(t.id, t);
  }
  return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
}

/** Reasigna micro-tasks al vincular perfil anónimo → uid de Firebase. */
export async function reassignMicroTasksProfileId(fromId: string, toId: string): Promise<number> {
  if (!fromId || !toId || fromId === toId) return 0;
  const tasks = await listMicroTasksByProfile(fromId);
  let count = 0;
  for (const t of tasks) {
    if (!t.id) continue;
    await updateMicroTask(t.id, { profileId: toId });
    count++;
  }
  return count;
}

export async function listMicroTasksByCompany(companyId: string): Promise<MicroTask[]> {
  // Mismo razonamiento que listMicroTasksByProfile: sin orderBy para no
  // requerir compound index. Sort post-fetch.
  if (useFirestore(MICROTASKS)) {
    try {
      const q = query(
        collection(db, MICROTASKS),
        where("companyId", "==", companyId),
      );
      const snap = await getDocs(q);
      const remote = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MicroTask, "id">),
      }));
      return remote.sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) {
      disableFirestoreWithWarning(e, "listMicroTasksByCompany", MICROTASKS);
    }
  }
  return Array.from(memMicroTasks.values())
    .filter((t) => t.companyId === companyId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function countMicroTasksBetween(
  companyId: string,
  profileId: string
): Promise<number> {
  if (useFirestore(MICROTASKS)) {
    try {
      const q = query(
        collection(db, MICROTASKS),
        where("companyId", "==", companyId),
        where("profileId", "==", profileId)
      );
      const snap = await getDocs(q);
      return snap.size;
    } catch (e) {
      disableFirestoreWithWarning(e, "countMicroTasksBetween", MICROTASKS);
    }
  }
  return Array.from(memMicroTasks.values()).filter(
    (t) => t.companyId === companyId && t.profileId === profileId
  ).length;
}

// --- ProfileDocument CRUD (diplomas, certificados, etc) ---

export async function createDocument(
  d: Omit<ProfileDocument, "id" | "createdAt">,
): Promise<{ id: string; storage: StorageMode }> {
  const data: ProfileDocument = { ...d, createdAt: Date.now() };
  if (useFirestore(DOCUMENTS)) {
    try {
      const ref = await addDoc(
        collection(db, DOCUMENTS),
        stripUndefined(data as unknown as Record<string, unknown>),
      );
      return { id: ref.id, storage: "firestore" };
    } catch (e) {
      disableFirestoreWithWarning(e, "createDocument", DOCUMENTS);
    }
  }
  const id = makeLocalId();
  memDocuments.set(id, { ...data, id });
  return { id, storage: "memory" };
}

export async function getDocument(id: string): Promise<ProfileDocument | null> {
  if (useFirestore(DOCUMENTS)) {
    try {
      const snap = await getDoc(doc(db, DOCUMENTS, id));
      if (!snap.exists()) return memDocuments.get(id) ?? null;
      return { id: snap.id, ...(snap.data() as Omit<ProfileDocument, "id">) };
    } catch (e) {
      disableFirestoreWithWarning(e, "getDocument", DOCUMENTS);
    }
  }
  return memDocuments.get(id) ?? null;
}

export async function listDocumentsByProfile(
  profileId: string,
): Promise<ProfileDocument[]> {
  if (!profileId) return [];
  if (useFirestore(DOCUMENTS)) {
    try {
      const q = query(collection(db, DOCUMENTS), where("profileId", "==", profileId));
      const snap = await getDocs(q);
      const remote = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ProfileDocument, "id">),
      }));
      remote.sort((a, b) => b.createdAt - a.createdAt);
      return remote;
    } catch (e) {
      disableFirestoreWithWarning(e, "listDocumentsByProfile", DOCUMENTS);
    }
  }
  return Array.from(memDocuments.values())
    .filter((d) => d.profileId === profileId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateDocument(
  id: string,
  patch: Partial<ProfileDocument>,
): Promise<void> {
  if (useFirestore(DOCUMENTS)) {
    try {
      await updateDoc(
        doc(db, DOCUMENTS, id),
        stripUndefined(patch as unknown as Record<string, unknown>),
      );
      return;
    } catch (e) {
      disableFirestoreWithWarning(e, "updateDocument", DOCUMENTS);
    }
  }
  const existing = memDocuments.get(id);
  if (existing) memDocuments.set(id, { ...existing, ...patch });
}

export async function deleteDocument(id: string): Promise<boolean> {
  let deleted = false;
  if (useFirestore(DOCUMENTS)) {
    try {
      await deleteDoc(doc(db, DOCUMENTS, id));
      deleted = true;
    } catch (e) {
      disableFirestoreWithWarning(e, "deleteDocument", DOCUMENTS);
    }
  }
  if (memDocuments.delete(id)) deleted = true;
  return deleted;
}

export function matchDecisionId(needId: string, profileId: string): string {
  return `${needId}__${profileId}`;
}

export async function upsertMatchDecision(
  input: Omit<MatchDecision, "id" | "updatedAt"> & { status: Exclude<MatchDecisionStatus, "pending"> }
): Promise<MatchDecision> {
  const id = matchDecisionId(input.needId, input.profileId);
  const data: MatchDecision = {
    ...input,
    id,
    updatedAt: Date.now(),
  };
  if (useFirestore(MATCH_DECISIONS)) {
    try {
      await setDoc(
        doc(db, MATCH_DECISIONS, id),
        stripUndefined(data as unknown as Record<string, unknown>)
      );
      memMatchDecisions.set(id, data);
      return data;
    } catch (e) {
      disableFirestoreWithWarning(e, "upsertMatchDecision", MATCH_DECISIONS);
    }
  }
  memMatchDecisions.set(id, data);
  return data;
}

export async function getMatchDecision(
  needId: string,
  profileId: string
): Promise<MatchDecision | null> {
  const id = matchDecisionId(needId, profileId);
  if (useFirestore(MATCH_DECISIONS)) {
    try {
      const snap = await getDoc(doc(db, MATCH_DECISIONS, id));
      if (!snap.exists()) return memMatchDecisions.get(id) ?? null;
      const row = { id: snap.id, ...(snap.data() as Omit<MatchDecision, "id">) };
      memMatchDecisions.set(id, row);
      return row;
    } catch (e) {
      disableFirestoreWithWarning(e, "getMatchDecision", MATCH_DECISIONS);
    }
  }
  return memMatchDecisions.get(id) ?? null;
}

export async function listDecisionsByNeed(needId: string): Promise<MatchDecision[]> {
  if (useFirestore(MATCH_DECISIONS)) {
    try {
      const q = query(collection(db, MATCH_DECISIONS), where("needId", "==", needId));
      const snap = await getDocs(q);
      const remote = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MatchDecision, "id">),
      }));
      for (const row of remote) memMatchDecisions.set(row.id, row);
      return remote.length > 0
        ? remote
        : Array.from(memMatchDecisions.values()).filter((d) => d.needId === needId);
    } catch (e) {
      disableFirestoreWithWarning(e, "listDecisionsByNeed", MATCH_DECISIONS);
    }
  }
  return Array.from(memMatchDecisions.values()).filter((d) => d.needId === needId);
}

export async function listDecisionsForProfile(profileId: string): Promise<MatchDecision[]> {
  if (useFirestore(MATCH_DECISIONS)) {
    try {
      const q = query(collection(db, MATCH_DECISIONS), where("profileId", "==", profileId));
      const snap = await getDocs(q);
      const remote = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MatchDecision, "id">),
      }));
      for (const row of remote) memMatchDecisions.set(row.id, row);
      return remote.length > 0
        ? remote
        : Array.from(memMatchDecisions.values()).filter((d) => d.profileId === profileId);
    } catch (e) {
      disableFirestoreWithWarning(e, "listDecisionsForProfile", MATCH_DECISIONS);
    }
  }
  return Array.from(memMatchDecisions.values()).filter((d) => d.profileId === profileId);
}

export async function saveNeedMatches(snapshot: NeedMatchSnapshot): Promise<void> {
  const id = snapshot.needId;
  if (useFirestore(NEED_MATCHES)) {
    try {
      await setDoc(
        doc(db, NEED_MATCHES, id),
        stripUndefined(snapshot as unknown as Record<string, unknown>)
      );
      memNeedMatches.set(id, snapshot);
      return;
    } catch (e) {
      disableFirestoreWithWarning(e, "saveNeedMatches", NEED_MATCHES);
    }
  }
  memNeedMatches.set(id, snapshot);
}

export async function getNeedMatches(needId: string): Promise<NeedMatchSnapshot | null> {
  if (useFirestore(NEED_MATCHES)) {
    try {
      const snap = await getDoc(doc(db, NEED_MATCHES, needId));
      if (snap.exists()) {
        const data = snap.data() as Omit<NeedMatchSnapshot, "needId">;
        const row: NeedMatchSnapshot = { needId, ...data };
        memNeedMatches.set(needId, row);
        return row;
      }
    } catch (e) {
      disableFirestoreWithWarning(e, "getNeedMatches", NEED_MATCHES);
    }
  }
  return memNeedMatches.get(needId) ?? null;
}

export async function getAllNeedMatches(): Promise<NeedMatchSnapshot[]> {
  if (useFirestore(NEED_MATCHES)) {
    try {
      const snap = await getDocs(collection(db, NEED_MATCHES));
      const remote = snap.docs.map((d) => ({
        needId: d.id,
        ...(d.data() as Omit<NeedMatchSnapshot, "needId">),
      }));
      for (const row of remote) memNeedMatches.set(row.needId, row);
      return remote.length > 0 ? remote : Array.from(memNeedMatches.values());
    } catch (e) {
      disableFirestoreWithWarning(e, "getAllNeedMatches", NEED_MATCHES);
    }
  }
  return Array.from(memNeedMatches.values());
}

export { isFirestoreConfigured };
