// Ported from packages/hono-helpers/src/helpers/r2.ts; TypeScript types erased; native runtime imports.
function writeContentRange(headers, requestHeaders, object) {
  if (!requestHeaders.get("range")?.startsWith("bytes=")) return false;
  const r = object.range;
  if (!r) return false;
  const length = r.length ?? r.suffix ?? object.size - (r.offset ?? 0);
  const offset = r.offset ?? object.size - length;
  headers.set("content-length", String(length));
  headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
  return true;
}
export {
  writeContentRange
};
