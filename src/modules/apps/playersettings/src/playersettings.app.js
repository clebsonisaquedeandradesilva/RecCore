// Ported from apps/playersettings/src/playersettings.app.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../runtime/router.js";
import { describeRoute, openAPIRouteHandler } from "../../../../runtime/openapi.js";
import { useWorkersLogger } from "../../../../runtime/logger.js";
import { withCleanSpec, withNotFound, withOnError } from "../../../packages/hono-helpers/src/index.js";
import { validateAndGetAccountId } from "../../../packages/jwt/src/index.js";
import { DEFAULT_SETTINGS } from "./default-settings.js";
import {
  AUTHED,
  formOrJson,
  HealthResponse,
  json,
  PlayerSettingEntry,
  SettingFormDelete,
  SettingFormWrite,
  SettingJsonDelete,
  SettingJsonWrite,
  UNAUTHORIZED_RESPONSE
} from "./openapi.js";
async function authedId(c) {
  return validateAndGetAccountId(c.req.raw, await c.env.JWT_SECRET.get());
}
function unauthorized(c) {
  return c.body(null, 401);
}
async function parseSettings(c) {
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await c.req.json().catch(() => null);
    const list = Array.isArray(body) ? body : body == null ? [] : [body];
    return list.map((o) => {
      const rec = o;
      const key2 = rec.key ?? rec.Key;
      const value2 = rec.value ?? rec.Value;
      return {
        key: typeof key2 === "string" ? key2 : "",
        value: typeof value2 === "string" ? value2 : typeof value2 === "number" || typeof value2 === "boolean" ? String(value2) : ""
      };
    }).filter((s) => s.key !== "");
  }
  const form = await c.req.parseBody().catch(() => ({}));
  const key = typeof form.key === "string" ? form.key : "";
  const value = typeof form.value === "string" ? form.value : "";
  return key ? [{ key, value }] : [];
}
async function parseDeleteKeys(c) {
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await c.req.json().catch(() => null);
    const list = Array.isArray(body) ? body : body == null ? [] : [body];
    return list.map((o) => {
      if (typeof o === "string") return o;
      const rec = o;
      const key2 = rec.key ?? rec.Key;
      return typeof key2 === "string" ? key2 : "";
    }).filter((k) => k !== "");
  }
  let key = "";
  if (contentType.includes("form-data") || contentType.includes("x-www-form-urlencoded")) {
    const form = await c.req.parseBody().catch(() => ({}));
    if (typeof form.key === "string") key = form.key;
  } else {
    key = new URLSearchParams(await c.req.text().catch(() => "")).get("key") ?? "";
  }
  if (key === "") key = c.req.query("key") ?? "";
  return key ? [key] : [];
}
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
    description: "Liveness probe for the playersettings worker. No auth.",
    responses: { 200: json(HealthResponse, "Service is up") }
  }),
  (c) => c.json({ service: "playersettings", status: "ok" })
).get(
  "/playersettings",
  describeRoute({
    tags: ["Player Settings"],
    summary: "The player\u2019s settings",
    description: [
      "The authenticated player\u2019s settings as `{ PlayerId, Key, Value }` entries, read from",
      "their KV map. A player with nothing stored is seeded with the reference defaults",
      "(Recroom.OOBE, TUTORIAL_COMPLETE_MASK, FIRST_TIME_IN_FLAGS), which are persisted on",
      "that first read."
    ].join(" "),
    security: AUTHED,
    responses: {
      200: json(PlayerSettingEntry.array(), "The player\u2019s settings (defaults on first read)"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const kvKey = `player:${id}`;
    let stored = await c.env.RECFLARE_PLAYER_SETTINGS.get(kvKey, "json");
    if (!stored || Object.keys(stored).length === 0) {
      stored = Object.fromEntries(DEFAULT_SETTINGS.map((s) => [s.Key, s.Value]));
      await c.env.RECFLARE_PLAYER_SETTINGS.put(kvKey, JSON.stringify(stored));
    }
    return c.json(Object.entries(stored).map(([Key, Value]) => ({ PlayerId: id, Key, Value })));
  }
).put(
  "/playersettings",
  describeRoute({
    tags: ["Player Settings"],
    summary: "Write the player\u2019s settings",
    description: [
      "Upserts the posted setting(s) into the caller\u2019s KV map. The write MERGES: a single",
      "key PUT (`key=PlayerSessionCount&value=1`, which is what the client sends) leaves the",
      "player\u2019s other settings alone. A JSON body is also accepted, as one object or an",
      "array, in either `key`/`value` or `Key`/`Value` casing; entries with an empty key are",
      "dropped. An unparseable or empty body is a no-op 200, not a 400. Empty body on success."
    ].join(" "),
    security: AUTHED,
    requestBody: formOrJson(SettingFormWrite, SettingJsonWrite, "The setting(s) to write"),
    responses: {
      200: { description: "Applied, or nothing parseable to apply (empty body)" },
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const incoming = await parseSettings(c);
    if (incoming.length === 0) return c.body(null, 200);
    const kvKey = `player:${id}`;
    const existing = await c.env.RECFLARE_PLAYER_SETTINGS.get(
      kvKey,
      "json"
    );
    const merged = { ...existing };
    for (const { key, value } of incoming) merged[key] = value;
    await c.env.RECFLARE_PLAYER_SETTINGS.put(kvKey, JSON.stringify(merged));
    return c.body(null, 200);
  }
).delete(
  "/playersettings",
  describeRoute({
    tags: ["Player Settings"],
    summary: "Delete a player setting",
    description: [
      "Removes the named setting(s) from the caller\u2019s KV map. The client sends a bare",
      "form-urlencoded `key=PlayerShoppingBagId` (no `value`); a JSON body \u2014 a string, a",
      "`{ key }` object, or an array of either \u2014 and a `?key=` query param are also read.",
      "Deleting a key that isn\u2019t stored, or sending nothing to delete, is a no-op 200, not a",
      "404. Empty body on success.",
      "",
      "Note that emptying the map entirely puts the player back to a first read: the next",
      "`GET` re-seeds the defaults."
    ].join(" "),
    security: AUTHED,
    requestBody: formOrJson(SettingFormDelete, SettingJsonDelete, "The setting(s) to remove"),
    responses: {
      200: { description: "Removed, or nothing to remove (empty body)" },
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const keys = await parseDeleteKeys(c);
    if (keys.length === 0) return c.body(null, 200);
    const kvKey = `player:${id}`;
    const existing = await c.env.RECFLARE_PLAYER_SETTINGS.get(
      kvKey,
      "json"
    );
    if (!existing) return c.body(null, 200);
    const remaining = { ...existing };
    let removed = false;
    for (const key of keys) {
      if (key in remaining) {
        delete remaining[key];
        removed = true;
      }
    }
    if (removed) await c.env.RECFLARE_PLAYER_SETTINGS.put(kvKey, JSON.stringify(remaining));
    return c.body(null, 200);
  }
);
app.get(
  "/openapi.json",
  describeRoute({ hide: true }),
  withCleanSpec(
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "recflare playersettings",
          version: "1.0.0",
          description: [
            "The player key/value settings bag for recflare, a private-server reimplementation of",
            "the Rec Room backend. The client reads these on load and writes them back as the",
            "player toggles options; they are stored in a per-player KV map, seeded with the",
            "reference defaults on a player\u2019s first read."
          ].join("\n")
        },
        servers: [{ url: "https://playersettings.recflare.net", description: "Production" }],
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
