// Ported from apps/api/src/routes/inventory.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../../runtime/router.js";
import { describeRoute } from "../../../../../runtime/openapi.js";
import { authedId, unauthorized } from "../http.js";
import { AUTHED, json, JsonArray, UNAUTHORIZED_RESPONSE } from "../openapi.js";
const inventoryRoutes = new Hono({ strict: false }).get(
  "/api/equipment/v2/getUnlocked",
  describeRoute({
    tags: ["Inventory"],
    summary: "Unlocked equipment",
    description: "A stub on this host \u2014 the real inventory lives in the `econ` worker, which serves this same path with the player\u2019s equipment. Always an empty list here, and unlike the econ route it does not require a token.",
    responses: { 200: json(JsonArray, "An empty list") }
  }),
  (c) => c.json([])
).get(
  "/api/consumables/v2/getUnlocked",
  describeRoute({
    tags: ["Inventory"],
    summary: "Unlocked consumables",
    description: "A stub on this host \u2014 the real consumables live in the `econ` worker. Auth-gated even so, then always an empty list.",
    security: AUTHED,
    responses: {
      200: json(JsonArray, "An empty list"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json([]);
  }
);
export {
  inventoryRoutes
};
