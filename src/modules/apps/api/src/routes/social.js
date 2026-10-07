// Ported from apps/api/src/routes/social.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../../runtime/router.js";
import { describeRoute } from "../../../../../runtime/openapi.js";
import {
  acceptFriendRequest,
  addFriend,
  countOnlineFriends,
  createNotification,
  deleteNotifications,
  getAccountsByIds,
  getMutualFriendIds,
  getNotificationsForPlayer,
  getRelationshipsForPlayer,
  MUTUAL_FRIENDS_LIMIT,
  removeFriend,
  sendFriendRequest,
  setRelationshipFlag
} from "../../../../packages/domain/src/index.js";
import { logger } from "../../../../packages/hono-helpers/src/index.js";
import { NotificationType } from "../../../notify/src/notification-types.js";
import { authedId, unauthorized } from "../http.js";
import {
  AckResponse,
  AUTHED,
  DeleteMessagesRequest,
  ErrorResponse,
  form,
  FriendOnlineCountResponse,
  intQuery,
  json,
  JsonArray,
  jsonBody,
  MessageDto,
  MutualFriendDto,
  RelationshipDto,
  SendMessageRequest,
  SendMultipleMessagesRequest,
  SuccessErrorEnvelope,
  UNAUTHORIZED_RESPONSE
} from "../openapi.js";
const HUB_INSTANCE = "global";
async function pushMessage(c, message) {
  try {
    await c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE).notifyPlayer(
      message.ToPlayerId,
      NotificationType.MessageReceived,
      { ...message }
    );
    return true;
  } catch (err) {
    logger.error("failed to push MessageReceived notification", {
      notificationId: message.Id,
      toPlayerId: message.ToPlayerId,
      error: err instanceof Error ? err.message : String(err)
    });
    return false;
  }
}
async function notifyRelationship(c, playerId, rel) {
  try {
    await c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE).notifyPlayer(
      playerId,
      NotificationType.RelationshipChanged,
      { ...rel }
    );
  } catch (err) {
    logger.error("failed to push RelationshipChanged notification", {
      playerId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
async function notifyBoth(c, playerId, otherId, change) {
  if (!change.changed) return;
  await notifyRelationship(c, playerId, change.self);
  await notifyRelationship(c, otherId, change.other);
}
async function applyFlag(c, playerId, otherId, flag, value) {
  const rel = await setRelationshipFlag(c.env.DB, playerId, otherId, flag, value);
  await notifyRelationship(c, playerId, rel);
  return c.json({ Success: true, Message: "" });
}
async function targetPlayerId(c) {
  const fromQuery = c.req.query("playerId") ?? c.req.query("id");
  if (fromQuery !== void 0) {
    const n = Number.parseInt(fromQuery, 10);
    if (!Number.isNaN(n)) return n;
  }
  const contentType = c.req.header("content-type") ?? "";
  const body = contentType.includes("application/json") ? await c.req.json().catch(() => ({})) : await c.req.parseBody().catch(() => ({}));
  const raw = body.PlayerId ?? body.playerId ?? body.Id;
  if (typeof raw === "number") return Number.isNaN(raw) ? null : raw;
  if (typeof raw === "string") {
    const n = Number.parseInt(raw, 10);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}
const TARGET_PARAMS = [
  intQuery("id", "The other player. The client uses this form."),
  intQuery("playerId", "Accepted as an alias for `id`")
];
function friendMutation(summary, description) {
  return describeRoute({
    tags: ["Social"],
    summary,
    description,
    security: AUTHED,
    parameters: TARGET_PARAMS,
    responses: {
      200: json(RelationshipDto, "The relationship, from the caller\u2019s point of view"),
      400: json(ErrorResponse, "No target id, or the caller targeting themselves"),
      401: UNAUTHORIZED_RESPONSE
    }
  });
}
function flagToggle(summary, description) {
  return describeRoute({
    tags: ["Social"],
    summary,
    description,
    security: AUTHED,
    parameters: TARGET_PARAMS,
    responses: {
      200: json(AckResponse, "The ack; the relationship arrives over the notification hub"),
      400: json(ErrorResponse, "No target id, or the caller targeting themselves"),
      401: UNAUTHORIZED_RESPONSE
    }
  });
}
const socialRoutes = new Hono({ strict: false }).get(
  "/api/relationships/v2/get",
  describeRoute({
    tags: ["Social"],
    summary: "The caller\u2019s relationships",
    description: "Every relationship the signed-in player has, projected from their point of view \u2014 a bare array. `None` rows are included: that is how an unfriending, or an ignore/mute of someone you were never friends with, is recorded, and they still carry the caller\u2019s favorited/ignored/muted flags.",
    security: AUTHED,
    responses: {
      200: json(RelationshipDto.array(), "The caller\u2019s relationships"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json(await getRelationshipsForPlayer(c.env.DB, id));
  }
).get(
  "/api/relationships/mutualfriends",
  describeRoute({
    tags: ["Social"],
    summary: "Friends in common with another player",
    description: `The accounts the caller and \`id\` are both friends with \u2014 a bare array, ascending by account id and capped at ${MUTUAL_FRIENDS_LIMIT}. Only real friendships count; pending requests on either side are ignored.

Answers an empty array rather than an error for the degenerate cases: no target id, an id of 0 or below, or the caller asking for mutuals with themselves. Mutual ids with no account row are dropped, so the list can be shorter than the intersection.

Each entry is a trimmed account card. \`ProfileImage\` is an empty string, never null, when the account has no image.`,
    security: AUTHED,
    parameters: [intQuery("id", "The other player")],
    responses: {
      200: json(MutualFriendDto.array(), "The shared friends; empty when there are none"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const raw = c.req.query("id");
    const otherId = raw === void 0 ? Number.NaN : Number.parseInt(raw, 10);
    if (Number.isNaN(otherId) || otherId <= 0 || otherId === id) return c.json([]);
    const mutualIds = await getMutualFriendIds(c.env.DB, id, otherId);
    const accounts = await getAccountsByIds(c.env.DB, mutualIds);
    return c.json(
      accounts.map((a) => ({
        AccountId: a.accountId,
        Username: a.username,
        DisplayName: a.displayName,
        ProfileImage: a.profileImage ?? ""
      })).sort((a, b) => a.AccountId - b.AccountId)
    );
  }
).post(
  "/api/messages/v2/send",
  describeRoute({
    tags: ["Social"],
    summary: "Send a message to another player",
    description: "Pushes a `MessageReceived` notification to `ToPlayerId` carrying the message \u2014 the same frame the Coach broadcast sends (see the `notify` worker\u2019s `coachMessageAll`), except `FromPlayerId` is the caller rather than the Coach account and it goes to one player. The hub queues it when the recipient is offline, so it arrives on their next connect.\n\nPersisted first, then pushed from the stored record, so the frame carries the stored id and the recipient reads the same message back from `GET /api/messages/v2/get` whether or not the push reached them. The sender is the caller (from the bearer token), NOT a body field. `Type` is a Message-model type (a different enum from `NotificationType`) passed through unmapped, defaulting to 0; `Data` is the payload and is commonly empty.\n\nAnswers the same `{ success, error }` envelope as the report / warning writes, `error` an empty string on success. A hub failure is still reported honestly as a 500 with `success: false` \u2014 the message is in their inbox, but the caller asked to send one and nothing was delivered.",
    security: AUTHED,
    requestBody: form(SendMessageRequest, "The message"),
    responses: {
      200: json(SuccessErrorEnvelope, '`{ success: true, error: "" }`'),
      400: json(SuccessErrorEnvelope, "No `ToPlayerId` in the request"),
      401: UNAUTHORIZED_RESPONSE,
      500: json(SuccessErrorEnvelope, "The notifications hub could not be reached")
    }
  }),
  async (c) => {
    const fromPlayerId = await authedId(c);
    if (fromPlayerId === null) return unauthorized(c);
    const body = await c.req.parseBody().catch(() => ({}));
    const str = (v) => typeof v === "string" ? v : void 0;
    const toPlayerId = Number.parseInt(str(body.ToPlayerId) ?? "", 10);
    if (Number.isNaN(toPlayerId)) {
      return c.json({ success: false, error: "ToPlayerId is required" }, 400);
    }
    const message = await createNotification(c.env.DB, {
      FromPlayerId: fromPlayerId,
      ToPlayerId: toPlayerId,
      Type: Number.parseInt(str(body.Type) ?? "", 10) || 0,
      // `Data` stays a string, empty included — distinct from the null the types
      // carrying no payload of their own send.
      Data: str(body.Data) ?? ""
    });
    const delivered = await pushMessage(c, message);
    if (!delivered) {
      return c.json({ success: false, error: "Failed to deliver message" }, 500);
    }
    return c.json({ success: true, error: "" });
  }
).post(
  "/api/messages/v1/sendMultiple",
  describeRoute({
    tags: ["Social"],
    summary: "Send one message to several players",
    description: "The bulk form of `POST /api/messages/v2/send`: pushes the same `MessageReceived` frame to every id in `ToPlayerIds`, each addressed to its own recipient (`ToPlayerId` differs per frame \u2014 the payload is not shared). Same sender rule: the caller\u2019s bearer token, never a body field. Stored the same way too \u2014 one notification per recipient, each with its own id.\n\nThe body is JSON rather than the single send\u2019s form encoding, so `Type` is a number (still an unmapped Message-model type, defaulting to 0) and `Data` a string, commonly empty. Repeated ids are delivered once.\n\nAnswers the same `{ success, error }` envelope. Delivery is attempted for every recipient even after one fails, but a hub failure for ANY of them is reported honestly as a 500 \u2014 the envelope has no room to say which. Each recipient gets a stored notification of their own, with its own id, so an undelivered one is still waiting in that player\u2019s inbox.",
    security: AUTHED,
    requestBody: jsonBody(SendMultipleMessagesRequest, "The message and its recipients"),
    responses: {
      200: json(SuccessErrorEnvelope, '`{ success: true, error: "" }`'),
      400: json(SuccessErrorEnvelope, "No usable id in `ToPlayerIds`"),
      401: UNAUTHORIZED_RESPONSE,
      500: json(SuccessErrorEnvelope, "The notifications hub could not be reached")
    }
  }),
  async (c) => {
    const fromPlayerId = await authedId(c);
    if (fromPlayerId === null) return unauthorized(c);
    const body = await c.req.json().catch(() => ({}));
    const toPlayerIds = [
      ...new Set(
        (Array.isArray(body.ToPlayerIds) ? body.ToPlayerIds : []).map((v) => typeof v === "number" ? v : Number.parseInt(String(v), 10)).filter((n) => Number.isInteger(n) && n > 0)
      )
    ];
    if (toPlayerIds.length === 0) {
      return c.json({ success: false, error: "ToPlayerIds is required" }, 400);
    }
    const type = typeof body.Type === "number" ? body.Type : Number(body.Type) || 0;
    const data = typeof body.Data === "string" ? body.Data : "";
    const results = await Promise.all(
      toPlayerIds.map(
        async (toPlayerId) => pushMessage(
          c,
          await createNotification(c.env.DB, {
            FromPlayerId: fromPlayerId,
            ToPlayerId: toPlayerId,
            Type: type,
            Data: data
          })
        )
      )
    );
    if (results.includes(false)) {
      return c.json({ success: false, error: "Failed to deliver message" }, 500);
    }
    return c.json({ success: true, error: "" });
  }
).on(
  ["GET", "POST"],
  "/api/relationships/v2/sendfriendrequest",
  friendMutation(
    "Send a friend request",
    "Offer friendship to another player. Re-sending an outstanding request is a no-op and notifies nobody."
  ),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const target = await targetPlayerId(c);
    if (target === null || target === id) return c.json({ error: "invalid player id" }, 400);
    const change = await sendFriendRequest(c.env.DB, id, target);
    await notifyBoth(c, id, target, change);
    return c.json(change.self);
  }
).on(
  ["GET", "POST"],
  "/api/relationships/v2/acceptfriendrequest",
  friendMutation(
    "Accept a friend request",
    "Turn a pending incoming request into a friendship. Accepting nothing pending is a no-op and notifies nobody."
  ),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const target = await targetPlayerId(c);
    if (target === null || target === id) return c.json({ error: "invalid player id" }, 400);
    const change = await acceptFriendRequest(c.env.DB, id, target);
    await notifyBoth(c, id, target, change);
    return c.json(change.self);
  }
).on(
  ["GET", "POST"],
  "/api/relationships/v2/removefriend",
  friendMutation(
    "Unfriend, or cancel/decline a request",
    "All three are the same operation. The row is kept as a `None` relationship so the per-side favorited/ignored/muted flags survive."
  ),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const target = await targetPlayerId(c);
    if (target === null || target === id) return c.json({ error: "invalid player id" }, 400);
    const change = await removeFriend(c.env.DB, id, target);
    await notifyBoth(c, id, target, change);
    return c.json(change.self);
  }
).on(
  ["GET", "POST"],
  "/api/relationships/v2/addfriend",
  friendMutation(
    "Befriend directly",
    "Become friends with no pending-request step. Already being friends is a no-op."
  ),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const target = await targetPlayerId(c);
    if (target === null || target === id) return c.json({ error: "invalid player id" }, 400);
    const change = await addFriend(c.env.DB, id, target);
    await notifyBoth(c, id, target, change);
    return c.json(change.self);
  }
).on(
  ["GET", "POST"],
  "/api/relationships/v1/ignore",
  flagToggle(
    "Ignore a player",
    "Sets the caller\u2019s `ignored` flag. Ignoring someone you have no relationship with creates a bare (`None`) row to hold the flag."
  ),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const target = await targetPlayerId(c);
    if (target === null || target === id) return c.json({ error: "invalid player id" }, 400);
    return applyFlag(c, id, target, "ignored", true);
  }
).on(
  ["GET", "POST"],
  "/api/relationships/v1/unignore",
  flagToggle("Stop ignoring a player", "Clears the caller\u2019s `ignored` flag."),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const target = await targetPlayerId(c);
    if (target === null || target === id) return c.json({ error: "invalid player id" }, 400);
    return applyFlag(c, id, target, "ignored", false);
  }
).on(
  ["GET", "POST"],
  "/api/relationships/v1/mute",
  flagToggle(
    "Mute a player",
    "Sets the caller\u2019s `muted` flag. Like ignore, this works on a player you have no relationship with."
  ),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const target = await targetPlayerId(c);
    if (target === null || target === id) return c.json({ error: "invalid player id" }, 400);
    return applyFlag(c, id, target, "muted", true);
  }
).on(
  ["GET", "POST"],
  "/api/relationships/v1/unmute",
  flagToggle("Unmute a player", "Clears the caller\u2019s `muted` flag."),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const target = await targetPlayerId(c);
    if (target === null || target === id) return c.json({ error: "invalid player id" }, 400);
    return applyFlag(c, id, target, "muted", false);
  }
).on(
  ["GET", "POST"],
  "/api/relationships/v1/favorite",
  flagToggle(
    "Favorite a player",
    "Sets the caller\u2019s `favorited` flag \u2014 what pins a player to the top of their friends list. Works on a player you have no relationship with."
  ),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const target = await targetPlayerId(c);
    if (target === null || target === id) return c.json({ error: "invalid player id" }, 400);
    return applyFlag(c, id, target, "favorited", true);
  }
).on(
  ["GET", "POST"],
  "/api/relationships/v1/unfavorite",
  flagToggle("Unfavorite a player", "Clears the caller\u2019s `favorited` flag."),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const target = await targetPlayerId(c);
    if (target === null || target === id) return c.json({ error: "invalid player id" }, 400);
    return applyFlag(c, id, target, "favorited", false);
  }
).get(
  "/api/messages/v2/get",
  describeRoute({
    tags: ["Social"],
    summary: "Direct messages",
    description: "The caller\u2019s inbox \u2014 everything sent to them that they haven\u2019t deleted, newest first. The client reads this on login, which is what makes it the DURABLE half of a message: the `MessageReceived` frame the hub pushes is best-effort (dropped once sent rather than acked, bounded per player, and skipped whenever the hub believes it delivered), so a message that only ever existed as a frame could be lost with nothing left to show for it.\n\nEach entry is the same Message the frame carries, `Id` included and equal \u2014 one message, delivered twice, which is how the client recognises the two as the same.\n\nAuth-gated, unlike the empty list this used to answer: an inbox is the caller\u2019s own. Capped at the newest `MAX_NOTIFICATIONS_PER_PLAYER`, which is also what the store keeps \u2014 the client shows an inbox, not an archive.",
    security: AUTHED,
    responses: {
      200: json(MessageDto.array(), "The caller\u2019s messages, newest first"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json(await getNotificationsForPlayer(c.env.DB, id));
  }
).post(
  "/api/messages/v3/delete",
  describeRoute({
    tags: ["Social"],
    summary: "Delete messages",
    description: "Drops the given messages from the caller\u2019s inbox \u2014 the ids being the `Id` on each message `GET /api/messages/v2/get` served.\n\nScoped to the CALLER\u2019s inbox, not just to the ids: an id names a message globally, so matching on id alone would let anyone holding one clear somebody else\u2019s inbox. An id that isn\u2019t theirs, or is already gone, matches nothing \u2014 not an error, since the client removes its rows locally and re-reads the list either way.\n\nAuth-gated now that there is a store behind it. The ids arrive either as a bare JSON array or under `MessageIds`; both are read. Answered 200 with an empty body, which is what the client wants.",
    security: AUTHED,
    requestBody: jsonBody(DeleteMessagesRequest, "The messages to delete"),
    responses: {
      200: { description: "Accepted (empty body)" },
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const body = await c.req.json().catch(() => null);
    const raw = Array.isArray(body) ? body : Array.isArray(body?.MessageIds) ? body.MessageIds : [];
    const ids = raw.map((v) => typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN).filter((v) => Number.isInteger(v));
    await deleteNotifications(c.env.DB, id, ids);
    return c.body(null, 200);
  }
).post(
  "/api/messages/v1/friendOnlineStatus",
  describeRoute({
    tags: ["Social"],
    summary: "How many friends are online",
    description: "The caller\u2019s `Friend` relationships joined to live `presence`. Only unexpired presence counts, and friends in the lobby (no room instance) count too \u2014 they are signed in, just not in a room.\n\nA friend\u2019s `statusVisibility` is not consulted: nothing else in the stack filters presence on it, so hiding people here would disagree with the list the client renders underneath the count.\n\nA POST that takes no body \u2014 the player is the bearer token.",
    security: AUTHED,
    responses: {
      200: json(FriendOnlineCountResponse, "The caller\u2019s online-friend count"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json({
      success: true,
      value: { FriendsOnlineCount: await countOnlineFriends(c.env.DB, id) }
    });
  }
).get(
  "/api/messages/v1/favoriteFriendOnlineStatus",
  describeRoute({
    tags: ["Social"],
    summary: "Online status of favorited friends",
    description: "Presence for the caller\u2019s favorited friends. Presence lives in the `match` worker and is not joined in here yet, so this is an empty list.",
    responses: { 200: json(JsonArray, "An empty list") }
  }),
  (c) => c.json([])
);
export {
  socialRoutes
};
