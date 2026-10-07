// Ported from apps/storage/src/openapi.ts; TypeScript types erased; native runtime imports.
import { resolver } from "../../../../runtime/openapi.js";
import { z } from "../../../../../vendor/zod.js";
function json(schema, description) {
  return { description, content: { "application/json": { schema: resolver(schema) } } };
}
function text(description) {
  return { description, content: { "text/plain": { schema: { type: "string" } } } };
}
function toOpenApiSchema(schema) {
  const { $schema: _$schema, additionalProperties: _extra, ...jsonSchema } = z.toJSONSchema(schema);
  return jsonSchema;
}
function form(schema, description) {
  const s = toOpenApiSchema(schema);
  return {
    description,
    content: {
      "application/x-www-form-urlencoded": { schema: s },
      "multipart/form-data": { schema: s }
    }
  };
}
const UNAUTHORIZED_RESPONSE = { description: "Missing or invalid bearer token (empty body)" };
const AUTHED = [{ bearerAuth: [] }];
const UploadResponse = z.object({
  filename: z.string().describe("`<YYYY-MM-DD>/<uuid>[.ext]`, or the posted name on a name-only upload")
});
const ErrorResponse = z.object({ error: z.string() });
const UploadRequest = z.object({
  FileType: z.string().describe(
    [
      "The client\u2019s UploadFileType enum as a string: 1 RoomSave, 2 Holotar, 3 Image,",
      "4 Video, 5 Invention, 6 RoomMetadata. 0 (Unknown) and unrecognized values have no",
      "destination folder and are rejected."
    ].join(" ")
  ),
  imageName: z.string().optional().describe(
    [
      "Name-only post: with no binary part, an explicit `imageName` / `filename` / `name`",
      "is echoed straight back as `filename`."
    ].join(" ")
  )
});
const UPLOAD_REQUEST_BODY = (() => {
  const body = form(UploadRequest, "The FileType and the file to store");
  for (const media of Object.values(body.content)) {
    const schema = media.schema;
    schema.properties = {
      ...schema.properties,
      File: {
        type: "string",
        format: "binary",
        description: [
          "The file to store. Matched by being a file part, not by this field name.",
          "Omit it to make a name-only post."
        ].join(" ")
      }
    };
  }
  return body;
})();
export {
  AUTHED,
  ErrorResponse,
  UNAUTHORIZED_RESPONSE,
  UPLOAD_REQUEST_BODY,
  UploadRequest,
  UploadResponse,
  form,
  json,
  text
};
