// Ported from apps/cdn/src/openapi.ts; TypeScript types erased; native runtime imports.
import { resolver } from "../../../../runtime/openapi.js";
import { z } from "../../../../../vendor/zod.js";
function json(schema, description) {
  return { description, content: { "application/json": { schema: resolver(schema) } } };
}
function assetBytes(description) {
  return {
    description,
    content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } }
  };
}
function assetResponses(description) {
  return {
    200: assetBytes(description),
    206: assetBytes("A byte range, when the request carried a `Range` header"),
    304: { description: "`If-None-Match` matched the stored etag (no body)" },
    400: { description: "The key contains `..` (no body)" },
    404: { description: "No such object in the bucket" },
    416: { description: "The `Range` header could not be satisfied (no body)" }
  };
}
const CONDITIONAL_HEADERS = [
  {
    name: "Range",
    in: "header",
    required: false,
    description: "A single byte range (`bytes=start-end`, `bytes=start-`, `bytes=-suffix`), parsed by R2 itself. Any `bytes=` value is answered 206 with a `Content-Range` naming the bytes enclosed \u2014 never a bare 200 carrying the whole object, which a chunked downloader would write at the offset it asked for. A multi-range or unsatisfiable value yields the whole object, but says so in the `Content-Range`. A unit other than `bytes` is ignored (200).",
    schema: { type: "string", example: "bytes=0-1023" }
  },
  {
    name: "If-None-Match",
    in: "header",
    required: false,
    description: "The etag of a previously fetched copy; a match answers 304 with no body.",
    schema: { type: "string" }
  }
];
function keyParam(name, description, slashes) {
  return {
    name,
    in: "path",
    required: true,
    description: slashes ? `${description} May contain slashes.` : description,
    schema: { type: "string" }
  };
}
const JsonValue = z.record(z.string(), z.unknown());
const ServiceStatus = z.object({
  service: z.literal("cdn"),
  status: z.literal("ok")
});
const LoadingScreenTip = z.object({
  Name: z.string().describe("A GUID (no dashes) \u2014 the tip\u2019s id, not a display name"),
  Title: z.string(),
  Message: z.string(),
  RoomNames: z.array(z.string()).describe("Rooms to restrict the tip to; empty everywhere in the bundled set"),
  Context: z.int(),
  InputType: z.int(),
  Visibility: z.int(),
  AllowCycling: z.boolean(),
  RestrictToNewUsers: z.boolean(),
  ImageName: z.string().describe("An image key the client resolves against the img worker"),
  PlatformMask: z.int().describe("Bit field of the platforms the tip shows on"),
  CreatedAt: z.string()
});
export {
  CONDITIONAL_HEADERS,
  JsonValue,
  LoadingScreenTip,
  ServiceStatus,
  assetBytes,
  assetResponses,
  json,
  keyParam
};
