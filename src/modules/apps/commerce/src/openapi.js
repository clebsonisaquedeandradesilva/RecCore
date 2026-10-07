// Ported from apps/commerce/src/openapi.ts; TypeScript types erased; native runtime imports.
import { resolver } from "../../../../runtime/openapi.js";
import { z } from "../../../../../vendor/zod.js";
function json(schema, description) {
  return { description, content: { "application/json": { schema: resolver(schema) } } };
}
function toOpenApiSchema(schema) {
  const { $schema: _$schema, additionalProperties: _extra, ...jsonSchema } = z.toJSONSchema(schema);
  return jsonSchema;
}
function jsonBody(schema, description) {
  return { description, content: { "application/json": { schema: toOpenApiSchema(schema) } } };
}
function boolQuery(name, description) {
  return { name, in: "query", required: false, description, schema: { type: "boolean" } };
}
const JsonObject = z.record(z.string(), z.unknown());
const JsonArray = z.array(z.unknown());
const BareBoolean = z.boolean();
const HealthResponse = z.object({
  service: z.literal("commerce"),
  status: z.literal("ok")
});
const CatalogSkuData = z.object({
  giftDropIds: z.array(z.int()),
  message: z.string(),
  subscriptionPurchase: z.unknown().optional().describe("Present only on the subscription SKU; its shape is not reversed yet")
});
const CatalogSku = z.object({
  skuId: z.int(),
  name: z.string(),
  description: z.string().describe("Often an empty string for token packs"),
  imageName: z.string().describe("The store tile image; the img worker serves it by name"),
  price: z.int().describe("Store price in cents, e.g. 99 = $0.99"),
  oculusSkuId: z.string(),
  appleProductId: z.string(),
  googlePlaySkuId: z.string(),
  picoSkuId: z.string().optional(),
  xboxProductId: z.string().optional(),
  xboxStoreId: z.string().optional(),
  psnProductLabel: z.string().optional(),
  psnEntitlementLabel: z.string().optional(),
  nintendoSkuId: z.string().optional(),
  isSingleUse: z.boolean(),
  shouldAppearInTokenStore: z.boolean(),
  dataSchemaVersion: z.int(),
  data: CatalogSkuData
});
const InitiatePurchaseRequest = JsonObject.describe(
  "The client\u2019s purchase-initiation payload; accepted and ignored"
);
const InitiatePurchaseResponse = z.object({
  transactionId: z.int().describe("Placeholder \u2014 no transaction is recorded")
});
export {
  BareBoolean,
  CatalogSku,
  CatalogSkuData,
  HealthResponse,
  InitiatePurchaseRequest,
  InitiatePurchaseResponse,
  JsonArray,
  JsonObject,
  boolQuery,
  json,
  jsonBody
};
