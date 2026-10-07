// Ported from packages/hono-helpers/src/helpers/request.ts; TypeScript types erased; native runtime imports.
import { redactUrl } from "./url.js";
function getRequestLogData(c, requestStartTimestamp) {
  const redactedUrl = redactUrl(c.req.url);
  return {
    url: redactedUrl.toString(),
    method: c.req.method,
    path: c.req.path,
    routePath: c.req.routePath,
    searchParams: redactedUrl.searchParams.toString(),
    headers: stringifyHeaders(c.req.raw.headers),
    ip: c.req.header("cf-connecting-ip") || c.req.header("x-real-ip") || c.req.header("x-forwarded-for"),
    timestamp: new Date(requestStartTimestamp).toISOString()
  };
}
const SENSITIVE_HEADER_NAMES = /* @__PURE__ */ new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "cf-access-jwt-assertion"
]);
function isSensitiveHeader(name) {
  const normalizedName = name.toLowerCase();
  return SENSITIVE_HEADER_NAMES.has(normalizedName) || normalizedName.includes("token") || normalizedName.includes("secret") || normalizedName.includes("jwt") || normalizedName.includes("signature") || normalizedName.includes("session") || normalizedName.endsWith("-key") || normalizedName.endsWith("_key");
}
function stringifyHeaders(headers) {
  return JSON.stringify(
    Object.fromEntries(
      Array.from(headers, ([name, value]) => [name, isSensitiveHeader(name) ? "REDACTED" : value])
    )
  );
}
export {
  getRequestLogData
};
