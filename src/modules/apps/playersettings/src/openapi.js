// Ported from apps/playersettings/src/openapi.ts; TypeScript types erased; native runtime imports.
import { resolver } from "../../../../runtime/openapi.js";
import { z } from "../../../../../vendor/zod.js";
function json(schema, description) {
  return { description, content: { "application/json": { schema: resolver(schema) } } };
}
function toOpenApiSchema(schema) {
  const { $schema: _$schema, additionalProperties: _extra, ...jsonSchema } = z.toJSONSchema(schema);
  return jsonSchema;
}
function formOrJson(formSchema, jsonSchema, description) {
  const f = toOpenApiSchema(formSchema);
  return {
    description,
    content: {
      "application/x-www-form-urlencoded": { schema: f },
      "multipart/form-data": { schema: f },
      "application/json": { schema: toOpenApiSchema(jsonSchema) }
    }
  };
}
const UNAUTHORIZED_RESPONSE = { description: "Missing or invalid bearer token (empty body)" };
const AUTHED = [{ bearerAuth: [] }];
const HealthResponse = z.object({
  service: z.literal("playersettings"),
  status: z.literal("ok")
});
const PlayerSettingEntry = z.object({
  PlayerId: z.int().describe("The authenticated player the setting belongs to"),
  Key: z.string(),
  Value: z.string()
});
const SettingFormWrite = z.object({
  key: z.string().describe("The setting name; an empty key is ignored"),
  value: z.string().describe("The setting value, as a string")
});
const SettingJsonWrite = z.union([
  z.object({
    key: z.string().optional(),
    Key: z.string().optional(),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
    Value: z.union([z.string(), z.number(), z.boolean()]).optional()
  }),
  z.array(
    z.object({
      key: z.string().optional(),
      Key: z.string().optional(),
      value: z.union([z.string(), z.number(), z.boolean()]).optional(),
      Value: z.union([z.string(), z.number(), z.boolean()]).optional()
    })
  )
]);
const SettingFormDelete = z.object({
  key: z.string().describe("The setting name to remove; an empty key is ignored")
});
const SettingJsonDelete = z.union([
  z.string(),
  z.object({ key: z.string().optional(), Key: z.string().optional() }),
  z.array(
    z.union([z.string(), z.object({ key: z.string().optional(), Key: z.string().optional() })])
  )
]);
export {
  AUTHED,
  HealthResponse,
  PlayerSettingEntry,
  SettingFormDelete,
  SettingFormWrite,
  SettingJsonDelete,
  SettingJsonWrite,
  UNAUTHORIZED_RESPONSE,
  formOrJson,
  json
};
