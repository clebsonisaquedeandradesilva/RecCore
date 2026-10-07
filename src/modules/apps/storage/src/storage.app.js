// Ported from apps/storage/src/storage.app.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../runtime/router.js";
import { describeRoute, openAPIRouteHandler } from "../../../../runtime/openapi.js";
import { useWorkersLogger } from "../../../../runtime/logger.js";
import {
  intVar,
  withCleanSpec,
  withDefaultCors,
  withNotFound,
  withOnError
} from "../../../packages/hono-helpers/src/index.js";
import { validateAndGetAccountId } from "../../../packages/jwt/src/index.js";
import {
  AUTHED,
  ErrorResponse,
  json,
  text,
  UNAUTHORIZED_RESPONSE,
  UPLOAD_REQUEST_BODY,
  UploadResponse
} from "./openapi.js";
const UPLOAD_SUBFOLDER = {
  1: "room",
  2: "data",
  3: "image",
  4: "video",
  5: "invention",
  6: "roommetadata"
};
function subfolderForFileType(fileType) {
  return UPLOAD_SUBFOLDER[Number.parseInt(fileType, 10)];
}
const UPLOAD_EXTENSION = {
  5: ".inv"
};
const DEFAULT_MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
function maxUploadBytes(value) {
  const configured = intVar(value, DEFAULT_MAX_UPLOAD_BYTES);
  return configured > 0 ? configured : DEFAULT_MAX_UPLOAD_BYTES;
}
function extensionForFileType(fileType) {
  return UPLOAD_EXTENSION[Number.parseInt(fileType, 10)] ?? "";
}
function textField(body, ...names) {
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string" && names.includes(key.toLowerCase())) return value;
  }
  return void 0;
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
    tags: ["Meta"],
    summary: "Health check",
    description: "Plain-text liveness probe. No auth.",
    responses: { 200: text("Service is up (`hello, world!`)") }
  }),
  async (c) => {
    return c.text("hello, world!");
  }
).post(
  "/upload",
  describeRoute({
    tags: ["Upload"],
    summary: "Upload a file",
    description: [
      "Stores the posted file in the shared CDN R2 bucket under",
      "`<type-subfolder>/<upload-date>/<random-name>` and returns the",
      "`<upload-date>/<random-name>` part the client references it by (the same name the",
      "`cdn` worker serves back). The subfolder comes from `FileType`; RoomSave (1) lands",
      "under `room/` so the cdn worker\u2019s `GET /room/:dataBlob` finds it, and an Invention",
      "(5) keeps a `.inv` extension on both the key and the returned name. Auth-gated \u2014",
      "any valid account token is allowed, no role check. A post with no binary part but",
      "an explicit `imageName` / `filename` / `name` just echoes that name back. Mirrors",
      "the reference server\u2019s `Upload`."
    ].join(" "),
    security: AUTHED,
    requestBody: UPLOAD_REQUEST_BODY,
    responses: {
      200: json(UploadResponse, "The stored (or echoed) file name"),
      400: json(ErrorResponse, "Unknown/missing FileType, or neither a file nor a name"),
      401: UNAUTHORIZED_RESPONSE,
      413: json(ErrorResponse, "The binary file exceeds the configured upload limit")
    }
  }),
  async (c) => {
    const id = await validateAndGetAccountId(c.req.raw, await c.env.JWT_SECRET.get());
    if (id === null) return c.body(null, 401);
    const body = await c.req.parseBody().catch(() => ({}));
    const file = Object.values(body).find((v) => v instanceof File);
    if (file) {
      const limit = maxUploadBytes(c.env.MAX_UPLOAD_BYTES);
      if (file.size > limit) {
        return c.json({ error: `file exceeds the ${limit}-byte upload limit` }, 413);
      }
      const fileType = textField(body, "filetype") ?? "0";
      const subfolder = subfolderForFileType(fileType);
      if (subfolder === void 0) {
        return c.json({ error: "missing or unknown FileType" }, 400);
      }
      const datePrefix = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const filename = `${datePrefix}/${crypto.randomUUID()}${extensionForFileType(fileType)}`;
      const bytes = await file.arrayBuffer();
      await c.env.CDN_ASSETS.put(`${subfolder}/${filename}`, bytes, {
        httpMetadata: { contentType: file.type || "application/octet-stream" },
        // Record the SHA-256 on the object. R2 stores an md5 on its own, but the
        // hashes the client is served (an invention's `BlobHash`) are SHA-256, and
        // only a checksum given at put time is readable later — this lets the `api`
        // worker answer one from a HEAD instead of downloading the blob to digest it.
        sha256: await crypto.subtle.digest("SHA-256", bytes)
      });
      return c.json({ filename });
    }
    const explicitName = textField(body, "imagename", "filename", "name");
    if (explicitName) return c.json({ filename: explicitName });
    return c.json({ error: "missing filename or valid upload data" }, 400);
  }
);
app.get(
  "/openapi.json",
  describeRoute({ hide: true }),
  withCleanSpec(
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "recflare storage",
          version: "1.0.0",
          description: [
            "File uploads for recflare, a private-server reimplementation of the Rec Room",
            "backend. The client posts room saves, holotars, images, videos, inventions and",
            "room metadata here; each lands in the shared CDN R2 bucket under a folder chosen",
            "by its `FileType`, and the `cdn` worker serves them back from the same bucket."
          ].join("\n")
        },
        servers: [{ url: "https://storage.recflare.net", description: "Production" }],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
              description: "An `access_token` from the auth worker\u2019s `POST /connect/token`."
            }
          }
        }
      }
    })
  )
);
var stdin_default = app;
export {
  stdin_default as default
};
