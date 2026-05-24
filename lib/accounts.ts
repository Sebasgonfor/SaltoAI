import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export type UserRole = "joven" | "empresa";

export interface UserAccount {
  uid: string;
  role: UserRole;
  email: string | null;
  displayName: string | null;
  createdAt: number;
  interviewCompleted?: boolean;
}

const ACCOUNTS = "accounts";

function isFirestoreConfigured(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "dummy"
  );
}

// Fallback en memoria para dev sin Firestore. Vive solo en el browser tab.
const memAccounts = new Map<string, UserAccount>();

export async function getUserAccount(uid: string): Promise<UserAccount | null> {
  if (!isFirestoreConfigured()) {
    return memAccounts.get(uid) ?? null;
  }
  try {
    const snap = await getDoc(doc(db, ACCOUNTS, uid));
    if (!snap.exists()) return null;
    const data = snap.data() as Omit<UserAccount, "uid">;
    return { uid, ...data };
  } catch (err) {
    console.warn("[accounts] getUserAccount fallback to memory:", (err as Error).message);
    return memAccounts.get(uid) ?? null;
  }
}

/**
 * Setea el rol del usuario por primera vez. Es one-shot:
 * si el documento ya existe con un rol, NO lo sobreescribe (devuelve el existente).
 * Cambiar de rol requiere soporte manual — eso es deliberado: evita que un joven
 * cree perfil, luego se pase a empresa y vea sus propios datos de candidato.
 */
export async function setUserRole(
  uid: string,
  role: UserRole,
  email: string | null,
  displayName: string | null
): Promise<UserAccount> {
  const existing = await getUserAccount(uid);
  if (existing) return existing;

  const account: UserAccount = {
    uid,
    role,
    email,
    displayName,
    createdAt: Date.now(),
  };

  if (!isFirestoreConfigured()) {
    memAccounts.set(uid, account);
    return account;
  }

  try {
    await setDoc(doc(db, ACCOUNTS, uid), {
      role,
      email,
      displayName,
      createdAt: account.createdAt,
      createdAtServer: serverTimestamp(),
    });
    return account;
  } catch (err) {
    console.warn("[accounts] setUserRole fallback to memory:", (err as Error).message);
    memAccounts.set(uid, account);
    return account;
  }
}

export async function markInterviewCompleted(uid: string): Promise<void> {
  if (!isFirestoreConfigured()) {
    const acc = memAccounts.get(uid);
    if (acc) acc.interviewCompleted = true;
    return;
  }

  try {
    await updateDoc(doc(db, ACCOUNTS, uid), { interviewCompleted: true });
  } catch (err) {
    console.warn("[accounts] markInterviewCompleted fallback:", (err as Error).message);
    const acc = memAccounts.get(uid);
    if (acc) acc.interviewCompleted = true;
  }
}
