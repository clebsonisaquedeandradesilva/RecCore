// Ported from apps/api/src/http.ts; TypeScript types erased; native runtime imports.
import { validateAndGetAccountId, validateAndGetRoles } from "../../../packages/jwt/src/index.js";
async function authedId(c) {
  return validateAndGetAccountId(c.req.raw, await c.env.JWT_SECRET.get());
}
async function authedRoles(c) {
  return validateAndGetRoles(c.req.raw, await c.env.JWT_SECRET.get());
}
function unauthorized(c) {
  return c.body(null, 401);
}
async function parseFormIds(c) {
  const body = await c.req.parseBody({ all: true }).catch(() => ({}));
  const raw = [body.Ids, body.ids].flat();
  return raw.filter((v) => typeof v === "string").flatMap((v) => v.split(",")).map((s) => Number.parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
}
function queryIds(c) {
  return c.req.queries("id")?.map((s) => Number.parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n)) ?? [];
}
export {
  authedId,
  authedRoles,
  parseFormIds,
  queryIds,
  unauthorized
};
