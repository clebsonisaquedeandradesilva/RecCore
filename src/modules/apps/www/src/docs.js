// Ported from apps/www/src/docs.ts; TypeScript types erased; native runtime imports.
const DOCUMENTED_SERVICES = [
  { slug: "auth", title: "auth \u2014 authentication & tokens" },
  { slug: "accounts", title: "accounts \u2014 profiles & lookups" },
  { slug: "rooms", title: "rooms \u2014 rooms, subrooms & browse feeds" },
  { slug: "match", title: "match \u2014 matchmaking & presence" },
  { slug: "econ", title: "econ \u2014 avatar & economy" },
  { slug: "clubs", title: "clubs \u2014 clubs & clubhouses" },
  { slug: "commerce", title: "commerce \u2014 store catalog & purchases" },
  { slug: "chat", title: "chat \u2014 threads & messages" },
  { slug: "img", title: "img \u2014 image serving & resizing" },
  { slug: "cdn", title: "cdn \u2014 binary asset delivery" },
  { slug: "storage", title: "storage \u2014 uploads to the CDN bucket" },
  { slug: "playersettings", title: "playersettings \u2014 per-player settings" },
  { slug: "roomcomments", title: "roomcomments \u2014 notes pinned in a room" },
  { slug: "discovery", title: "discovery \u2014 discovery page layouts" },
  { slug: "lists", title: "lists \u2014 curated & algorithmic lists" },
  { slug: "leaderboard", title: "leaderboard \u2014 room score boards" },
  { slug: "ai", title: "ai \u2014 game AI access" },
  { slug: "api", title: "api \u2014 everything else" }
];
const SCALAR_ASSET = process.env.ROUTING_MODE === "subdomain" ? "/docs/scalar.standalone.js" : "/www/docs/scalar.standalone.js";
function overviewSpec() {
  const list = DOCUMENTED_SERVICES.map((s) => `- **${s.title}**`).join("\n");
  const description = [
    "Aggregated API reference for the **recflare** private-server backend \u2014 a",
    "reimplementation of the Rec Room services the game client talks to.",
    "",
    "Use the **dropdown at the top** to switch between services:",
    "",
    list,
    "",
    "---",
    "",
    "These specs are **descriptive, not enforced** \u2014 they document a protocol",
    "reverse-engineered from the game client (the only real consumer). They record",
    "observed behaviour, not a designed contract, and the handlers are lenient: they",
    "parse bodies defensively rather than rejecting them. So a field marked required",
    'means "the client always sends it", not "the server rejects it if absent".',
    "",
    "This applies to every service below; the individual specs don\u2019t repeat it. Each",
    "service also serves its own spec at `https://<service>.<domain>/openapi.json`."
  ].join("\n");
  return {
    openapi: "3.1.0",
    info: { title: "recflare API", version: "1.0.0", description },
    paths: {}
  };
}
function specUpstream(env, slug) {
  return process.env.ROUTING_MODE === "subdomain" ? `https://${slug}.${env.DOMAIN}/openapi.json` : `${process.env.PUBLIC_BASE_URL || "http://localhost:10000"}/${slug}/openapi.json`;
}
async function fetchSpec(env, slug) {
  if (!DOCUMENTED_SERVICES.some((s) => s.slug === slug)) return null;
  const upstream = await fetch(specUpstream(env, slug));
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
function docsPage() {
  const sources = [
    { slug: "overview", title: "Overview", content: overviewSpec() },
    ...DOCUMENTED_SERVICES.map((s) => ({
      url: `${process.env.ROUTING_MODE === "subdomain" ? "" : "/www"}/docs/openapi/${s.slug}.json`,
      title: s.title,
      slug: s.slug
    }))
  ];
  const config = JSON.stringify({ sources });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>recflare API docs</title>
</head>
<body>
<div id="app"></div>
<script src="${SCALAR_ASSET}"><\/script>
<script>
	Scalar.createApiReference('#app', ${config})
<\/script>
</body>
</html>`;
}
export {
  DOCUMENTED_SERVICES,
  docsPage,
  fetchSpec,
  specUpstream
};
