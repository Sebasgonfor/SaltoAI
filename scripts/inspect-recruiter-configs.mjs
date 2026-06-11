// Throwaway: lee recruiter_configs con el WEB SDK (mismo que la app) para ver
// si las reglas están desplegadas y si el slug/instructions están persistidos.
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const app = initializeApp({
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
const db = getFirestore(app);
console.log("projectId:", env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

try {
  const snap = await getDocs(collection(db, "recruiter_configs"));
  console.log(`\n✅ READ OK — recruiter_configs tiene ${snap.size} doc(s):`);
  for (const d of snap.docs) {
    const c = d.data();
    console.log(`  docId=${d.id}`);
    console.log(`    slug=${JSON.stringify(c.slug)} interviewerName=${JSON.stringify(c.interviewerName)} displayName=${JSON.stringify(c.displayName)}`);
    console.log(`    instructions=${c.instructions ? JSON.stringify(c.instructions.slice(0, 80)) : "(vacío)"}`);
  }
  // Prueba el lookup exacto por slug que usa la app
  for (const s of ["sebastiantest", "sebastian"]) {
    const qs = await getDocs(query(collection(db, "recruiter_configs"), where("slug", "==", s)));
    console.log(`\n  lookup where slug=="${s}" → ${qs.size} match(es)`);
  }
} catch (e) {
  console.log(`\n❌ READ FALLÓ: ${e.code || ""} ${e.message}`);
  console.log("   Si es 'permission-denied' → las reglas de recruiter_configs NO están desplegadas en este proyecto.");
}
process.exit(0);
