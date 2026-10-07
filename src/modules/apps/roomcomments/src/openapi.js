// Ported from apps/roomcomments/src/openapi.ts; TypeScript types erased; native runtime imports.
import { resolver } from "../../../../runtime/openapi.js";
import { z } from "../../../../../vendor/zod.js";
function json(schema, description) {
  return { description, content: { "application/json": { schema: resolver(schema) } } };
}
function toOpenApiSchema(schema) {
  const { $schema: _$schema, additionalProperties: _extra, ...jsonSchema } = z.toJSONSchema(schema);
  return jsonSchema;
}
function form(schema, description) {
  const f = toOpenApiSchema(schema);
  return {
    description,
    content: {
      "application/x-www-form-urlencoded": { schema: f },
      "multipart/form-data": { schema: f }
    }
  };
}
const UNAUTHORIZED_RESPONSE = { description: "Missing or invalid bearer token (empty body)" };
const AUTHED = [{ bearerAuth: [] }];
const HealthResponse = z.object({
  service: z.literal("roomcomments"),
  status: z.literal("ok")
});
const RoomCommentEntry = z.object({
  CommentId: z.int().describe("Autoincrement id; also the `minId` cursor for the read"),
  RoomId: z.int(),
  SubRoomId: z.int().describe("The subroom whose scene the comment is pinned in"),
  AccountId: z.int().describe("The player who wrote it"),
  CreatedAt: z.string().describe("ISO-8601 UTC"),
  Message: z.string(),
  Style: z.int().describe("The bubble style the client rendered it with"),
  Unread: z.boolean().describe(
    "Always true. Read state rather than a per-viewer flag, and nothing marks a comment read \u2014 the create response says true for the author\u2019s own new comment too."
  ),
  PositionX: z.number(),
  PositionY: z.number(),
  PositionZ: z.number()
});
const CommentCreateBody = z.object({
  message: z.string().describe("The comment text; an empty message is rejected"),
  subRoomId: z.string().describe("The subroom to pin it in (integer, as text)"),
  style: z.string().optional().describe("Bubble style (integer, as text); defaults to 0"),
  positionX: z.string().optional().describe("Scene position (float, as text); defaults to 0"),
  positionY: z.string().optional().describe("Scene position (float, as text); defaults to 0"),
  positionZ: z.string().optional().describe("Scene position (float, as text); defaults to 0")
});
export {
  AUTHED,
  CommentCreateBody,
  HealthResponse,
  RoomCommentEntry,
  UNAUTHORIZED_RESPONSE,
  form,
  json
};
