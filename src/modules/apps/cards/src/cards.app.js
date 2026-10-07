// Ported from apps/cards/src/cards.app.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../runtime/router.js";
import { useWorkersLogger } from "../../../../runtime/logger.js";
import { withNotFound, withOnError } from "../../../packages/hono-helpers/src/index.js";
const app = new Hono().use(
  "*",
  // middleware
  (c, next) => useWorkersLogger(c.env.NAME, {
    environment: c.env.ENVIRONMENT,
    release: c.env.SENTRY_RELEASE
  })(c, next)
).onError(withOnError()).notFound(withNotFound()).get("/", async (c) => {
  return c.text("hello, world!");
});
var stdin_default = app;
export {
  stdin_default as default
};
