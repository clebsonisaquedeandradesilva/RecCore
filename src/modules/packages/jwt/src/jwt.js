// Ported from packages/jwt/src/jwt.ts; TypeScript types erased; native runtime imports.
import { sign, verify } from "../../../../runtime/jwt.js";
import { GAME_VERSION } from "../../domain/src/index.js";
const TOKEN_TTL_SECONDS = 86400;
async function getAccountIdFromToken(token, secret) {
  try {
    const payload = await verify(token, secret, "HS256");
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
async function validateAndGetAccountId(request, secret) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice("bearer ".length);
  const accountId = await getAccountIdFromToken(token, secret);
  if (!accountId) return null;
  if (!/^[1-9]\d*$/.test(accountId)) return null;
  const id = Number(accountId);
  return Number.isSafeInteger(id) ? id : null;
}
async function validateAndGetRoles(request, secret) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice("bearer ".length);
  try {
    const payload = await verify(token, secret, "HS256");
    return Array.isArray(payload.role) ? payload.role.filter((r) => typeof r === "string") : [];
  } catch {
    return null;
  }
}
async function validateAndGetPlus(request, secret) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) return false;
  const token = authHeader.slice("bearer ".length);
  try {
    const payload = await verify(token, secret, "HS256");
    return payload["rn.plus"] === true;
  } catch {
    return false;
  }
}
async function validateAndGetVersion(request, secret) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice("bearer ".length);
  try {
    const payload = await verify(token, secret, "HS256");
    const version = payload["rn.ver"];
    return typeof version === "string" && version !== "" ? version : null;
  } catch {
    return null;
  }
}
const TOKEN_SCOPES = [
  "profile",
  "rn",
  "rn.accounts",
  "rn.accounts.gc",
  "rn.api",
  "rn.chat",
  "rn.clubs",
  "rn.commerce",
  "rn.match.read",
  "rn.match.write",
  "rn.notify",
  "rn.rooms",
  "rn.storage",
  "offline_access"
];
const BASE_ROLES = ["gameClient"];
async function generatePhotonAuthToken(accountId, claims, secret) {
  return sign(
    {
      sub: String(accountId),
      "rn.platid": claims.platformId,
      "rn.plat": String(claims.platform),
      "rn.deviceclass": String(claims.deviceClass),
      "rn.env": "prod",
      exp: Math.floor(Date.now() / 1e3) + TOKEN_TTL_SECONDS,
      aud: claims.audience
    },
    secret
  );
}
async function generateToken(accountId, platformId, platform, secret, extraRoles = [], privileges = [], version = GAME_VERSION, hasPlus = false) {
  const now = Math.floor(Date.now() / 1e3);
  return sign(
    {
      iss: "https://auth.recflare.net",
      aud: "https://auth.recflare.net",
      nbf: now,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
      auth_time: now,
      amr: "cached_login",
      client_id: "recroom",
      sub: accountId,
      idp: "local",
      platform,
      platform_id: platformId,
      // The CLIENT's build, as it posted it to /connect/token (`ver`) — not this
      // server's GAME_VERSION, which is only the fallback for a grant that names none
      // (a refresh, or a caller that isn't the game). Presence reads it back off the
      // token, so a player's reported version is the build they are actually running.
      "rn.ver": version,
      "rn.plat": platform,
      role: [...BASE_ROLES, ...extraRoles],
      // `rn.privilege` LOOKS like a scope but is a claim: the client reads it out of
      // the same claims dictionary it reads `role` from, and it never appears in
      // `scope`. Omitted entirely when empty, so an unrestricted token is byte-for-byte
      // what it was before privileges existed.
      ...privileges.length > 0 ? { "rn.privilege": privileges } : {},
      // Whether the account has Rec Room Plus (`account.hasPlus`) — a CLAIM, like
      // `rn.privilege` and for the same reason: it is ours, the client has never heard of
      // it, and `scope` is a fixed list the client parses. `econ` reads it to answer the
      // CampusCard lookup and to price the subscriber discount, which is the whole point
      // of carrying it here: those calls then need no database read at all.
      //
      // Omitted when false, so a non-subscriber's token is byte-for-byte what it was
      // before Plus existed, and `validateAndGetPlus` reads an absent claim as "no Plus".
      //
      // STAMPED AT LOGIN, so it is only as fresh as the token: a player who claims Plus on
      // the website has to sign in again (and restart the game) before it takes effect.
      // Tokens last a day and the client does not refresh them — see TOKEN_TTL_SECONDS —
      // so that wait is real, and it is the accepted trade for making the check free.
      ...hasPlus ? { "rn.plus": true } : {},
      scope: TOKEN_SCOPES,
      jti: crypto.randomUUID()
    },
    secret
  );
}
export {
  TOKEN_TTL_SECONDS,
  generatePhotonAuthToken,
  generateToken,
  validateAndGetAccountId,
  validateAndGetPlus,
  validateAndGetRoles,
  validateAndGetVersion
};
