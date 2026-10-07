// Ported from apps/api/src/api.app.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../runtime/router.js";
import { describeRoute, openAPIRouteHandler } from "../../../../runtime/openapi.js";
import { useWorkersLogger } from "../../../../runtime/logger.js";
import { withCleanSpec, withDefaultCors, withNotFound, withOnError } from "../../../packages/hono-helpers/src/index.js";
import { accountRoutes } from "./routes/account.js";
import { avatarRoutes } from "./routes/avatar.js";
import { configRoutes } from "./routes/config.js";
import { eventRoutes } from "./routes/events.js";
import { gameplayRoutes } from "./routes/gameplay.js";
import { imageRoutes } from "./routes/images.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { moderationRoutes } from "./routes/moderation.js";
import { progressionRoutes } from "./routes/progression.js";
import { roomRoutes } from "./routes/rooms.js";
import { socialRoutes } from "./routes/social.js";
const app = new Hono({ strict: false }).use(
  "*",
  // middleware
  (c, next) => useWorkersLogger(c.env.NAME, {
    environment: c.env.ENVIRONMENT,
    release: c.env.SENTRY_RELEASE
  })(c, next)
).use("*", withDefaultCors()).onError(withOnError()).notFound(withNotFound()).route("/", configRoutes).route("/", socialRoutes).route("/", progressionRoutes).route("/", avatarRoutes).route("/", gameplayRoutes).route("/", eventRoutes).route("/", moderationRoutes).route("/", inventoryRoutes).route("/", roomRoutes).route("/", imageRoutes).route("/", accountRoutes);
app.get(
  "/openapi.json",
  describeRoute({ hide: true }),
  withCleanSpec(
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "recflare api",
          version: "1.0.0",
          description: [
            "The catch-all Game API for recflare, a private-server reimplementation of the Rec",
            "Room backend: everything the client calls that has not been split out into its own",
            "worker yet. Today that is config, the friend graph, inventions, saved photos,",
            "player events, reputation and the assorted sinks the client hits while loading.",
            "Relationships, inventions, images and player events are D1-backed; several",
            "endpoints are still stubs, noted per route.",
            "",
            "Expect this surface to shrink. Paths that also exist on a dedicated worker (avatar,",
            "equipment, consumables and objectives on `econ`) are already served there \u2014 the",
            "client calls that host and the copy here is a stub, which each route says."
          ].join("\n")
        },
        servers: [{ url: "https://api.recflare.net", description: "Production" }],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
              description: "An `access_token` from the auth worker\u2019s `POST /connect/token`."
            }
          }
        }
      }
    })
  )
);
var stdin_default = app;
export {
  stdin_default as default
};
