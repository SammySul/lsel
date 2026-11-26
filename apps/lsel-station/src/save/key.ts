// A save's key, the only credential it has, and the id the sync service stores instead.

/** A new save key: 24 random bytes as base64url, 32 characters. The key is the only credential a save has. */
export function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}

/** A save's id: the SHA-256 of its key, so the service never stores the key itself. */
export async function keyId(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** What a typed or pasted key may look like. */
export const KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
