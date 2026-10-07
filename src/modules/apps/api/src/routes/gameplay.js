// Ported from apps/api/src/routes/gameplay.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../../runtime/router.js";
import { describeRoute } from "../../../../../runtime/openapi.js";
import charadesAprilWords from "../../static/charades-april.json.js";
import charadesWords from "../../static/charades.json.js";
import communityBoard from "../../static/community-board.json.js";
import { authedId, unauthorized } from "../http.js";
import {
  AUTHED,
  BareString,
  idParam,
  IsPureResponse,
  json,
  JsonArray,
  jsonBody,
  JsonObject,
  KeepsakeCategories,
  KeepsakeConfig,
  SanitizeRequest,
  stringParam,
  UNAUTHORIZED_RESPONSE
} from "../openapi.js";
import {
  censorSwears,
  containsSwears,
  DEFAULT_REPLACEMENT_CHAR,
  removeBlockedCharacters
} from "../sanitize.js";
async function sanitizeRequest(c) {
  const body = await c.req.json().catch(() => ({}));
  const field = (name) => {
    const key = Object.keys(body).find((k) => k.toLowerCase() === name.toLowerCase());
    return key === void 0 ? void 0 : body[key];
  };
  const value = field("Value");
  const replacementChar = field("ReplacementChar");
  return {
    value: typeof value === "string" ? value : "",
    replacementChar: typeof replacementChar === "string" && replacementChar !== "" ? replacementChar : DEFAULT_REPLACEMENT_CHAR,
    preRemoveBlockedCharacters: field("PreRemoveBlockedCharacters") === true
  };
}
function charadesWordsFor(now = /* @__PURE__ */ new Date()) {
  const isAprilFools = now.getUTCMonth() === 3 && now.getUTCDate() === 1;
  return isAprilFools ? charadesAprilWords : charadesWords;
}
const gameplayRoutes = new Hono({ strict: false }).post(
  "/api/sanitize/v1",
  describeRoute({
    tags: ["Gameplay"],
    summary: "Sanitize a string",
    description: "Masks any swear in the posted `Value` and returns the cleaned text as a bare JSON string. Each character of a swear becomes the request\u2019s `ReplacementChar` (`*` when it names none), so the shape of the message survives; text with nothing to object to comes back untouched. `PreRemoveBlockedCharacters` strips control and zero-width characters first \u2014 the ones used to break a word up so a filter misses it. `Context`, `Intent` and `ruleset` are accepted and ignored: they pick among the reference\u2019s filtering policies, and this server has one.",
    requestBody: jsonBody(SanitizeRequest, "The text to clean"),
    responses: { 200: json(BareString, "The cleaned text (a bare JSON string)") }
  }),
  async (c) => {
    const { value, replacementChar, preRemoveBlockedCharacters } = await sanitizeRequest(c);
    const text = preRemoveBlockedCharacters ? removeBlockedCharacters(value) : value;
    return c.json(censorSwears(text, replacementChar));
  }
).post(
  "/api/sanitize/v1/isPure",
  describeRoute({
    tags: ["Gameplay"],
    summary: "Whether a string is clean",
    description: "Reports whether the posted `Value` contains a swear \u2014 the check the client runs against a display name, room name or invention title before it accepts one. Matching is word-boundary aware, so ordinary words that contain a swear (`analysis`, `Scunthorpe`, `class`) are pure, while leetspeak (`sh1t`, `a$$hole`) is not. An empty or absent `Value` is pure.",
    security: AUTHED,
    requestBody: jsonBody(SanitizeRequest, "The text to check"),
    responses: {
      200: json(IsPureResponse, "Whether the text is clean"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const { value } = await sanitizeRequest(c);
    return c.json({ IsPure: !containsSwears(value) });
  }
).get(
  "/api/activities/charades/v1/words/:activity",
  describeRoute({
    tags: ["Gameplay"],
    summary: "An activity\u2019s word bank",
    description: "The words the Charades activity draws from. The client asks by activity name (`.../words/Charades`); the name is not matched on, so every activity gets the charades list \u2014 no other activity has data yet. On April 1st (UTC) the April Fools word list is served in place of the ordinary one.",
    parameters: [stringParam("activity", "Activity name, e.g. `Charades`. Not matched on.")],
    responses: { 200: json(JsonArray, "The word list") }
  }),
  (c) => c.json(charadesWordsFor())
).get(
  "/api/keepsakes/globalconfig",
  describeRoute({
    tags: ["Gameplay"],
    summary: "Keepsake feature switches",
    description: "Whether keepsakes (room mementos) are on and how many a room may hold. The feature reports as enabled, but nothing stores keepsakes yet.",
    responses: { 200: json(KeepsakeConfig, "The keepsake config") }
  }),
  (c) => c.json({ KeepsakeFeatureEnabled: true, KeepsakeRoomLimit: 10, SocialXpBoostEnabled: false })
).get(
  "/api/keepsakes/rooms/:roomId",
  describeRoute({
    tags: ["Gameplay"],
    summary: "A room\u2019s keepsakes",
    description: "No keepsake storage yet. Answers 204 with no body rather than an empty list \u2014 that is what the reference does, and the client treats a body here as data.",
    parameters: [idParam("roomId", "Room id")],
    responses: { 204: { description: "No keepsakes (empty body)" } }
  }),
  (c) => c.body(null, 204)
).get(
  "/api/keepsakes/categories",
  describeRoute({
    tags: ["Gameplay"],
    summary: "Keepsake categories",
    description: "No keepsake catalog yet, so the result set is empty \u2014 but it IS a result set (`{ Results, TotalResults }`), not the empty list the stubs around it serve. The client parses this one as an object and fails on an array (\"expected '{', actual '['\"), taking the keepsake load down with it. `TotalResults` counts `Results` itself \u2014 there is no paging here.",
    responses: { 200: json(KeepsakeCategories, "An empty result set") }
  }),
  (c) => c.json({ Results: [], TotalResults: 0 })
).get(
  "/api/communityboard/v2/current",
  describeRoute({
    tags: ["Gameplay"],
    summary: "The current community board",
    description: "The rotating community board on the home screen \u2014 featured player, featured room group, announcement and image strips. Served verbatim from a static blob.",
    responses: { 200: json(JsonObject, "The community board") }
  }),
  (c) => c.json(communityBoard)
).get(
  "/api/CircuitChipLists/:list",
  describeRoute({
    tags: ["Gameplay"],
    summary: "One circuit chip list",
    description: "A palette on the Maker Pen\u2019s circuit board, named by the path (`Favorites`, `Recent`, \u2026). Always empty: nothing records which chips a player has used or favourited yet. An unknown name is empty too rather than a 404 \u2014 the client asks for whichever palettes its build has, and a 404 renders as a palette that failed to load rather than one with nothing in it.",
    parameters: [stringParam("list", "The palette name, e.g. `Favorites`")],
    responses: { 200: json(JsonArray, "An empty list") }
  }),
  (c) => c.json([])
).get(
  "/api/announcement/v1/get",
  describeRoute({
    tags: ["Gameplay"],
    summary: "Announcements",
    description: "The announcement banners on the home screen. Not hydrated yet.",
    responses: { 200: json(JsonArray, "An empty list") }
  }),
  (c) => c.json([])
).post(
  "/api/gamesight/event",
  describeRoute({
    tags: ["Gameplay"],
    summary: "Analytics event sink",
    description: "The client\u2019s GameSight attribution/analytics events. Accepted and dropped \u2014 nothing is persisted. Answers 200 with an empty body.",
    responses: { 200: { description: "Accepted (empty body)" } }
  }),
  (c) => c.body(null, 200)
);
export {
  charadesWordsFor,
  gameplayRoutes
};
