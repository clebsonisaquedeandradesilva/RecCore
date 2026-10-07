// Ported from apps/api/src/routes/rooms.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../../runtime/router.js";
import { describeRoute } from "../../../../../runtime/openapi.js";
import { getRoomById } from "../../../../packages/domain/src/index.js";
import { authedId } from "../http.js";
import {
  AUTHED,
  BareBoolean,
  form,
  json,
  JsonArray,
  QuickPlayResponse,
  TagFilters,
  VerifyRoleRequest
} from "../openapi.js";
const roomRoutes = new Hono({ strict: false }).get(
  "/api/roomkeys/v1/mine",
  describeRoute({
    tags: ["Rooms"],
    summary: "The caller\u2019s room keys",
    description: "Nothing issues room keys yet, so this is an empty list.",
    responses: { 200: json(JsonArray, "An empty list") }
  }),
  (c) => c.json([])
).get(
  "/api/roomkeys/v1/room",
  describeRoute({
    tags: ["Rooms"],
    summary: "A room\u2019s keys",
    description: "Nothing issues room keys yet, so this is an empty list.",
    responses: { 200: json(JsonArray, "An empty list") }
  }),
  (c) => c.json([])
).get(
  "/api/quickPlay/v1/getandclear",
  describeRoute({
    tags: ["Rooms"],
    summary: "Take the pending quick-play action",
    description: "A read-and-clear of whatever quick-play action is queued for the caller (joining a friend, an invite deep link). Nothing queues one yet, so all three fields are null \u2014 which the client reads as \u201Cnothing to do\u201D.",
    responses: { 200: json(QuickPlayResponse, "All null \u2014 no pending action") }
  }),
  (c) => c.json({ RoomName: null, ActionCode: null, TargetPlayerId: null })
).get(
  "/api/rooms/v1/filters",
  describeRoute({
    tags: ["Rooms"],
    summary: "Room browse filter chips",
    description: "The filter chips on the room browse screen. Static, taken from the 2025 reference. The client deserializes this as an OBJECT, not an array \u2014 and unlike the invention/event filters, `TrendingFilters` here is a real list.",
    responses: { 200: json(TagFilters, "The filter chips") }
  }),
  (c) => c.json({
    PinnedFilters: [
      "recroomoriginal",
      "community",
      "featured",
      "quest",
      "pvp",
      "hangout",
      "game",
      "art",
      "store",
      "tutorial",
      "fandom",
      "performance",
      "action",
      "horror"
    ],
    PopularFilters: ["pvp", "quest", "game", "hangout", "art"],
    TrendingFilters: [
      "roleplay",
      "nomp",
      "rp",
      "casual",
      "fun",
      "action",
      "military",
      "sports"
    ]
  })
).post(
  "/api/rooms/v1/verifyRole",
  describeRoute({
    tags: ["Rooms"],
    summary: "Verify the caller\u2019s role in a room",
    description: "Whether the caller holds at least `role` in the room \u2014 the gate the client checks before letting someone into the Maker Pen. The room\u2019s creator always passes; anyone else needs a `Roles` entry at that level or higher.\n\nAnswers a bare `true`/`false`, and every failure is `false` rather than an error status: no token, an unknown room, and an insufficient role are indistinguishable to the client. Params are read from the form body, falling back to the query string. Room data is read from the shared rooms database (owned by the `rooms` worker).",
    security: AUTHED,
    requestBody: form(VerifyRoleRequest, "The room and the role level to check"),
    responses: { 200: json(BareBoolean, "Whether the caller holds the role") }
  }),
  async (c) => {
    const body = await c.req.parseBody().catch(() => ({}));
    const param = (name) => {
      const fromBody = body[name];
      if (typeof fromBody === "string" && fromBody !== "") return fromBody;
      return c.req.query(name) ?? "";
    };
    const roomId = Number.parseInt(param("roomId"), 10);
    const role = Number.parseInt(param("role"), 10);
    const accountId = await authedId(c);
    if (accountId === null || Number.isNaN(roomId)) return c.json(false);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) return c.json(false);
    if (room.CreatorAccountId === accountId) return c.json(true);
    const roles = Array.isArray(room.Roles) ? room.Roles : [];
    const hasRole = roles.some(
      (r) => r.AccountId === accountId && typeof r.Role === "number" && r.Role >= (role || 0)
    );
    return c.json(hasRole);
  }
);
export {
  roomRoutes
};
