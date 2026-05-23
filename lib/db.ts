import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Profile, CompanyNeed } from "./types";

const PROFILES = "profiles";
const NEEDS = "needs";

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

const memProfiles = new Map<string, Profile>();
const memNeeds = new Map<string, CompanyNeed>();

let firestoreDisabled = false;
function disableFirestoreWithWarning(err: unknown, op: string) {
  if (!firestoreDisabled) {
    firestoreDisabled = true;
    console.warn(
      `[db] Firestore unavailable during ${op}; switching to in-memory store for the rest of this process. Reason:`,
      (err as Error)?.message ?? err
    );
  }
}

function useFirestore(): boolean {
  return isFirestoreConfigured() && !firestoreDisabled;
}

function makeLocalId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createProfile(
  p: Omit<Profile, "id" | "createdAt">
): Promise<{ id: string; storage: StorageMode }> {
  const data: Profile = { ...p, createdAt: Date.now() };
  if (useFirestore()) {
    try {
      const ref = await addDoc(collection(db, PROFILES), data);
      return { id: ref.id, storage: "firestore" };
    } catch (e) {
      disableFirestoreWithWarning(e, "createProfile");
    }
  }
  const id = makeLocalId();
  memProfiles.set(id, { ...data, id });
  return { id, storage: "memory" };
}

export async function getProfile(id: string): Promise<Profile | null> {
  if (useFirestore()) {
    try {
      const snap = await getDoc(doc(db, PROFILES, id));
      if (!snap.exists()) return memProfiles.get(id) ?? null;
      return { id: snap.id, ...(snap.data() as Omit<Profile, "id">) };
    } catch (e) {
      disableFirestoreWithWarning(e, "getProfile");
    }
  }
  return memProfiles.get(id) ?? null;
}

export async function getAllProfiles(): Promise<Profile[]> {
  if (useFirestore()) {
    try {
      const snap = await getDocs(collection(db, PROFILES));
      const remote = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Profile, "id">) }));
      return remote.length > 0 ? remote : Array.from(memProfiles.values());
    } catch (e) {
      disableFirestoreWithWarning(e, "getAllProfiles");
    }
  }
  return Array.from(memProfiles.values());
}

export async function upsertProfileWithId(id: string, p: Omit<Profile, "id">): Promise<void> {
  if (useFirestore()) {
    try {
      await setDoc(doc(db, PROFILES, id), p);
      return;
    } catch (e) {
      disableFirestoreWithWarning(e, "upsertProfileWithId");
    }
  }
  memProfiles.set(id, { ...p, id });
}

export async function createNeed(
  n: Omit<CompanyNeed, "id" | "createdAt">
): Promise<{ id: string; storage: StorageMode }> {
  const data: CompanyNeed = { ...n, createdAt: Date.now() };
  if (useFirestore()) {
    try {
      const ref = await addDoc(collection(db, NEEDS), data);
      return { id: ref.id, storage: "firestore" };
    } catch (e) {
      disableFirestoreWithWarning(e, "createNeed");
    }
  }
  const id = makeLocalId();
  memNeeds.set(id, { ...data, id });
  return { id, storage: "memory" };
}

export async function getAllNeeds(): Promise<CompanyNeed[]> {
  if (useFirestore()) {
    try {
      const snap = await getDocs(collection(db, NEEDS));
      const remote = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CompanyNeed, "id">) }));
      return remote.length > 0 ? remote : Array.from(memNeeds.values());
    } catch (e) {
      disableFirestoreWithWarning(e, "getAllNeeds");
    }
  }
  return Array.from(memNeeds.values());
}

export async function getNeed(id: string): Promise<CompanyNeed | null> {
  if (useFirestore()) {
    try {
      const snap = await getDoc(doc(db, NEEDS, id));
      if (!snap.exists()) return memNeeds.get(id) ?? null;
      return { id: snap.id, ...(snap.data() as Omit<CompanyNeed, "id">) };
    } catch (e) {
      disableFirestoreWithWarning(e, "getNeed");
    }
  }
  return memNeeds.get(id) ?? null;
}

export { isFirestoreConfigured };
