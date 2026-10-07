// Ported from apps/match/src/match.app.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../runtime/router.js";
import { describeRoute, openAPIRouteHandler } from "../../../../runtime/openapi.js";
import { useWorkersLogger } from "../../../../runtime/logger.js";
import {
  Accessibility,
  areFriends,
  canManageRoom,
  countOnlinePlayers,
  createRoomInstance,
  createRoomInvite,
  deleteEmptyRoomInstances,
  deleteExpiredPresence,
  deletePresence,
  GAME_VERSION,
  getAccount,
  getClubSummary,
  getExpiredPresenceInstanceIds,
  getFriendIds,
  getJoinableInstance,
  deleteRoomInvite,
  getLatestRoomInviteBetween,
  getMostActiveClubhouses,
  getOrCreateDormRoom,
  getPresence,
  getPresences,
  getRoomById,
  getRoomByName,
  getRoomInstance,
  getRoomInstancesByRoom,
  getRoomInvite,
  getRoomInstanceSummariesByRoom,
  getStoredRoomInstance,
  InviteMode,
  isClubMember,
  isPlayerBannedFromRoom,
  MatchmakingErrorCode,
  MessageType,
  MOST_ACTIVE_CLUBHOUSE_LIMIT,
  recordRoomVisit,
  recordStat,
  refreshInstanceFullness,
  RoomInstanceType,
  setPresence,
  setRoomInstanceInProgress,
  setRoomInstancePrivate,
  subRoomDataBlob
} from "../../../packages/domain/src/index.js";
import { logger, withCleanSpec, withNotFound, withOnError } from "../../../packages/hono-helpers/src/index.js";
import { generatePhotonAuthToken, validateAndGetAccountId, validateAndGetVersion } from "../../../packages/jwt/src/index.js";
import { banEvasionMatch, resolveBan } from "../../api/src/bans-db.js";
import { getEventById, getEventResponse } from "../../api/src/events-db.js";
import { NotificationType } from "../../notify/src/notification-types.js";
import {
  ActiveClubhouseDto,
  AUTHED,
  AvoidJuniorsRequest,
  AvoidJuniorsResponse,
  ConnectionInfoResponse,
  CorrelationIdRequest,
  EMPTY_OK,
  ExclusiveLoginResponse,
  form,
  InProgressRequest,
  InstanceIdResponse,
  InviteRequest,
  InviteResponse,
  JoinModeRequest,
  json,
  jsonBody,
  LoginLockRequest,
  MatchmakeResponse,
  MatchmakeRoomRequest,
  MatchmakeRoomV2Request,
  MatchmakeV2Response,
  NotifyDisconnectRequest,
  PlayerDto,
  QosRegion,
  RoomInstanceDto,
  RoomInstanceSummaryDto,
  StatusVisibilityRequest,
  UNAUTHORIZED_RESPONSE
} from "./openapi.js";
const NULL_CONNECTION_INFO = {
  photonAuthToken: null,
  photonRealtimeAppId: null,
  photonVoiceAppId: null,
  photonChatAppId: null,
  photonRegion: null,
  photonRoomId: null,
  voiceConnectionInfo: null,
  voiceServerId: null,
  experiments: null
};
const DEFAULT_PHOTON_REGION = "us";
function varOr(value, fallback) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}
function photonApps(env) {
  return {
    photonRealtimeAppId: varOr(env.PHOTON_REALTIME_APP_ID, ""),
    photonVoiceAppId: varOr(env.PHOTON_VOICE_APP_ID, ""),
    photonChatAppId: varOr(env.PHOTON_CHAT_APP_ID, ""),
    photonRegion: instancePhotonRegion(env)
  };
}
function instancePhotonRegion(env) {
  return varOr(env.PHOTON_REGION, DEFAULT_PHOTON_REGION);
}
function tachyonPool(env) {
  return varOr(env.TACHYON_HOST_PORT, "").split(",").map((entry) => entry.trim()).filter((entry) => entry !== "").map((hostPort, i) => ({ hostPort, serverId: `tachyon-${i + 1}` }));
}
const NO_TACHYON_SERVER = { hostPort: "", serverId: "" };
function tachyonServerFor(env, roomInstanceId) {
  const pool = tachyonPool(env);
  if (pool.length === 0 || roomInstanceId <= 0) return NO_TACHYON_SERVER;
  return pool[roomInstanceId % pool.length] ?? NO_TACHYON_SERVER;
}
const PHOTON_EXPERIMENTS = {
  networkTransformSyncInterval: 10,
  shouldUseUnreliableOnChange: false,
  shouldAvoidDiscontinuityRPCs: true,
  shouldAvoidRedundantDiscontinuity: false,
  r2RuntimeStaticBaking: true,
  r2AutoEmbodiment: true,
  r2RuntimeStaticBakingMinShapeThreshold: 1,
  r2UseCheapReplicas: true,
  shouldUseGameServerNetworking: false
};
const QOS_REGIONS = [
  { id: "us-west1", address: "34.169.254.144:50000" },
  { id: "europe-west1", address: "35.205.141.119:50000" },
  { id: "asia-northeast1", address: "35.200.67.228:50000" },
  { id: "us-east1", address: "34.73.244.122:50000" },
  { id: "us-central1", address: "34.69.179.51:50000" },
  { id: "northamerica-northeast1", address: "34.152.4.100:50000" }
];
function playerPayload(playerId, presence, callerVersion2) {
  return {
    // The stored row is authoritative — for the caller it was just synced from their
    // token, and for anyone else the caller's token says nothing. `callerVersion` only
    // covers the caller having no presence row at all (they aren't in a room yet), where
    // the alternative is reporting a build nobody is running.
    appVersion: presence?.appVersion || callerVersion2 || GAME_VERSION,
    deviceClass: presence?.deviceClass ?? 0,
    errorCode: 0,
    // `getPresence` yields null and the batch map yields undefined — neither is online.
    isOnline: presence != null,
    playerId,
    roomInstance: presence?.roomInstance ?? null,
    statusVisibility: presence?.statusVisibility ?? 0,
    vrMovementMode: presence?.vrMovementMode ?? 1,
    platform: presence?.platform ?? 0,
    ...NULL_CONNECTION_INFO
  };
}
async function authedId(c) {
  return validateAndGetAccountId(c.req.raw, await c.env.JWT_SECRET.get());
}
function unauthorized(c) {
  return c.body(null, 401);
}
async function callerVersion(c) {
  return validateAndGetVersion(c.req.raw, await c.env.JWT_SECRET.get());
}
async function callerGameVersion(c) {
  return await callerVersion(c) ?? GAME_VERSION;
}
const AVOID_JUNIORS_KEY = "avoidJuniors";
function normalizeSettingKey(key) {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}
function findAvoidJuniorsKey(stored) {
  const wanted = normalizeSettingKey(AVOID_JUNIORS_KEY);
  return Object.keys(stored).find((key) => normalizeSettingKey(key) === wanted);
}
function parseSettingBool(value) {
  if (typeof value === "boolean") return value;
  switch (String(value).trim().toLowerCase()) {
    case "true":
    case "1":
    case "yes":
      return true;
    case "false":
    case "0":
    case "no":
      return false;
    default:
      return void 0;
  }
}
async function getPlayerSettings(env, accountId) {
  return env.RECFLARE_PLAYER_SETTINGS.get(
    `player:${accountId}`,
    "json"
  ).catch(() => null);
}
async function readAvoidJuniors(env, accountId) {
  const stored = await getPlayerSettings(env, accountId);
  if (!stored) return false;
  const key = findAvoidJuniorsKey(stored);
  return key === void 0 ? false : parseSettingBool(stored[key]) ?? false;
}
async function writeAvoidJuniors(env, accountId, value) {
  const stored = await getPlayerSettings(env, accountId) ?? {};
  const merged = { ...stored };
  merged[findAvoidJuniorsKey(merged) ?? AVOID_JUNIORS_KEY] = value ? "True" : "False";
  await env.RECFLARE_PLAYER_SETTINGS.put(`player:${accountId}`, JSON.stringify(merged));
}
async function readAvoidJuniorsBody(c) {
  const contentType = c.req.header("content-type") ?? "";
  const body = contentType.includes("application/json") ? await c.req.json().catch(() => null) : await c.req.parseBody().catch(() => null);
  if (body === null || typeof body !== "object") return void 0;
  const key = findAvoidJuniorsKey(body);
  return key === void 0 ? void 0 : parseSettingBool(body[key]);
}
const PRESENCE_REFRESH_THRESHOLD = 300;
const DEFAULT_GET_PLAYER = [{ ...playerPayload(1), isOnline: true }];
function redactInstanceForPresence(instance) {
  return {
    roomInstanceId: instance.roomInstanceId,
    roomId: instance.roomId,
    subRoomId: instance.subRoomId,
    roomInstanceType: instance.roomInstanceType,
    location: instance.location,
    // Blanked — see above: never hand another player the join coordinates.
    dataBlob: "",
    eventId: instance.eventId,
    clubId: instance.clubId,
    roomCode: instance.roomCode,
    photonRegionId: instance.photonRegionId,
    photonRoomId: "",
    name: instance.name,
    maxCapacity: instance.maxCapacity,
    isFull: instance.isFull,
    isPrivate: instance.isPrivate,
    isInProgress: instance.isInProgress,
    EncryptVoiceChat: instance.EncryptVoiceChat
  };
}
function presenceUpdateMessage(playerId, instance, appVersion) {
  return {
    playerId,
    statusVisibility: 0,
    deviceClass: 0,
    vrMovementMode: 0,
    roomInstance: instance ? redactInstanceForPresence(instance) : null,
    isOnline: instance != null,
    // The build the SUBJECT is running, off the presence row their own token wrote —
    // this frame describes them to their friends, so GAME_VERSION would report this
    // server's build as theirs.
    appVersion: appVersion || GAME_VERSION
  };
}
async function notifyFriendsPresence(c, playerId) {
  try {
    const friendIds = await getFriendIds(c.env.DB, playerId);
    if (friendIds.length === 0) return;
    const presence = await getPresence(c.env.DB, playerId);
    await c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE).notifyPlayersEphemeral(
      friendIds,
      NotificationType.SubscriptionUpdatePresence,
      presenceUpdateMessage(playerId, presence?.roomInstance ?? null, presence?.appVersion)
    );
  } catch (err) {
    logger.error("failed to push SubscriptionUpdatePresence to friends", {
      playerId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
async function enterRoom(c, id, roomInstance) {
  const prev = await getPresence(c.env.DB, id);
  const account = prev ? null : await getAccount(c.env.DB, id);
  await setPresence(c.env.DB, {
    accountId: id,
    roomInstance,
    statusVisibility: prev?.statusVisibility ?? 0,
    deviceClass: prev?.deviceClass ?? account?.deviceClass ?? 0,
    vrMovementMode: prev?.vrMovementMode ?? 1,
    platform: prev?.platform ?? account?.platform ?? 0,
    // The token's build wins over the stored one: the token belongs to the session
    // making this call, while `prev` can be a row left by an earlier session on an
    // older build.
    appVersion: await callerVersion(c) ?? prev?.appVersion ?? GAME_VERSION,
    // Carry the session lock recorded at login forward, so matchmake doesn't wipe it
    // and the heartbeat can keep verifying against it.
    loginLock: prev?.loginLock
  });
  try {
    await recordRoomVisit(c.env.DB, roomInstance.roomId);
  } catch (err) {
    logger.error("failed to record room visit", {
      roomId: roomInstance.roomId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
  await refreshInstanceFullness(c.env.DB, roomInstance.roomInstanceId);
  const leftId = prev?.roomInstance?.roomInstanceId;
  if (leftId != null && leftId !== roomInstance.roomInstanceId) {
    await refreshInstanceFullness(c.env.DB, leftId);
  }
  await notifyFriendsPresence(c, id);
}
const NO_SUCH_ROOM = MatchmakingErrorCode.NoSuchRoom;
const BANNED_FROM_ROOM = MatchmakingErrorCode.BannedFromRoom;
function crossBuildRefusal(callerVersion2, instanceVersion) {
  if (callerVersion2 === instanceVersion) return null;
  return instanceVersion > callerVersion2 ? MatchmakingErrorCode.UpdateRequired : NO_SUCH_ROOM;
}
const BUILD_2023 = 20230414;
const MIN_UNLOADABLE_PERSISTENCE_VERSION_2023 = 227;
function subRoomPersistenceVersion(sub) {
  const save = sub?.CurrentSave;
  if (save && typeof save === "object") {
    const v = save.PersistenceVersion;
    if (typeof v === "number") return v;
  }
  return typeof sub?.PersistenceVersion === "number" ? sub.PersistenceVersion : null;
}
function persistenceVersionRefusal(room, callerVersion2) {
  if (buildNumber(callerVersion2) !== BUILD_2023) return null;
  const subRooms = Array.isArray(room.SubRooms) ? room.SubRooms : [];
  const tooNew = subRooms.some((sub) => {
    const v = subRoomPersistenceVersion(sub);
    return v !== null && v >= MIN_UNLOADABLE_PERSISTENCE_VERSION_2023;
  });
  return tooNew ? MatchmakingErrorCode.UpdateRequired : null;
}
const EVENT_IS_PRIVATE = MatchmakingErrorCode.EventIsPrivate;
const HUB_INSTANCE = "global";
function nextLiveMessageId() {
  return Date.now();
}
const GAME_INVITE_V2_MIN_BUILD = 20230414;
function buildNumber(version) {
  const date = Number.parseInt(version?.split(".")[0] ?? "", 10);
  return Number.isNaN(date) ? null : date;
}
async function gameInviteType(c) {
  const build = buildNumber(await callerVersion(c));
  return build !== null && build >= GAME_INVITE_V2_MIN_BUILD ? MessageType.GameInviteV2 : MessageType.GameInvite;
}
const GAME_INVITE_V2_INVITE_MODE = InviteMode.PlayTogether;
function gameInviteData(type, target) {
  if (type !== MessageType.GameInviteV2) return target.instanceId;
  return JSON.stringify({
    InviteId: target.inviteId,
    Name: target.name,
    InviteMode: GAME_INVITE_V2_INVITE_MODE
  });
}
async function sendGameInvite(c, fromId, toId, target, type) {
  const message = {
    Id: nextLiveMessageId(),
    FromPlayerId: fromId,
    ToPlayerId: toId,
    Type: type,
    Data: gameInviteData(type, target),
    SentTime: (/* @__PURE__ */ new Date()).toISOString(),
    RoomId: target.roomId
  };
  try {
    await c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE).notifyPlayer(
      toId,
      NotificationType.MessageReceived,
      message
    );
  } catch (err) {
    logger.error("failed to push game-invite MessageReceived notification", {
      fromPlayerId: fromId,
      toPlayerId: toId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
const ORIENTATION_INSTANCE_ID = -2;
const NO_INSTANCE = 0;
function instanceFieldsFromRoom(room, subRoomId) {
  const subRooms = Array.isArray(room.SubRooms) ? room.SubRooms : [];
  const sub = (subRoomId === void 0 ? void 0 : subRooms.find((s) => s.SubRoomId === subRoomId)) ?? subRooms[0];
  const str = (v, fallback = "") => typeof v === "string" ? v : fallback;
  const num = (v, fallback) => typeof v === "number" ? v : fallback;
  const rawName = str(room.Name, "Room");
  const name = rawName.startsWith("^") || rawName.startsWith("@") ? rawName : `^${rawName}`;
  return {
    roomId: num(room.RoomId, 1),
    subRoomId: num(sub?.SubRoomId, 1),
    location: str(sub?.UnitySceneId),
    // Always the PUBLISHED save. A creator who wants their unpublished work is offered
    // the choice client-side from the `/subrooms/{id}/saves` list — matchmaking is not
    // involved, and serving a staged blob here would put two people in one instance on
    // different versions.
    dataBlob: subRoomDataBlob(sub),
    name,
    maxCapacity: num(sub?.MaxPlayers, 4),
    roomInstanceType: room.IsDorm === true ? RoomInstanceType.Dormroom : RoomInstanceType.Public,
    isDorm: room.IsDorm === true
  };
}
function roomInstanceFromRoom(env, room, isPrivate, instanceId, photonRoomId, subRoomId) {
  const f = instanceFieldsFromRoom(room, subRoomId);
  const region = instancePhotonRegion(env);
  return {
    roomInstanceId: instanceId,
    roomId: f.roomId,
    subRoomId: f.subRoomId,
    roomInstanceType: f.roomInstanceType,
    location: f.location,
    dataBlob: f.dataBlob,
    eventId: 0,
    clubId: 0,
    roomCode: "",
    photonRegion: region,
    photonRegionId: region,
    photonRoomId,
    name: f.name,
    maxCapacity: f.maxCapacity,
    isFull: false,
    isPrivate: isPrivate || f.isDorm,
    isInProgress: false,
    EncryptVoiceChat: false
  };
}
const EMPTY_CORRELATION_ID = "00000000-0000-0000-0000-000000000000";
async function readRequestFields(c) {
  const empty = {};
  if ((c.req.header("content-type") ?? "").includes("application/json")) {
    const parsed = await c.req.json().catch(() => null);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : empty;
  }
  return await c.req.parseBody({ all: true }).catch(() => empty);
}
function field(fields, name) {
  const key = Object.keys(fields).find((k) => k.toLowerCase() === name.toLowerCase());
  const value = key === void 0 ? void 0 : fields[key];
  return Array.isArray(value) ? value[0] : value;
}
function fieldString(fields, name) {
  const value = field(fields, name);
  return typeof value === "string" && value ? value : void 0;
}
function fieldInt(fields, name) {
  const value = field(fields, name);
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : void 0;
  if (typeof value !== "string") return void 0;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isNaN(parsed) ? void 0 : parsed;
}
async function readCorrelationId(c) {
  const posted = fieldString(await readRequestFields(c), "CorrelationId");
  if (posted !== void 0) return posted;
  const queried = c.req.query("CorrelationId") ?? c.req.query("correlationId");
  return queried || EMPTY_CORRELATION_ID;
}
const DEFAULT_MATCHMAKING_POLICY = 0;
function toV2RoomInstance(instance) {
  return {
    RoomInstanceId: instance.roomInstanceId,
    RoomId: instance.roomId,
    SubRoomId: instance.subRoomId,
    Location: instance.location,
    EventId: instance.eventId,
    ClubId: instance.clubId,
    RoomCode: instance.roomCode,
    Name: instance.name,
    MaxCapacity: instance.maxCapacity,
    IsFull: instance.isFull,
    IsPrivate: instance.isPrivate,
    IsInProgress: instance.isInProgress,
    EncryptVoiceChat: instance.EncryptVoiceChat,
    RoomInstanceType: instance.roomInstanceType,
    MatchmakingPolicy: DEFAULT_MATCHMAKING_POLICY
  };
}
const PASCAL_CASE_MATCHMAKE_PATHS = ["/matchmake/v2/", "/matchmake/invite/"];
async function matchmakeResult(c, errorCode, roomInstance) {
  const correlationId = await readCorrelationId(c);
  if (PASCAL_CASE_MATCHMAKE_PATHS.some((prefix) => c.req.path.startsWith(prefix))) {
    return c.json({
      ErrorCode: errorCode,
      CorrelationId: correlationId,
      RoomInstance: roomInstance === null ? null : toV2RoomInstance(roomInstance)
    });
  }
  return c.json({
    errorCode,
    result: errorCode,
    roomInstance,
    correlationId
  });
}
async function readLoginLock(c) {
  return fieldString(await readRequestFields(c), "LoginLock");
}
async function readJoinMode(c) {
  return fieldInt(await readRequestFields(c), "JoinMode") ?? 0;
}
async function readMatchmakeBody(c) {
  const body = await readRequestFields(c);
  const joinMode = fieldInt(body, "JoinMode") ?? 0;
  const key = Object.keys(body).find((k) => k.toLowerCase() === "additionalplayerids");
  const raw = key === void 0 ? null : body[key];
  const values = Array.isArray(raw) ? raw : raw === null || raw === void 0 ? [] : [raw];
  const additionalPlayerIds = [
    ...new Set(
      values.map(
        (v) => typeof v === "number" ? Math.trunc(v) : typeof v === "string" ? Number.parseInt(v.trim(), 10) : Number.NaN
      ).filter((n) => Number.isFinite(n) && n > 0)
    )
  ];
  return { joinMode, additionalPlayerIds };
}
async function inviteParty(c, leaderId, playerIds, instance) {
  const type = await gameInviteType(c);
  await Promise.all(
    playerIds.filter((pid) => pid !== leaderId).map(async (pid) => {
      const invite = await createRoomInvite(c.env.DB, leaderId, pid, instance.roomId);
      if (invite === null) {
        logger.error("failed to record party room invite", {
          fromPlayerId: leaderId,
          toPlayerId: pid,
          roomId: instance.roomId
        });
        return;
      }
      const target = {
        instanceId: String(instance.roomInstanceId),
        roomId: instance.roomId,
        name: instance.name,
        inviteId: invite.RoomInviteId
      };
      await sendGameInvite(c, leaderId, pid, target, type);
    })
  );
}
function roomRedirects(env) {
  const map = /* @__PURE__ */ new Map();
  if (typeof env.ROOM_REDIRECTS !== "string") return map;
  for (const pair of env.ROOM_REDIRECTS.split(",")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const from = Number(pair.slice(0, eq).trim());
    const to = pair.slice(eq + 1).trim();
    if (!Number.isInteger(from) || to === "") continue;
    map.set(from, to);
  }
  return map;
}
async function substituteRoom(c, room, subRoomId) {
  const fromId = typeof room.RoomId === "number" ? room.RoomId : NaN;
  const to = roomRedirects(c.env).get(fromId);
  if (to === void 0) return { room, subRoomId };
  const toId = Number.parseInt(to, 10);
  const target = Number.isNaN(toId) ? await getRoomByName(c.env.DB, to) : await getRoomById(c.env.DB, toId);
  if (!target) {
    logger.warn("room redirect target not found; entering the requested room", {
      roomId: fromId,
      target: to
    });
    return { room, subRoomId };
  }
  logger.info("room redirected", { roomId: fromId, target: to });
  return { room: target, subRoomId: void 0 };
}
async function resolveRoomInstance(c, roomKey, isPrivate, ownerId, requestedSubRoomId) {
  const id = Number.parseInt(roomKey, 10);
  const requested = Number.isNaN(id) ? await getRoomByName(c.env.DB, roomKey) : await getRoomById(c.env.DB, id);
  if (!requested) return { instance: null, errorCode: NO_SUCH_ROOM };
  const { room, subRoomId } = await substituteRoom(c, requested, requestedSubRoomId);
  const f = instanceFieldsFromRoom(room, subRoomId);
  if (await isPlayerBannedFromRoom(c.env.DB, f.roomId, ownerId)) {
    logger.info("matchmake refused: player banned from room", { roomId: f.roomId, ownerId });
    return { instance: null, errorCode: BANNED_FROM_ROOM };
  }
  const tokenVersion = await callerVersion(c);
  const tooNew = persistenceVersionRefusal(room, tokenVersion);
  if (tooNew !== null) {
    logger.info("matchmake refused: room persistence version too new for client build", {
      roomId: f.roomId,
      ownerId,
      gameVersion: tokenVersion
    });
    return { instance: null, errorCode: tooNew };
  }
  const currentInstanceId = isPrivate ? void 0 : (await getPresence(c.env.DB, ownerId))?.roomInstance?.roomInstanceId;
  const gameVersion = tokenVersion ?? GAME_VERSION;
  let instance = isPrivate ? null : await getJoinableInstance(c.env.DB, f.roomId, gameVersion, f.subRoomId, currentInstanceId);
  if (!instance) {
    instance = await createRoomInstance(c.env.DB, {
      ownerAccountId: ownerId,
      roomId: f.roomId,
      subRoomId: f.subRoomId,
      location: f.location,
      dataBlob: f.dataBlob,
      photonRoomId: crypto.randomUUID(),
      name: f.name,
      maxCapacity: f.maxCapacity,
      isPrivate: isPrivate || f.isDorm,
      roomInstanceType: f.roomInstanceType,
      gameVersion
    });
  }
  return {
    instance: roomInstanceFromRoom(
      c.env,
      room,
      isPrivate,
      instance.roomInstanceId,
      instance.photonRoomId,
      f.subRoomId
    ),
    errorCode: MatchmakingErrorCode.Success
  };
}
async function matchmakeIntoRoom(c) {
  const id = await authedId(c);
  if (id === null) return unauthorized(c);
  const { joinMode, additionalPlayerIds } = await readMatchmakeBody(c);
  const rawSubRoomId = c.req.param("subRoomId");
  const subRoomId = rawSubRoomId === void 0 ? void 0 : Number.parseInt(rawSubRoomId, 10);
  const { instance, errorCode } = await resolveRoomInstance(
    c,
    c.req.param("roomId") ?? "",
    joinMode === 2,
    id,
    subRoomId
  );
  if (!instance) return matchmakeResult(c, errorCode, null);
  await enterRoom(c, id, instance);
  await inviteParty(c, id, additionalPlayerIds, instance);
  return matchmakeResult(c, 0, instance);
}
async function playerDormInstance(c, accountId) {
  const room = await getOrCreateDormRoom(c.env.DB, accountId);
  const f = instanceFieldsFromRoom(room);
  const gameVersion = await callerGameVersion(c);
  let instance = (await getRoomInstancesByRoom(c.env.DB, f.roomId, gameVersion))[0];
  if (!instance) {
    instance = await createRoomInstance(c.env.DB, {
      ownerAccountId: accountId,
      roomId: f.roomId,
      subRoomId: f.subRoomId,
      location: f.location,
      dataBlob: f.dataBlob,
      photonRoomId: crypto.randomUUID(),
      name: f.name,
      maxCapacity: f.maxCapacity,
      isPrivate: true,
      roomInstanceType: f.roomInstanceType,
      gameVersion
    });
  }
  return roomInstanceFromRoom(c.env, room, true, instance.roomInstanceId, instance.photonRoomId);
}
const app = new Hono().use(
  "*",
  // middleware
  (c, next) => useWorkersLogger(c.env.NAME, {
    environment: c.env.ENVIRONMENT,
    release: c.env.SENTRY_RELEASE
  })(c, next)
).use("/matchmake/*", async (c, next) => {
  const id = await authedId(c);
  if (id !== null) {
    const match = await resolveBan(c.env.DB, id, {
      identity: { ip: c.req.header("cf-connecting-ip") },
      arms: banEvasionMatch(c.env.BAN_EVASION_MATCH)
    });
    if (match) {
      logger.info("matchmake refused: player banned", {
        accountId: id,
        via: match.via,
        bannedAccountId: match.bannedAccountId,
        path: c.req.path
      });
      return matchmakeResult(c, BANNED_FROM_ROOM, null);
    }
  }
  await next();
}).onError(withOnError()).notFound(withNotFound()).post(
  "/player/login",
  describeRoute({
    tags: ["Presence"],
    summary: "Record the session login lock",
    description: [
      "Records the posted `LoginLock` in the player\u2019s presence so later heartbeats can",
      "verify they still own the session. Updates the live presence row if there is one,",
      "otherwise seeds a lobby presence (no room) carrying the lock. Empty ack."
    ].join(" "),
    requestBody: form(LoginLockRequest, "The session LoginLock GUID"),
    responses: { 200: EMPTY_OK }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id !== null) {
      const loginLock = await readLoginLock(c);
      if (loginLock !== void 0) {
        const presence = await getPresence(c.env.DB, id);
        if (presence) {
          presence.loginLock = loginLock;
          await setPresence(c.env.DB, presence);
        } else {
          const account = await getAccount(c.env.DB, id);
          await setPresence(c.env.DB, {
            accountId: id,
            roomInstance: null,
            statusVisibility: 0,
            deviceClass: account?.deviceClass ?? 0,
            vrMovementMode: 1,
            platform: account?.platform ?? 0,
            appVersion: await callerVersion(c) ?? GAME_VERSION,
            loginLock
          });
        }
      }
    }
    return c.body(null, 200);
  }
).post(
  "/player/exclusivelogin",
  describeRoute({
    tags: ["Presence"],
    summary: "Exclusive-login ack (no-op)",
    description: [
      "Player exclusive login. Carries the session `LoginLock` (as every presence",
      "lifecycle call does) but is currently a no-op ack. @todo implement login locking."
    ].join(" "),
    requestBody: form(LoginLockRequest, "The session LoginLock GUID"),
    responses: { 200: json(ExclusiveLoginResponse, "errorCode 0") }
  }),
  (c) => c.json({ errorCode: 0 })
).post(
  "/player/logout",
  describeRoute({
    tags: ["Presence"],
    summary: "Clear presence on logout",
    description: [
      "Clears the player\u2019s presence so they read offline immediately and the instance",
      "they were in frees up. Carries the session `LoginLock` (as every presence",
      "lifecycle call does). EXCEPTION: a logout whose presence still points at the",
      "Orientation seed (instance -2) is left as a no-op, so the account-creation",
      "bootstrap isn\u2019t wiped. An unauthenticated logout is also a no-op."
    ].join(" "),
    requestBody: form(LoginLockRequest, "The session LoginLock GUID"),
    responses: { 200: EMPTY_OK }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id !== null) {
      const presence = await getPresence(c.env.DB, id);
      const instanceId = presence?.roomInstance?.roomInstanceId;
      if (presence && instanceId !== ORIENTATION_INSTANCE_ID) {
        await deletePresence(c.env.DB, id);
        if (instanceId != null) await refreshInstanceFullness(c.env.DB, instanceId);
        await notifyFriendsPresence(c, id);
      }
    }
    return c.body(null, 200);
  }
).post(
  "/player/notifydisconnect",
  describeRoute({
    tags: ["Presence"],
    summary: "Photon disconnect notification",
    description: [
      "Posted by Photon when it sees a player drop a room instance (form body",
      "`PlayerId`/`RoomInstanceId`). Currently just logged and acked \u2014 presence is cleared",
      "by logout and otherwise expires on its TTL \u2014 but the hook is here for a future check."
    ].join(" "),
    requestBody: form(
      NotifyDisconnectRequest,
      "The disconnecting player and the instance they left"
    ),
    responses: { 200: EMPTY_OK }
  }),
  async (c) => {
    const body = await c.req.parseBody().catch(() => ({}));
    const parseId = (v) => {
      const n = typeof v === "string" ? Number.parseInt(v, 10) : NaN;
      return Number.isNaN(n) ? null : n;
    };
    logger.info("player disconnect notification", {
      playerId: parseId(body.PlayerId),
      roomInstanceId: parseId(body.RoomInstanceId)
    });
    return c.body(null, 200);
  }
).get(
  "/tachyon",
  describeRoute({
    tags: ["Presence"],
    summary: "The room instance a player is in",
    description: [
      "The `roomInstanceId` from a player\u2019s live presence (`?id=123`), as a BARE NUMBER \u2014",
      "the whole body is the id, not an object around it. The single field out of what",
      "`/player` serves whole.",
      "",
      "0 means not in an instance: no live presence, an expired row, or no usable `id`. A",
      "real instance id is never 0, so the sentinel can\u2019t collide with one. Synthetic ids",
      "pass through as they stand \u2014 -2 is the Orientation presence the `auth` worker seeds",
      "a brand-new player with.",
      "",
      "Ungated: the player is named by the query rather than by a token, so anyone may ask",
      "about anyone. It discloses an instance id and nothing else."
    ].join(" "),
    parameters: [
      {
        name: "id",
        in: "query",
        required: false,
        description: "The account to look up. Absent or unparseable answers 0",
        schema: { type: "integer" }
      }
    ],
    responses: { 200: json(InstanceIdResponse, "The instance id, or 0") }
  }),
  async (c) => {
    const playerId = Number.parseInt(c.req.query("id") ?? "", 10);
    if (!Number.isInteger(playerId)) return c.json(NO_INSTANCE);
    const presence = await getPresence(c.env.DB, playerId);
    return c.json(presence?.roomInstance?.roomInstanceId ?? NO_INSTANCE);
  }
).get(
  "/clubhousesearch/mostactivenow",
  describeRoute({
    tags: ["Presence"],
    summary: "The busiest clubhouses right now",
    description: [
      "One row per clubhouse with players in it this second, busiest first \u2014 a bare array",
      "of `{ RoomId, ClubId, PlayerCount }`.",
      "",
      "Live presence FILTERS here rather than merely ranking: a club whose clubhouse is",
      "empty is absent rather than listed with a `PlayerCount` of 0, and a club with no",
      "clubhouse can never appear at all, so this is `[]` when nobody is anywhere. Public,",
      "non-subscription clubs only \u2014 the same eligibility `clubs` `/club/search` applies,",
      `since this is a search too. Ties break on ClubId, and at most ${MOST_ACTIVE_CLUBHOUSE_LIMIT} rows`,
      "come back: it fills a carousel, not a directory.",
      "",
      "Ungated \u2014 nothing in the answer is per-caller."
    ].join(" "),
    responses: { 200: json(ActiveClubhouseDto.array(), "The busiest clubhouses, or []") }
  }),
  async (c) => c.json(await getMostActiveClubhouses(c.env.DB))
).get(
  "/player",
  describeRoute({
    tags: ["Presence"],
    summary: "Batch player presence lookup",
    description: [
      "Returns each requested player\u2019s presence. `id` is a repeated query param",
      "(`?id=2&id=155&id=153`) \u2014 one value each, not comma-separated. With no ids, serves",
      "a single default (online) player."
    ].join(" "),
    parameters: [
      {
        name: "id",
        in: "query",
        required: false,
        description: "Repeated once per player id (`?id=2&id=155`); not comma-separated",
        schema: { type: "array", items: { type: "string" } }
      }
    ],
    responses: { 200: json(PlayerDto.array(), "One entry per requested player") }
  }),
  async (c) => {
    const ids = c.req.queries("id")?.map((s) => Number.parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
    if (!ids || ids.length === 0) return c.json(DEFAULT_GET_PLAYER);
    const presences = await getPresences(c.env.DB, ids);
    return c.json(ids.map((playerId) => playerPayload(playerId, presences.get(playerId))));
  }
).post(
  "/player/heartbeat",
  describeRoute({
    tags: ["Presence"],
    summary: "Presence heartbeat",
    description: [
      "Returns the player\u2019s current presence payload without mutating any stored fields \u2014",
      "the only side effect is refreshing the row\u2019s TTL, and even that only when the TTL",
      "is close to lapsing so a still player isn\u2019t written on every beat. The posted",
      "`LoginLock` is verified against the one recorded at login: a heartbeat carrying a",
      "different lock is a superseded session and gets an empty body. With no stored",
      "presence the player isn\u2019t in a room yet (roomInstance null, isOnline false)."
    ].join(" "),
    security: AUTHED,
    requestBody: form(LoginLockRequest, "The session LoginLock GUID (verified, not stored)"),
    responses: {
      200: json(PlayerDto, "The player\u2019s current presence payload"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const postedLock = await readLoginLock(c);
    const version = await callerVersion(c);
    const presence = await getPresence(c.env.DB, id);
    if (presence) {
      if (postedLock !== void 0 && presence.loginLock !== void 0 && presence.loginLock !== postedLock) {
        return c.body(null, 200);
      }
      const versionChanged = version !== null && presence.appVersion !== version;
      if (versionChanged) presence.appVersion = version;
      const nowSeconds = Math.floor(Date.now() / 1e3);
      if (versionChanged || presence.expiresAt - nowSeconds <= PRESENCE_REFRESH_THRESHOLD) {
        await setPresence(c.env.DB, presence);
      }
    }
    return c.json(playerPayload(id, presence, version));
  }
).put(
  "/player/statusvisibility",
  describeRoute({
    tags: ["Presence"],
    summary: "Set status visibility",
    description: [
      "Updates the stored presence\u2019s status visibility. No-op when the player has no live",
      "presence or an unauthenticated/invalid token \u2014 always acks 200."
    ].join(" "),
    requestBody: form(StatusVisibilityRequest, "The statusVisibility value"),
    responses: { 200: EMPTY_OK }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id !== null) {
      const body = await c.req.parseBody().catch(() => ({}));
      const sv = typeof body.statusVisibility === "string" ? Number.parseInt(body.statusVisibility, 10) : NaN;
      const presence = await getPresence(c.env.DB, id);
      if (presence && !Number.isNaN(sv)) {
        presence.statusVisibility = sv;
        await setPresence(c.env.DB, presence);
      }
    }
    return c.body(null, 200);
  }
).get(
  "/player/avoidjuniors",
  describeRoute({
    tags: ["Player settings"],
    summary: "The player\u2019s \u201Cavoid juniors\u201D preference",
    description: [
      "Whether the authenticated player asked to be kept away from junior accounts, read",
      "from their settings map in the `playersettings` KV. The body is a bare JSON boolean",
      "(`true`/`false`), not an envelope. A player who never set it reads `false`."
    ].join(" "),
    security: AUTHED,
    responses: {
      200: json(AvoidJuniorsResponse, "The preference; `false` when never set"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json(await readAvoidJuniors(c.env, id));
  }
).put(
  "/player/avoidjuniors",
  describeRoute({
    tags: ["Player settings"],
    summary: "Set the player\u2019s \u201Cavoid juniors\u201D preference",
    description: [
      "Stores the posted preference in the authenticated player\u2019s settings map (the",
      "`playersettings` KV) and answers the resulting value as a bare JSON boolean. The",
      "write merges, so the player\u2019s other settings are left alone. A body with no readable",
      "`avoidJuniors` value leaves the setting as it was and answers the stored value \u2014 a",
      "no-op 200, not a 400."
    ].join(" "),
    security: AUTHED,
    requestBody: form(AvoidJuniorsRequest, "The preference to store"),
    responses: {
      200: json(AvoidJuniorsResponse, "The preference now stored"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const posted = await readAvoidJuniorsBody(c);
    if (posted === void 0) return c.json(await readAvoidJuniors(c.env, id));
    await writeAvoidJuniors(c.env, id, posted);
    return c.json(posted);
  }
).post(
  "/matchmake/club/:clubId{[0-9]+}",
  describeRoute({
    tags: ["Navigation"],
    summary: "Matchmake into a club\u2019s clubhouse",
    description: [
      "Looks the club up, checks the caller is a member of it, and places them into an",
      "instance of its clubhouse room. Returns errorCode 20 with a null instance when the",
      "club is unknown, has no clubhouse set, or the caller isn\u2019t a member \u2014 and errorCode",
      "55 when they are banned from the clubhouse room."
    ].join(" "),
    security: AUTHED,
    requestBody: form(JoinModeRequest, "Optional JoinMode"),
    parameters: [
      {
        name: "clubId",
        in: "path",
        required: true,
        description: "Club id (digits only)",
        schema: { type: "string", pattern: "^[0-9]+$" }
      }
    ],
    responses: {
      200: json(
        MatchmakeResponse,
        "The clubhouse instance (or a null instance with errorCode 20 / 55 when it can\u2019t be entered)"
      ),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const clubId = Number.parseInt(c.req.param("clubId"), 10);
    const club = await getClubSummary(c.env.DB, clubId);
    if (!club?.clubhouseRoomId) return matchmakeResult(c, NO_SUCH_ROOM, null);
    if (!await isClubMember(c.env.DB, clubId, id)) {
      return matchmakeResult(c, NO_SUCH_ROOM, null);
    }
    const joinMode = await readJoinMode(c);
    const { instance, errorCode } = await resolveRoomInstance(
      c,
      String(club.clubhouseRoomId),
      joinMode === 2,
      id
    );
    if (!instance) return matchmakeResult(c, errorCode, null);
    await enterRoom(c, id, instance);
    return matchmakeResult(c, 0, instance);
  }
).post(
  "/matchmake/event/:eventId{[0-9]+}",
  describeRoute({
    tags: ["Navigation"],
    summary: "Matchmake into a player event",
    description: [
      "Places the caller into an instance of the event\u2019s room \u2014 its subroom too, when the",
      "event pins one. Who may join: anyone, if the event is Public (1) or Unlisted (2),",
      "since unlisted only keeps an event out of the listings rather than closing it; and",
      "otherwise only the event\u2019s creator or a player who has been invited to it (any",
      "`event_attendee` row, whatever their answer \u2014 being able to decline and change your",
      "mind is the point). Everyone else gets errorCode 35 (EventIsPrivate) with a null",
      "instance; an unknown event is the opaque errorCode 20, and 55 when the caller is",
      "banned from the room the event runs in.",
      "",
      "The event\u2019s start and end times are NOT enforced \u2014 the reference has codes for",
      "both (4 EventNotStarted, 5 EventAlreadyFinished) but nothing here has been observed",
      "sending them, and locking a creator out of their own room before the hour would be",
      "worse than letting people in early."
    ].join(" "),
    security: AUTHED,
    requestBody: form(MatchmakeRoomRequest, "Optional JoinMode and AdditionalPlayerIds"),
    parameters: [
      {
        name: "eventId",
        in: "path",
        required: true,
        description: "Player event id (digits only)",
        schema: { type: "string", pattern: "^[0-9]+$" }
      }
    ],
    responses: {
      200: json(
        MatchmakeResponse,
        "The event\u2019s instance (or a null instance with errorCode 20 / 35 / 55)"
      ),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const eventId = Number.parseInt(c.req.param("eventId"), 10);
    const event = await getEventById(c.env.DB, eventId);
    if (event === null) return matchmakeResult(c, NO_SUCH_ROOM, null);
    const open = event.Accessibility === Accessibility.Public || event.Accessibility === Accessibility.Unlisted;
    if (!open && event.CreatorPlayerId !== id && await getEventResponse(c.env.DB, eventId, id) === null) {
      logger.info("matchmake refused: not invited to private event", { eventId, id });
      return matchmakeResult(c, EVENT_IS_PRIVATE, null);
    }
    const { joinMode, additionalPlayerIds } = await readMatchmakeBody(c);
    const { instance, errorCode } = await resolveRoomInstance(
      c,
      String(event.RoomId),
      joinMode === 2,
      id,
      event.SubRoomId ?? void 0
    );
    if (!instance) return matchmakeResult(c, errorCode, null);
    await enterRoom(c, id, instance);
    await inviteParty(c, id, additionalPlayerIds, instance);
    return matchmakeResult(c, 0, instance);
  }
).post(
  "/matchmake/player/:playerId{[0-9]+}",
  describeRoute({
    tags: ["Navigation"],
    summary: "Follow a friend into their room",
    description: [
      "Places the caller into the room instance the target player is currently in, read",
      "from the target\u2019s stored presence. FRIENDS ONLY: the caller must be a mutual friend",
      "of the target (otherwise anyone could read a player\u2019s presence and warp to them).",
      "Returns errorCode 20 with a null instance when the target isn\u2019t a friend, is the",
      "caller themselves, or isn\u2019t currently in a room, and errorCode 55 when the caller is",
      "banned from the room the friend is in \u2014 this path hands out join coordinates without",
      "going through the room resolver, so it carries its own ban check."
    ].join(" "),
    security: AUTHED,
    requestBody: form(CorrelationIdRequest, "The attempt\u2019s CorrelationId"),
    parameters: [
      {
        name: "playerId",
        in: "path",
        required: true,
        description: "The friend to follow (digits only)",
        schema: { type: "string", pattern: "^[0-9]+$" }
      }
    ],
    responses: {
      200: json(
        MatchmakeResponse,
        "The friend\u2019s instance (or a null instance with errorCode 20 / 55 when it can\u2019t be joined)"
      ),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const targetId = Number.parseInt(c.req.param("playerId"), 10);
    if (targetId === id || !await areFriends(c.env.DB, id, targetId)) {
      return matchmakeResult(c, NO_SUCH_ROOM, null);
    }
    const targetPresence = await getPresence(c.env.DB, targetId);
    const instance = targetPresence?.roomInstance ?? null;
    if (!instance) return matchmakeResult(c, NO_SUCH_ROOM, null);
    if (await isPlayerBannedFromRoom(c.env.DB, instance.roomId, id)) {
      logger.info("follow refused: player banned from room", { roomId: instance.roomId, id });
      return matchmakeResult(c, BANNED_FROM_ROOM, null);
    }
    const followed = crossBuildRefusal(
      await callerGameVersion(c),
      targetPresence?.appVersion ?? GAME_VERSION
    );
    if (followed !== null) {
      logger.info("follow refused: friend is on another client build", {
        roomInstanceId: instance.roomInstanceId,
        targetId,
        id
      });
      return matchmakeResult(c, followed, null);
    }
    await enterRoom(c, id, instance);
    return matchmakeResult(c, 0, instance);
  }
).post(
  "/matchmake/v2/player/:playerId{[0-9]+}",
  describeRoute({
    tags: ["Navigation", "2025"],
    summary: "Join the player who invited you (v2)",
    description: [
      "Places the caller into the room instance the target player is currently in, read from",
      "the target\u2019s stored presence. INVITEES ONLY: the caller must hold a `room_invite` row",
      "FROM the target (as `POST /invite` writes them) \u2014 the newer client redeems an invite by",
      "its sender when the frame carries no usable `RoomInviteId`. The invite is SINGLE-USE:",
      "a successful join deletes the row, so the same invite can\u2019t be redeemed again into",
      "wherever that player goes next (a refusal leaves it standing, so a retry still works).",
      "Answers 40",
      "(RoomInviteExpired) when no invite stands (expiry deletes rows, so \u201Cnever invited\u201D and",
      "\u201Cexpired\u201D are one answer), 2 (PlayerNotOnline) when the target isn\u2019t in a room, 17",
      "(AlreadyInTargetInstance) when the caller is already standing there, 3",
      "(InsufficientSpace) when it filled up, and 55 (BannedFromRoom) when the caller is",
      "banned from that room.",
      "",
      "2025-client route: it answers the PascalCase `ErrorCode`/`RoomInstance` envelope, as",
      "the other `/matchmake/v2/*` routes do."
    ].join(" "),
    security: AUTHED,
    requestBody: form(CorrelationIdRequest, "The attempt\u2019s CorrelationId"),
    parameters: [
      {
        name: "playerId",
        in: "path",
        required: true,
        description: "The player to join (digits only)",
        schema: { type: "string", pattern: "^[0-9]+$" }
      }
    ],
    responses: {
      200: json(
        MatchmakeV2Response,
        "The target\u2019s instance, or a null RoomInstance with the refusal code"
      ),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const targetId = Number.parseInt(c.req.param("playerId"), 10);
    const invite = await getLatestRoomInviteBetween(c.env.DB, targetId, id);
    if (invite === null) {
      logger.info("v2 player matchmake refused: no invite from target", { targetId, id });
      return matchmakeResult(c, MatchmakingErrorCode.RoomInviteExpired, null);
    }
    const targetPresence = await getPresence(c.env.DB, targetId);
    const instance = targetPresence?.roomInstance ?? null;
    if (!instance) {
      logger.info("v2 player matchmake refused: target is not in a room", { targetId, id });
      return matchmakeResult(c, MatchmakingErrorCode.PlayerNotOnline, null);
    }
    const own = await getPresence(c.env.DB, id);
    if (own?.roomInstance?.roomInstanceId === instance.roomInstanceId) {
      return matchmakeResult(c, MatchmakingErrorCode.AlreadyInTargetInstance, null);
    }
    if (await isPlayerBannedFromRoom(c.env.DB, instance.roomId, id)) {
      logger.info("v2 player matchmake refused: player banned from room", {
        roomId: instance.roomId,
        id
      });
      return matchmakeResult(c, BANNED_FROM_ROOM, null);
    }
    const refusal = crossBuildRefusal(
      await callerGameVersion(c),
      targetPresence?.appVersion ?? GAME_VERSION
    );
    if (refusal !== null) {
      logger.info("v2 player matchmake refused: target is on another client build", {
        roomInstanceId: instance.roomInstanceId,
        targetId,
        id
      });
      return matchmakeResult(c, refusal, null);
    }
    if (await refreshInstanceFullness(c.env.DB, instance.roomInstanceId) === true) {
      logger.info("v2 player matchmake refused: instance is full", {
        roomInstanceId: instance.roomInstanceId,
        id
      });
      return matchmakeResult(c, MatchmakingErrorCode.InsufficientSpace, null);
    }
    await enterRoom(c, id, instance);
    await deleteRoomInvite(c.env.DB, invite.RoomInviteId);
    return matchmakeResult(c, MatchmakingErrorCode.Success, instance);
  }
).post(
  "/matchmake/invite/:inviteId{[0-9]+}",
  describeRoute({
    tags: ["Navigation", "2025"],
    summary: "Accept a game invite",
    description: [
      "Places the caller into the room instance the INVITER is currently in, resolved from",
      "the `room_invite` row named by `roomInviteId` and the inviter\u2019s live presence (not the",
      "invite\u2019s stored `RoomId`, which records where they were when they sent it).",
      "",
      "ADDRESSEE ONLY: the caller must be the invite\u2019s `ToPlayerId`, or it answers 76",
      "(InstanceJoinNotPermitted) \u2014 the id is a small integer held by another player, so an",
      "ungated form of this would be a way into any private instance. Answers 40",
      "(RoomInviteExpired) for an invite that isn\u2019t there any more, 2 (PlayerNotOnline) when",
      "the inviter isn\u2019t in a room, 17 (AlreadyInTargetInstance) when the caller is already",
      "standing in it, 3 (InsufficientSpace) when it filled up, and 55 (BannedFromRoom) when",
      "the caller is banned from the room they\u2019d be joining.",
      "",
      "2025-client route: it answers the PascalCase `ErrorCode`/`RoomInstance` envelope, as",
      "the `/matchmake/v2/*` routes do, and has no older lowercase spelling."
    ].join(" "),
    security: AUTHED,
    requestBody: form(CorrelationIdRequest, "The attempt\u2019s CorrelationId"),
    parameters: [
      {
        name: "inviteId",
        in: "path",
        required: true,
        description: "The `RoomInviteId` from `POST /invite` (digits only)",
        schema: { type: "string", pattern: "^[0-9]+$" }
      }
    ],
    responses: {
      200: json(
        MatchmakeV2Response,
        "The inviter\u2019s instance, or a null instance with the refusal code"
      ),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const inviteId = Number.parseInt(c.req.param("inviteId"), 10);
    const invite = await getRoomInvite(c.env.DB, inviteId);
    if (invite === null) {
      logger.info("invite matchmake refused: no such invite", { inviteId, id });
      return matchmakeResult(c, MatchmakingErrorCode.RoomInviteExpired, null);
    }
    if (invite.ToPlayerId !== id) {
      logger.info("invite matchmake refused: caller is not the invitee", {
        inviteId,
        toPlayerId: invite.ToPlayerId,
        id
      });
      return matchmakeResult(c, MatchmakingErrorCode.InstanceJoinNotPermitted, null);
    }
    const inviterPresence = await getPresence(c.env.DB, invite.FromPlayerId);
    const instance = inviterPresence?.roomInstance ?? null;
    if (!instance) {
      logger.info("invite matchmake refused: inviter is not in a room", {
        inviteId,
        fromPlayerId: invite.FromPlayerId,
        id
      });
      return matchmakeResult(c, MatchmakingErrorCode.PlayerNotOnline, null);
    }
    const own = await getPresence(c.env.DB, id);
    if (own?.roomInstance?.roomInstanceId === instance.roomInstanceId) {
      return matchmakeResult(c, MatchmakingErrorCode.AlreadyInTargetInstance, null);
    }
    if (await isPlayerBannedFromRoom(c.env.DB, instance.roomId, id)) {
      logger.info("invite matchmake refused: player banned from room", {
        roomId: instance.roomId,
        id
      });
      return matchmakeResult(c, BANNED_FROM_ROOM, null);
    }
    const refusal = crossBuildRefusal(
      await callerGameVersion(c),
      inviterPresence?.appVersion ?? GAME_VERSION
    );
    if (refusal !== null) {
      logger.info("invite matchmake refused: inviter is on another client build", {
        roomInstanceId: instance.roomInstanceId,
        fromPlayerId: invite.FromPlayerId,
        id
      });
      return matchmakeResult(c, refusal, null);
    }
    if (await refreshInstanceFullness(c.env.DB, instance.roomInstanceId) === true) {
      logger.info("invite matchmake refused: instance is full", {
        roomInstanceId: instance.roomInstanceId,
        id
      });
      return matchmakeResult(c, MatchmakingErrorCode.InsufficientSpace, null);
    }
    await enterRoom(c, id, instance);
    return matchmakeResult(c, MatchmakingErrorCode.Success, instance);
  }
).post(
  "/matchmake/instance/:instanceId{[0-9]+}",
  describeRoute({
    tags: ["Navigation"],
    summary: "Join a specific instance (owner only)",
    description: [
      "Places the caller into one specific live instance of their own room, picked by id",
      "from the owner\u2019s instance listing. Gated to the room\u2019s creator or a co-owner.",
      "Unlike the other matchmakes this never reuses or creates an instance, and enters",
      "even a full or in-progress one. Returns errorCode 20 with a null instance when the",
      "instance or its room is gone, or the caller doesn\u2019t manage that room; errorCode 55",
      "when banned."
    ].join(" "),
    security: AUTHED,
    requestBody: form(CorrelationIdRequest, "The attempt\u2019s CorrelationId"),
    parameters: [
      {
        name: "instanceId",
        in: "path",
        required: true,
        description: "Room instance id (digits only)",
        schema: { type: "string", pattern: "^[0-9]+$" }
      }
    ],
    responses: {
      200: json(
        MatchmakeResponse,
        "The instance (or a null instance with errorCode 20 / 55 when it can\u2019t be joined)"
      ),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const instanceId = Number.parseInt(c.req.param("instanceId"), 10);
    const stored = await getStoredRoomInstance(c.env.DB, instanceId);
    if (!stored) return matchmakeResult(c, NO_SUCH_ROOM, null);
    const room = await getRoomById(c.env.DB, stored.roomId);
    if (!room) return matchmakeResult(c, NO_SUCH_ROOM, null);
    if (!canManageRoom(room, id)) {
      logger.info("instance matchmake refused: not the room\u2019s owner", {
        roomInstanceId: instanceId,
        roomId: stored.roomId,
        accountId: id
      });
      return matchmakeResult(c, NO_SUCH_ROOM, null);
    }
    if (await isPlayerBannedFromRoom(c.env.DB, stored.roomId, id)) {
      logger.info("instance matchmake refused: player banned from room", {
        roomId: stored.roomId,
        id
      });
      return matchmakeResult(c, BANNED_FROM_ROOM, null);
    }
    const crossBuild = crossBuildRefusal(await callerGameVersion(c), stored.gameVersion);
    if (crossBuild !== null) {
      logger.info("instance matchmake refused: instance is on another client build", {
        roomInstanceId: instanceId,
        instanceVersion: stored.gameVersion,
        accountId: id
      });
      return matchmakeResult(c, crossBuild, null);
    }
    const instance = roomInstanceFromRoom(
      c.env,
      room,
      stored.isPrivate,
      stored.roomInstanceId,
      stored.photonRoomId,
      stored.subRoomId
    );
    await enterRoom(c, id, instance);
    return matchmakeResult(c, 0, instance);
  }
).post(
  "/matchmake/room/:roomId/:subRoomId{[0-9]+}",
  describeRoute({
    tags: ["Navigation"],
    summary: "Matchmake into a specific subroom",
    description: [
      "Enters a specific subroom (scene) of a room. The subroom decides the scene loaded",
      "and which instances are joinable; an unknown subroom falls back to the room\u2019s first."
    ].join(" "),
    security: AUTHED,
    requestBody: form(MatchmakeRoomRequest, "Optional JoinMode and AdditionalPlayerIds"),
    parameters: [
      { name: "roomId", in: "path", required: true, schema: { type: "string" } },
      {
        name: "subRoomId",
        in: "path",
        required: true,
        description: "Subroom id (digits only)",
        schema: { type: "string", pattern: "^[0-9]+$" }
      }
    ],
    responses: {
      200: json(
        MatchmakeResponse,
        "The instance (or a null instance with errorCode 20 on an unknown room, 55 when banned)"
      ),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  matchmakeIntoRoom
).post(
  "/matchmake/room/:roomId",
  describeRoute({
    tags: ["Navigation"],
    summary: "Matchmake into a room (default subroom)",
    description: [
      "The 2023 client\u2019s two-segment matchmake. Resolves the room from D1 so the instance",
      "carries its real scene, and stores it as presence."
    ].join(" "),
    security: AUTHED,
    requestBody: form(MatchmakeRoomRequest, "Optional JoinMode and AdditionalPlayerIds"),
    parameters: [{ name: "roomId", in: "path", required: true, schema: { type: "string" } }],
    responses: {
      200: json(
        MatchmakeResponse,
        "The instance (or a null instance with errorCode 20 on an unknown room, 55 when banned)"
      ),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  matchmakeIntoRoom
).post(
  "/matchmake/v2/room/:roomId/:subRoomId{[0-9]+}",
  describeRoute({
    tags: ["Navigation"],
    summary: "Matchmake into a specific subroom (v2)",
    description: [
      "The newer client\u2019s `/v2/` spelling of the subroom matchmake. Enters the same",
      "instances as `POST /matchmake/room/{roomId}/{subRoomId}`; the body is JSON and the",
      "response is the PascalCase v2 envelope."
    ].join(" "),
    security: AUTHED,
    requestBody: jsonBody(MatchmakeRoomV2Request, "Optional JoinMode and AdditionalPlayerIds"),
    parameters: [
      { name: "roomId", in: "path", required: true, schema: { type: "string" } },
      {
        name: "subRoomId",
        in: "path",
        required: true,
        description: "Subroom id (digits only)",
        schema: { type: "string", pattern: "^[0-9]+$" }
      }
    ],
    responses: {
      200: json(
        MatchmakeV2Response,
        "The instance (or a null RoomInstance with ErrorCode 20 on an unknown room, 55 when banned)"
      ),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  matchmakeIntoRoom
).post(
  "/matchmake/v2/room/:roomId",
  describeRoute({
    tags: ["Navigation"],
    summary: "Matchmake into a room (v2, default subroom)",
    description: [
      "The newer client\u2019s `/v2/` spelling of the room matchmake. Enters the same instances",
      "as `POST /matchmake/room/{roomId}`; the body is JSON and the response is the",
      "PascalCase v2 envelope."
    ].join(" "),
    security: AUTHED,
    requestBody: jsonBody(MatchmakeRoomV2Request, "Optional JoinMode and AdditionalPlayerIds"),
    parameters: [{ name: "roomId", in: "path", required: true, schema: { type: "string" } }],
    responses: {
      200: json(
        MatchmakeV2Response,
        "The instance (or a null RoomInstance with ErrorCode 20 on an unknown room, 55 when banned)"
      ),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  matchmakeIntoRoom
).post(
  "/matchmake/none",
  describeRoute({
    tags: ["Navigation"],
    summary: "Matchmake with no target",
    description: [
      "Answers the instance the caller is already in, rather than sending them anywhere \u2014",
      "this is what the client posts at startup and while in Orientation, so forcing a",
      "destination here would warp the player out of the room they are standing in. A",
      "caller with no live presence (their TTL lapsed, or they have never entered a room)",
      "falls back to their personal dorm. Re-commits presence either way, refreshing its",
      "TTL."
    ].join(" "),
    security: AUTHED,
    requestBody: form(CorrelationIdRequest, "The attempt\u2019s CorrelationId"),
    responses: {
      200: json(MatchmakeResponse, "The caller\u2019s current instance, or their dorm"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const presence = await getPresence(c.env.DB, id);
    const current = presence?.roomInstance ?? await playerDormInstance(c, id);
    await enterRoom(c, id, current);
    return matchmakeResult(c, 0, current);
  }
).post(
  "/matchmake/dorm",
  describeRoute({
    tags: ["Navigation"],
    summary: "Matchmake into the player\u2019s dorm",
    description: [
      "Single-segment matchmake into the caller\u2019s personal dorm, stored as presence. The",
      "client only ever calls this with the `dorm` keyword \u2014 real rooms go through",
      "`/matchmake/room/:roomId`. Returns errorCode 55 with a null instance when the",
      "account is banned: a ban keeps a player out of their own dorm too."
    ].join(" "),
    security: AUTHED,
    requestBody: form(CorrelationIdRequest, "The attempt\u2019s CorrelationId"),
    responses: {
      200: json(MatchmakeResponse, "The dorm instance (or a null instance with errorCode 55)"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const instance = await playerDormInstance(c, id);
    await enterRoom(c, id, instance);
    return matchmakeResult(c, 0, instance);
  }
).get(
  "/player/connection-info",
  describeRoute({
    tags: ["Presence"],
    summary: "Photon connection info",
    description: [
      "The realtime (Photon) credentials the caller should connect with, in a",
      "`{ success, value, error }` envelope: a freshly minted `photonAuthToken`, the",
      "Photon application ids, and the `photonRoomId` of the instance the caller is in",
      "(from their presence, falling back to the `roomInstanceId` query param). The voice",
      "fields name the Tachyon server that instance was assigned \u2014 one entry out of the",
      "`TACHYON_HOST_PORT` pool, chosen by instance id so every player in a session is",
      "handed the same one, with a generated `voiceServerId` (`tachyon-1`, `tachyon-2`,",
      "\u2026). Both are empty when the pool is unset or the caller is in no instance.",
      "`experiments` carries the client\u2019s networking flags."
    ].join(" "),
    security: AUTHED,
    parameters: [
      {
        name: "roomInstanceId",
        in: "query",
        required: false,
        description: "The instance being connected to; used only when presence has no room",
        schema: { type: "string" }
      }
    ],
    responses: {
      200: json(ConnectionInfoResponse, "The Photon credentials, room, and experiment flags"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const apps = photonApps(c.env);
    const presence = await getPresence(c.env.DB, id);
    let roomInstanceId = presence?.roomInstance?.roomInstanceId ?? 0;
    let photonRoomId = presence?.roomInstance?.photonRoomId ?? "";
    if (!photonRoomId) {
      const requested = Number.parseInt(c.req.query("roomInstanceId") ?? "", 10);
      if (!Number.isNaN(requested)) {
        const instance = await getRoomInstance(c.env.DB, requested);
        roomInstanceId = instance?.roomInstanceId ?? 0;
        photonRoomId = instance?.photonRoomId ?? "";
      }
    }
    const tachyon = tachyonServerFor(c.env, roomInstanceId);
    const photonAuthToken = await generatePhotonAuthToken(
      id,
      {
        platformId: (await getAccount(c.env.DB, id))?.platformId ?? "",
        platform: presence?.platform ?? 0,
        deviceClass: presence?.deviceClass ?? 0,
        audience: apps.photonRealtimeAppId
      },
      await c.env.JWT_SECRET.get()
    );
    return c.json({
      success: true,
      value: {
        photonAuthToken,
        ...apps,
        photonRoomId,
        // The Tachyon server this instance runs on, picked out of the operator's
        // pool by {@link tachyonServerFor} — empty strings when the pool is empty
        // or the caller is in no instance. Empty rather than null: the client's
        // decoder is likelier to accept a missing-value string than a null on a
        // string field. The presence payload's NULL_CONNECTION_INFO keeps its
        // nulls — that one never carries credentials.
        voiceConnectionInfo: tachyon.hostPort,
        voiceServerId: tachyon.serverId,
        experiments: PHOTON_EXPERIMENTS
      },
      error: null
    });
  }
).get(
  "/player/qos",
  describeRoute({
    tags: ["Presence"],
    summary: "QoS probe targets",
    description: [
      "The regions the client pings to measure latency, reporting the results back through",
      "`PUT /player/photonregionpings`. Rec Room\u2019s own probe endpoints, served verbatim \u2014",
      "recflare runs none of its own, and the resulting ranking is unused anyway: every",
      "session is pinned to the one region `/player/connection-info` hands out."
    ].join(" "),
    responses: { 200: json(QosRegion.array(), "The regions to probe, as `host:port`") }
  }),
  (c) => c.json(QOS_REGIONS)
).put(
  "/player/photonregionpings",
  describeRoute({
    tags: ["Presence"],
    summary: "Photon region pings (no-op ack)",
    description: "Region latency report; accepted and ignored.",
    responses: { 200: EMPTY_OK }
  }),
  (c) => c.body(null, 200)
).put(
  "/player/gameserverregionpings",
  describeRoute({
    tags: ["Presence"],
    summary: "Game-server region pings (no-op ack)",
    description: "Region latency report; accepted and ignored.",
    responses: { 200: EMPTY_OK }
  }),
  (c) => c.body(null, 200)
).post(
  "/invite",
  describeRoute({
    tags: ["Social"],
    summary: "Invite a player into the caller\u2019s room instance",
    description: [
      "Sends a game invite from the caller (the Bearer token) to `playerId` for",
      "`roomInstanceId`. Delivered to the target over the notify hub as a `MessageReceived`",
      "notification carrying a game-invite `Message`; the resolved instance\u2019s `RoomId` rides",
      "on the message. The invite is recorded as a `room_invite` row and that row is the",
      "response (bad `playerId` \u2192 400); hub delivery is best-effort."
    ].join(" "),
    security: AUTHED,
    requestBody: form(InviteRequest, "The target player and the room instance"),
    responses: {
      200: json(InviteResponse, "The invite that was sent"),
      400: { description: "Missing, non-numeric, or zero playerId (empty body)" },
      401: UNAUTHORIZED_RESPONSE,
      500: { description: "The invite could not be recorded; nothing was sent (empty body)" }
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const body = await c.req.parseBody().catch(() => ({}));
    const str = (v) => typeof v === "string" ? v : "";
    const toPlayerId = Number.parseInt(str(body.playerId), 10);
    if (Number.isNaN(toPlayerId) || toPlayerId === 0) return c.body(null, 400);
    const roomInstanceIdStr = str(body.roomInstanceId);
    const roomInstanceId = Number.parseInt(roomInstanceIdStr, 10);
    const instance = !Number.isNaN(roomInstanceId) && roomInstanceId > 0 ? await getRoomInstance(c.env.DB, roomInstanceId) : null;
    const roomId = instance?.roomId ?? null;
    const invite = await createRoomInvite(c.env.DB, id, toPlayerId, roomId);
    if (invite === null) {
      logger.error("failed to record room invite", { fromPlayerId: id, toPlayerId, roomId });
      return c.body(null, 500);
    }
    await sendGameInvite(
      c,
      id,
      toPlayerId,
      {
        instanceId: roomInstanceIdStr,
        roomId,
        name: instance?.name ?? "",
        inviteId: invite.RoomInviteId
      },
      await gameInviteType(c)
    );
    return c.json(invite);
  }
).post(
  "/roominstance/:id/reportjoinresult",
  describeRoute({
    tags: ["Room instance"],
    summary: "Report join result (no-op ack)",
    description: "The client reports how a join went; accepted and ignored.",
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
    responses: { 200: EMPTY_OK }
  }),
  (c) => c.body(null, 200)
).put(
  "/roominstance/:id/inprogress",
  describeRoute({
    tags: ["Room instance"],
    summary: "Set instance in-progress flag",
    description: [
      "Flips the instance\u2019s in-progress flag when a session starts (e.g. a round begins).",
      "Set by whoever in the room starts the game \u2014 any authenticated player, not just the",
      "room\u2019s owner. Body is `inProgress=True|False`."
    ].join(" "),
    security: AUTHED,
    requestBody: form(InProgressRequest, "The inProgress flag"),
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
    responses: {
      200: EMPTY_OK,
      401: UNAUTHORIZED_RESPONSE,
      404: { description: "Non-numeric id or no such instance (empty body)" }
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const instanceId = Number.parseInt(c.req.param("id"), 10);
    if (Number.isNaN(instanceId)) return c.body(null, 404);
    const body = await c.req.parseBody().catch(() => ({}));
    const inProgress = typeof body.inProgress === "string" && body.inProgress.toLowerCase() === "true";
    const instance = await setRoomInstanceInProgress(c.env.DB, instanceId, inProgress);
    if (!instance) return c.body(null, 404);
    return c.body(null, 200);
  }
).post(
  "/roominstance/:id/markprivate",
  describeRoute({
    tags: ["Room instance"],
    summary: "Mark an instance private (owner only)",
    description: [
      "Marks a live instance private, so public matchmaking stops placing new players",
      "into it. Players already inside are unaffected. Auth-gated and gated to the",
      "instance\u2019s room\u2019s creator or a co-owner (403 otherwise). Empty ack."
    ].join(" "),
    security: AUTHED,
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "Room instance id",
        schema: { type: "string" }
      }
    ],
    responses: {
      200: EMPTY_OK,
      401: UNAUTHORIZED_RESPONSE,
      403: { description: "Not the room\u2019s creator or a co-owner (empty body)" },
      404: { description: "Non-numeric id or no such instance (empty body)" }
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const instanceId = Number.parseInt(c.req.param("id"), 10);
    if (Number.isNaN(instanceId)) return c.body(null, 404);
    const stored = await getRoomInstance(c.env.DB, instanceId);
    if (!stored) return c.body(null, 404);
    const room = await getRoomById(c.env.DB, stored.roomId);
    if (!room || !canManageRoom(room, id)) return c.body(null, 403);
    await setRoomInstancePrivate(c.env.DB, instanceId, true);
    return c.body(null, 200);
  }
).get(
  "/room/:roomId{[0-9]+}/instances",
  describeRoute({
    tags: ["Room instance"],
    summary: "A room\u2019s live instances",
    description: [
      "The owner\u2019s view of active sessions of their room \u2014 each instance with the",
      "players currently in it. Auth-gated and gated to the room\u2019s creator or a",
      "co-owner (403 otherwise). Unknown room \u2192 404."
    ].join(" "),
    security: AUTHED,
    parameters: [
      {
        name: "roomId",
        in: "path",
        required: true,
        description: "Room id (digits only)",
        schema: { type: "string", pattern: "^[0-9]+$" }
      }
    ],
    responses: {
      200: json(RoomInstanceSummaryDto.array(), "Live instances (empty when none)"),
      401: UNAUTHORIZED_RESPONSE,
      403: { description: "Not the room\u2019s creator or a co-owner (empty body)" },
      404: { description: "No such room (empty body)" }
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) return c.body(null, 404);
    if (!canManageRoom(room, id)) return c.body(null, 403);
    return c.json(await getRoomInstanceSummariesByRoom(c.env.DB, roomId));
  }
).get(
  "/rooms/requiring/developer",
  describeRoute({
    tags: ["Room instance"],
    summary: "Rooms requiring a developer",
    description: "Rooms flagged as needing a developer/moderator to spawn in. No queue yet \u2192 [].",
    responses: { 200: json(RoomInstanceDto.array(), "Always empty for now") }
  }),
  (c) => c.json([])
).get(
  "/rooms/requiring/rrplus",
  describeRoute({
    tags: ["Room instance"],
    summary: "Rooms requiring RR+",
    description: "Rooms flagged as requiring an RR+ subscription. No queue yet \u2192 [].",
    responses: { 200: json(RoomInstanceDto.array(), "Always empty for now") }
  }),
  (c) => c.json([])
);
async function sweepExpiredPresence(env) {
  const staleInstanceIds = await getExpiredPresenceInstanceIds(env.DB);
  const removed = await deleteExpiredPresence(env.DB);
  const emptyInstanceIds = await deleteEmptyRoomInstances(env.DB);
  for (const instanceId of staleInstanceIds) {
    await refreshInstanceFullness(env.DB, instanceId);
  }
  const online = await countOnlinePlayers(env.DB);
  await recordStat(env.DB, "online", online);
  console.log(
    `presence sweep: removed ${removed} expired rows, deleted ${emptyInstanceIds.length} empty instances, refreshed ${staleInstanceIds.length} instances, ${online} online`
  );
}
app.get(
  "/openapi.json",
  describeRoute({ hide: true }),
  withCleanSpec(
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "recflare match",
          version: "1.0.0",
          description: [
            "Matchmaking and presence for recflare, a private-server reimplementation of the Rec",
            "Room backend. Rooms and room instances are D1-backed (matchmaking finds or creates a",
            "`room_instance` per session); presence \u2014 the instance each player is currently in \u2014",
            "lives in the shared `presence` table and expires on a TTL. A cron sweep clears",
            "expired presence, frees up instances a crashed player never left, and deletes",
            "instances nobody is standing in any more."
          ].join("\n")
        },
        servers: [{ url: "https://match.recflare.net", description: "Production" }],
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
const scheduled = (_controller, env, ctx) => {
  ctx.waitUntil(sweepExpiredPresence(env));
};
var stdin_default = { fetch: app.fetch, scheduled };
export {
  app,
  stdin_default as default,
  scheduled
};
