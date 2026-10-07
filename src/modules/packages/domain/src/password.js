// Ported from packages/domain/src/password.ts; TypeScript types erased; native runtime imports.
const ITERATIONS = 1e5;
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
async function deriveBits(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `${b64(salt)}:${b64(await deriveBits(password, salt))}`;
}
async function verifyPassword(password, stored) {
  const [saltB64, hashB64] = stored.split(":");
  if (!saltB64 || !hashB64) return false;
  const actual = b64(await deriveBits(password, fromB64(saltB64)));
  return actual === hashB64;
}
export {
  hashPassword,
  verifyPassword
};
