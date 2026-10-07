// Ported from packages/hono-helpers/src/helpers/openapi.ts; TypeScript types erased; native runtime imports.
const PLACEHOLDER_INTEGER = 12345;
function addIntegerExamples(node) {
  if (Array.isArray(node)) {
    for (const item of node) addIntegerExamples(item);
    return;
  }
  if (node === null || typeof node !== "object") return;
  const obj = node;
  if (obj.type === "integer" && obj.example === void 0 && obj.examples === void 0) {
    const min = obj.minimum;
    const max = obj.maximum;
    const tooLow = typeof min === "number" && PLACEHOLDER_INTEGER < min;
    const tooHigh = typeof max === "number" && PLACEHOLDER_INTEGER > max;
    if (!tooLow && !tooHigh) obj.example = PLACEHOLDER_INTEGER;
  }
  for (const value of Object.values(obj)) addIntegerExamples(value);
}
function mirrorFormBodies(node) {
  if (Array.isArray(node)) {
    for (const item of node) mirrorFormBodies(item);
    return;
  }
  if (node === null || typeof node !== "object") return;
  const obj = node;
  const content = obj.content;
  if (content !== null && typeof content === "object") {
    const media = content;
    const multipart = media["multipart/form-data"];
    if (multipart !== void 0 && media["application/x-www-form-urlencoded"] === void 0) {
      media["application/x-www-form-urlencoded"] = multipart;
    }
  }
  for (const value of Object.values(obj)) mirrorFormBodies(value);
}
function withCleanSpec(handler) {
  return async (c, next) => {
    const res = await handler(c, next);
    if (!(res instanceof Response)) return res;
    const spec = await res.json();
    addIntegerExamples(spec);
    mirrorFormBodies(spec);
    return c.json(spec);
  };
}
export {
  withCleanSpec
};
