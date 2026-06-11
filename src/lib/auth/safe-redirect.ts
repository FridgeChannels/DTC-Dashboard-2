export function safeRedirectPath(path?: string | null): string | null {
  if (!path) return null;
  const decoded = decodeURIComponent(path);
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return null;
  if (decoded.startsWith("/login")) return null;
  return decoded;
}
