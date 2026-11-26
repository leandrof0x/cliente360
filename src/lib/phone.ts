/** Misma regla que public.normalize_phone() en la base de datos. */
export function normalizePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  if (digits.length < 6) return null;
  if (/^0\d{8,9}$/.test(digits)) return "595" + digits.slice(1);
  return digits;
}
