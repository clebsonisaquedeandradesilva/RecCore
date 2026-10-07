// Ported from apps/ns/src/ns.app.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../runtime/router.js";
import { useWorkersLogger } from "../../../../runtime/logger.js";
import { withNotFound, withOnError } from "../../../packages/hono-helpers/src/index.js";
import { buildEndpoints } from "./endpoints.js";
const app = new Hono().use(
  "*",
  // middleware
  (c, next) => useWorkersLogger(c.env.NAME, {
    environment: c.env.ENVIRONMENT,
    release: c.env.SENTRY_RELEASE
  })(c, next)
).onError(withOnError()).notFound(withNotFound()).get("/", (c) => c.json(buildEndpoints(c.env.DOMAIN, c.env.SUBDOMAINS)));
var stdin_default = app;
export {
  stdin_default as default
};
