// Ported from apps/cdn/src/cdn.app.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../runtime/router.js";
import { describeRoute, openAPIRouteHandler, resolver } from "../../../../runtime/openapi.js";
import { useWorkersLogger } from "../../../../runtime/logger.js";
import {
  withCleanSpec,
  withDefaultCors,
  withNotFound,
  withOnError,
  writeContentRange
} from "../../../packages/hono-helpers/src/index.js";
import loadingScreenTipData from "../static/loading-screen-tip-data.json.js";
import {
  assetResponses,
  CONDITIONAL_HEADERS,
  json,
  JsonValue,
  keyParam,
  LoadingScreenTip,
  ServiceStatus
} from "./openapi.js";
async function serveAsset(c, key) {
  if (key.includes("..")) return c.body(null, 400);
  const ifNoneMatch = c.req.header("if-none-match")?.replace(/"/g, "");
  let object;
  try {
    object = await c.env.CDN_ASSETS.get(key, {
      ...ifNoneMatch ? { onlyIf: { etagDoesNotMatch: ifNoneMatch } } : {},
      range: c.req.raw.headers
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes("(10039)")) return c.body(null, 416);
    throw e;
  }
  if (!object) return c.notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("content-type", "application/octet-stream");
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", CACHE_CONTROL);
  if (!("body" in object)) return new Response(null, { status: 304, headers });
  if (writeContentRange(headers, c.req.raw.headers, object)) {
    return new Response(object.body, { status: 206, headers });
  }
  return new Response(object.body, { headers });
}
const CACHE_CONTROL = `public, max-age=${86400 * 30}`;
const CONFIG_NAME = /^[A-Za-z0-9._-]+$/;
async function serveConfig(c, name) {
  if (!CONFIG_NAME.test(name) || name.includes("..")) return null;
  const candidates = name.includes(".") ? [name] : [name, `${name}.json`];
  for (const candidate of candidates) {
    const res = await c.env.ASSETS.fetch(
      new Request(new URL(`/config/${candidate}`, c.req.url), c.req.raw)
    );
    if (res.ok || res.status === 304) {
      const headers = new Headers(res.headers);
      headers.set("cache-control", CACHE_CONTROL);
      return new Response(res.status === 304 ? null : res.body, { status: res.status, headers });
    }
  }
  return null;
}
const app = new Hono().use(
  "*",
  // middleware
  (c, next) => useWorkersLogger(c.env.NAME, {
    environment: c.env.ENVIRONMENT,
    release: c.env.SENTRY_RELEASE
  })(c, next)
).use("*", withDefaultCors()).onError(withOnError()).notFound(withNotFound()).get(
  "/",
  describeRoute({
    tags: ["Service"],
    summary: "Service liveness",
    description: "A fixed `{ service, status }` body. No auth \u2014 a plain liveness probe.",
    responses: { 200: json(ServiceStatus, 'Always `{ service: "cdn", status: "ok" }`') }
  }),
  (c) => c.json({ service: "cdn", status: "ok" })
).get(
  "/config/LoadingScreenTipData",
  describeRoute({
    tags: ["Config"],
    summary: "Loading-screen tips",
    description: [
      "The tips the client cycles through on a loading screen. A bundled static file",
      "(`static/loading-screen-tip-data.json`), captured from the real service and served",
      "verbatim \u2014 nothing here is editable at runtime, and every client gets the same list",
      "regardless of platform or room. The per-tip `Context`/`Visibility`/`PlatformMask`",
      "fields are the client\u2019s own filters, applied client-side."
    ].join(" "),
    responses: { 200: json(LoadingScreenTip.array(), "The bundled tips") }
  }),
  (c) => c.json(loadingScreenTipData, 200, { "Cache-Control": CACHE_CONTROL })
).get(
  "/config/:name",
  describeRoute({
    tags: ["Config"],
    summary: "Serve a config file",
    description: [
      "Serves a file out of `static/config/` verbatim \u2014 `RRPlusConfig_v3.json` (the Rec Room",
      "Plus benefit lists), `SkuConfig_v1.json` (the Maker AI day-pass store copy) and a",
      "GUID-named binary blob today. `{name}` IS the filename, so publishing a config is",
      "dropping a file in that directory; nothing in the worker enumerates them, and not",
      "everything there is JSON.",
      "",
      "A name with no extension also resolves against `<name>.json`, because the same file",
      "is asked for both ways \u2014 the game configs that point at these carry the extension",
      '(`Econ.MakerAI.DayPass.Config` is `"SkuConfig_v1.json"`), the client\u2019s older config',
      "calls leave it off. An extension-less file wins over the `.json` guess.",
      "",
      "These are byte-for-byte copies of what the real CDN served, BOM included, and are",
      "not rewritten or re-serialized on the way out."
    ].join(" "),
    parameters: [
      keyParam("name", "The config\u2019s filename. The `.json` may be left off.", false),
      ...CONDITIONAL_HEADERS.filter((h) => h.name === "If-None-Match")
    ],
    responses: {
      200: {
        description: "The config file, as stored",
        content: {
          "application/json": { schema: resolver(JsonValue) },
          "application/octet-stream": { schema: { type: "string", format: "binary" } }
        }
      },
      304: { description: "`If-None-Match` matched the file\u2019s etag (no body)" },
      404: { description: "No config is published under that name" }
    }
  }),
  async (c) => await serveConfig(c, c.req.param("name")) ?? c.notFound()
).get(
  "/sigs/:sigName",
  describeRoute({
    tags: ["Assets"],
    summary: "Serve a signature blob",
    description: [
      "Streams the object stored under `sigs/<sigName>`. These are the anti-cheat signature",
      "blobs the client fetches at startup; nothing here inspects or validates them."
    ].join(" "),
    parameters: [keyParam("sigName", "The blob name.", false), ...CONDITIONAL_HEADERS],
    responses: assetResponses("The signature blob")
  }),
  (c) => serveAsset(c, `sigs/${c.req.param("sigName")}`)
).get(
  "/room/:dataBlob{.+}",
  describeRoute({
    tags: ["Assets"],
    summary: "Serve room build data",
    description: [
      "Streams the object stored under `room/<dataBlob>` \u2014 the saved scene the client",
      "downloads to load a room. The name comes from a subroom\u2019s `DataBlob` (see the `rooms`",
      "worker) and is date-foldered by the upload, e.g. `2026-02-03/<uuid>`, so it contains",
      "slashes.",
      "",
      "A room\u2019s IMAGE also lives under this prefix, stored by its bare `ImageName` \u2014 the",
      "same route serves both."
    ].join("\n"),
    parameters: [keyParam("dataBlob", "The blob name.", true), ...CONDITIONAL_HEADERS],
    responses: assetResponses("The room data")
  }),
  (c) => serveAsset(c, `room/${c.req.param("dataBlob")}`)
).get(
  "/invention/:dataBlob{.+}",
  describeRoute({
    tags: ["Assets"],
    summary: "Serve invention data",
    description: [
      "Streams the object stored under `invention/<dataBlob>` \u2014 the data the client",
      "downloads to spawn an invention. The name comes from an invention\u2019s",
      "`CurrentVersion.BlobName` (see the `api` worker); like room blobs it is date-foldered,",
      "and it keeps the `.inv` extension the upload stored it under."
    ].join(" "),
    parameters: [
      keyParam("dataBlob", "The blob name, including `.inv`.", true),
      ...CONDITIONAL_HEADERS
    ],
    responses: assetResponses("The invention data")
  }),
  (c) => serveAsset(c, `invention/${c.req.param("dataBlob")}`)
).get(
  "/data/:id{.+}",
  describeRoute({
    tags: ["Assets"],
    summary: "Serve a client data blob",
    description: [
      "Streams the object stored under `data/<id>` \u2014 whatever the client uploaded as",
      "`UploadFileType` 2 (see the `storage` worker), a Holotar recording being the case",
      "observed. Like room and invention blobs the name is date-foldered by the upload,",
      "e.g. `2026-02-03/<uuid>`, so it contains slashes. The worker does not interpret the",
      "bytes \u2014 the prefix exists because the client expects to read these back from `/data/`."
    ].join(" "),
    parameters: [keyParam("id", "The blob name.", true), ...CONDITIONAL_HEADERS],
    responses: assetResponses("The data blob")
  }),
  (c) => serveAsset(c, `data/${c.req.param("id")}`)
);
app.get(
  "/openapi.json",
  describeRoute({ hide: true }),
  withCleanSpec(
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "recflare cdn",
          version: "1.0.0",
          description: [
            "Binary asset delivery for recflare, a private-server reimplementation of the Rec",
            "Room backend. Streams the blobs the client downloads while playing \u2014 anti-cheat",
            "signatures, saved room scenes, invention data and generic client uploads \u2014 out of",
            "the shared `recflare-cdn` R2 bucket, plus the JSON config files the client reads",
            "from `/config/`.",
            "",
            "Everything is keyed by prefix (`sigs/`, `room/`, `invention/`, `data/`) and served as",
            "`application/octet-stream`; the worker never interprets what it hands back. Reads",
            "are unauthenticated \u2014 a caller needs the exact key, which only comes from an",
            "authenticated call to another worker.",
            "",
            "This worker only READS. Uploads go through the `storage` worker, which writes the",
            "same bucket, and images are served by `img` rather than from here.",
            "",
            "Every asset route supports conditional GETs (`If-None-Match` \u2192 304) and single",
            "byte ranges (`Range` \u2192 206). The ranges matter: large-file downloaders fetch in",
            "chunks, and answering 200 where a 206 is expected corrupts the reassembled file \u2014",
            "which surfaces as an anti-cheat \u201CSignatures don\u2019t match\u201D failure, not a download",
            "error. So a `bytes=` request is never answered with a whole-object 200: the 206",
            "always carries a `Content-Range` stating which bytes the body holds, even where",
            "that turns out to be all of them."
          ].join("\n")
        },
        servers: [{ url: "https://cdn.recflare.net", description: "Production" }]
      }
    })
  )
);
var stdin_default = app;
export {
  stdin_default as default
};
