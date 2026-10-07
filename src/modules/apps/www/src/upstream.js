// Ported from apps/www/src/upstream.ts; TypeScript types erased; native runtime imports.
import { authFailure } from "./auth-messages.js";
const authBase = (env) => process.env.ROUTING_MODE === "subdomain" ? `https://auth.${env.DOMAIN}` : `${process.env.PUBLIC_BASE_URL || "http://localhost:10000"}/auth`;
const accountsBase = (env) => process.env.ROUTING_MODE === "subdomain" ? `https://accounts.${env.DOMAIN}` : `${process.env.PUBLIC_BASE_URL || "http://localhost:10000"}/accounts`;
const notifyBase = (env) => process.env.ROUTING_MODE === "subdomain" ? `https://notify.${env.DOMAIN}` : `${process.env.PUBLIC_BASE_URL || "http://localhost:10000"}/notify`;
const apiBase = (env) => process.env.ROUTING_MODE === "subdomain" ? `https://api.${env.DOMAIN}` : `${process.env.PUBLIC_BASE_URL || "http://localhost:10000"}/api`;
const imgBase = (env) => process.env.ROUTING_MODE === "subdomain" ? `https://img.${env.DOMAIN}` : `${process.env.PUBLIC_BASE_URL || "http://localhost:10000"}/img`;
const roomsBase = (env) => process.env.ROUTING_MODE === "subdomain" ? `https://rooms.${env.DOMAIN}` : `${process.env.PUBLIC_BASE_URL || "http://localhost:10000"}/rooms`;
const cdnBase = (env) => process.env.ROUTING_MODE === "subdomain" ? `https://cdn.${env.DOMAIN}` : `${process.env.PUBLIC_BASE_URL || "http://localhost:10000"}/cdn`;
const storageBase = (env) => process.env.ROUTING_MODE === "subdomain" ? `https://storage.${env.DOMAIN}` : `${process.env.PUBLIC_BASE_URL || "http://localhost:10000"}/storage`;
async function postAuthForm(env, path, fields, opts = {}) {
  const headers = {
    "content-type": "application/x-www-form-urlencoded"
  };
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  if (opts.clientIp) headers["cf-connecting-ip"] = opts.clientIp;
  const request = new Request(`${authBase(env)}${path}`, {
    method: "POST",
    headers,
    body: new URLSearchParams(fields).toString()
  });
  return env.AUTH ? env.AUTH.fetch(request) : fetch(request);
}
async function readAuthError(res, action) {
  const parsed = await res.json().catch(() => null);
  const body = parsed ?? {};
  const code = typeof body.error === "string" ? body.error : "";
  const description = typeof body.error_description === "string" ? body.error_description : "";
  return authFailure(action, res.status, code, description);
}
export {
  accountsBase,
  apiBase,
  authBase,
  cdnBase,
  imgBase,
  notifyBase,
  postAuthForm,
  readAuthError,
  roomsBase,
  storageBase
};
