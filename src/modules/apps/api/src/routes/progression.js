// Ported from apps/api/src/routes/progression.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../../runtime/router.js";
import { describeRoute } from "../../../../../runtime/openapi.js";
import {
  getPlayerIdsInInstance,
  getPresence,
  getProgression,
  getProgressions,
  MessageType
} from "../../../../packages/domain/src/index.js";
import { logger } from "../../../../packages/hono-helpers/src/index.js";
import { NotificationType } from "../../../notify/src/notification-types.js";
import { authedId, parseFormIds, queryIds, unauthorized } from "../http.js";
import {
  AUTHED,
  BulkIdsRequest,
  CheerPlayerRequest,
  CheerPlayerResponse,
  SetSelectedCheerRequest,
  form,
  idParam,
  intQuery,
  json,
  JsonArray,
  ProgressionDto,
  ReputationDto,
  UNAUTHORIZED_RESPONSE
} from "../openapi.js";
import {
  addCheer,
  CheerCategory,
  DAILY_CHEER_CREDIT,
  getReputation,
  getReputations,
  isCheerCategory,
  setSelectedCheer,
  spendCheerCredit
} from "../reputation-db.js";
const HUB_INSTANCE = "global";
async function pushProgression(c, progression) {
  try {
    await c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE).notifyPlayer(
      progression.PlayerId,
      NotificationType.PlayerProgressionLevelUpdate,
      { PlayerId: progression.PlayerId, Level: progression.Level, XP: progression.XP }
    );
  } catch (err) {
    logger.error("failed to push PlayerProgressionLevelUpdate notification", {
      accountId: progression.PlayerId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
async function pushCheerMessage(c, fromId, toId, category, anonymous) {
  try {
    await c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE).notifyPlayer(
      toId,
      NotificationType.MessageReceived,
      {
        FromPlayerId: anonymous ? 0 : fromId,
        ToPlayerId: toId,
        Type: anonymous ? MessageType.PlayerCheerAnonymous : MessageType.PlayerCheer,
        Data: String(category)
      }
    );
  } catch (err) {
    logger.error("failed to push PlayerCheer MessageReceived notification", {
      fromId,
      toId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
function reputationFrame(reputation) {
  const { Noteriety: _n, SubscriberCount: _sr, SubscribedCount: _sd, ...payload } = reputation;
  return payload;
}
async function pushReputation(c, playerId, frame) {
  try {
    await c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE).notifyPlayer(
      playerId,
      NotificationType.ReputationUpdate,
      { ...frame }
    );
  } catch (err) {
    logger.error("failed to push ReputationUpdate notification", {
      playerId,
      accountId: frame.AccountId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
async function pushReputationToRoom(c, playerIds, frame) {
  if (playerIds.length === 0) return;
  try {
    await c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE).notifyPlayersEphemeral(
      playerIds,
      NotificationType.ReputationUpdate,
      { ...frame }
    );
  } catch (err) {
    logger.error("failed to push ReputationUpdate notification to room", {
      playerIds,
      accountId: frame.AccountId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
function formField(body, c, name) {
  const raw = body[name];
  if (typeof raw === "string" && raw !== "") return raw;
  return c.req.query(name) || void 0;
}
function asInt(value) {
  if (value === void 0) return null;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}
function asBool(value) {
  return value !== void 0 && /^(true|1)$/i.test(value.trim());
}
function cheerResult(c, message = null) {
  return c.json({ Success: message === null, Message: message });
}
const BULK_ID_QUERY = [
  intQuery("id", "Repeated once per account id (`?id=1&id=2`); not comma-separated")
];
const BULK_ID_BODY = form(BulkIdsRequest, "The account ids to look up");
const progressionRoutes = new Hono({ strict: false }).get(
  "/api/playerReputation/v1/:id",
  describeRoute({
    tags: ["Progression"],
    summary: "A player\u2019s reputation",
    description: `The cheer counters shown on a player\u2019s profile, from the \`reputation\` table. A player nobody has cheered has no row and reads back all-zero. \`CheerCredit\` is the odd one out \u2014 what they have left to GIVE today, out of ${DAILY_CHEER_CREDIT}; it refills lazily, so a stale window reads as full without being reset here.`,
    parameters: [idParam("id", "Account id")],
    responses: { 200: json(ReputationDto, "The player\u2019s reputation") }
  }),
  async (c) => c.json(await getReputation(c.env.DB, Number.parseInt(c.req.param("id"), 10)))
).get(
  "/api/players/v1/progression/:id",
  describeRoute({
    tags: ["Progression"],
    summary: "A player\u2019s level and XP",
    description: "The level and XP banked in `progression` (game rewards pay into it from the `econ` worker); `XP` is the progress into the current level, not a lifetime total. A player who has earned none has no row and reads back as level 1 with 0 XP. Also pushes the same values as a `PlayerProgressionLevelUpdate` frame, as the reference does \u2014 that is what moves the client\u2019s bar.",
    parameters: [idParam("id", "Account id")],
    responses: { 200: json(ProgressionDto, "The player\u2019s progression") }
  }),
  async (c) => {
    const id = Number.parseInt(c.req.param("id"), 10);
    const progression = await getProgression(c.env.DB, id);
    await pushProgression(c, progression);
    return c.json(progression);
  }
).post(
  "/api/playerReputation/v1/bulk",
  describeRoute({
    tags: ["Progression"],
    summary: "Reputations in bulk (v1)",
    description: "The older bulk form, superseded by v2. It answers an empty list rather than synthesizing defaults \u2014 the client only uses v2.",
    requestBody: BULK_ID_BODY,
    responses: { 200: json(JsonArray, "An empty list") }
  }),
  (c) => c.json([])
).post(
  "/api/playerReputation/v2/bulk",
  describeRoute({
    tags: ["Progression"],
    summary: "Reputations in bulk",
    description: "One reputation per requested id, in request order. Ids that name no account \u2014 or that nobody has cheered \u2014 still get an all-zero record rather than being dropped: the client renders a profile card from each entry.",
    requestBody: BULK_ID_BODY,
    responses: { 200: json(ReputationDto.array(), "One reputation per requested id") }
  }),
  async (c) => c.json(await getReputations(c.env.DB, await parseFormIds(c)))
).get(
  "/api/playerReputation/v2/bulk",
  describeRoute({
    tags: ["Progression"],
    summary: "Reputations in bulk (GET form)",
    description: "What the 2023 client sends: the same bulk lookup with the ids as repeated query params instead of a form body.",
    parameters: BULK_ID_QUERY,
    responses: { 200: json(ReputationDto.array(), "One reputation per requested id") }
  }),
  async (c) => c.json(await getReputations(c.env.DB, queryIds(c)))
).post(
  "/api/PlayerCheer/v1/create",
  describeRoute({
    tags: ["Progression"],
    summary: "Cheer another player",
    description: `Hands one cheer to \`PlayerIdTo\` in the category \`CheerCategory\` names (0 General, 10 Helpful, 20 Sportmanship, 30 GreatHost, 40 Creative), counting it on their \`reputation\` row.

A player may give ${DAILY_CHEER_CREDIT} cheers per day. The credit refills lazily: the first cheer opens a 24-hour window, and the first cheer after that window has passed starts a fresh one at full credit \u2014 so a player who spends all day refills 24h after their FIRST cheer, not their last.

The cheered player gets a durable \`MessageReceived\` frame carrying a Message of type 50 (\`PlayerCheer\`) \u2014 51 (\`PlayerCheerAnonymous\`, sender 0) when \`Anonymous\` \u2014 with \`Data\` = the category. That message is what plays the cheer on their client; the \`ReputationUpdate\` frames below only refresh the numbers.

A cheer is played in front of people, so the \`ReputationUpdate\` frame naming the cheered player goes to EVERYONE in the room instance the caller is standing in, not just the two of them. The cheered player gets it durably (their counters really moved); the rest of the room gets it only if they are connected, since the effect belongs to the moment. The caller gets a second frame of their own because their \`CheerCredit\` moved and the response body does not carry it.

\`Anonymous\` swaps the message for its anonymous twin (type 51, sender 0) and nothing else \u2014 the counters move the same either way.

The audience comes from the caller\u2019s live presence, not from \`RoomId\`, which is accepted and unused: a client cannot aim its effect at a room it is not in. Neither field is stored \u2014 this keeps counters, not a log of individual cheers.

Refusals (no credit left, an unknown category, cheering yourself) answer 200 with \`{ Success: false, Message }\` rather than an error status \u2014 the client shows the message.`,
    security: AUTHED,
    requestBody: form(CheerPlayerRequest, "The cheer"),
    responses: {
      200: json(
        CheerPlayerResponse,
        "`{ Success: true, Message: null }` \u2014 see above for refusals"
      ),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const fromId = await authedId(c);
    if (fromId === null) return unauthorized(c);
    const body = await c.req.parseBody().catch(() => ({}));
    const toId = asInt(formField(body, c, "PlayerIdTo"));
    if (toId === null) return cheerResult(c, "PlayerIdTo is required");
    if (toId === fromId) return cheerResult(c, "You cannot cheer yourself");
    const category = asInt(formField(body, c, "CheerCategory"));
    if (category === null || !isCheerCategory(category)) {
      return cheerResult(c, "CheerCategory is not a cheer category");
    }
    const remaining = await spendCheerCredit(c.env.DB, fromId);
    if (remaining === null) return cheerResult(c, "You are out of cheers for today");
    const cheered = await addCheer(c.env.DB, toId, category);
    await pushCheerMessage(c, fromId, toId, category, asBool(formField(body, c, "Anonymous")));
    const frame = reputationFrame(cheered);
    const presence = await getPresence(c.env.DB, fromId);
    const instanceId = presence?.roomInstance?.roomInstanceId;
    const audience = instanceId === void 0 ? [] : (await getPlayerIdsInInstance(c.env.DB, instanceId)).filter((id) => id !== toId);
    await pushReputation(c, toId, frame);
    await pushReputationToRoom(c, audience, frame);
    await pushReputation(
      c,
      fromId,
      reputationFrame({ ...await getReputation(c.env.DB, fromId), CheerCredit: remaining })
    );
    return cheerResult(c);
  }
).post(
  "/api/PlayerCheer/v1/SetSelectedCheer",
  describeRoute({
    tags: ["Progression"],
    summary: "Pin a cheer to your profile",
    description: "Stores `CheerCategory` as the caller\u2019s `SelectedCheer` (-1 `None` unpins, read back as 0) and pushes them a `ReputationUpdate` so a second device catches up. Same `{ Success, Message }` reply as the cheer.",
    security: AUTHED,
    requestBody: form(SetSelectedCheerRequest, "The category to pin"),
    responses: {
      200: json(CheerPlayerResponse, "`{ Success: true, Message: null }`"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const body = await c.req.parseBody().catch(() => ({}));
    const category = asInt(formField(body, c, "CheerCategory"));
    if (category === null || !(category === CheerCategory.None || isCheerCategory(category))) {
      return cheerResult(c, "CheerCategory is not a cheer category");
    }
    const reputation = await setSelectedCheer(c.env.DB, id, category);
    await pushReputation(c, id, reputationFrame(reputation));
    return cheerResult(c);
  }
).post(
  "/api/players/v1/progression/bulk",
  describeRoute({
    tags: ["Progression"],
    summary: "Progressions in bulk (v1)",
    description: "No progression is stored yet, so this is an empty list.",
    requestBody: BULK_ID_BODY,
    responses: { 200: json(JsonArray, "An empty list") }
  }),
  async (c) => {
    await parseFormIds(c);
    return c.json([]);
  }
).post(
  "/api/players/v2/progression/bulk",
  describeRoute({
    tags: ["Progression"],
    summary: "Progressions in bulk (v2)",
    description: "Identical to v1 \u2014 same ids in, same empty list out.",
    requestBody: BULK_ID_BODY,
    responses: { 200: json(JsonArray, "An empty list") }
  }),
  async (c) => {
    await parseFormIds(c);
    return c.json([]);
  }
).get(
  "/api/players/v2/progression/bulk",
  describeRoute({
    tags: ["Progression"],
    summary: "Progressions in bulk (GET form)",
    description: "What the 2023 client sends. Unlike the POST forms this one does answer \u2014 one progression per requested id, in request order, defaulting to level 1 / 0 XP for ids that have earned nothing.",
    parameters: BULK_ID_QUERY,
    responses: { 200: json(ProgressionDto.array(), "One progression per requested id") }
  }),
  async (c) => c.json(await getProgressions(c.env.DB, queryIds(c)))
).post(
  "/api/v1/progression/bulk",
  describeRoute({
    tags: ["Progression"],
    summary: "Progressions in bulk (unversioned path)",
    description: "An older unversioned path some client builds still call. Same empty answer as the versioned POST forms.",
    requestBody: BULK_ID_BODY,
    responses: { 200: json(JsonArray, "An empty list") }
  }),
  async (c) => {
    await parseFormIds(c);
    return c.json([]);
  }
).get(
  "/api/progressionEvents/active",
  describeRoute({
    tags: ["Progression"],
    summary: "Progression events currently running (stub)",
    description: "The limited-time XP events in progress. Always an empty list \u2014 nothing on this server runs one \u2014 which the client reads as \u201Cno event\u201D and skips the event UI, where a 404 would stall the load. No auth: it is the same answer for every player.",
    responses: { 200: json(JsonArray, "Empty \u2014 no event is running") }
  }),
  (c) => c.json([])
);
export {
  progressionRoutes
};
