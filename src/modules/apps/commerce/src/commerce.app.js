// Ported from apps/commerce/src/commerce.app.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../runtime/router.js";
import { describeRoute, openAPIRouteHandler } from "../../../../runtime/openapi.js";
import { useWorkersLogger } from "../../../../runtime/logger.js";
import { withCleanSpec, withNotFound, withOnError } from "../../../packages/hono-helpers/src/index.js";
import catalog from "../static/catalog-v1-all.json.js";
import {
  BareBoolean,
  boolQuery,
  CatalogSku,
  HealthResponse,
  InitiatePurchaseRequest,
  InitiatePurchaseResponse,
  json,
  JsonArray,
  jsonBody
} from "./openapi.js";
const PLACEHOLDER_TRANSACTION_ID = 1234567890;
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
    description: "Liveness probe for the commerce worker. No auth.",
    responses: { 200: json(HealthResponse, "Service is up") }
  }),
  (c) => c.json({ service: "commerce", status: "ok" })
).get(
  "/purchase/v1/hasspentmoney",
  describeRoute({
    tags: ["Purchase"],
    summary: "Whether the player has ever spent money",
    description: [
      "Always `false` \u2014 nobody buys anything on this server. A 404 here makes the client",
      "treat the call as an error, so the answer is the bare boolean rather than nothing."
    ].join(" "),
    responses: { 200: json(BareBoolean, "Always false (no purchases)") }
  }),
  (c) => c.json(false)
).post(
  "/purchase/v1/initiatepurchase",
  describeRoute({
    tags: ["Purchase"],
    summary: "Begin a purchase",
    description: [
      "Hands the client the transaction handle it carries through the rest of the store",
      "flow. Nothing is charged and no transaction is recorded, so the id is a fixed",
      "placeholder and the posted body is accepted and ignored \u2014 an absent or unparseable",
      "body is a 200, not a 400."
    ].join(" "),
    requestBody: jsonBody(InitiatePurchaseRequest, "The purchase the player confirmed"),
    responses: { 200: json(InitiatePurchaseResponse, "The (placeholder) transaction id") }
  }),
  (c) => c.json({ transactionId: PLACEHOLDER_TRANSACTION_ID })
).get(
  "/api/catalog/v1/all",
  describeRoute({
    tags: ["Catalog"],
    summary: "The purchasable SKU catalog",
    description: [
      "The token packs, bundles and special offers the store shows, served from the bundled",
      "static catalog. The client\u2019s `onlyAvailableSkus` is accepted and ignored: the bundled",
      "catalog already contains only available SKUs."
    ].join(" "),
    parameters: [
      boolQuery("onlyAvailableSkus", "Accepted and ignored \u2014 the catalog is already filtered")
    ],
    responses: { 200: json(CatalogSku.array(), "Every available SKU") }
  }),
  (c) => c.json(catalog)
).on(
  ["GET", "POST"],
  "/purchase/v1/cleanuppending",
  describeRoute({
    tags: ["Purchase"],
    summary: "Reconcile pending purchases (no-op)",
    description: [
      "Always `[]` \u2014 no purchase is ever recorded, so nothing can be left pending. A 404",
      "here makes the client treat the call as an error, so the empty list is served",
      "instead. Accepts GET or POST."
    ].join(" "),
    responses: { 200: json(JsonArray, "Always empty (nothing pending)") }
  }),
  (c) => c.json([])
).get(
  "/purchasecampaign/allcurrent/v2",
  describeRoute({
    tags: ["Purchase"],
    summary: "Current purchase campaigns",
    description: [
      "Limited-time offers and promos. Always `[]` \u2014 none exist, and an empty list is the",
      "client\u2019s \u201Cno active campaigns\u201D state."
    ].join(" "),
    responses: { 200: json(JsonArray, "Always empty (no active campaigns)") }
  }),
  (c) => c.json([])
).get(
  "/reminder/currentTokenBundles/v2",
  describeRoute({
    tags: ["Purchase"],
    summary: "Token-bundle purchase reminders",
    description: [
      "The \u201Cbuy more tokens\u201D nudges. Always `[]` \u2014 there are none to show, and an empty list",
      "is the client\u2019s \u201Cno reminders\u201D state."
    ].join(" "),
    responses: { 200: json(JsonArray, "Always empty (no reminders)") }
  }),
  (c) => c.json([])
);
app.get(
  "/openapi.json",
  describeRoute({ hide: true }),
  withCleanSpec(
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "recflare commerce",
          version: "1.0.0",
          description: [
            "The store surface for recflare, a private-server reimplementation of the Rec Room",
            "backend: the SKU catalog the client shows and the purchase calls it makes around it.",
            "",
            "No money moves here. There is no store integration and no purchase storage, so the",
            "catalog is a bundled static asset, the campaign and reminder feeds are empty, and a",
            "purchase initiation answers with a placeholder transaction id."
          ].join("\n")
        },
        servers: [{ url: "https://commerce.recflare.net", description: "Production" }]
      }
    })
  )
);
var stdin_default = app;
export {
  stdin_default as default
};
