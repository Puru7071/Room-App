/**
 * Two-letter initials for avatar chips (ASCII-safe, trimmed).
 */
export function initialsFromDisplayName(name: string): string {
  const t = name.trim();
  if (!t.length) return "?";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]!.charAt(0);
    const b = parts[1]!.charAt(0);
    return `${a}${b}`.toUpperCase();
  }
  const single = parts[0] ?? t;
  if (single.length >= 2) {
    return single.slice(0, 2).toUpperCase();
  }
  return single.charAt(0).toUpperCase();
}
