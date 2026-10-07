// Ported from apps/www/src/turnstile.ts; TypeScript types erased; native runtime imports.
import { logger } from "../../../packages/hono-helpers/src/index.js";
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
async function turnstileKeys(env) {
  const [siteKey, secretKey] = await Promise.all([
    readSecret(env.TURNSTILE_SITE_KEY, "TURNSTILE_SITE_KEY"),
    readSecret(env.TURNSTILE_SECRET_KEY, "TURNSTILE_SECRET_KEY")
  ]);
  if (siteKey !== "" && secretKey !== "") return { siteKey, secretKey };
  if (siteKey !== "" || secretKey !== "") {
    logger.error("turnstile is half-configured, so web signup is closed", {
      hasSiteKey: siteKey !== "",
      hasSecretKey: secretKey !== ""
    });
  }
  return null;
}
async function readSecret(secret, name) {
  try {
    return await secret.get() ?? "";
  } catch (err) {
    logger.error("failed to read a turnstile key from the secrets store", {
      secret: name,
      error: String(err)
    });
    return "";
  }
}
async function verifyTurnstile(secretKey, token, remoteIp) {
  const fields = { secret: secretKey, response: token };
  if (remoteIp) fields.remoteip = remoteIp;
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString()
    });
    if (!res.ok) {
      logger.error("turnstile siteverify failed", { status: res.status });
      return false;
    }
    const verdict = await res.json();
    if (verdict.success !== true) {
      logger.info("turnstile rejected a signup", { codes: verdict["error-codes"] ?? [] });
      return false;
    }
    return true;
  } catch (err) {
    logger.error("turnstile siteverify threw", { error: String(err) });
    return false;
  }
}
export {
  turnstileKeys,
  verifyTurnstile
};
