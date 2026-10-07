// Ported from apps/discovery/src/page-sources.ts; TypeScript types erased; native runtime imports.
const SAFE_NAME = /^[A-Za-z0-9_-]+$/;
async function fetchPageSource(c, type) {
  if (!SAFE_NAME.test(type)) return null;
  const res = await c.env.ASSETS.fetch(new Request(new URL(`/${type}.json`, c.req.url), c.req.raw));
  return res.ok || res.status === 304 ? res : null;
}
const SECTIONS_CATALOGUE = "sections";
async function readSections(c, name) {
  if (!SAFE_NAME.test(name)) return null;
  const res = await c.env.ASSETS.fetch(new URL(`/${name}.json`, c.req.url));
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) ? rows : null;
}
export {
  SECTIONS_CATALOGUE,
  fetchPageSource,
  readSections
};
