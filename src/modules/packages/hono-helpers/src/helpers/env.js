// Ported from packages/hono-helpers/src/helpers/env.ts; TypeScript types erased; native runtime imports.
function intVar(value, fallback) {
  if (typeof value === "number") return Number.isInteger(value) ? value : fallback;
  if (typeof value !== "string" || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}
export {
  intVar
};
