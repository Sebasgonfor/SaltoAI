import { useSyncExternalStore } from "react";

// Sin suscripción: el valor solo cambia una vez (SSR → cliente). React usa
// getServerSnapshot en el render de hidratación y getSnapshot después.
const subscribe = () => () => {};

/**
 * `true` una vez que el componente montó en el cliente; `false` durante SSR y
 * en el primer render de hidratación. Sirve para diferir lecturas client-only
 * (localStorage, matchMedia, etc.) SIN provocar hydration mismatch ni
 * `setState` dentro de un efecto.
 *
 * Reemplaza el patrón `const [hydrated,setHydrated]=useState(false);
 * useEffect(()=>setHydrated(true),[])` por la API recomendada de React 19.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true, // cliente
    () => false // servidor
  );
}
