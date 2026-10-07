// Ported from apps/notify/src/notify.app.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../runtime/router.js";
import { useWorkersLogger } from "../../../../runtime/logger.js";
import { createNotification } from "../../../packages/domain/src/index.js";
import { logger, withDefaultCors, withNotFound, withOnError } from "../../../packages/hono-helpers/src/index.js";
import { validateAndGetAccountId, validateAndGetRoles } from "../../../packages/jwt/src/index.js";
import {
  COACH_MESSAGE_TYPE,
  COACH_PLAYER_ID,
  NotificationsHub,
  OWNER_HEADER
} from "./notifications-hub.js";
const HUB_INSTANCE = "global";
const HUB_RETRIES = 2;
function isRetryableHubError(err) {
  if (typeof err !== "object" || err === null) return false;
  const fields = err;
  return fields.retryable === true || fields.durableObjectReset === true;
}
async function hubCall(c, call) {
  let lastError;
  for (let attempt = 0; attempt <= HUB_RETRIES; attempt++) {
    try {
      return await call(c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE));
    } catch (err) {
      if (!isRetryableHubError(err)) throw err;
      lastError = err;
      logger.warn("hub call reset, retrying", {
        attempt: attempt + 1,
        of: HUB_RETRIES + 1,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  throw lastError;
}
function isNotificationType(value) {
  return typeof value === "string" && value !== "" || typeof value === "number";
}
const ADMIN_ROLES = /* @__PURE__ */ new Set(["developer", "moderator"]);
async function connectionOwner(c) {
  const secret = await c.env.JWT_SECRET.get();
  const id = await validateAndGetAccountId(c.req.raw, secret);
  if (id !== null) return id;
  const token = c.req.query("access_token");
  if (!token) return null;
  return validateAndGetAccountId(
    new Request(c.req.url, { headers: { Authorization: `Bearer ${token}` } }),
    secret
  );
}
const requireAdmin = async (c, next) => {
  const roles = await validateAndGetRoles(c.req.raw, await c.env.JWT_SECRET.get());
  if (roles === null) return c.json({ error: "Unauthorized" }, 401);
  if (!roles.some((role) => ADMIN_ROLES.has(role))) return c.json({ error: "Forbidden" }, 403);
  await next();
};
const app = new Hono().use(
  "*",
  // middleware
  (c, next) => useWorkersLogger(c.env.NAME, {
    environment: c.env.ENVIRONMENT,
    release: c.env.SENTRY_RELEASE
  })(c, next)
).use("*", withDefaultCors()).onError(withOnError()).notFound(withNotFound()).post("/hub/v1/negotiate", (c) => {
  const negotiateVersion = Number(c.req.query("negotiateVersion")) || 0;
  const id = crypto.randomUUID();
  logger.info("signalr negotiate", { negotiateVersion });
  return c.json({
    negotiateVersion,
    connectionId: id,
    connectionToken: id,
    availableTransports: [{ transport: "WebSockets", transferFormats: ["Text"] }]
  });
}).get("/hub/v1", async (c) => {
  if ((c.req.header("upgrade") ?? "").toLowerCase() !== "websocket") {
    return c.json({ error: "Expected a WebSocket upgrade request" }, 426);
  }
  const playerId = await connectionOwner(c);
  if (playerId === null) return c.json({ error: "Unauthorized" }, 401);
  const request = new Request(c.req.raw);
  request.headers.set(OWNER_HEADER, String(playerId));
  return hubCall(c, (hub) => hub.fetch(new Request(request)));
}).use("/internal/*", requireAdmin).post("/internal/notify", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.playerId !== "number" || !isNotificationType(body.notificationType)) {
    return c.json({ error: "playerId and notificationType are required" }, 400);
  }
  const { playerId, notificationType, data } = body;
  const result = await hubCall(c, (hub) => hub.notifyPlayer(playerId, notificationType, data));
  return c.json({ success: true, ...result });
}).post("/internal/broadcast", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !isNotificationType(body.notificationType)) {
    return c.json({ error: "notificationType is required" }, 400);
  }
  const { notificationType, data } = body;
  const result = await hubCall(c, (hub) => hub.broadcast(notificationType, data));
  return c.json({ success: true, ...result });
}).post("/internal/coach-message-all", async (c) => {
  const body = await c.req.json().catch(() => null);
  const content = typeof body?.messageContent === "string" ? body.messageContent.trim() : "";
  if (content === "") return c.json({ error: "messageContent is required" }, 400);
  const result = await hubCall(c, (hub) => hub.coachMessageAll(content));
  return c.json({ success: true, ...result });
}).post("/internal/coach-message", async (c) => {
  const body = await c.req.json().catch(() => null);
  const content = typeof body?.messageContent === "string" ? body.messageContent.trim() : "";
  if (typeof body?.playerId !== "number" || !Number.isInteger(body.playerId)) {
    return c.json({ error: "playerId is required" }, 400);
  }
  if (content === "") return c.json({ error: "messageContent is required" }, 400);
  const notification = await createNotification(c.env.DB, {
    FromPlayerId: COACH_PLAYER_ID,
    ToPlayerId: body.playerId,
    Type: COACH_MESSAGE_TYPE,
    Data: content
  });
  const result = await hubCall(c, (hub) => hub.coachMessage(notification));
  return c.json({ success: true, notificationId: notification.Id, ...result });
}).get("/internal/hub-state", async (c) => {
  return c.json(await hubCall(c, (hub) => hub.inspect()));
}).delete("/internal/hub-state/pending", async (c) => {
  const raw = c.req.query("playerId");
  const playerId = raw === void 0 ? void 0 : Number.parseInt(raw, 10);
  if (playerId !== void 0 && !Number.isInteger(playerId)) {
    return c.json({ error: "playerId must be an integer" }, 400);
  }
  if (playerId === void 0 && c.req.query("all") !== "true") {
    return c.json({ error: "pass playerId, or all=true to clear every queue" }, 400);
  }
  const result = await hubCall(c, (hub) => hub.clearPending(playerId));
  logger.info("cleared pending notifications", { playerId: playerId ?? null, ...result });
  return c.json({ success: true, ...result });
});
var stdin_default = app;
export {
  NotificationsHub,
  stdin_default as default
};
