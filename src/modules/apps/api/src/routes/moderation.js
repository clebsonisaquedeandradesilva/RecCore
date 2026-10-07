// Ported from apps/api/src/routes/moderation.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../../runtime/router.js";
import { describeRoute } from "../../../../../runtime/openapi.js";
import {
  canModerateRoom,
  deletePresence,
  getPlayerIdsInInstance,
  getPresences,
  getRoomById,
  getStoredRoomInstance,
  MessageType,
  refreshInstanceFullness
} from "../../../../packages/domain/src/index.js";
import { logger } from "../../../../packages/hono-helpers/src/index.js";
import { KickReportCategory } from "../../../notify/src/notification-payloads.js";
import { NotificationType } from "../../../notify/src/notification-types.js";
import { authedId, authedRoles, unauthorized } from "../http.js";
import {
  AUTHED,
  BareBoolean,
  CreateReportRequest,
  CreateWarningRequest,
  DeviceIdRequest,
  form,
  InstantKickRequest,
  json,
  JsonArray,
  jsonBody,
  ModerationBlockDetails,
  SuccessErrorEnvelope,
  UNAUTHORIZED_RESPONSE,
  VoteToKickReason,
  VoteToKickRequest
} from "../openapi.js";
import { createReport, getActiveBan } from "../reports-db.js";
import { createWarning } from "../warnings-db.js";
const MODERATOR_ROLES = /* @__PURE__ */ new Set(["moderator", "developer"]);
function formField(body, c, name) {
  const raw = body[name];
  if (typeof raw === "string" && raw !== "") return raw;
  return c.req.query(name) || void 0;
}
const asInt = (v) => {
  if (v === void 0) return null;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};
const asFloat = (v) => {
  if (v === void 0) return null;
  const n = Number.parseFloat(v);
  return Number.isNaN(n) ? null : n;
};
const VOTE_TO_KICK_REASONS = [
  { Reason: "Discriminatory language", ReportCategory: 102 },
  { Reason: "Discriminatory behavior", ReportCategory: 102 },
  { Reason: "Threats or encouraging suicide", ReportCategory: 102 },
  { Reason: "Toxic behavior", ReportCategory: 102 },
  { Reason: "Sexual behavior in public", ReportCategory: 101 },
  { Reason: "Sexual language in public", ReportCategory: 101 },
  { Reason: "Non-consensual sexual behavior", ReportCategory: 101 },
  { Reason: "Player in walls or floor", ReportCategory: 103 },
  { Reason: "Friendly fire", ReportCategory: 103 },
  { Reason: "Microphone spam", ReportCategory: 103 },
  { Reason: "Abusing bugs or exploits", ReportCategory: 103 },
  { Reason: "Spawn camping", ReportCategory: 103 },
  { Reason: "Inactive in games (AFK)", ReportCategory: 6 },
  { Reason: "Prefab swapping", ReportCategory: 6 },
  { Reason: "Not following game rules", ReportCategory: 6 }
];
const HUB_INSTANCE = "global";
async function pushInstantKick(c, playerIds, gameSessionId, roomName, moderatorId) {
  const frame = {
    ReportCategory: KickReportCategory.Moderator,
    Duration: 0,
    GameSessionId: gameSessionId,
    IsHostKick: true,
    Message: `You have been kicked from ${roomName}.`,
    PlayerIdReporter: moderatorId,
    IsBan: false,
    IsVoiceModAutoban: false,
    IsWarning: false,
    VoteKickReason: "",
    TimeoutStartedAt: null
  };
  try {
    await c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE).notifyPlayersEphemeral(
      playerIds,
      NotificationType.ModerationKick,
      { ...frame }
    );
  } catch (err) {
    logger.error("failed to push ModerationKick notification", {
      playerIds,
      gameSessionId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
const voteToKickData = (data) => JSON.stringify(data);
async function pushVoteToKick(c, message) {
  try {
    await c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE).notifyPlayerEphemeral(
      message.ToPlayerId,
      NotificationType.MessageReceived,
      message
    );
    return true;
  } catch (err) {
    logger.error("failed to push VoteToKick MessageReceived notification", {
      toPlayerId: message.ToPlayerId,
      error: err instanceof Error ? err.message : String(err)
    });
    return false;
  }
}
const PERMANENT_BAN_DURATION = 2147483647;
const NOT_BLOCKED = {
  ReportCategory: -1,
  Duration: 0,
  GameSessionId: 0,
  IsHostKick: false,
  Message: null,
  PlayerIdReporter: null,
  IsBan: false,
  IsVoiceModAutoban: false,
  IsDeviceBan: false,
  IsWarning: false,
  VoteKickReason: null,
  TimeoutStartedAt: null,
  AssociatedAccountUsername: null,
  ShowCreatorCodeOfConduct: false,
  TopMessageOverride: null,
  BottomMessageOverride: null
};
function banBlockDetails(ban) {
  const startedAt = Date.parse(ban.created_at);
  const duration = ban.ban_expires === null ? PERMANENT_BAN_DURATION : Math.max(1, Math.ceil((Date.parse(ban.ban_expires) - startedAt) / 1e3));
  return {
    ...NOT_BLOCKED,
    ReportCategory: ban.report_category,
    Duration: duration,
    IsBan: true,
    Message: "Rule violation",
    TimeoutStartedAt: ban.created_at
  };
}
const moderationRoutes = new Hono({ strict: false }).on(
  ["GET", "POST"],
  "/api/PlayerReporting/v1/moderationBlockDetails",
  describeRoute({
    tags: ["Moderation"],
    summary: "Whether the caller is blocked",
    description: "Ban / timeout / host-kick state for the caller. The one block this server hands out is the account-wide ban \u2014 a `report` row with `banned` set, the same row matchmake refuses on (login still issues a token, so the client can reach this screen) \u2014 so a caller with one in force gets `IsBan: true`, the `ReportCategory` the report was filed under, the fixed `Message` \u201CRule violation\u201D, and the block\u2019s span as the pair the client reads them as: `TimeoutStartedAt` is the report\u2019s `created_at` and `Duration` the seconds from there to `ban_expires` (2147483647, the int32 max, for a permanent ban). `PlayerIdReporter` stays null: it names a kicking host, and the reporter is not shown to the player they reported. Only the caller\u2019s own account is consulted, not the ban-evasion arms.\n\nEveryone else gets the reference server\u2019s stub \u201Cnot blocked\u201D answer: `ReportCategory` is `Unknown` (-1) rather than 0, which is a real category, and `Message` is null rather than the empty string that stub sends \u2014 the client distinguishes \u201Cno message\u201D from a blank one. `IsVoiceModAutoban` and `TimeoutStartedAt` are on the DTO but unset by that stub, so they carry their defaults, as do the seven keys past the stub\u2019s nine that the 2025 client\u2019s decoder names (`IsDeviceBan`, `IsWarning`, `VoteKickReason`, `AssociatedAccountUsername`, `ShowCreatorCodeOfConduct`, `TopMessageOverride`, `BottomMessageOverride`) \u2014 block kinds and screen dressings this server never uses. Answers GET or POST: the newer client POSTs it with no body.",
    security: AUTHED,
    responses: {
      200: json(ModerationBlockDetails, "The caller\u2019s block, or \u201Cnot blocked\u201D"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const ban = await getActiveBan(c.env.DB, id);
    return c.json(ban ? banBlockDetails(ban) : NOT_BLOCKED);
  }
).get(
  "/api/PlayerReporting/v1/voteToKickReasons",
  describeRoute({
    tags: ["Moderation"],
    summary: "Vote-to-kick reasons",
    description: "The reasons offered when starting a vote-to-kick, each with the `ReportCategory` the report is filed under if the vote carries: 102 hate, 101 sexual content, 103 griefing, 6 game conduct. A fixed list, in the order the client renders it.",
    security: AUTHED,
    responses: {
      200: json(VoteToKickReason.array(), "The reasons, in render order"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json(VOTE_TO_KICK_REASONS);
  }
).post(
  "/api/PlayerReporting/v1/referee",
  describeRoute({
    tags: ["Moderation"],
    summary: "Whether the caller is a referee",
    description: "A bare JSON `false` \u2014 no envelope. The game client asks this to decide whether to run its referee moderation flow. Always false: the referee program is switched off here rather than unimplemented, since this server is archival.",
    responses: { 200: json(BareBoolean, "Always `false` \u2014 the program is off") }
  }),
  (c) => c.json(false)
).get(
  "/api/referee/files",
  describeRoute({
    tags: ["Moderation"],
    summary: "Referee case files",
    description: "The moderation cases assigned to the caller as a referee. Always empty \u2014 the referee program is switched off here (see `/api/PlayerReporting/v1/referee`), so nothing is ever assigned.",
    responses: { 200: json(JsonArray, "An empty list \u2014 no cases are ever assigned") }
  }),
  (c) => c.json([])
).post(
  "/api/PlayerReporting/v1/hile",
  describeRoute({
    tags: ["Moderation"],
    summary: "Report submission sink",
    description: "A player report. Nothing stores reports, so this accepts whatever it is sent and answers a bare `false`.",
    responses: { 200: json(BareBoolean, "A bare JSON `false`") }
  }),
  (c) => c.json(false)
).post(
  "/api/PlayerReporting/v3/create",
  describeRoute({
    tags: ["Moderation"],
    summary: "Submit a player report",
    description: "Records a player report in the `report` table; nothing dedupes the rows. A report is filed unbanned \u2014 a moderator converts one into an account-wide ban by setting `banned` on the row, which is what matchmaking refuses on and what `moderationBlockDetails` describes to the banned player.\n\nThe reporter is the caller (from the bearer token), NOT a body field. Only `PlayerIdReported` is required; the client omits whatever it has no value for (a report raised outside a room carries no `RoomId`), and those are stored as NULL. `ReportCategory` and `RoomInstanceType` are stored verbatim \u2014 neither enum is mapped here. A `RoomId` of 0 or below means \u201Cno room\u201D.\n\nAnswers the real service\u2019s `{ success, error }` envelope, where `error` is an empty string rather than null. The rejected branch uses the same envelope so the client only ever parses one shape.",
    security: AUTHED,
    requestBody: form(CreateReportRequest, "The report"),
    responses: {
      200: json(SuccessErrorEnvelope, '`{ success: true, error: "" }`'),
      400: json(SuccessErrorEnvelope, "No `PlayerIdReported` in the request"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const reporterId = await authedId(c);
    if (reporterId === null) return unauthorized(c);
    const body = await c.req.parseBody().catch(() => ({}));
    const reportedPlayerId = asInt(formField(body, c, "PlayerIdReported"));
    if (reportedPlayerId === null) {
      return c.json({ success: false, error: "PlayerIdReported is required" }, 400);
    }
    const roomId = asInt(formField(body, c, "RoomId"));
    await createReport(c.env.DB, {
      reporterPlayerId: reporterId,
      reportedPlayerId,
      reportCategory: asInt(formField(body, c, "ReportCategory")) ?? 0,
      details: formField(body, c, "Details") ?? null,
      heightReporter: asFloat(formField(body, c, "HeightReporter")),
      heightReported: asFloat(formField(body, c, "HeightReported")),
      roomId: roomId !== null && roomId > 0 ? roomId : null,
      roomInstanceType: formField(body, c, "RoomInstanceType") ?? null
    });
    return c.json({ success: true, error: "" });
  }
).post(
  "/api/PlayerReporting/v3/voteToKick",
  describeRoute({
    tags: ["Moderation"],
    summary: "Call a vote to kick a player",
    description: 'Puts a vote-to-kick to the room instance. Open to any player \u2014 no role is required \u2014 but BOTH the caller and `PlayerId` must have a live `presence` row in the instance `GameSessionId` names, or the call is refused with a 403. That is the whole gate: without it a client could raise a vote in a session it is not in, or against a player who is not there.\n\nEveryone else in that instance \u2014 the player being voted on included, since a vote is called in front of them \u2014 gets a `MessageReceived` frame carrying a Message of type 5 (`VoteToKick`). The caller is left out: they have voted already, and their own `Response` is what they posted.\n\n`Data` is an ESCAPED JSON STRING \u2014 `"{\\"PlayerId\\":\\"205\\",\u2026}"`, not a nested object. A Message\u2019s `Data` is a string on the wire, and an object there fails the client\u2019s decoder outright (`expected:\'String Begin Token\', actual:\'{\'`), aborting the notification rather than dropping the field. Inside it, `PlayerId` is the account id as a STRING, as the reference relays it, and `Response` is empty \u2014 the frame is the question, not an answer.\n\nThe frames are EPHEMERAL: a vote belongs to the moment it was called, so an offline player gets nothing rather than a prompt about a dead session on their next connect.\n\nNothing is stored \u2014 no tally, no report row, and `Reason` is accepted and unused. Answers the same lowercase `{ success, error }` envelope as the report write; a hub failure for any recipient is reported honestly as a 500, since with nothing behind it the frame is the whole delivery.',
    security: AUTHED,
    requestBody: form(VoteToKickRequest, "The vote"),
    responses: {
      200: json(SuccessErrorEnvelope, '`{ success: true, error: "" }`'),
      400: json(SuccessErrorEnvelope, "No `PlayerId` or no `GameSessionId`"),
      401: UNAUTHORIZED_RESPONSE,
      403: json(SuccessErrorEnvelope, "Either player is not in that game session"),
      500: json(SuccessErrorEnvelope, "The notifications hub could not be reached")
    }
  }),
  async (c) => {
    const voterId = await authedId(c);
    if (voterId === null) return unauthorized(c);
    const body = await c.req.parseBody().catch(() => ({}));
    const playerIdField = formField(body, c, "PlayerId");
    const playerId = asInt(playerIdField);
    if (playerIdField === void 0 || playerId === null) {
      return c.json({ success: false, error: "PlayerId is required" }, 400);
    }
    const gameSessionId = asInt(formField(body, c, "GameSessionId"));
    if (gameSessionId === null) {
      return c.json({ success: false, error: "GameSessionId is required" }, 400);
    }
    const presences = await getPresences(c.env.DB, [
      voterId,
      playerId
    ]);
    const isHere = (id) => presences.get(id)?.roomInstance?.roomInstanceId === gameSessionId;
    if (!isHere(voterId)) {
      return c.json({ success: false, error: "You are not in that game session!" }, 403);
    }
    if (!isHere(playerId)) {
      return c.json({ success: false, error: "That player is not in that game session!" }, 403);
    }
    const audience = (await getPlayerIdsInInstance(c.env.DB, gameSessionId)).filter(
      (id) => id !== voterId
    );
    const results = await Promise.all(
      audience.map(
        (toPlayerId) => pushVoteToKick(c, {
          FromPlayerId: voterId,
          ToPlayerId: toPlayerId,
          Type: MessageType.VoteToKick,
          // An escaped JSON STRING, not a nested object — see VoteToKickData.
          Data: voteToKickData({
            PlayerId: playerIdField,
            Response: "",
            GameSessionId: gameSessionId
          })
        })
      )
    );
    if (results.includes(false)) {
      return c.json({ success: false, error: "Failed to deliver vote" }, 500);
    }
    return c.json({ success: true, error: "" });
  }
).post(
  "/api/PlayerReporting/v1/instantKick",
  describeRoute({
    tags: ["Moderation"],
    summary: "Kick players out of a room instance",
    description: "Ejects the named players from one live room instance. `GameSessionId` is that instance (`roomInstanceId`); the body is JSON, unlike the form posts elsewhere in this controller.\n\nGated to the instance\u2019s room: the caller must be its creator or hold a role of Moderator (20) or above on it \u2014 anyone else with a valid token gets a 403. Nobody who can moderate the room can be kicked out of it, and a caller cannot kick themselves.\n\nA player is only kicked if their live `presence` row puts them in **that** instance. Anyone else named \u2014 offline, or standing in another room \u2014 is skipped in silence, so naming an account id cannot reach into a session the caller has no authority over.\n\nEach kicked player loses their presence row (they read offline at once and the instance frees a slot) and gets a `ModerationKick` frame (id 22) \u2014 the frame the client acts on to leave. It is the same frame a room ban sends, but `IsBan` is false: this only removes them from the session they are in, and nothing stops them rejoining. The frame is EPHEMERAL \u2014 a kick is true of the moment it happened, and queueing one would eject the player from an unrelated session on their next connect.\n\nAnswers the same lowercase `{ success, error }` envelope the report write uses, and says nothing about who was actually kicked \u2014 the response shape is unverified against the real service.",
    security: AUTHED,
    requestBody: jsonBody(InstantKickRequest, "The instance and the players to eject"),
    responses: {
      200: json(SuccessErrorEnvelope, '`{ success: true, error: "" }`'),
      400: json(SuccessErrorEnvelope, "Unparseable body, no `GameSessionId` or no `PlayerIds`"),
      401: UNAUTHORIZED_RESPONSE,
      403: json(SuccessErrorEnvelope, "The caller cannot moderate the instance\u2019s room"),
      404: json(SuccessErrorEnvelope, "No such game session")
    }
  }),
  async (c) => {
    const moderatorId = await authedId(c);
    if (moderatorId === null) return unauthorized(c);
    const body = await c.req.json().catch(() => null);
    if (body === null) return c.json({ success: false, error: "Invalid request body" }, 400);
    const gameSessionId = typeof body.GameSessionId === "number" ? body.GameSessionId : Number.NaN;
    if (!Number.isInteger(gameSessionId)) {
      return c.json({ success: false, error: "GameSessionId is required" }, 400);
    }
    const playerIds = Array.isArray(body.PlayerIds) ? body.PlayerIds.filter((id) => Number.isInteger(id)) : [];
    if (playerIds.length === 0) {
      return c.json({ success: false, error: "PlayerIds is required" }, 400);
    }
    const instance = await getStoredRoomInstance(c.env.DB, gameSessionId);
    const room = instance && await getRoomById(c.env.DB, instance.roomId);
    if (!room) return c.json({ success: false, error: "This game session does not exist!" }, 404);
    if (!canModerateRoom(room, moderatorId)) {
      return c.json({ success: false, error: "Forbidden" }, 403);
    }
    const presences = await getPresences(c.env.DB, playerIds);
    const kicked = [];
    for (const playerId of playerIds) {
      if (playerId === moderatorId || canModerateRoom(room, playerId)) continue;
      if (presences.get(playerId)?.roomInstance?.roomInstanceId !== gameSessionId) continue;
      await deletePresence(c.env.DB, playerId);
      kicked.push(playerId);
    }
    if (kicked.length > 0) {
      await refreshInstanceFullness(c.env.DB, gameSessionId);
      const roomName = typeof room.Name === "string" ? room.Name : "this room";
      await pushInstantKick(c, kicked, gameSessionId, roomName, moderatorId);
    }
    return c.json({ success: true, error: "" });
  }
).post(
  "/api/playerwarnings",
  describeRoute({
    tags: ["Moderation"],
    summary: "Issue a player warning",
    description: "Records a moderator-issued warning in the `warning` table \u2014 an append-only log like `report`; nothing dispatches the warning to the player or acts on the rows yet.\n\n**Staff only.** The token must carry the `moderator` or `developer` role (granted per account by the operator, see the admin CLI\u2019s `grant-moderator` / `grant-developer`); a valid token with neither gets a 403. The acting moderator is the caller, NOT a body field.\n\nOnly `WarnedPlayerId` is required; the rest are stored as NULL when absent. `ReportCategory` is stored verbatim \u2014 the enum is not mapped here. `DisplayReason` is what the warned player would be shown; `ModeratorNote` is internal and never surfaced to them.\n\nAnswers the same `{ success, error }` envelope as the report write, with `error` an empty string rather than null \u2014 including on the rejected branches, so there is only one shape to parse.",
    security: AUTHED,
    requestBody: form(CreateWarningRequest, "The warning"),
    responses: {
      200: json(SuccessErrorEnvelope, '`{ success: true, error: "" }`'),
      400: json(SuccessErrorEnvelope, "No `WarnedPlayerId` in the request"),
      401: UNAUTHORIZED_RESPONSE,
      403: json(SuccessErrorEnvelope, "A valid token with neither staff role")
    }
  }),
  async (c) => {
    const moderatorId = await authedId(c);
    if (moderatorId === null) return unauthorized(c);
    const roles = await authedRoles(c);
    if (!roles?.some((role) => MODERATOR_ROLES.has(role))) {
      return c.json({ success: false, error: "Forbidden" }, 403);
    }
    const body = await c.req.parseBody().catch(() => ({}));
    const warnedPlayerId = asInt(formField(body, c, "WarnedPlayerId"));
    if (warnedPlayerId === null) {
      return c.json({ success: false, error: "WarnedPlayerId is required" }, 400);
    }
    await createWarning(c.env.DB, {
      moderatorPlayerId: moderatorId,
      warnedPlayerId,
      reportCategory: asInt(formField(body, c, "ReportCategory")) ?? 0,
      displayReason: formField(body, c, "DisplayReason") ?? null,
      moderatorNote: formField(body, c, "ModeratorNote") ?? null
    });
    return c.json({ success: true, error: "" });
  }
).post(
  "/api/PlayerReporting/v1/deviceId",
  describeRoute({
    tags: ["Moderation"],
    summary: "Device id rotation (known broken)",
    description: "The client reporting its device id, rotating from the one it thinks we hold to the current one. It carries no bearer token and fires *before* account creation, so there is no caller to attribute the id to and nothing to store it against \u2014 we accept it and drop it.\n\n**Known broken.** No response shape found so far keeps the client happy: it hangs during account creation with nothing in the logs. The real service answers a `{ success, error }` envelope; we currently answer an empty array, which does not help either. The workaround is to disable the device-id check client-side (see [recnet-plugin](https://github.com/djdevin/recnet-plugin)).",
    requestBody: form(DeviceIdRequest, "The id rotation"),
    responses: {
      200: json(JsonArray, "An empty array \u2014 see the note above; this is not the real shape")
    }
  }),
  (c) => c.json([])
);
export {
  moderationRoutes
};
