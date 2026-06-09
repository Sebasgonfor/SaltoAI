import { defineConfig } from "eslint/config";
import next from "eslint-config-next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig([{
    extends: [...next],
    rules: {
        // Reglas del React Compiler (react-hooks v6) que marcan patrones
        // intencionales y correctos de este código (fetch/suscripción en
        // montaje, memoización manual). Las dejamos como `warn` —no bloquean
        // ni representan bugs— mientras migramos caso por caso. Los efectos
        // con fix limpio (media query, hidratación, localStorage) ya usan
        // useSyncExternalStore / useHydrated.
        "react-hooks/set-state-in-effect": "warn",
        "react-hooks/preserve-manual-memoization": "warn",
        "react-hooks/refs": "warn",
    },
}]);
