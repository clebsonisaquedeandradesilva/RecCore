// Ported from apps/api/src/routes/account.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../../runtime/router.js";
import { describeRoute } from "../../../../../runtime/openapi.js";
import { json, JsonArray, stringParam } from "../openapi.js";
const accountRoutes = new Hono({ strict: false }).get(
  "/iam/me/channels/:type",
  describeRoute({
    tags: ["Account"],
    summary: "The caller\u2019s channels of a type",
    description: 'The channels of the given `{type}` linked to the caller\u2019s account. This server links none, so the list is always empty \u2014 a real answer rather than a placeholder for one, since the client renders "nothing linked" from it. `{type}` is accepted but not inspected, and the route is not auth-gated: the answer is the same for every caller and every type.',
    parameters: [stringParam("type", "The channel type. Accepted but not inspected.")],
    responses: { 200: json(JsonArray, "Always an empty list") }
  }),
  (c) => c.json([])
);
export {
  accountRoutes
};
