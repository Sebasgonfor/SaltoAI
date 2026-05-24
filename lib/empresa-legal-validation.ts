export function validateTaxId(v: string): string | null {
  const trimmed = v.trim();
  if (trimmed.length < 6) return "El identificador fiscal parece muy corto.";
  if (!/[0-9]/.test(trimmed)) return "El identificador fiscal debe tener al menos un número.";
  return null;
}

export function validateDocId(v: string): string | null {
  const trimmed = v.trim();
  if (trimmed.length < 5) return "El documento del representante parece muy corto.";
  return null;
}
