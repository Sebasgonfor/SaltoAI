/**
 * Firebase Admin (server-only). Init perezoso desde la variable de entorno
 * FIREBASE_SERVICE_ACCOUNT (JSON crudo o base64 del service-account).
 *
 * Por qué: el backend escribía a Firestore con el SDK WEB sin auth, así que las
 * reglas denegaban las escrituras y todo caía al fallback en memoria (efímero
 * en serverless → los links/perfiles "se vencían" en cada redeploy). El Admin
 * SDK usa una service account, salta las reglas y persiste SIEMPRE.
 *
 * NUNCA se commitea la credencial: vive en env (.env.local local + Vercel).
 */
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

type ServiceAccount = { projectId: string; clientEmail: string; privateKey: string };

let cachedDb: Firestore | null | undefined;

function parseServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  try {
    // Acepta JSON crudo o base64 (recomendado en Vercel para evitar problemas
    // con los saltos de línea de la private key).
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const sa = JSON.parse(json) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    if (!sa.project_id || !sa.client_email || !sa.private_key) return null;
    return {
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      // Si la key vino con \n escapados (Vercel), los desescapamos.
      privateKey: sa.private_key.replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

/** ¿Hay service account válida en env? */
export function adminConfigured(): boolean {
  return parseServiceAccount() !== null;
}

/** Firestore admin (o null si no hay credencial). Lazy + cacheado. */
export function adminDb(): Firestore | null {
  if (cachedDb !== undefined) return cachedDb;
  const sa = parseServiceAccount();
  if (!sa) {
    cachedDb = null;
    return null;
  }
  try {
    const app: App = getApps().length ? getApps()[0] : initializeApp({ credential: cert(sa) });
    const fdb = getFirestore(app);
    try {
      // Firestore admin rechaza undefined salvo que lo pidamos explícito.
      fdb.settings({ ignoreUndefinedProperties: true });
    } catch {
      /* settings ya aplicado (app reutilizada): ignorar */
    }
    cachedDb = fdb;
    return fdb;
  } catch (e) {
    console.error("[firebase-admin] init falló:", (e as Error)?.message);
    cachedDb = null;
    return null;
  }
}
