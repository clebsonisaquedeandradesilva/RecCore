// Ported from apps/platformnotifications/src/platformnotifications.app.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../runtime/router.js";
import { useWorkersLogger } from "../../../../runtime/logger.js";
import { withNotFound, withOnError } from "../../../packages/hono-helpers/src/index.js";
import { validateAndGetAccountId } from "../../../packages/jwt/src/index.js";
async function authedId(c) {
  return validateAndGetAccountId(c.req.raw, await c.env.JWT_SECRET.get());
}
function unauthorized(c) {
  return c.body(null, 401);
}
const NOTIFICATION_CATEGORIES = [
  {
    CategoryId: 2,
    Importance: 0,
    Name: "Friends",
    Description: "Friend requests and friend activity [STUB \u2014 recflare sends no notifications yet]",
    IsMuteable: true
  }
];
const app = new Hono().use(
  "*",
  // middleware
  (c, next) => useWorkersLogger(c.env.NAME, {
    environment: c.env.ENVIRONMENT,
    release: c.env.SENTRY_RELEASE
  })(c, next)
).onError(withOnError()).notFound(withNotFound()).get("/", async (c) => {
  return c.text("hello, world!");
}).get("/accounts/:id{[0-9]+}/receives/GameplayInvites", async (c) => {
  const accountId = await authedId(c);
  if (accountId === null) return unauthorized(c);
  return c.json(true);
}).get("/config/categories", async (c) => {
  return c.json({
    Results: NOTIFICATION_CATEGORIES,
    TotalResults: NOTIFICATION_CATEGORIES.length
  });
}).get("/crm/me/config/v3", async (c) => {
  const accountId = await authedId(c);
  if (accountId === null) return unauthorized(c);
  return c.json({});
}).get("/preferences", async (c) => {
  const accountId = await authedId(c);
  if (accountId === null) return unauthorized(c);
  return c.json({ MutedCategories: [] });
});
var stdin_default = app;
export {
  stdin_default as default
};
