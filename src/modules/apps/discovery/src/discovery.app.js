// Ported from apps/discovery/src/discovery.app.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../runtime/router.js";
import { describeRoute, openAPIRouteHandler } from "../../../../runtime/openapi.js";
import { useWorkersLogger } from "../../../../runtime/logger.js";
import { withCleanSpec, withNotFound, withOnError } from "../../../packages/hono-helpers/src/index.js";
import {
  DiscoverySections,
  json,
  PAGE_SOURCE_PARAM,
  SECTION_IDS_PARAM,
  ServiceStatus
} from "./openapi.js";
import { fetchPageSource, readSections, SECTIONS_CATALOGUE } from "./page-sources.js";
const app = new Hono().use(
  "*",
  // middleware
  (c, next) => useWorkersLogger(c.env.NAME, {
    environment: c.env.ENVIRONMENT,
    release: c.env.SENTRY_RELEASE
  })(c, next)
).onError(withOnError()).notFound(withNotFound()).get(
  "/",
  describeRoute({
    tags: ["Service"],
    summary: "Health check",
    description: "Liveness probe for the discovery worker. No auth.",
    responses: { 200: json(ServiceStatus, "Service is up") }
  }),
  (c) => c.json({ service: "discovery", status: "ok" })
).get(
  "/sections/bulk",
  describeRoute({
    tags: ["Discovery", "2025"],
    summary: "Look up sections by id",
    description: [
      "The sections named by the repeated `?id=` query, drawn from the catalogue in",
      "`static/sections.json` \u2014 the union of the rows the page sources are built from.",
      "",
      "The answer is that file FILTERED, which fixes the edges: rows come back in the",
      "catalogue\u2019s order rather than the query\u2019s, an id that matches nothing is left out",
      "instead of erroring, and repeating an id still yields it once. A query with no `id`",
      "at all answers `[]`. Rows are served exactly as stored, so a field this service",
      "doesn\u2019t model survives the round trip.",
      "",
      "Same section shape as `/sections/pagesource/{type}`: a section NAMES a feed",
      "(`source`/`sourceMetadata`) that the client resolves itself. Nothing here is",
      "player-specific, so there is no auth."
    ].join("\n"),
    parameters: [SECTION_IDS_PARAM],
    responses: {
      200: json(DiscoverySections, "The requested sections, in catalogue order"),
      404: { description: "The catalogue file is not published" }
    }
  }),
  async (c) => {
    const ids = c.req.queries("id");
    if (ids === void 0 || ids.length === 0) return c.json([]);
    const sections = await readSections(c, SECTIONS_CATALOGUE);
    if (sections === null) return c.notFound();
    const wanted = new Set(ids);
    return c.json(sections.filter((s) => typeof s.id === "string" && wanted.has(s.id)));
  }
).get(
  "/sections/pagesource/:type",
  describeRoute({
    tags: ["Discovery", "2025"],
    summary: "Section layout for a page source",
    description: [
      "The sections of one discovery page, in the order the client draws them. `{type}` IS",
      "the filename \u2014 the body is `static/<type>.json` served verbatim \u2014 so the page sources",
      "that exist are whichever files are published (`WatchHome`, `PlayHighlight`,",
      "`CommunityBoard`, `PlayMenuTabs`, `PlayCategories`, `StoreCategories`,",
      "`StoreFeatured`, `StoreClothing`, `StoreConsumables` and `bulk` at the time of",
      "writing). The match is exact, case included.",
      "",
      "This replaces the `Discovery.DiscoveryPageContent.*` game configs, which carried the",
      "same layouts as embedded JSON strings: with `Discovery.UseNewDiscoveryServerAPI` set",
      "to `True` the client asks this service instead. The two are not the same shape \u2014 the",
      "configs wrapped the list in `{ pageSource, sections }` with PascalCase fields, while",
      "this answers the bare ARRAY with camelCase ones.",
      "",
      "A section only NAMES a feed (`source`/`sourceMetadata`); its rooms, items and accounts",
      "are fetched separately by the client. Nothing here is player-specific, so there is no",
      "auth and every client gets the same layout."
    ].join("\n"),
    parameters: [PAGE_SOURCE_PARAM],
    responses: {
      200: json(DiscoverySections, "The page\u2019s sections"),
      304: { description: "`If-None-Match` matched the file\u2019s etag (no body)" },
      404: { description: "No file is published under that name" }
    }
  }),
  async (c) => {
    const res = await fetchPageSource(c, c.req.param("type"));
    return res ?? c.notFound();
  }
);
app.get(
  "/openapi.json",
  describeRoute({ hide: true }),
  withCleanSpec(
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "recflare discovery",
          version: "1.0.0",
          description: [
            "Discovery page layouts for recflare, a private-server reimplementation of the Rec",
            "Room backend. The client asks this service which sections each of its discovery",
            "pages shows \u2014 Watch home, the play menu and its tabs, the community board, the store",
            "pages \u2014 and draws them in the order given.",
            "",
            "Each layout is a file in `static/`, published as a Workers static asset and served",
            "verbatim by filename, so the set of page sources is whatever is published rather",
            "than anything the code enumerates. Nothing is editable at runtime and every client",
            "gets the same answer, so the routes are unauthenticated.",
            "",
            "Sections can also be fetched by id rather than by page: `/sections/bulk` filters",
            "`static/sections.json`, the catalogue those layouts draw their rows from.",
            "",
            "A section names a feed rather than carrying its contents: the client resolves the",
            "rooms, items and accounts behind each carousel against the `rooms` and `api` workers",
            "itself."
          ].join("\n")
        },
        servers: [{ url: "https://discovery.recflare.net", description: "Production" }]
      }
    })
  )
);
var stdin_default = app;
export {
  stdin_default as default
};
