// Ported from apps/img/src/img.app.ts; TypeScript types erased; native runtime imports.
import { crop, PhotonImage, resize, SamplingFilter } from "../../../../../vendor/photon.js";
import { Hono } from "../../../../runtime/router.js";
import { describeRoute, openAPIRouteHandler } from "../../../../runtime/openapi.js";
import { useWorkersLogger } from "../../../../runtime/logger.js";
import { withCleanSpec, withNotFound, withOnError, writeContentRange } from "../../../packages/hono-helpers/src/index.js";
import { imageBytes, json, ServiceStatus } from "./openapi.js";
const SIGNATURE_KEY_ID = "KEY:RSA:p1.rec.net";
const FALLBACK_ASSET_PATH = "/DefaultProfileImage.jpg";
const CDN_IMAGE_PREFIX = "image/";
const CACHE_CONTROL = `public, max-age=${86400 * 30}, immutable`;
const ALLOWED_DIMENSIONS = /* @__PURE__ */ new Set([128, 256, 512, 1024]);
const RESIZE_JPEG_QUALITY = 90;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
function isPng(bytes) {
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}
function parseDimension(value) {
  if (value === void 0) return void 0;
  const n = Number(value);
  if (!Number.isInteger(n) || !ALLOWED_DIMENSIONS.has(n)) return void 0;
  return n;
}
function parseTransform(width, height, cropSquare) {
  const w = parseDimension(width);
  const h = parseDimension(height);
  const square = cropSquare === "1";
  if (w === void 0 && h === void 0 && !square) return null;
  return { width: w, height: h, cropSquare: square };
}
function resizeImage(input, transform) {
  const png = isPng(input);
  let img = PhotonImage.new_from_byteslice(input);
  const owned = [img];
  try {
    if (transform.cropSquare) {
      const w = img.get_width();
      const h = img.get_height();
      const side = Math.min(w, h);
      const x = Math.floor((w - side) / 2);
      const y = Math.floor((h - side) / 2);
      img = crop(img, x, y, x + side, y + side);
      owned.push(img);
    }
    let { width, height } = transform;
    if (width !== void 0 || height !== void 0) {
      const srcW = img.get_width();
      const srcH = img.get_height();
      if (width !== void 0 && height === void 0) {
        height = Math.max(1, Math.round(srcH / srcW * width));
      } else if (height !== void 0 && width === void 0) {
        width = Math.max(1, Math.round(srcW / srcH * height));
      }
      img = resize(img, width, height, SamplingFilter.Lanczos3);
      owned.push(img);
    }
    return png ? { bytes: img.get_bytes(), contentType: "image/png" } : { bytes: img.get_bytes_jpeg(RESIZE_JPEG_QUALITY), contentType: "image/jpeg" };
  } finally {
    for (const image of owned) image.free();
  }
}
function resolveObject(env, key) {
  const filename = key.slice(key.lastIndexOf("/") + 1);
  return filename.includes(".") ? { bucket: env.IMAGES, objectKey: key } : { bucket: env.CDN_ASSETS, objectKey: CDN_IMAGE_PREFIX + key };
}
let signingKey;
function getSigningKey(env) {
  if (signingKey === void 0) {
    signingKey = (async () => {
      if (!env.IMG_SIGNING_KEY) return null;
      const der = Uint8Array.from(atob(env.IMG_SIGNING_KEY), (ch) => ch.charCodeAt(0));
      return crypto.subtle.importKey(
        "pkcs8",
        der,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-1" },
        false,
        ["sign"]
      );
    })();
  }
  return signingKey;
}
async function signImage(env, bytes) {
  const key = await getSigningKey(env);
  if (!key) return null;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, bytes);
  let binary = "";
  for (const byte of new Uint8Array(sig)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
const SIGNATURE_BYTES = 256;
function stubSignature(key) {
  let state = 2166136261;
  for (let i = 0; i < key.length; i++) {
    state = Math.imul(state ^ key.charCodeAt(i), 16777619) >>> 0;
  }
  if (state === 0) state = 2166136261;
  let binary = "";
  for (let i = 0; i < SIGNATURE_BYTES; i++) {
    state = (state ^ state << 13) >>> 0;
    state = state ^ state >>> 17;
    state = (state ^ state << 5) >>> 0;
    binary += String.fromCharCode(state & 255);
  }
  return btoa(binary);
}
function resolveSigning(env, sig, key) {
  if (sig !== "p1") return { mode: "none" };
  if (env.IMG_SIGNING_ENABLED === true) return { mode: "rsa" };
  return { mode: "stub", value: stubSignature(key) };
}
function signatureHeader(value) {
  return `key-id=${SIGNATURE_KEY_ID}; data=${value}`;
}
function applyStubSignature(headers, signing) {
  if (signing.mode === "stub") headers.set("content-signature", signatureHeader(signing.value));
}
function needsBody(transform, signing) {
  return transform !== null || signing.mode === "rsa";
}
async function finalizeImage(env, bytes, headers, transform, signing) {
  let body = bytes;
  if (transform) {
    const out = resizeImage(new Uint8Array(bytes), transform);
    body = out.bytes;
    headers.set("content-type", out.contentType);
    headers.delete("etag");
  }
  if (signing.mode === "rsa") {
    const signature = await signImage(env, body);
    if (signature) headers.set("content-signature", signatureHeader(signature));
  }
  return new Response(body, { headers });
}
async function serveStaticAsset(env, asset, transform, signing) {
  const headers = new Headers();
  const contentType = asset.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("cache-control", CACHE_CONTROL);
  applyStubSignature(headers, signing);
  if (needsBody(transform, signing)) {
    const bytes = await asset.arrayBuffer();
    return finalizeImage(env, bytes, headers, transform, signing);
  }
  return new Response(asset.body, { headers });
}
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
    tags: ["Images"],
    summary: "Service status",
    description: 'Liveness probe. Always `{ service: "img", status: "ok" }`.',
    responses: { 200: json(ServiceStatus, "The worker is up") }
  }),
  (c) => c.json({ service: "img", status: "ok" })
);
app.get(
  "/openapi.json",
  describeRoute({ hide: true }),
  withCleanSpec(
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "recflare img",
          version: "1.0.0",
          description: [
            "Image hosting for recflare, a private-server reimplementation of the Rec Room",
            "backend. Serves every image the client renders \u2014 profile photos, room thumbnails,",
            "club banners and the photo feed \u2014 out of R2, with bundled static assets",
            "(`static/`) taking precedence over the bucket and `DefaultProfileImage.jpg` served",
            "as the fallback when a key is missing. Keys with an extension come from the",
            "`recflare-img` bucket; extensionless ones are `storage` uploads and come from the",
            "shared `recflare-cdn` bucket under its `image/` prefix. Optional center-crop and resize",
            "run through the Photon WASM codec; `?sig=p1` adds the `Content-Signature` header",
            "the client expects against `KEY:RSA:p1.rec.net` \u2014 a key-derived placeholder",
            "unless the `IMG_SIGNING_ENABLED` flag turns on real RSA-SHA1 signing.",
            "",
            "Note that this worker only serves bytes: the image metadata the client lists (the",
            "`SavedImage` records behind `/api/images/...`) lives in the `api` worker, which",
            "points at keys here."
          ].join("\n")
        },
        servers: [{ url: "https://img.recflare.net", description: "Production" }]
      }
    })
  )
);
app.get(
  "/:key{.+}",
  describeRoute({
    tags: ["Images"],
    summary: "Serve an image by key",
    description: [
      "Serves the image stored under `key`, which may contain slashes for nested objects",
      "(e.g. `Base/Clearcut.jpg`). A bundled static asset always wins over an R2 object of",
      "the same key; when neither exists the bundled `DefaultProfileImage.jpg` is served",
      "with a 200 rather than a 404, so the client never renders a broken image.",
      "",
      "Which bucket the key resolves in depends on its extension. A key with one (always",
      "the case for an `api` image upload) comes from `recflare-img`. A key WITHOUT one is",
      "a `storage` upload and comes from the shared `recflare-cdn` bucket under its",
      "`image/` prefix, so `/2028-06-01/<uuid>` here serves `image/2028-06-01/<uuid>`",
      "there.",
      "",
      "Responses carry `Cache-Control: public, max-age=31536000, immutable` \u2014 an uploaded",
      "image is never rewritten in place, a new image gets a new key.",
      "",
      "`?width`/`?height`/`?cropSquare=1` run the body through the Photon codec and",
      "re-encode it \u2014 a PNG source stays PNG (alpha preserved), anything else becomes JPEG \u2014",
      "with no `ETag` (the source etag no longer describes the body), and the",
      "`If-None-Match` precondition is skipped. An out-of-range or non-integer dimension is",
      "ignored and the original is served \u2014 never an error.",
      "",
      "A `Range` is honoured (206) only on the untouched stream, which is the only response",
      "that advertises `Accept-Ranges`. A transform decodes the whole image and a real",
      "signature covers the whole body, so those serve the entire result and ignore the",
      "header. Where a range does apply, a `bytes=` request is never answered with a bare",
      "200: the `Content-Range` always states which bytes the body holds."
    ].join("\n"),
    parameters: [
      {
        name: "key",
        in: "path",
        required: true,
        description: "Object key; may contain slashes. A key containing `..` is rejected (400).",
        schema: { type: "string" }
      },
      {
        name: "width",
        in: "query",
        required: false,
        description: [
          "Output width. Only 128, 256, 512 or 1024 are honoured \u2014 any other value is",
          "ignored and the source served untouched. Given alone, height follows the aspect ratio."
        ].join(" "),
        schema: { type: "integer", enum: [128, 256, 512, 1024], example: 512 }
      },
      {
        name: "height",
        in: "query",
        required: false,
        description: "Output height, same allowed set as `width`. Given alone, width follows the aspect ratio.",
        schema: { type: "integer", enum: [128, 256, 512, 1024], example: 512 }
      },
      {
        name: "cropSquare",
        in: "query",
        required: false,
        description: [
          "`1` center-crops the source to a square before any resize. Used for the square",
          "profile/thumbnail slots. Any other value is ignored."
        ].join(" "),
        schema: { type: "string", enum: ["1"] }
      },
      {
        name: "sig",
        in: "query",
        required: false,
        description: [
          "`p1` returns a `Content-Signature: key-id=KEY:RSA:p1.rec.net; data=<base64>`",
          "header. By default `data` is a PLACEHOLDER derived from the object key, not a",
          "real signature \u2014 the client requires the header to be present but does not",
          "verify it, and signing for real costs the streaming fast path. Set",
          "`IMG_SIGNING_ENABLED` for a true RSA-SHA1 signature over the bytes actually",
          "returned (i.e. the resized body when a transform applies); that also needs an",
          "`IMG_SIGNING_KEY`, without which the header is omitted entirely."
        ].join(" "),
        schema: { type: "string", enum: ["p1"] }
      },
      {
        name: "If-None-Match",
        in: "header",
        required: false,
        description: "Conditional request against the R2 object etag. Ignored when a transform is requested.",
        schema: { type: "string" }
      },
      {
        name: "Range",
        in: "header",
        required: false,
        description: [
          "A single byte range, parsed by R2 itself. Honoured with a 206 on the untouched",
          "stream only \u2014 ignored when a transform or a real signature applies, since both",
          "need the whole image. A `bytes=` value never yields a bare 200: the",
          "`Content-Range` names the bytes enclosed even where that is all of them."
        ].join(" "),
        schema: { type: "string", example: "bytes=0-1023" }
      }
    ],
    responses: {
      200: imageBytes("The image bytes (or the DefaultProfileImage.jpg fallback)"),
      206: imageBytes("A byte range of the stored image, when the request carried a `Range`"),
      304: { description: "If-None-Match matched the stored object etag; no body" },
      400: { description: "The key contained `..`; no body" }
    }
  }),
  async (c) => {
    const key = c.req.param("key");
    if (key.includes("..")) return c.body(null, 400);
    const signing = resolveSigning(c.env, c.req.query("sig"), key);
    const transform = parseTransform(
      c.req.query("width"),
      c.req.query("height"),
      c.req.query("cropSquare")
    );
    const staticAsset = await c.env.ASSETS.fetch(new URL(`/${key}`, c.req.url));
    if (staticAsset.ok) {
      return serveStaticAsset(c.env, staticAsset, transform, signing);
    }
    const ifNoneMatch = transform ? void 0 : c.req.header("if-none-match")?.replace(/"/g, "");
    const { bucket, objectKey } = resolveObject(c.env, key);
    const range = needsBody(transform, signing) ? void 0 : c.req.raw.headers;
    const object = await bucket.get(objectKey, {
      ...ifNoneMatch ? { onlyIf: { etagDoesNotMatch: ifNoneMatch } } : {},
      ...range ? { range } : {}
    });
    if (!object) {
      const asset = await c.env.ASSETS.fetch(new URL(FALLBACK_ASSET_PATH, c.req.url));
      return serveStaticAsset(c.env, asset, transform, signing);
    }
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", CACHE_CONTROL);
    if (!("body" in object)) return new Response(null, { status: 304, headers });
    applyStubSignature(headers, signing);
    if (needsBody(transform, signing)) {
      const bytes = await object.arrayBuffer();
      return finalizeImage(c.env, bytes, headers, transform, signing);
    }
    headers.set("accept-ranges", "bytes");
    if (writeContentRange(headers, c.req.raw.headers, object)) {
      return new Response(object.body, { status: 206, headers });
    }
    return new Response(object.body, { headers });
  }
);
var stdin_default = app;
export {
  stdin_default as default
};
