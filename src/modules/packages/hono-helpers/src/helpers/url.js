// Ported from packages/hono-helpers/src/helpers/url.ts; TypeScript types erased; native runtime imports.
function redactUrl(_url) {
  let url;
  if (typeof _url === "string") {
    url = new URL(_url);
  } else {
    url = new URL(_url.toString());
  }
  for (const [key] of url.searchParams) {
    if (/key|token|secret|password|passwd|auth|credential/i.test(key)) {
      url.searchParams.set(key, "REDACTED");
    }
  }
  return url;
}
function searchParamsToArray(searchParams) {
  const result = [];
  for (const [key, value] of searchParams.entries()) {
    result.push(`${key}=${value}`);
  }
  return result;
}
export {
  redactUrl,
  searchParamsToArray
};
