// Ported from apps/auth/src/meta-nonce.ts; TypeScript types erased; native runtime imports.
const NONCE_VALIDATE_URL = "https://graph.oculus.com/user_nonce_validate";
const TRANSIENT_ERROR_CODES = /* @__PURE__ */ new Set([1, 2]);
const MAX_ATTEMPTS = 3;
function parseMetaPlatformAuth(platformAuth) {
  let parsed;
  try {
    parsed = JSON.parse(platformAuth);
  } catch {
    return null;
  }
  const { Nonce: nonce, AppId: appId } = parsed;
  if (typeof nonce !== "string" || nonce === "") return null;
  if (typeof appId !== "string" || !/^\d+$/.test(appId)) return null;
  return { nonce, appId };
}
async function validateOnce(form, fetcher) {
  let res;
  try {
    res = await fetcher(NONCE_VALIDATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
  } catch (err) {
    return { ok: false, retryable: true, reason: `request failed: ${String(err)}` };
  }
  let body;
  try {
    body = await res.json();
  } catch {
    return { ok: false, retryable: true, reason: `HTTP ${res.status} with a non-JSON body` };
  }
  if (body.error) {
    const { code, message, is_transient } = body.error;
    return {
      ok: false,
      retryable: is_transient === true || code !== void 0 && TRANSIENT_ERROR_CODES.has(code),
      reason: `graph error ${code ?? "?"}: ${message ?? "no message"}`
    };
  }
  if (body.is_valid !== true) return { ok: false, retryable: false, reason: "nonce rejected" };
  return { ok: true, retryable: false, reason: "" };
}
async function verifyMetaNonce(platformAuth, userId, appSecret, fetcher) {
  if (appSecret === "") return { ok: false, reason: "no app secret configured" };
  if (!/^\d+$/.test(userId)) return { ok: false, reason: "missing or non-numeric platform_id" };
  const auth = parseMetaPlatformAuth(platformAuth);
  if (!auth) return { ok: false, reason: "malformed platform_auth payload" };
  const form = new URLSearchParams({
    nonce: auth.nonce,
    user_id: userId,
    access_token: `OC|${auth.appId}|${appSecret}`
  });
  const doFetch = fetcher ?? globalThis.fetch;
  let last = { ok: false, retryable: false, reason: "not attempted" };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    last = await validateOnce(form, doFetch);
    if (last.ok) return { ok: true, identity: { userId, appId: auth.appId } };
    if (!last.retryable || attempt === MAX_ATTEMPTS) break;
    await new Promise((resolve) => setTimeout(resolve, attempt * attempt * 250));
  }
  return { ok: false, reason: last.reason };
}
export {
  parseMetaPlatformAuth,
  verifyMetaNonce
};
