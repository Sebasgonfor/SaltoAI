/** Mensajes en español para errores comunes de Firebase Auth. */
export function getAuthErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Ese correo ya está registrado. Inicia sesión o usa otro email.';
    case 'auth/invalid-email':
      return 'El correo no es válido.';
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.';
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
      return 'Correo o contraseña incorrectos.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return '';
    default:
      return 'No pudimos completar el inicio de sesión. Inténtalo de nuevo.';
  }
}

export function isAuthCancellation(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? '';
  return code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request';
}

/**
 * ¿El error es "esperable" (user typeó mal, ya registrado, demasiados
 * intentos)? Estos NO son bugs — el form ya los muestra al usuario con
 * `getAuthErrorMessage`. Logearlos a console solo genera ruido en el dev
 * overlay de Next y confunde al revisar logs reales.
 *
 * Para bugs reales (network down, Firebase misconfigured, internal),
 * isExpected devuelve false → caller debe console.error para diagnóstico.
 */
const EXPECTED_AUTH_CODES = new Set([
  'auth/email-already-in-use',
  'auth/invalid-email',
  'auth/weak-password',
  'auth/wrong-password',
  'auth/user-not-found',
  'auth/invalid-credential',
  'auth/too-many-requests',
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-disabled',
  'auth/account-exists-with-different-credential',
]);

export function isExpectedAuthError(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? '';
  return EXPECTED_AUTH_CODES.has(code);
}
