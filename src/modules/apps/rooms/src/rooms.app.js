// Ported from apps/rooms/src/rooms.app.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../runtime/router.js";
import { describeRoute, openAPIRouteHandler } from "../../../../runtime/openapi.js";
import { useWorkersLogger } from "../../../../runtime/logger.js";
import {
  Accessibility,
  answerRoomRoleInvite,
  applyRoomTagEdit,
  areFriends,
  autocompleteRoomSearch,
  banPlayerFromRoom,
  canManageRoom,
  cloneRoom,
  cloneSubRoom,
  countRoomsByCreator,
  createNotification,
  createSubRoom,
  deleteRoom,
  deleteRoomLeaderboard,
  deleteSubRoom,
  findSubRoom,
  getBaseRooms,
  getContributedRooms,
  getFavoritedRooms,
  getFeaturedRooms,
  getHotRooms,
  getInteraction,
  getOrCreateDormRoom,
  getPlayerIdsInRoom,
  getPresence,
  getPublicRoomsByCreator,
  getRecommendedRooms,
  getRoomBans,
  getRoomById,
  getRoomByName,
  getRoomsByCreator,
  getRoomsByIds,
  getSimilarRooms,
  getSubRoomPermissions,
  getSubRoomSaveById,
  getSubRoomSaves,
  getTrendingRooms,
  getVisitedRooms,
  inviteRoomRole,
  isPlayerBannedFromRoom,
  isRoomOwner,
  MessageType,
  modifySubRoom,
  publishSubRoomSave,
  removeCheer,
  removeFavorite,
  Role,
  roomNameRejection,
  roomRoles,
  saveSubRoomData,
  searchRooms,
  setRoomDescription,
  setRoomImage,
  setRoomLeaderboard,
  setRoomName,
  setRoomRole,
  setSubRoomPermissions,
  toggleCheer,
  toggleFavorite,
  unbanPlayerFromRoom,
  updateRoomFields
} from "../../../packages/domain/src/index.js";
import {
  intVar,
  logger,
  withCleanSpec,
  withDefaultCors,
  withNotFound,
  withOnError
} from "../../../packages/hono-helpers/src/index.js";
import { validateAndGetAccountId, validateAndGetRoles, validateAndGetVersion } from "../../../packages/jwt/src/index.js";
import { NotificationType } from "../../notify/src/notification-types.js";
import {
  AccessibilityRequest,
  AUTHED,
  bannedPlayerIdParam,
  BanRequest,
  BulkRoomsRequest,
  CloneRoomRequest,
  CloningRequest,
  CreateSubRoomRequest,
  CuratedPlaylists,
  DescriptionRequest,
  DormRoomId,
  FeaturedRoomGroupDto,
  FORBIDDEN_RESPONSE,
  form,
  ImageRequest,
  InteractionDto,
  intQuery,
  InviteRoleRequest,
  IsBannedEnvelope,
  IsBannedPascalEnvelope,
  json,
  jsonBody,
  leaderboardIdParam,
  LeaderboardRequest,
  LeaderboardResultEnvelope,
  LoadScreenRequest,
  MissingLookupParam,
  ModifySubRoomRequest,
  NameRequest,
  NOT_FRIENDS_RESPONSE,
  PagedRooms,
  pageParams,
  PhotonAccessTokenDto,
  PlayerDataDto,
  playerIdParam,
  PublishSaveRequest,
  PublishStateConfigsEnvelope,
  RestrictionsRequest,
  RoleRequest,
  RoomBanEntryDto,
  RoomBanEnvelope,
  RoomDto,
  RoomEnvelope,
  RoomExperience,
  RoomExperiencePlayer,
  roomIdParam,
  RoomLookup,
  RoomResultEnvelope,
  RoomRoleDto,
  RoomSaveEnvelope,
  saveIdParam,
  SaveSubRoomDataRequest,
  SearchSuggestions,
  ServiceStatus,
  ShowcasedRooms,
  stringQuery,
  SubRoomAccessibilityRequest,
  SubRoomDataSaveResponseDto,
  subRoomIdParam,
  SubRoomPermissionsRequest,
  SubRoomSavesNoUnityAssetsPage,
  SubRoomSavesPage,
  SuccessEnvelope,
  TagRequest,
  TooManyLookupIds,
  UNAUTHORIZED_EMPTY,
  UNAUTHORIZED_ENVELOPE,
  UNAUTHORIZED_RESPONSE,
  WarningRequest
} from "./openapi.js";
function firstId(idParam) {
  return idParam.split(",").map((s) => Number.parseInt(s.trim(), 10)).find((n) => !Number.isNaN(n));
}
const MAX_BULK_ROOM_IDS = 100;
function tooManyIds(c) {
  return c.json(`At most ${MAX_BULK_ROOM_IDS} room ids may be looked up at once`, 400);
}
function excludePrivateRooms(value) {
  return (value ?? "").toLowerCase() === "true";
}
function allIds(idParam) {
  return idParam.split(",").map((s) => Number.parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
}
const DEFAULT_MAX_ROOMS_PER_ACCOUNT = 10;
const MAKER_PEN_ACCOUNT_IDS = /* @__PURE__ */ new Set([1, 2, 3]);
function photonAccessToken(accountId, roomInstanceId, overrides = []) {
  const perm = (Permission, Role2, Override) => ({
    Override,
    Permission,
    Role: Role2,
    Type: 0,
    Value: "True"
  });
  const permissions = [
    perm("CAN_USE_ROOM_RESET_BUTTON", 0, true),
    perm("CAN_USE_DELETE_ALL_BUTTON", 0, true),
    perm("CAN_SAVE_INVENTIONS", 0, true),
    perm("CAN_SPAWN_INVENTIONS", 0, true),
    perm("CAN_USE_PLAY_GIZMOS_TOGGLE", 0, true),
    perm("CAN_USE_MAKER_PEN", 30, false),
    perm("CAN_USE_ROOM_RESET_BUTTON", 30, true),
    perm("CAN_USE_DELETE_ALL_BUTTON", 30, true),
    perm("CAN_SAVE_INVENTIONS", 30, true),
    perm("CAN_SPAWN_INVENTIONS", 30, true),
    perm("CAN_USE_PLAY_GIZMOS_TOGGLE", 30, true)
  ];
  if (MAKER_PEN_ACCOUNT_IDS.has(accountId)) {
    permissions.unshift(perm("CAN_USE_MAKER_PEN", 0, true));
  }
  for (const override of overrides) {
    const i = permissions.findIndex(
      (p) => p.Permission === override.Permission && p.Role === override.Role
    );
    if (i === -1) permissions.push(override);
    else permissions[i] = override;
  }
  return {
    Permissions: permissions,
    PhotonAccessToken: "",
    RoomInstanceId: roomInstanceId
  };
}
async function handlePhotonAccessToken(c) {
  const accountId = await authedAccountId(c);
  if (accountId === null) return unauthorized(c);
  const instance = (await getPresence(c.env.DB, accountId))?.roomInstance;
  const overrides = typeof instance?.subRoomId === "number" ? await getSubRoomPermissions(c.env.DB, instance.subRoomId) : [];
  return c.json(photonAccessToken(accountId, instance?.roomInstanceId ?? null, overrides));
}
async function canReadSaves(c, room, roomId, accountId) {
  if (room.CreatorAccountId === accountId) return true;
  const instance = (await getPresence(c.env.DB, accountId))?.roomInstance;
  return instance?.roomId === roomId;
}
async function authedAccountId(c) {
  return validateAndGetAccountId(c.req.raw, await c.env.JWT_SECRET.get());
}
async function authedGameVersion(c) {
  return validateAndGetVersion(c.req.raw, await c.env.JWT_SECRET.get());
}
const FEATURED_ROOMS_VERSIONS = /* @__PURE__ */ new Set(["20250718.01"]);
const STAFF_ROLES = /* @__PURE__ */ new Set(["developer", "moderator"]);
async function isStaff(c) {
  const roles = await validateAndGetRoles(c.req.raw, await c.env.JWT_SECRET.get());
  return roles?.some((role) => STAFF_ROLES.has(role)) ?? false;
}
async function pathBan(c) {
  const id = (name) => Number.parseInt(c.req.param(name) ?? "", 10);
  return isPlayerBannedFromRoom(c.env.DB, id("roomId"), id("playerId"));
}
function unauthorized(c) {
  return c.json({ error: "Unauthorized" }, 401);
}
function parseAccessibility(value) {
  if (typeof value !== "string") return void 0;
  const raw = value.trim();
  if (/^-?\d+$/.test(raw)) return Number.parseInt(raw, 10);
  const named = Object.entries(Accessibility).find(
    ([name, ordinal]) => typeof ordinal === "number" && name.toLowerCase() === raw.toLowerCase()
  );
  return named ? named[1] : void 0;
}
function parseInt10(value) {
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : void 0;
  if (typeof value !== "string") return void 0;
  const n = Number.parseInt(value.trim(), 10);
  return Number.isNaN(n) ? void 0 : n;
}
function permissionValue(value) {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return String(value);
  return "";
}
function parseRoomPermissions(body) {
  if (!Array.isArray(body)) return [];
  const permissions = [];
  for (const entry of body) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry;
    const permission = typeof e.Permission === "string" ? e.Permission.trim() : "";
    const role = parseInt10(e.Role);
    if (permission === "" || role === void 0) continue;
    permissions.push({
      Permission: permission,
      Role: role,
      // Sent as a JSON boolean, unlike `Value` — accept the string form regardless.
      Override: e.Override === true || String(e.Override).toLowerCase() === "true",
      Type: parseInt10(e.Type) ?? 0,
      Value: permissionValue(e.Value)
    });
  }
  return permissions;
}
const HUB_INSTANCE = "global";
const RESTRICTION_FIELDS = {
  supportsscreens: "SupportsScreens",
  supportswalkvr: "SupportsWalkVR",
  supportsteleportvr: "SupportsTeleportVR",
  supportsvrlow: "SupportsVRLow",
  supportsquest2: "SupportsQuest2",
  supportsmobile: "SupportsMobile",
  supportsjuniors: "SupportsJuniors"
};
async function pushRoomUpdate(c, playerId, room) {
  try {
    await c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE).notifyPlayer(
      playerId,
      NotificationType.SubscriptionUpdateRoom,
      room
    );
  } catch (err) {
    logger.error("failed to push RoomUpdate notification", {
      playerId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
async function pushRoomUpdateToRoom(c, roomId, room, alsoNotify = []) {
  const playerIds = new Set(await getPlayerIdsInRoom(c.env.DB, roomId));
  for (const playerId of alsoNotify) playerIds.add(playerId);
  await Promise.all([...playerIds].map((playerId) => pushRoomUpdate(c, playerId, room)));
}
async function pushRoleInvite(c, roomId, fromAccountId, toAccountId, role) {
  const stored = await createNotification(c.env.DB, {
    FromPlayerId: fromAccountId,
    ToPlayerId: toAccountId,
    Type: MessageType.RoomCoOwnerInvited,
    // The role being offered, as a string — a Message's `Data` is a string on the wire.
    Data: String(role),
    RoomId: roomId
  });
  const message = {
    Id: stored.Id,
    FromPlayerId: stored.FromPlayerId,
    SentTime: stored.SentTime,
    Type: stored.Type,
    Data: stored.Data,
    RoomId: stored.RoomId,
    PlayerEventId: stored.PlayerEventId
  };
  try {
    await c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE).notifyPlayer(
      toAccountId,
      NotificationType.MessageReceived,
      { ...message, ToPlayerId: stored.ToPlayerId }
    );
  } catch (err) {
    logger.error("failed to push RoomCoOwnerInvited MessageReceived notification", {
      messageId: stored.Id,
      roomId,
      toAccountId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
const REPORT_CATEGORY_MODERATOR = -1;
async function pushRoomBan(c, ban, roomName, isHostKick) {
  try {
    await c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE).notifyPlayer(
      ban.BannedPlayerId,
      NotificationType.ModerationKick,
      {
        reportCategory: REPORT_CATEGORY_MODERATOR,
        duration: 0,
        gameSessionId: 0,
        isHostKick,
        message: `You have been banned from ${roomName}.`,
        playerIdReporter: ban.BannedByAccountId,
        isBan: true,
        isVoiceModAutoban: false
      }
    );
  } catch (err) {
    logger.error("failed to push ModerationKick notification", {
      playerId: ban.BannedPlayerId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
function roomResult(c, fields) {
  return c.json({
    Success: fields.Success,
    Value: fields.Value ?? null,
    ErrorId: fields.ErrorId ?? null,
    Error: fields.Error ?? null
  });
}
function toSaveResponse(save) {
  const str = (v) => typeof v === "string" ? v : null;
  const num = (v) => typeof v === "number" ? v : null;
  return {
    subRoomDataSaveId: num(save.SubRoomDataSaveId),
    subRoomId: num(save.SubRoomId),
    unityAssetId: str(save.UnityAssetId),
    unityAsset: null,
    unityAssetHash: null,
    dataBlob: str(save.DataBlob) ?? "",
    dataBlobHash: str(save.DataBlobHash),
    savedByAccountId: num(save.SavedByAccountId),
    savedOnPlatform: num(save.SavedOnPlatform) ?? 0,
    savedOnDeviceClass: num(save.SavedOnDeviceClass) ?? 0,
    description: str(save.Description),
    createdAt: str(save.CreatedAt) ?? ""
  };
}
function toSaveWithoutUnityAssets(save) {
  const str = (v) => typeof v === "string" ? v : null;
  const num = (v) => typeof v === "number" ? v : null;
  return {
    SubRoomDataSaveId: num(save.SubRoomDataSaveId),
    SubRoomId: num(save.SubRoomId),
    UnityAssetId: str(save.UnityAssetId),
    ReferencedUnityAssetIds: Array.isArray(save.ReferencedUnityAssetIds) ? save.ReferencedUnityAssetIds : [],
    DataBlob: str(save.DataBlob) ?? "",
    DataBlobHash: str(save.DataBlobHash),
    PersistenceVersion: num(save.PersistenceVersion) ?? 0,
    OMVersion: num(save.OMVersion) ?? 0,
    SavedByAccountId: num(save.SavedByAccountId),
    SavedOnPlatform: num(save.SavedOnPlatform) ?? 0,
    SavedOnDeviceClass: num(save.SavedOnDeviceClass) ?? 0,
    Description: str(save.Description) ?? "",
    ModerationState: num(save.ModerationState) ?? 0,
    CreatedAt: str(save.CreatedAt) ?? "",
    UgcSubVersion: num(save.UgcSubVersion) ?? 0
  };
}
function roomEnvelope(c, value, error = "") {
  return c.json({ success: error === "", error, value });
}
const banEnvelope = roomEnvelope;
function leaderboardEnvelope(c, error = null) {
  return c.json({ Success: error === null, Error: error, error_id: null });
}
async function ownedRooms(c) {
  const accountId = await authedAccountId(c);
  if (accountId === null) return unauthorized(c);
  return c.json(await getRoomsByCreator(c.env.DB, accountId));
}
async function ownedRoomsExcludingDorm(c) {
  const accountId = await authedAccountId(c);
  if (accountId === null) return unauthorized(c);
  const rooms = await getRoomsByCreator(c.env.DB, accountId);
  return c.json(rooms.filter((r) => r.IsDorm !== true));
}
const DEFAULT_SUGGESTION_COUNT = 10;
const ROOM_XP_ENABLED = false;
const ROOM_XP_DAILY_LIMIT = 1e3;
const app = new Hono().use(
  "*",
  // middleware
  (c, next) => useWorkersLogger(c.env.NAME, {
    environment: c.env.ENVIRONMENT,
    release: c.env.SENTRY_RELEASE
  })(c, next)
).use("*", withDefaultCors()).onError(withOnError()).notFound(withNotFound()).get(
  "/",
  describeRoute({
    tags: ["Service"],
    summary: "Service liveness",
    description: "A fixed `{ service, status }` body. No auth \u2014 a plain liveness probe.",
    responses: { 200: json(ServiceStatus, 'Always `{ service: "rooms", status: "ok" }`') }
  }),
  (c) => c.json({ service: "rooms", status: "ok" })
).get(
  "/rooms",
  describeRoute({
    tags: ["Rooms"],
    summary: "Look up a room by id or name",
    description: [
      "A single room by `id` or `name`. `id` may be a comma-separated list \u2014 the first",
      "valid integer wins. An unknown room is `{}`, not a 404: the client reads an empty",
      "object as \u201Cno such room\u201D."
    ].join(" "),
    parameters: [
      stringQuery("id", "Room id (comma-separated; the first valid one is used)"),
      stringQuery("name", "Room name (matched case-insensitively). Ignored when `id` is given")
    ],
    responses: {
      200: json(RoomLookup, "The room, or `{}` when there\u2019s no match"),
      400: json(MissingLookupParam, "Neither `id` nor `name` was supplied")
    }
  }),
  async (c) => {
    const idParam = c.req.query("id");
    const nameParam = c.req.query("name");
    if (!idParam && !nameParam) {
      return c.json("Either 'id' or 'name' query parameter is required", 400);
    }
    if (idParam) {
      const id = firstId(idParam);
      const room2 = id === void 0 ? null : await getRoomById(c.env.DB, id);
      return c.json(room2 ?? {});
    }
    const room = await getRoomByName(c.env.DB, nameParam ?? "");
    return c.json(room ?? {});
  }
).get(
  "/rooms/search",
  describeRoute({
    tags: ["Discovery"],
    summary: "Search rooms",
    description: [
      "Full room search. `query` is space- or `+`-separated terms: a `#tag` term matches the",
      "room\u2019s tags, a plain term matches its name. Public, non-dorm rooms only.",
      "`#community` is a pseudo-tag no room carries \u2014 it narrows to rooms a player made",
      "(anything the system Coach account didn\u2019t create), like `/rooms/hot?tag=community`."
    ].join(" "),
    parameters: [
      stringQuery(
        "query",
        "Search terms \u2014 `#tag` matches tags, plain terms match the name, `#community` matches player-made rooms"
      ),
      ...pageParams(30)
    ],
    responses: { 200: json(PagedRooms, "The matching rooms") }
  }),
  async (c) => {
    const query = c.req.query("query") ?? "";
    const skip = Number.parseInt(c.req.query("skip") ?? "0", 10) || 0;
    const take = Number.parseInt(c.req.query("take") ?? "30", 10) || 30;
    return c.json(await searchRooms(c.env.DB, query, skip, take));
  }
).get(
  "/rooms/autocomplete_search",
  describeRoute({
    tags: ["Discovery"],
    summary: "Search suggestions for the search box",
    description: [
      "Type-ahead suggestions as a bare array of strings \u2014 not rooms, not an envelope.",
      "Drawn from room names and room tags over the public, non-dorm rooms `/rooms/search`",
      "searches, so every suggestion is one that finds something when submitted; a tag",
      "suggestion carries its `#` so it searches by tag. A `query` starting with `#`",
      "suggests tags only. Matches that START with the query come first, then ones that",
      "merely contain it, alphabetically within each \u2014 the same query always suggests the",
      "same things. `take` caps the list (4 is what the client asks for);",
      "`searchSessionId` is the client\u2019s analytics correlation id and is ignored."
    ].join(" "),
    parameters: [
      stringQuery("query", "What the player has typed so far. `#` prefix suggests tags only"),
      intQuery("take", "How many suggestions to return (default 10)"),
      stringQuery("searchSessionId", "The client\u2019s typing-session id. Accepted and ignored")
    ],
    responses: { 200: json(SearchSuggestions, "The suggestions, best match first") }
  }),
  async (c) => {
    const take = Number.parseInt(c.req.query("take") ?? "", 10);
    return c.json(
      await autocompleteRoomSearch(
        c.env.DB,
        c.req.query("query") ?? "",
        Number.isNaN(take) ? DEFAULT_SUGGESTION_COUNT : take
      )
    );
  }
).get(
  "/rooms/hot",
  describeRoute({
    tags: ["Discovery"],
    summary: "The \u201Chot\u201D rooms feed",
    description: [
      "Public, non-dorm rooms ordered by how many players are in them right now \u2014 live",
      "presence summed across each room\u2019s instances \u2014 falling back to stored engagement",
      "for rooms nobody is in. Optionally narrowed to a single `tag` (the browse screen\u2019s",
      "filter chips post one, e.g. `rro`). The `new` and `community` chips are pseudo-tags \u2014",
      "no room carries either. `new` instead serves the player-made (non-RRO) rooms, newest",
      "first; `community` keeps the ordering above but serves only rooms the Coach account",
      "(the system account owning the seeded first-party rooms) did not create."
    ].join(" "),
    parameters: [
      stringQuery(
        "tag",
        "Restrict to rooms carrying this tag (or `new`/`community`, pseudo-tags)"
      ),
      ...pageParams(100)
    ],
    responses: { 200: json(PagedRooms, "The feed page") }
  }),
  async (c) => {
    const tag = c.req.query("tag") ?? "";
    const skip = Number.parseInt(c.req.query("skip") ?? "0", 10) || 0;
    const take = Number.parseInt(c.req.query("take") ?? "100", 10) || 100;
    return c.json(await getHotRooms(c.env.DB, tag, skip, take));
  }
).get(
  "/rooms/curated_playlists",
  describeRoute({
    tags: ["Discovery"],
    summary: "Curated room playlists",
    description: [
      "The curated room playlists the discovery pages\u2019 playlist sections draw from. There",
      "is no editorial curation on this server yet, so this is always an empty array \u2014",
      "which the client reads as \u201Cno playlists\u201D and draws nothing, rather than the 404 it",
      "would keep retrying."
    ].join(" "),
    responses: { 200: json(CuratedPlaylists, "Always an empty list") }
  }),
  (c) => c.json([])
).get(
  "/rooms/carousel/rising",
  describeRoute({
    tags: ["Discovery"],
    summary: "The \u201Crising\u201D rooms carousel",
    description: [
      "The rooms players are in RIGHT NOW, busiest first \u2014 the trending carousel. Live",
      "presence is a filter here, not just a sort: a room nobody is standing in is absent",
      "entirely, so this is empty when the server is quiet rather than falling back to",
      "stored engagement the way `/rooms/hot` does. Ties break on engagement and then",
      "RoomId, so equally busy rooms page stably. Public, non-dorm, listable rooms only."
    ].join(" "),
    parameters: pageParams(100),
    responses: { 200: json(PagedRooms, "The carousel page") }
  }),
  async (c) => {
    const skip = Number.parseInt(c.req.query("skip") ?? "0", 10) || 0;
    const take = Number.parseInt(c.req.query("take") ?? "100", 10) || 100;
    return c.json(await getTrendingRooms(c.env.DB, skip, take));
  }
).get(
  "/rooms/base",
  describeRoute({
    tags: ["Discovery"],
    summary: "Base (template) rooms",
    description: [
      "The template rooms \u2014 those tagged `base` \u2014 the client offers when a player creates a",
      "room. Served regardless of accessibility, and as a bare array rather than a page."
    ].join(" "),
    parameters: pageParams(100),
    responses: { 200: json(RoomDto.array(), "The template rooms") }
  }),
  async (c) => {
    const skip = Number.parseInt(c.req.query("skip") ?? "0", 10) || 0;
    const take = Number.parseInt(c.req.query("take") ?? "100", 10) || 100;
    return c.json(await getBaseRooms(c.env.DB, skip, take));
  }
).get(
  "/rooms/recommendations",
  describeRoute({
    tags: ["Discovery"],
    summary: "Recommended rooms",
    description: [
      "Public, non-dorm rooms ranked by engagement. Unlike search and hot this is a BARE",
      "array \u2014 the client\u2019s recommendation room-source expects a plain list. The",
      "`splitTestId`/`splitTestValue` A/B params are accepted and ignored."
    ].join(" "),
    parameters: [
      stringQuery("splitTestId", "A/B test id \u2014 accepted and ignored"),
      stringQuery("splitTestValue", "A/B test bucket \u2014 accepted and ignored"),
      ...pageParams(100)
    ],
    responses: { 200: json(RoomDto.array(), "The recommended rooms") }
  }),
  async (c) => {
    const skip = Number.parseInt(c.req.query("skip") ?? "0", 10) || 0;
    const take = Number.parseInt(c.req.query("take") ?? "100", 10) || 100;
    return c.json(await getRecommendedRooms(c.env.DB, skip, take));
  }
).get(
  "/featuredrooms/current",
  describeRoute({
    tags: ["Discovery"],
    summary: "Featured rooms",
    description: [
      "A single always-active group of featured rooms: a random shuffle of eligible public",
      "rooms, since there is no editorial curation yet. Capped at 10 rooms \u2014 a featured",
      "group is a short selection, not the whole room list \u2014 and the cap is applied after",
      "the shuffle, so each request serves a different sample.",
      "",
      "Restricted by CLIENT BUILD. Serving this to the 2023 client breaks its other room",
      "listings (NREs, apparently from the featured-room load corrupting its room cache), so",
      "only the builds known to render it \u2014 `20250718.01` today \u2014 get the group; anything",
      "else gets a 404, the same answer it got while the route was parked. The build is read",
      "from the token\u2019s `rn.ver` claim, which is why this needs a token at all: nothing in",
      "the group itself is per-player."
    ].join("\n"),
    security: AUTHED,
    responses: {
      200: json(FeaturedRoomGroupDto, "The featured-room group"),
      401: UNAUTHORIZED_RESPONSE,
      404: { description: "The caller\u2019s client build is not one this is served to" }
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const version = await authedGameVersion(c);
    if (version === null || !FEATURED_ROOMS_VERSIONS.has(version)) {
      logger.info("featured rooms withheld: unsupported client build", { accountId, version });
      return c.notFound();
    }
    return c.json(await getFeaturedRooms(c.env.DB));
  }
).get(
  "/rooms/bulk",
  describeRoute({
    tags: ["Rooms"],
    summary: "Look up several rooms at once",
    description: [
      "Rooms by `id` \u2014 repeated `id` params, a comma-separated list, or both \u2014 or a single",
      "`name`. Ids that aren\u2019t in D1 are simply absent from the result rather than an error \u2014",
      "the client reads an empty result as NoSuchRoom. `excludePrivateRooms=True` drops rooms",
      "that are not publicly visible, as on the POST."
    ].join(" "),
    parameters: [
      stringQuery("id", "Room ids \u2014 repeated `id` fields, comma-separated, or both"),
      stringQuery("name", "A single room name. Ignored when `id` is given"),
      stringQuery("excludePrivateRooms", "True drops rooms that are not publicly visible")
    ],
    responses: {
      200: json(RoomDto.array(), "The rooms that matched (missing ids are omitted)"),
      400: json(
        MissingLookupParam,
        "Neither `id` nor `name` was supplied, or more than 100 ids were"
      )
    }
  }),
  async (c) => {
    const idParams = c.req.queries("id") ?? [];
    const nameParam = c.req.query("name");
    if (idParams.length === 0 && !nameParam) {
      return c.json("Either 'id' or 'name' query parameter is required", 400);
    }
    if (idParams.length > 0) {
      const ids = idParams.flatMap(allIds);
      if (ids.length > MAX_BULK_ROOM_IDS) return tooManyIds(c);
      const rooms = await getRoomsByIds(c.env.DB, ids);
      return c.json(
        excludePrivateRooms(c.req.query("excludePrivateRooms")) ? rooms.filter((r) => r.Accessibility === 1) : rooms
      );
    }
    const room = await getRoomByName(c.env.DB, nameParam ?? "");
    return c.json(room ? [room] : []);
  }
).post(
  "/rooms/bulk",
  describeRoute({
    tags: ["Rooms"],
    summary: "Look up several rooms at once (bulk POST)",
    description: [
      "Rooms by id, as a form body of repeated `id` fields \u2014 the form the client sends, since",
      "it asks about a whole room list at once. Ids that aren\u2019t in D1 are simply absent from",
      "the result rather than an error, so the array can be shorter than the request. At most",
      "100 ids per call (D1 binds one parameter each); more is a 400.",
      "",
      "`excludePrivateRooms=True` drops rooms that are not publicly visible. It is a filter",
      "the caller asks for, not an access check \u2014 like the GET, this answers by id whatever",
      "the room\u2019s accessibility, which is what makes a player\u2019s own unpublished room resolve."
    ].join("\n"),
    requestBody: form(BulkRoomsRequest, "The room ids, plus the optional filter"),
    responses: {
      200: json(RoomDto.array(), "The rooms that matched (missing ids are omitted)"),
      400: json(TooManyLookupIds, "More than 100 ids were asked for")
    }
  }),
  async (c) => {
    const body = await c.req.parseBody({ all: true }).catch(() => ({}));
    const field = (name) => {
      const key = Object.keys(body).find((k) => k.toLowerCase() === name.toLowerCase());
      const value = key === void 0 ? [] : body[key];
      return (Array.isArray(value) ? value : [value]).filter(
        (v) => typeof v === "string"
      );
    };
    const ids = field("id").flatMap(allIds);
    if (ids.length > MAX_BULK_ROOM_IDS) return tooManyIds(c);
    const rooms = await getRoomsByIds(c.env.DB, ids);
    const excludePrivate = excludePrivateRooms(field("excludePrivateRooms")[0]);
    return c.json(excludePrivate ? rooms.filter((r) => r.Accessibility === 1) : rooms);
  }
).get(
  "/roomserver/rooms/createdby/me",
  describeRoute({
    tags: ["My rooms"],
    summary: "Rooms the caller created (legacy path)",
    description: [
      "Every room the caller created, dorm included. Identical to",
      "`GET /rooms/createdby/me` \u2014 the 2023 client calls this one under the `/roomserver`",
      "prefix, so both forms are registered."
    ].join(" "),
    security: AUTHED,
    responses: { 200: json(RoomDto.array(), "The caller\u2019s rooms"), 401: UNAUTHORIZED_RESPONSE }
  }),
  ownedRooms
).get(
  "/rooms/ownedby/me",
  describeRoute({
    tags: ["My rooms"],
    summary: "Rooms the caller owns (excluding their dorm)",
    description: [
      "The caller\u2019s own rooms with the dorm filtered out: a dorm is auto-provisioned, not a",
      "room the player made, so it doesn\u2019t belong in the \u201Crooms you own\u201D list. Use",
      "`createdby/me` for everything the account created. Accessibility is deliberately NOT",
      "filtered \u2014 this is the owner\u2019s own list, so unpublished (Private) rooms appear, unlike",
      "the public `ownedby/{accountId}` profile list."
    ].join(" "),
    security: AUTHED,
    responses: {
      200: json(RoomDto.array(), "The caller\u2019s rooms, dorm excluded"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  ownedRoomsExcludingDorm
).get(
  "/rooms/createdby/me",
  describeRoute({
    tags: ["My rooms"],
    summary: "Rooms the caller created",
    description: "Every room the caller created, dorm included.",
    security: AUTHED,
    responses: { 200: json(RoomDto.array(), "The caller\u2019s rooms"), 401: UNAUTHORIZED_RESPONSE }
  }),
  ownedRooms
).get(
  "/rooms/contributedby/me",
  describeRoute({
    tags: ["My rooms"],
    summary: "Rooms the caller owns or contributes to",
    description: [
      "Every room the caller works on, as a bare array: the ones they CREATED plus the ones",
      "that name them in their `Roles` \u2014 Host, Moderator or CoOwner. Overlaps",
      "`createdby/me` deliberately, so a client rendering one list sees everything; the",
      "dorm is excluded as it is on `ownedby/me`. Every role tier counts, not only the",
      "owner-level ones, and accessibility is not filtered: a contributor works on the room",
      "whether or not it is published."
    ].join(" "),
    security: AUTHED,
    responses: {
      200: json(RoomDto.array(), "The rooms the caller owns or contributes to (empty when none)"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    return c.json(await getContributedRooms(c.env.DB, accountId));
  }
).get(
  "/dormroom/me",
  describeRoute({
    tags: ["My rooms"],
    summary: "The caller\u2019s dorm id",
    description: [
      "The `RoomId` of the caller\u2019s personal dorm, as a bare JSON number \u2014 NOT the room:",
      "fetch that from `GET /rooms/{roomId}` with the id this returns.",
      "",
      "The dorm is provisioned on first access (cloned from the seeded template dorm), so",
      "this answers for any authed caller and never 404s, and calling it again returns the",
      "same id."
    ].join(" "),
    security: AUTHED,
    responses: { 200: json(DormRoomId, "The caller\u2019s dorm id"), 401: UNAUTHORIZED_RESPONSE }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const dorm = await getOrCreateDormRoom(c.env.DB, accountId);
    return c.json(Number(dorm.RoomId));
  }
).get(
  "/rooms/ownedby/:accountId{[0-9]+}",
  describeRoute({
    tags: ["Rooms"],
    summary: "Another player\u2019s public rooms",
    description: [
      "The rooms an account owns that are publicly viewable \u2014 what the client shows on a",
      "player\u2019s profile. No auth; empty when the account owns no public rooms."
    ].join(" "),
    parameters: [
      {
        name: "accountId",
        in: "path",
        required: true,
        description: "The account whose rooms to list",
        schema: { type: "string", pattern: "^[0-9]+$" }
      }
    ],
    responses: { 200: json(RoomDto.array(), "That account\u2019s public rooms") }
  }),
  async (c) => c.json(await getPublicRoomsByCreator(c.env.DB, Number.parseInt(c.req.param("accountId"), 10)))
).get(
  "/showcase/:playerId{[0-9]+}",
  describeRoute({
    tags: ["Rooms"],
    summary: "A player\u2019s showcased rooms",
    description: [
      "The rooms a player has showcased on their profile, as a bare array. Nothing stores a",
      "showcase yet, so this is a stub serving an empty list \u2014 which the client reads as",
      "\u201Cnothing showcased\u201D, the same as a player who has picked none. Unlike",
      "`ownedby/{accountId}`, which lists everything public the account owns, a showcase is",
      "a chosen subset. No auth: a profile is public."
    ].join(" "),
    parameters: [playerIdParam],
    responses: { 200: json(ShowcasedRooms, "An empty list") }
  }),
  (c) => c.json([])
).get(
  "/rooms/favoritedby/me",
  describeRoute({
    tags: ["My rooms"],
    summary: "Rooms the caller favorited",
    description: "The rooms the caller has favorited (from the interaction table), as a bare array.",
    security: AUTHED,
    parameters: pageParams(100),
    responses: {
      200: json(RoomDto.array(), "The favorited rooms"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const skip = Number.parseInt(c.req.query("skip") ?? "0", 10) || 0;
    const take = Number.parseInt(c.req.query("take") ?? "100", 10) || 100;
    return c.json(await getFavoritedRooms(c.env.DB, accountId, skip, take));
  }
).get(
  "/rooms/visitedby/me",
  describeRoute({
    tags: ["My rooms"],
    summary: "Rooms the caller visited",
    description: [
      "The rooms the caller has visited \u2014 interaction rows carrying a last-visited time \u2014",
      "as a bare array."
    ].join(" "),
    security: AUTHED,
    parameters: pageParams(100),
    responses: { 200: json(RoomDto.array(), "The visited rooms"), 401: UNAUTHORIZED_RESPONSE }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const skip = Number.parseInt(c.req.query("skip") ?? "0", 10) || 0;
    const take = Number.parseInt(c.req.query("take") ?? "100", 10) || 100;
    return c.json(await getVisitedRooms(c.env.DB, accountId, skip, take));
  }
).get(
  "/rooms/visitedby/:playerId{[0-9]+}",
  describeRoute({
    tags: ["Rooms"],
    summary: "A friend\u2019s visited rooms",
    description: [
      "The rooms another player has visited, as a bare array. Friends only: the caller must",
      "be that player or a mutual friend of theirs (403 otherwise) \u2014 visit history is not",
      "public."
    ].join(" "),
    security: AUTHED,
    parameters: [playerIdParam, ...pageParams(100)],
    responses: {
      200: json(RoomDto.array(), "That player\u2019s visited rooms"),
      401: UNAUTHORIZED_RESPONSE,
      403: NOT_FRIENDS_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const playerId = Number.parseInt(c.req.param("playerId"), 10);
    if (playerId !== accountId && !await areFriends(c.env.DB, accountId, playerId)) {
      return c.body(null, 403);
    }
    const skip = Number.parseInt(c.req.query("skip") ?? "0", 10) || 0;
    const take = Number.parseInt(c.req.query("take") ?? "100", 10) || 100;
    return c.json(await getVisitedRooms(c.env.DB, playerId, skip, take));
  }
).get(
  "/rooms/:roomId{[0-9]+}/interactionby/me",
  describeRoute({
    tags: ["Interaction"],
    summary: "The caller\u2019s state on a room",
    description: [
      "Whether the caller has cheered/favorited the room. An unknown room (or one the caller",
      "has never touched) reads as all-false rather than 404. `LastVisitedAt` is stamped",
      "with \u201Cnow\u201D on every read, not served from storage."
    ].join(" "),
    security: AUTHED,
    parameters: [roomIdParam],
    responses: { 200: json(InteractionDto, "The interaction"), 401: UNAUTHORIZED_RESPONSE }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const interaction = await getInteraction(
      c.env.DB,
      accountId,
      Number.parseInt(c.req.param("roomId"), 10)
    );
    return c.json({ ...interaction, LastVisitedAt: (/* @__PURE__ */ new Date()).toISOString() });
  }
).put(
  "/rooms/:roomId{[0-9]+}/interactionby/me/cheer",
  describeRoute({
    tags: ["Interaction"],
    summary: "Toggle the caller\u2019s cheer on a room",
    description: "Flips the stored cheer flag and answers the updated interaction.",
    security: AUTHED,
    parameters: [roomIdParam],
    responses: {
      200: json(InteractionDto, "The interaction after the toggle"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const interaction = await toggleCheer(
      c.env.DB,
      accountId,
      Number.parseInt(c.req.param("roomId"), 10)
    );
    return c.json({ ...interaction, LastVisitedAt: (/* @__PURE__ */ new Date()).toISOString() });
  }
).delete(
  "/rooms/:roomId{[0-9]+}/interactionby/me/cheer",
  describeRoute({
    tags: ["Interaction"],
    summary: "Un-cheer a room",
    description: [
      "Clears the cheer outright, where the PUT toggles it. Idempotent \u2014 un-cheering a room",
      "that isn\u2019t cheered is a no-op."
    ].join(" "),
    security: AUTHED,
    parameters: [roomIdParam],
    responses: { 200: json(InteractionDto, "The interaction"), 401: UNAUTHORIZED_RESPONSE }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const interaction = await removeCheer(
      c.env.DB,
      accountId,
      Number.parseInt(c.req.param("roomId"), 10)
    );
    return c.json({ ...interaction, LastVisitedAt: (/* @__PURE__ */ new Date()).toISOString() });
  }
).put(
  "/rooms/:roomId{[0-9]+}/interactionby/me/favorite",
  describeRoute({
    tags: ["Interaction"],
    summary: "Toggle the caller\u2019s favorite on a room",
    description: "Flips the stored favorite flag and answers the updated interaction.",
    security: AUTHED,
    parameters: [roomIdParam],
    responses: {
      200: json(InteractionDto, "The interaction after the toggle"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const interaction = await toggleFavorite(
      c.env.DB,
      accountId,
      Number.parseInt(c.req.param("roomId"), 10)
    );
    return c.json({ ...interaction, LastVisitedAt: (/* @__PURE__ */ new Date()).toISOString() });
  }
).delete(
  "/rooms/:roomId{[0-9]+}/interactionby/me/favorite",
  describeRoute({
    tags: ["Interaction"],
    summary: "Un-favorite a room",
    description: [
      "Clears the favorite outright, where the PUT toggles it. Idempotent \u2014 un-favoriting a",
      "room that isn\u2019t favorited is a no-op."
    ].join(" "),
    security: AUTHED,
    parameters: [roomIdParam],
    responses: { 200: json(InteractionDto, "The interaction"), 401: UNAUTHORIZED_RESPONSE }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const interaction = await removeFavorite(
      c.env.DB,
      accountId,
      Number.parseInt(c.req.param("roomId"), 10)
    );
    return c.json({ ...interaction, LastVisitedAt: (/* @__PURE__ */ new Date()).toISOString() });
  }
).post(
  "/rooms/:roomId{[0-9]+}/clone",
  describeRoute({
    tags: ["Room settings"],
    summary: "Clone a room",
    description: [
      "Copies a room\u2019s content (scene, subrooms, settings) into a new room owned by the",
      "caller. Cloning is the only way to make a room, so the per-account room cap is",
      "enforced here \u2014 it counts the rooms the account created, minus their auto-provisioned",
      "dorm (`MAX_ROOMS_PER_ACCOUNT`; 0 lifts the cap). The clone starts with no tags,",
      "`IsRRO` cleared, and PRIVATE accessibility \u2014 a new room is unpublished until its",
      "owner sets its accessibility, so it never lands in the public feeds on creation.",
      "",
      "Rejections \u2014 a blank or taken name, the cap, a source that disallows cloning \u2014 are",
      "HTTP 200 with `success: false` and the message the client shows."
    ].join("\n"),
    security: AUTHED,
    parameters: [roomIdParam],
    requestBody: form(CloneRoomRequest, "The new room\u2019s name (also read from `?name=`)"),
    responses: {
      200: json(RoomEnvelope, "The new room, or a rejection with `success: false`"),
      401: UNAUTHORIZED_ENVELOPE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) {
      return c.json({ success: false, error: "Unauthorized", value: null }, 401);
    }
    const body = await c.req.parseBody().catch(() => ({}));
    const raw = body.name ?? c.req.query("name") ?? "";
    const name = typeof raw === "string" ? raw.trim() : "";
    if (name === "") return roomEnvelope(c, null, "You must enter a name for your room.");
    const badName = roomNameRejection(name, "room name");
    if (badName !== null) return roomEnvelope(c, null, badName);
    if (await getRoomByName(c.env.DB, name)) {
      return roomEnvelope(c, null, "A room with that name already exists!");
    }
    const maxRooms = intVar(c.env.MAX_ROOMS_PER_ACCOUNT, DEFAULT_MAX_ROOMS_PER_ACCOUNT);
    if (maxRooms > 0 && await countRoomsByCreator(c.env.DB, accountId) >= maxRooms) {
      logger.info("room create rejected: per-account room limit", { accountId });
      return roomEnvelope(c, null, `You can only have ${maxRooms} rooms.`);
    }
    const room = await cloneRoom(
      c.env.DB,
      Number.parseInt(c.req.param("roomId"), 10),
      name,
      accountId
    );
    if (!room) return roomEnvelope(c, null, "You can't clone this room!");
    return roomEnvelope(c, room);
  }
).put(
  "/rooms/:roomId{[0-9]+}/description",
  describeRoute({
    tags: ["Room settings"],
    summary: "Set a room\u2019s description",
    description: [
      "Owner-only (the room\u2019s `CreatorAccountId` \u2014 co-owners cannot). An unknown room or a",
      "non-owner is HTTP 200 with `Success: false` and an `ErrorId`; only a missing token is",
      "a real 401. An absent `description` field clears the description. Pushes a",
      "`RoomUpdate` to the owner \u2014 this envelope carries no room, so the push is the only",
      "thing that tells their client to redraw."
    ].join(" "),
    security: AUTHED,
    parameters: [roomIdParam],
    requestBody: form(DescriptionRequest, "The new description"),
    responses: {
      200: json(RoomResultEnvelope, "Success, or a rejection carrying an `ErrorId`"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) {
      return roomResult(c, {
        Success: false,
        ErrorId: "Rooms.DoesntExist",
        Error: "This room does not exist!"
      });
    }
    if (room.CreatorAccountId !== accountId) {
      return roomResult(c, {
        Success: false,
        ErrorId: "Rooms.NotOwner",
        Error: "You are not the owner of this room!"
      });
    }
    const body = await c.req.parseBody().catch(() => ({}));
    const description = typeof body.description === "string" ? body.description : "";
    await setRoomDescription(c.env.DB, roomId, description);
    await pushRoomUpdate(c, accountId, { ...room, Description: description });
    return roomResult(c, { Success: true });
  }
).put(
  "/rooms/:roomId{[0-9]+}/name",
  describeRoute({
    tags: ["Room settings"],
    summary: "Rename a room",
    description: [
      "Owner-only. The new name must be non-empty and not already taken by another room",
      "(names are compared case-insensitively). Rejections are HTTP 200 with",
      "`Success: false`.",
      "",
      "NOTE: the `ErrorId` strings other than `Rooms.DoesntExist` are best guesses \u2014 the",
      "client only renders `Error`, so they have never been confirmed against the real one."
    ].join("\n"),
    security: AUTHED,
    parameters: [roomIdParam],
    requestBody: form(NameRequest, "The new name"),
    responses: {
      200: json(RoomResultEnvelope, "Success, or a rejection carrying an `ErrorId`"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) {
      return roomResult(c, {
        Success: false,
        ErrorId: "Rooms.DoesntExist",
        Error: "This room does not exist!"
      });
    }
    if (room.CreatorAccountId !== accountId) {
      return roomResult(c, {
        Success: false,
        ErrorId: "Rooms.NotOwner",
        Error: "You are not the owner of this room!"
      });
    }
    const body = await c.req.parseBody().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name === "") {
      return roomResult(c, {
        Success: false,
        ErrorId: "Rooms.InvalidName",
        Error: "You must enter a name for your room!"
      });
    }
    const badName = roomNameRejection(name, "room name");
    if (badName !== null) {
      return roomResult(c, { Success: false, ErrorId: "Rooms.InvalidName", Error: badName });
    }
    const existing = await getRoomByName(c.env.DB, name);
    if (existing && existing.RoomId !== roomId) {
      return roomResult(c, {
        Success: false,
        ErrorId: "Rooms.AlreadyExists",
        Error: "A room with that name already exists!"
      });
    }
    await setRoomName(c.env.DB, roomId, name);
    await pushRoomUpdate(c, accountId, { ...room, Name: name });
    return roomResult(c, { Success: true });
  }
).put(
  "/rooms/:roomId{[0-9]+}/tags",
  describeRoute({
    tags: ["Room settings"],
    summary: "Toggle a tag on a room",
    description: [
      "Owner or co-owner only (403 otherwise). Two bodies reach this one path, and the",
      "FIELDS say which \u2014 not the URL.",
      "",
      "**A lone `tag=<name>` TOGGLES** (the 2023 form): there is no delete/patch",
      "counterpart, so the same call adds the tag (Type 0) when absent and removes it when",
      "present, and the \u201Cmain\u201D tags (`pvp`/`quest`/`game`/`hangout`/`art`) behave as radio",
      "buttons among themselves.",
      "",
      "**Anything else is a whole-state save** \u2014 the form room settings posts, e.g.",
      "`autoTag=limitsv2&tag=roleplay&tag=social&tag=sports&primaryGenreTag=roleplay`.",
      "Nothing toggles here; the three fields compose into one write:",
      "",
      "- `tag` repeats and is the COMPLETE set of user (Type 0) tags \u2014 one the body omits",
      "is removed. Derived tags are not the client\u2019s to send and are left alone.",
      "- `autoTag` repeats and adds a derived tag at **Type 1** (`limitsv2`, `beta`). It is",
      "additive: it never removes one, since the client posts what it wants rather than the",
      "full set. A tag already on the room is re-categorised rather than duplicated.",
      "- `primaryGenreTag` flags the room\u2019s genre. The tag is added as a Type 0 tag when",
      "the room lacks it and left as it stands when it has it; `IsPrimaryGenre: true` moves",
      "onto it, and every OTHER tag loses the flag but KEEPS its place.",
      "",
      "Answers the lowercase envelope with the updated room, which the client re-renders",
      "from, and pushes a `RoomUpdate` to the owner for their other sessions."
    ].join("\n"),
    security: AUTHED,
    parameters: [roomIdParam],
    requestBody: form(TagRequest, "The tag to toggle"),
    responses: {
      200: json(RoomEnvelope, "The updated room, or a rejection with `success: false`"),
      401: UNAUTHORIZED_RESPONSE,
      403: FORBIDDEN_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) return roomEnvelope(c, null, "This room does not exist!");
    if (!canManageRoom(room, accountId)) return c.body(null, 403);
    const body = await c.req.parseBody({ all: true }).catch(() => ({}));
    const values = (name) => (Array.isArray(body[name]) ? body[name] : [body[name]]).filter((v) => typeof v === "string").map((v) => v.trim()).filter((v) => v !== "");
    const tags = values("tag");
    const autoTags = values("autoTag");
    const primaryGenre = values("primaryGenreTag")[0];
    if (tags.length === 0 && autoTags.length === 0 && primaryGenre === void 0) {
      return roomEnvelope(c, null, "You must provide a tag!");
    }
    const isToggle = tags.length === 1 && autoTags.length === 0 && primaryGenre === void 0;
    const updated = await applyRoomTagEdit(c.env.DB, roomId, room, {
      toggle: isToggle ? tags[0] : void 0,
      tags: isToggle ? void 0 : tags.length > 0 ? tags : void 0,
      autoTags,
      primaryGenre
    });
    await pushRoomUpdate(c, accountId, updated);
    return roomEnvelope(c, updated);
  }
).put(
  "/rooms/:roomId{[0-9]+}/image",
  describeRoute({
    tags: ["Room settings"],
    summary: "Set a room\u2019s image",
    description: [
      "Owner-only. `imageName` is a key from the storage upload, stored un-prefixed (the",
      "`cdn` worker serves it back under `room/`). Pushes a `RoomUpdate` to the owner so",
      "their client re-renders with the new image."
    ].join(" "),
    security: AUTHED,
    parameters: [roomIdParam],
    requestBody: form(ImageRequest, "The uploaded image key"),
    responses: {
      200: json(RoomResultEnvelope, "Success, or a rejection carrying an `ErrorId`"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) {
      return roomResult(c, {
        Success: false,
        ErrorId: "Rooms.DoesntExist",
        Error: "This room does not exist!"
      });
    }
    if (room.CreatorAccountId !== accountId) {
      return roomResult(c, {
        Success: false,
        ErrorId: "Rooms.NotOwner",
        Error: "You are not the owner of this room!"
      });
    }
    const body = await c.req.parseBody().catch(() => ({}));
    const imageName = typeof body.imageName === "string" ? body.imageName.trim() : "";
    if (imageName === "") {
      return roomResult(c, {
        Success: false,
        ErrorId: "Rooms.InvalidImage",
        Error: "You must provide an image!"
      });
    }
    await setRoomImage(c.env.DB, roomId, imageName);
    await pushRoomUpdate(c, accountId, { ...room, ImageName: imageName });
    return roomResult(c, { Success: true });
  }
).delete(
  "/rooms/:roomId{[0-9]+}",
  describeRoute({
    tags: ["Room settings"],
    summary: "Delete a room",
    description: [
      "Owner-only. Removes the room record, the per-player interactions with it, and the",
      "room\u2019s image object from the shared CDN bucket. Photos players TOOK in the room are",
      "left alone \u2014 those live in the api/img world and outlive the room."
    ].join(" "),
    security: AUTHED,
    parameters: [roomIdParam],
    responses: {
      200: json(RoomResultEnvelope, "Success, or a rejection carrying an `ErrorId`"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) {
      return roomResult(c, {
        Success: false,
        ErrorId: "Rooms.DoesntExist",
        Error: "This room does not exist!"
      });
    }
    if (room.CreatorAccountId !== accountId) {
      return roomResult(c, {
        Success: false,
        ErrorId: "Rooms.NotOwner",
        Error: "You are not the owner of this room!"
      });
    }
    await deleteRoom(c.env.DB, roomId);
    const imageName = typeof room.ImageName === "string" ? room.ImageName : "";
    if (imageName !== "") {
      await c.env.CDN_ASSETS.delete(`room/${imageName}`);
    }
    return roomResult(c, { Success: true });
  }
).get(
  "/rooms/:roomId{[0-9]+}/roles",
  describeRoute({
    tags: ["Room settings"],
    summary: "A room\u2019s roles",
    description: [
      "Everyone with a role in the room \u2014 its creator plus whoever has been granted Host,",
      "Moderator or CoOwner \u2014 as whole `RoomRole` records. This is the same array the",
      "room DTO serves under `Roles`, on its own endpoint, so it is public exactly like the",
      "room is: a role list says who runs a room, which the room page already shows.",
      "",
      "A bare array, NOT the `{ success, error, value }` envelope the role WRITE answers. An",
      "unknown room is an empty list rather than an error \u2014 it reads the same as a room",
      "nobody holds a role in."
    ].join("\n"),
    parameters: [roomIdParam],
    responses: {
      200: json(RoomRoleDto.array(), "The room\u2019s role assignments")
    }
  }),
  async (c) => {
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    return c.json(room ? roomRoles(room) : []);
  }
).put(
  "/rooms/:roomId{[0-9]+}/roles/:accountId{[0-9]+}",
  describeRoute({
    tags: ["Room settings"],
    summary: "Set a player\u2019s role in a room",
    description: [
      "Two callers share this path, told apart by whether the `accountId` in it is the",
      "caller\u2019s own.",
      "",
      "**The room\u2019s owner or a co-owner, granting a role to someone else.** Takes effect",
      "immediately, updating the target\u2019s entry in `Roles` or adding one. `Role` 30",
      "(CoOwner) is refused: co-ownership is offered with `PUT \u2026/roles/{accountId}/invite`",
      "and accepted by the invited player, which is what the other half of this endpoint",
      "is for. `Role` 255 (Creator) is refused too \u2014 it is strictly more than the tier",
      "that needs an invite, so it cannot be the one grant that skips the ceremony.",
      "Any pending invite on the entry is left standing.",
      "",
      "**The invited player, answering their own co-owner invite.** Accepting promotes",
      "their entry from its pending `InvitedRole` to the real `Role` and clears the",
      "pending one \u2014 an accepted entry reads `Role: 30, InvitedRole: 0`, so an invite",
      "cannot be answered twice. The `role` body field must equal the `InvitedRole` the",
      "owner offered: without that check the invited player could answer an invite to",
      "Host by asking for Creator and award themselves the room. Declining is `role=0`",
      "and drops the entry outright, leaving `Roles` as it was before the offer \u2014 note",
      "that this takes any role they already held with it. No entry, no invite standing,",
      "and the wrong role are all the same rejection, so probing tells the caller nothing.",
      "",
      "Everyone standing in the room right now gets the `RoomUpdate` push, and so does the",
      "affected player wherever they are \u2014 a role change alters what the room lets people",
      "do, and every client showing it re-renders from the room they are pushed. The",
      "caller reads the same room out of the envelope."
    ].join("\n"),
    security: AUTHED,
    parameters: [
      roomIdParam,
      {
        name: "accountId",
        in: "path",
        required: true,
        description: "The player whose role changes \u2014 the caller\u2019s own id to answer an invite",
        schema: { type: "string", pattern: "^[0-9]+$" }
      }
    ],
    requestBody: form(RoleRequest, "The role tier, or 0 to decline an invite"),
    responses: {
      200: json(RoomEnvelope, "The updated room, or a rejection with `success: false`"),
      401: UNAUTHORIZED_RESPONSE,
      403: FORBIDDEN_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const targetAccountId = Number.parseInt(c.req.param("accountId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) return roomEnvelope(c, null, "This room does not exist!");
    const body = await c.req.parseBody().catch(() => ({}));
    const role = typeof body.role === "string" ? Number.parseInt(body.role, 10) : Number.NaN;
    if (Number.isNaN(role)) return roomEnvelope(c, null, "You must provide a valid role!");
    if (targetAccountId === accountId) {
      const answered = await answerRoomRoleInvite(c.env.DB, roomId, accountId, role, room);
      if (!answered) return roomEnvelope(c, null, "You have no such invite to this room!");
      await pushRoomUpdateToRoom(c, roomId, answered);
      return roomEnvelope(c, answered);
    }
    if (!canManageRoom(room, accountId)) return c.body(null, 403);
    if (role === Role.None) return roomEnvelope(c, null, "You must provide a valid role!");
    const updated = await setRoomRole(c.env.DB, roomId, targetAccountId, role, accountId, room);
    if (!updated) return roomEnvelope(c, null, "Co-ownership must be invited, not granted!");
    await pushRoomUpdateToRoom(c, roomId, updated, [targetAccountId]);
    return roomEnvelope(c, updated);
  }
).put(
  "/rooms/:roomId{[0-9]+}/roles/:accountId{[0-9]+}/invite",
  describeRoute({
    tags: ["Room settings"],
    summary: "Invite a player to a room role",
    description: [
      "Sets `InvitedRole` on the target\u2019s entry in the room\u2019s `Roles` (adding an entry at",
      "`Role` 0 when they have none) \u2014 the PENDING half of a role entry, held until they",
      "accept, at which point the role proper is granted. Someone who already holds a role",
      "keeps it while a higher one is pending.",
      "",
      "Gated to the room\u2019s OWNER \u2014 its creator, or the holder of the Creator role. Narrower",
      "than setting a role outright, which a co-owner may also do: otherwise a co-owner",
      "could quietly grow the set of people who can change the room. A valid token from",
      "anyone else is a 403.",
      "",
      "The INVITED player gets a durable `MessageReceived` frame carrying a Message of type",
      "62 (`RoomCoOwnerInvited`), naming the inviter, the room, and the offered role as its",
      "`Data` \u2014 that message, not the `Roles` entry, is what their client raises the invite",
      "from, and the role in it is what they send back to accept.",
      "",
      "Answers a bare `{ success: true }`, NOT the `{ success, error, value }` room",
      "envelope: nothing on the inviter\u2019s screen re-renders from an invite."
    ].join("\n"),
    security: AUTHED,
    parameters: [
      roomIdParam,
      {
        name: "accountId",
        in: "path",
        required: true,
        description: "The player being invited",
        schema: { type: "string", pattern: "^[0-9]+$" }
      }
    ],
    requestBody: form(InviteRoleRequest, "The role tier being offered"),
    responses: {
      200: json(SuccessEnvelope, "The invite was recorded and pushed"),
      401: UNAUTHORIZED_RESPONSE,
      403: FORBIDDEN_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const targetAccountId = Number.parseInt(c.req.param("accountId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room || !isRoomOwner(room, accountId)) return c.body(null, 403);
    const body = await c.req.parseBody().catch(() => ({}));
    const role = typeof body.role === "string" ? Number.parseInt(body.role, 10) : Number.NaN;
    if (Number.isNaN(role)) return c.body(null, 400);
    await inviteRoomRole(c.env.DB, roomId, targetAccountId, role, accountId, room);
    await pushRoleInvite(c, roomId, accountId, targetAccountId, role);
    return c.json({ success: true });
  }
).get(
  "/rooms/:roomId{[0-9]+}/bans",
  describeRoute({
    tags: ["Room settings"],
    summary: "A room\u2019s ban list",
    description: [
      "Everyone banned from the room, most recently banned first. Auth-gated, then gated",
      "exactly like issuing a ban: the room\u2019s creator or a co-owner, or an account whose",
      "token carries the `developer` / `moderator` role. A ban list says who a room\u2019s",
      "owner has had trouble with, so it is not public.",
      "",
      "A bare array, NOT the `{ success, error, value }` envelope the ban write answers,",
      "and the entries are camelCase with a different field set: no room id (the path",
      "already says which room) and no ban mask. An unknown room is an empty list rather",
      "than an error \u2014 it reads the same as a room nobody is banned from."
    ].join("\n"),
    security: AUTHED,
    parameters: [roomIdParam],
    responses: {
      200: json(RoomBanEntryDto.array(), "The room\u2019s bans, newest first"),
      401: UNAUTHORIZED_RESPONSE,
      403: FORBIDDEN_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) return c.json([]);
    if (!canManageRoom(room, accountId) && !await isStaff(c)) return c.body(null, 403);
    const bans = await getRoomBans(c.env.DB, roomId);
    return c.json(
      bans.map((ban) => ({
        accountId: ban.BannedPlayerId,
        bannedByAccountId: ban.BannedByAccountId,
        banStartTime: ban.CreatedAt
      }))
    );
  }
).post(
  "/rooms/:roomId{[0-9]+}/bans",
  describeRoute({
    tags: ["Room settings"],
    summary: "Ban a player from a room",
    description: [
      "Records a ban in the `room_ban` table \u2014 one row per (room, player), so re-banning",
      "someone already banned rewrites their row rather than adding a second. The row is",
      "what the `match` worker checks: a banned player\u2019s matchmake into this room is",
      "refused with errorCode 55 and never gets a Photon room id.",
      "",
      "Gated to the room\u2019s creator or a co-owner, OR to any account whose token carries the",
      "`developer` / `moderator` role \u2014 a valid token from anyone else is a 403. Banning",
      "yourself, or banning someone who can manage the room, is refused: otherwise a",
      "co-owner could ban the owner out of their own room.",
      "",
      "`banMask` is stored verbatim and nothing interprets it \u2014 the client sends `0` and",
      "what it selects is not known yet. It defaults to 0 when absent.",
      "",
      "The BANNED player (not the caller) gets a `ModerationKick` push (id 22) \u2014 the frame",
      "the client acts on to eject someone \u2014 so a ban takes effect immediately rather than",
      "only at their next matchmake. `isBan` is true, `duration` 0 (a room ban has no",
      "expiry; it is lifted by DELETE, not by time) and `reportCategory` -1 (Moderator).",
      "",
      "`isHostKick` means the room\u2019s HOST ejected them rather than the room majority",
      "vote-kicking them; with no vote-kick path yet the only false case is a staff",
      "moderator acting in a room they do not host. `playerIdReporter` is whoever caused",
      "it \u2014 the host today, the player who started the vote once vote-kicks exist. The hub",
      "queues the frame if they are offline.",
      "",
      "Answers the same lowercase `{ success, error, value }` envelope the room writes use,",
      "but `value` is the BAN, not the room \u2014 a ban is not part of the room the client",
      "renders. This shape is unverified against the real service."
    ].join("\n"),
    security: AUTHED,
    parameters: [roomIdParam],
    requestBody: form(BanRequest, "The player to ban"),
    responses: {
      200: json(RoomBanEnvelope, "The stored ban, or a rejection with `success: false`"),
      401: UNAUTHORIZED_RESPONSE,
      403: FORBIDDEN_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) return banEnvelope(c, null, "This room does not exist!");
    const isHostKick = canManageRoom(room, accountId);
    if (!isHostKick && !await isStaff(c)) return c.body(null, 403);
    const body = await c.req.parseBody().catch(() => ({}));
    const str = (v) => typeof v === "string" ? v : "";
    const bannedPlayerId = Number.parseInt(str(body.id), 10);
    if (Number.isNaN(bannedPlayerId)) {
      return banEnvelope(c, null, "You must provide a valid player to ban!");
    }
    if (bannedPlayerId === accountId) return banEnvelope(c, null, "You cannot ban yourself!");
    if (canManageRoom(room, bannedPlayerId)) {
      return banEnvelope(c, null, "You cannot ban an owner of this room!");
    }
    const banMask = Number.parseInt(str(body.banMask), 10) || 0;
    const ban = await banPlayerFromRoom(c.env.DB, roomId, bannedPlayerId, banMask, accountId);
    const roomName = typeof room.Name === "string" ? room.Name : "this room";
    await pushRoomBan(c, ban, roomName, isHostKick);
    return banEnvelope(c, ban);
  }
).get(
  "/Room_server/rooms/:roomId{[0-9]+}/bans/:playerId{[0-9]+}/isBanned",
  describeRoute({
    tags: ["Room settings"],
    summary: "Whether a player is banned from a room",
    description: [
      "Whether `playerId` is banned from `roomId`, read from the same `room_ban` rows the",
      "ban routes write and `match` refuses matchmakes on \u2014 so it answers what would",
      "actually happen, not a stub.",
      "",
      "The envelope is `{ success, error, error_id, value }`: `success` says the check ran,",
      "`value` is the answer. It is NOT the room mutations\u2019 envelope \u2014 that one has no",
      '`error_id` and uses `""` where this uses null.',
      "",
      "Auth-gated, but any authenticated caller may ask: a ban is not a secret from the",
      "player it stops. The path is the client\u2019s own capitalised `/Room_server/` spelling."
    ].join("\n"),
    security: AUTHED,
    parameters: [
      roomIdParam,
      {
        name: "playerId",
        in: "path",
        required: true,
        description: "The account being asked about",
        schema: { type: "string", pattern: "^[0-9]+$" }
      }
    ],
    responses: {
      200: json(IsBannedEnvelope, "Whether that player is banned from that room"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    return c.json({ success: true, error: null, error_id: null, value: await pathBan(c) });
  }
).get(
  "/rooms/:roomId{[0-9]+}/bans/:playerId{[0-9]+}/isBanned",
  describeRoute({
    tags: ["Room settings"],
    summary: "Whether a player is banned from a room (unprefixed path)",
    description: [
      "The same `room_ban` check as the `/Room_server/` route, on the path the client uses",
      "against the rooms host directly \u2014 and in the PascalCase envelope it reads there:",
      "`{ Value, Success, Error, error_id }`, with `error_id` lowercase.",
      "",
      "The two envelopes are NOT unified. The client\u2019s decoder drops members it does not",
      "recognise, so serving the other route\u2019s lowercase `value` here would decode as",
      "`false` \u2014 a banned player shown as unbanned \u2014 rather than fail.",
      "",
      "Auth-gated, but any authenticated caller may ask: a ban is not a secret from the",
      "player it stops. A room that does not exist has no bans, so it answers",
      "`Value: false` rather than 404ing \u2014 the check is about the ban row, not the room."
    ].join("\n"),
    security: AUTHED,
    parameters: [roomIdParam, bannedPlayerIdParam],
    responses: {
      200: json(IsBannedPascalEnvelope, "Whether that player is banned from that room"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    return c.json({ Value: await pathBan(c), Success: true, Error: null, error_id: null });
  }
).delete(
  "/rooms/:roomId{[0-9]+}/bans/:playerId{[0-9]+}",
  describeRoute({
    tags: ["Room settings"],
    summary: "Unban a player from a room",
    description: [
      "Removes the player\u2019s `room_ban` row, so they can matchmake into the room again.",
      "Gated exactly like issuing a ban: the room\u2019s creator or a co-owner, or an account",
      "whose token carries the `developer` / `moderator` role.",
      "",
      "Unbanning someone who is not banned is a rejection (`success: false`), not a silent",
      "success \u2014 the caller asked to undo something that was not there.",
      "",
      "Answers the same envelope as the ban write, with the REMOVED ban as `value`. No",
      "notification is pushed: nothing tells a player their ban was lifted."
    ].join("\n"),
    security: AUTHED,
    parameters: [roomIdParam, bannedPlayerIdParam],
    responses: {
      200: json(RoomBanEnvelope, "The removed ban, or a rejection with `success: false`"),
      401: UNAUTHORIZED_RESPONSE,
      403: FORBIDDEN_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) return banEnvelope(c, null, "This room does not exist!");
    if (!canManageRoom(room, accountId) && !await isStaff(c)) return c.body(null, 403);
    const playerId = Number.parseInt(c.req.param("playerId"), 10);
    const removed = await unbanPlayerFromRoom(c.env.DB, roomId, playerId);
    if (!removed) return banEnvelope(c, null, "This player is not banned from this room!");
    return banEnvelope(c, removed);
  }
).post(
  "/rooms/:roomId{[0-9]+}/leaderboards/:leaderboardId{[0-9]+}",
  describeRoute({
    tags: ["Room settings"],
    summary: "Configure a room leaderboard",
    description: [
      "Creates or reconfigures one leaderboard slot in the `room_leaderboard` table \u2014 one",
      "row per (room, slot), so re-posting a slot rewrites its title, format and direction",
      "rather than adding a second. The slot number in the path is the client\u2019s small",
      "ordinal (1, 2, 3\u2026), unique only within the room. Owner or co-owner only (403",
      "otherwise).",
      "",
      "`statFormat` is stored verbatim (default 0); `sortAscending` is the client\u2019s",
      "`True`/`False` string (default `False`).",
      "",
      "Answers a bare `{ Success, Error, error_id }` \u2014 PascalCase with a lowercase",
      "`error_id`, like the unprefixed isBanned route, carrying no entity. NOT the room",
      "mutations\u2019 lowercase `{ success, error, value }`."
    ].join("\n"),
    security: AUTHED,
    parameters: [roomIdParam, leaderboardIdParam],
    requestBody: form(LeaderboardRequest, "The leaderboard configuration"),
    responses: {
      200: json(LeaderboardResultEnvelope, "Stored, or a rejection with `Success: false`"),
      401: UNAUTHORIZED_RESPONSE,
      403: FORBIDDEN_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) return leaderboardEnvelope(c, "This room does not exist!");
    if (!canManageRoom(room, accountId)) return c.body(null, 403);
    const leaderboardId = Number.parseInt(c.req.param("leaderboardId"), 10);
    const body = await c.req.parseBody().catch(() => ({}));
    const title = typeof body.leaderboardTitle === "string" ? body.leaderboardTitle : "";
    const statFormat = typeof body.statFormat === "string" ? Number.parseInt(body.statFormat, 10) : Number.NaN;
    const sortAscending = typeof body.sortAscending === "string" && body.sortAscending.toLowerCase() === "true";
    await setRoomLeaderboard(
      c.env.DB,
      roomId,
      leaderboardId,
      title,
      Number.isNaN(statFormat) ? 0 : statFormat,
      sortAscending
    );
    return leaderboardEnvelope(c);
  }
).delete(
  "/rooms/:roomId{[0-9]+}/leaderboards/:leaderboardId{[0-9]+}",
  describeRoute({
    tags: ["Room settings"],
    summary: "Remove a room leaderboard",
    description: [
      "Removes the slot\u2019s `room_leaderboard` row. Owner or co-owner only (403 otherwise).",
      "",
      "Removing a slot that isn\u2019t configured is a rejection (`Success: false`), not a",
      "silent success \u2014 the caller asked to undo something that was not there. The client",
      "deletes slots blindly when tearing boards down and tolerates the refusal.",
      "",
      "Answers the same bare `{ Success, Error, error_id }` as the leaderboard write."
    ].join("\n"),
    security: AUTHED,
    parameters: [roomIdParam, leaderboardIdParam],
    responses: {
      200: json(LeaderboardResultEnvelope, "Removed, or a rejection with `Success: false`"),
      401: UNAUTHORIZED_RESPONSE,
      403: FORBIDDEN_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) return leaderboardEnvelope(c, "This room does not exist!");
    if (!canManageRoom(room, accountId)) return c.body(null, 403);
    const leaderboardId = Number.parseInt(c.req.param("leaderboardId"), 10);
    const removed = await deleteRoomLeaderboard(c.env.DB, roomId, leaderboardId);
    if (!removed) return leaderboardEnvelope(c, "This room has no such leaderboard!");
    return leaderboardEnvelope(c);
  }
).put(
  "/rooms/:roomId{[0-9]+}/warning",
  describeRoute({
    tags: ["Room settings"],
    summary: "Set a room\u2019s content warning",
    description: [
      "The `WarningMask` bit flags plus an optional free-text `CustomWarning`. Owner or",
      "co-owner only (403 otherwise). `CustomWarning` is only touched when the field is",
      "present \u2014 sending it empty clears it, omitting it leaves it alone."
    ].join(" "),
    security: AUTHED,
    parameters: [roomIdParam],
    requestBody: form(WarningRequest, "The warning flags and optional custom text"),
    responses: {
      200: json(RoomEnvelope, "The updated room, or a rejection with `success: false`"),
      401: UNAUTHORIZED_RESPONSE,
      403: FORBIDDEN_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) return roomEnvelope(c, null, "This room does not exist!");
    if (!canManageRoom(room, accountId)) return c.body(null, 403);
    const body = await c.req.parseBody().catch(() => ({}));
    const warningMask = typeof body.warningMask === "string" ? Number.parseInt(body.warningMask, 10) : Number.NaN;
    if (Number.isNaN(warningMask))
      return roomEnvelope(c, null, "You must provide a valid warning mask!");
    const patch = { WarningMask: warningMask };
    if (typeof body.customWarning === "string") patch.CustomWarning = body.customWarning;
    const updated = await updateRoomFields(c.env.DB, roomId, room, patch);
    await pushRoomUpdate(c, accountId, updated);
    return roomEnvelope(c, updated);
  }
).put(
  "/rooms/:roomId{[0-9]+}/cloning",
  describeRoute({
    tags: ["Room settings"],
    summary: "Allow or block cloning of a room",
    description: [
      "Sets `CloningAllowed` \u2014 false makes `POST /rooms/{roomId}/clone` refuse. Owner or",
      "co-owner only (403 otherwise)."
    ].join(" "),
    security: AUTHED,
    parameters: [roomIdParam],
    requestBody: form(CloningRequest, "Whether cloning is allowed"),
    responses: {
      200: json(RoomEnvelope, "The updated room, or a rejection with `success: false`"),
      401: UNAUTHORIZED_RESPONSE,
      403: FORBIDDEN_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) return roomEnvelope(c, null, "This room does not exist!");
    if (!canManageRoom(room, accountId)) return c.body(null, 403);
    const body = await c.req.parseBody().catch(() => ({}));
    if (typeof body.cloningAllowed !== "string") {
      return roomEnvelope(c, null, "You must provide cloningAllowed.");
    }
    const cloningAllowed = body.cloningAllowed.toLowerCase() === "true";
    const updated = await updateRoomFields(c.env.DB, roomId, room, {
      CloningAllowed: cloningAllowed
    });
    await pushRoomUpdate(c, accountId, updated);
    return roomEnvelope(c, updated);
  }
).put(
  "/rooms/:roomId{[0-9]+}/restrictions",
  describeRoute({
    tags: ["Room settings"],
    summary: "Set a room\u2019s platform/movement support flags",
    description: [
      "The room\u2019s `Supports*` restrictions \u2014 which platforms and movement modes may enter.",
      "Owner or co-owner only (403 otherwise). Only the fields actually posted are changed,",
      "and field names are matched case-insensitively."
    ].join(" "),
    security: AUTHED,
    parameters: [roomIdParam],
    requestBody: form(RestrictionsRequest, "The flags to change"),
    responses: {
      200: json(RoomEnvelope, "The updated room, or a rejection with `success: false`"),
      401: UNAUTHORIZED_RESPONSE,
      403: FORBIDDEN_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) return roomEnvelope(c, null, "This room does not exist!");
    if (!canManageRoom(room, accountId)) return c.body(null, 403);
    const body = await c.req.parseBody().catch(() => ({}));
    const patch = {};
    for (const [key, value] of Object.entries(body)) {
      const field = RESTRICTION_FIELDS[key.toLowerCase()];
      if (field !== void 0 && typeof value === "string") {
        patch[field] = value.toLowerCase() === "true";
      }
    }
    const updated = await updateRoomFields(c.env.DB, roomId, room, patch);
    await pushRoomUpdate(c, accountId, updated);
    return roomEnvelope(c, updated);
  }
).put(
  "/rooms/:roomId{[0-9]+}/loadscreen",
  describeRoute({
    tags: ["Room settings"],
    summary: "Set a room\u2019s load screen",
    description: [
      "REPLACES the room\u2019s `LoadScreens` with the single posted `{ ImageName, Title,",
      "Subtitle }` \u2014 the image shown while the room loads. The field is an array (the",
      "client\u2019s parser expects one) but the client only supports a single screen, so this",
      "never appends. Owner or co-owner only (403 otherwise)."
    ].join(" "),
    security: AUTHED,
    parameters: [roomIdParam],
    requestBody: form(LoadScreenRequest, "The load screen to set"),
    responses: {
      200: json(RoomEnvelope, "The updated room, or a rejection with `success: false`"),
      401: UNAUTHORIZED_RESPONSE,
      403: FORBIDDEN_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) return roomEnvelope(c, null, "This room does not exist!");
    if (!canManageRoom(room, accountId)) return c.body(null, 403);
    const body = await c.req.parseBody().catch(() => ({}));
    const imageName = typeof body.imageName === "string" ? body.imageName.trim() : "";
    if (imageName === "") return roomEnvelope(c, null, "You must provide an image!");
    const title = typeof body.title === "string" ? body.title : "";
    const subtitle = typeof body.subtitle === "string" ? body.subtitle : "";
    const loadScreens = [{ ImageName: imageName, Title: title, Subtitle: subtitle }];
    const updated = await updateRoomFields(c.env.DB, roomId, room, { LoadScreens: loadScreens });
    await pushRoomUpdate(c, accountId, updated);
    return roomEnvelope(c, updated);
  }
).put(
  "/rooms/:roomId{[0-9]+}/accessibility",
  describeRoute({
    tags: ["Room settings"],
    summary: "Set a room\u2019s accessibility",
    description: [
      "The room\u2019s top-level visibility \u2014 the field the public-room and search filters key",
      "on (0 Private, 1 Public, 2 Unlisted). Owner or co-owner only (403 otherwise).",
      "Subrooms carry their own `Accessibility`, set through the subroom `modify` call."
    ].join(" "),
    security: AUTHED,
    parameters: [roomIdParam],
    requestBody: form(AccessibilityRequest, "The new accessibility"),
    responses: {
      200: json(RoomEnvelope, "The updated room, or a rejection with `success: false`"),
      401: UNAUTHORIZED_RESPONSE,
      403: FORBIDDEN_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) return roomEnvelope(c, null, "This room does not exist!");
    if (!canManageRoom(room, accountId)) return c.body(null, 403);
    const body = await c.req.parseBody().catch(() => ({}));
    const accessibility = typeof body.accessibility === "string" ? Number.parseInt(body.accessibility, 10) : Number.NaN;
    if (Number.isNaN(accessibility)) {
      return roomEnvelope(c, null, "You must provide a valid accessibility!");
    }
    const updated = await updateRoomFields(c.env.DB, roomId, room, {
      Accessibility: accessibility
    });
    await pushRoomUpdate(c, accountId, updated);
    return roomEnvelope(c, updated);
  }
).get(
  "/rooms/:roomId{[0-9]+}/subrooms/:subRoomId{[0-9]+}/saves",
  describeRoute({
    tags: ["Subrooms"],
    summary: "A subroom\u2019s saved-data versions",
    description: [
      "The room-history / \u201Crestore a save\u201D list, newest first. Every room save appends a",
      "row rather than overwriting, so this is the subroom\u2019s full history; it is empty",
      "only when the subroom has never been saved.",
      "`unityAssetTarget`/`unityAssetVersion` are accepted and ignored.",
      "",
      "The list includes STAGED saves that were never published, so it is not public:",
      "the room\u2019s creator may read it, and so may anyone standing IN the room (their live",
      "presence says so). Anyone else is a 403. It is what the client reads to resolve",
      "\u201Cload the latest or the published version?\u201D on entering a private instance \u2014 a",
      "visitor who cannot read it cannot load what the instance is running.",
      "",
      "`TotalResults` and `TotalCount` carry the same number: the client\u2019s paged DTO and",
      "the reference disagree on the name, so both are emitted."
    ].join(" "),
    security: AUTHED,
    parameters: [
      roomIdParam,
      subRoomIdParam,
      stringQuery("unityAssetTarget", "Accepted and ignored"),
      stringQuery("unityAssetVersion", "Accepted and ignored"),
      stringQuery("skip", "How many saves to skip (default 0)"),
      stringQuery("take", "How many saves to return (default all)")
    ],
    responses: {
      200: json(SubRoomSavesPage, "The subroom\u2019s saves, newest first"),
      401: UNAUTHORIZED_RESPONSE,
      403: FORBIDDEN_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const subRoomId = Number.parseInt(c.req.param("subRoomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room || !findSubRoom(room, subRoomId)) {
      return c.json({ Results: [], TotalResults: 0, TotalCount: 0 });
    }
    if (!await canReadSaves(c, room, roomId, accountId)) return c.body(null, 403);
    const saves = await getSubRoomSaves(c.env.DB, subRoomId);
    const skip = Number.parseInt(c.req.query("skip") ?? "", 10);
    const take = Number.parseInt(c.req.query("take") ?? "", 10);
    const from = Number.isNaN(skip) || skip < 0 ? 0 : skip;
    const page = saves.slice(from, Number.isNaN(take) || take < 0 ? void 0 : from + take);
    return c.json({ Results: page, TotalResults: saves.length, TotalCount: saves.length });
  }
).get(
  "/rooms/:roomId{[0-9]+}/subrooms/:subRoomId{[0-9]+}/saves/no_unity_assets",
  describeRoute({
    tags: ["Subrooms"],
    summary: "A subroom\u2019s saves, without their Unity-asset payloads",
    description: [
      "The same page as `\u2026/saves`, newest first, carrying the lighter rows: no",
      "`UnitySubAssets`, no `ReferencedUnityAssets`, no `Tags` \u2014 only the asset ids. A BARE",
      "paged wrapper, with no `{ success, error, value }` envelope around it.",
      "",
      "Gated exactly like `\u2026/saves`, and for the same reason: the list includes STAGED",
      "saves that were never published, so it is the room\u2019s creator or anyone whose live",
      "presence puts them in the room, and anyone else is a 403.",
      "",
      "`TotalResults` and `TotalCount` carry the same number \u2014 the client\u2019s paged DTO and",
      "the reference disagree on the name, so both are emitted."
    ].join(" "),
    security: AUTHED,
    parameters: [
      roomIdParam,
      subRoomIdParam,
      stringQuery("skip", "How many saves to skip (default 0)"),
      stringQuery("take", "How many saves to return (default all)")
    ],
    responses: {
      200: json(SubRoomSavesNoUnityAssetsPage, "The subroom\u2019s saves, newest first"),
      401: UNAUTHORIZED_RESPONSE,
      403: FORBIDDEN_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const subRoomId = Number.parseInt(c.req.param("subRoomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room || !findSubRoom(room, subRoomId)) {
      return c.json({ Results: [], TotalResults: 0, TotalCount: 0 });
    }
    if (!await canReadSaves(c, room, roomId, accountId)) return c.body(null, 403);
    const saves = await getSubRoomSaves(c.env.DB, subRoomId);
    const skip = Number.parseInt(c.req.query("skip") ?? "", 10);
    const take = Number.parseInt(c.req.query("take") ?? "", 10);
    const from = Number.isNaN(skip) || skip < 0 ? 0 : skip;
    const page = saves.slice(from, Number.isNaN(take) || take < 0 ? void 0 : from + take);
    return c.json({
      Results: page.map(toSaveWithoutUnityAssets),
      TotalResults: saves.length,
      TotalCount: saves.length
    });
  }
).get(
  "/rooms/:roomId{[0-9]+}/subrooms/:subRoomId{[0-9]+}/saves/:saveId{[0-9]+}",
  describeRoute({
    tags: ["Subrooms"],
    summary: "One of a subroom\u2019s saves by id",
    description: [
      "A single save, in the SAME camelCase projection the room save that created it",
      "returned \u2014 not the PascalCase rows `\u2026/saves` lists. Save ids are globally",
      "unique but resolved scoped to the subroom, so one subroom cannot read another\u2019s",
      "save by guessing an id: a save that belongs elsewhere is a 404, same as an unknown",
      "one.",
      "",
      "Gated like the list it details \u2014 the room\u2019s creator, or anyone whose presence puts",
      "them in the room. A save id resolves whether or not it was ever published, so this",
      "reads unpublished work."
    ].join(" "),
    security: AUTHED,
    parameters: [roomIdParam, subRoomIdParam, saveIdParam],
    responses: {
      200: json(SubRoomDataSaveResponseDto, "The save"),
      401: UNAUTHORIZED_RESPONSE,
      403: FORBIDDEN_RESPONSE,
      404: { description: "No such room, subroom, or save on that subroom" }
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const subRoomId = Number.parseInt(c.req.param("subRoomId"), 10);
    const saveId = Number.parseInt(c.req.param("saveId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room || !findSubRoom(room, subRoomId)) return c.notFound();
    if (!await canReadSaves(c, room, roomId, accountId)) return c.body(null, 403);
    const save = await getSubRoomSaveById(c.env.DB, subRoomId, saveId);
    return save ? c.json(toSaveResponse(save)) : c.notFound();
  }
).post(
  "/rooms/:roomId{[0-9]+}/subrooms/:subRoomId{[0-9]+}/data",
  describeRoute({
    tags: ["Subrooms"],
    summary: "Save a subroom\u2019s data (room save)",
    description: [
      "Records a save against the subroom from the blobs the client has already uploaded",
      "through the `storage` worker. Everything the body carries describes THAT revision",
      "and lands on the save and its subroom \u2014 `Description` is the save comment, NOT the",
      "room\u2019s description (only `PUT /rooms/{roomId}/description` sets that). Nothing here",
      "writes to the room. Editable by the room\u2019s creator or a co-owner (403 otherwise); a",
      "missing token is an EMPTY-body 401, unlike the other room writes.",
      "",
      "`AutoPublish: true` makes the save live immediately. Otherwise it is STAGED: it",
      "lands on `StagedSubRoomDataSaveId` with the live `CurrentSave` untouched, so",
      "players keep loading the last published version until the owner calls",
      "`POST \u2026/subrooms/{subRoomId}/publish_save`. DORMS always publish \u2014 they have no",
      "publish step in the client, so staging one would hide the player\u2019s own edits.",
      "",
      "`value` carries BOTH the updated `room` and the `subRoomDataSave` just created,",
      "and `error` is NULL here rather than the empty string the other room envelopes",
      "use. The save is projected in camelCase with a different field set from the",
      "PascalCase `CurrentSave` embedded in the room \u2014 the two are not the same shape.",
      "A subroom with no `CreatorAccountId` yet (the seeded rooms start null) gets the",
      "saver\u2019s id here, because the client NREs on a null one."
    ].join("\n"),
    security: AUTHED,
    parameters: [roomIdParam, subRoomIdParam],
    requestBody: jsonBody(SaveSubRoomDataRequest, "The uploaded blob keys and save fields"),
    responses: {
      200: json(RoomSaveEnvelope, "The updated room + the new save, or a rejection"),
      401: UNAUTHORIZED_EMPTY,
      403: FORBIDDEN_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return c.body(null, 401);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const subRoomId = Number.parseInt(c.req.param("subRoomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) {
      return c.json({ success: false, error: "This room does not exist!", value: null });
    }
    if (!canManageRoom(room, accountId)) return c.body(null, 403);
    const body = await c.req.json().catch(() => ({}));
    const result = await saveSubRoomData(c.env.DB, roomId, subRoomId, accountId, {
      subRoomDataFilename: body.SubRoomData?.Filename,
      subRoomDataHash: typeof body.SubRoomData?.Hash === "string" ? body.SubRoomData.Hash : void 0,
      roomDataFilename: body.RoomData?.Filename,
      unityAssetId: typeof body.UnityAssetId === "string" ? body.UnityAssetId : void 0,
      autoPublish: body.AutoPublish === true,
      description: typeof body.Description === "string" ? body.Description : void 0,
      persistenceVersion: typeof body.PersistenceVersion === "number" ? body.PersistenceVersion : void 0,
      inventionUsage: typeof body.InventionUsage === "string" ? body.InventionUsage : void 0
    });
    if (!result) {
      return c.json({ success: false, error: "This subroom does not exist!", value: null });
    }
    await pushRoomUpdate(c, accountId, result.room);
    return c.json({
      success: true,
      error: null,
      value: { room: result.room, subRoomDataSave: toSaveResponse(result.save) }
    });
  }
).put(
  "/rooms/:roomId{[0-9]+}/subrooms/:subRoomId{[0-9]+}/modify",
  describeRoute({
    tags: ["Subrooms"],
    summary: "Modify a subroom\u2019s settings",
    description: [
      "Sets a subroom\u2019s `Name`, `Accessibility` and `MaxPlayers`. Owner-only \u2014 only the",
      "room\u2019s creator may change its subrooms, not co-owners. `name` is required;",
      "`accessibility` and `maxPlayers` are applied only when supplied, and a non-positive",
      "`maxPlayers` is ignored rather than rejected."
    ].join(" "),
    security: AUTHED,
    parameters: [roomIdParam, subRoomIdParam],
    requestBody: form(ModifySubRoomRequest, "The settings to change"),
    responses: {
      200: json(RoomResultEnvelope, "Success, or a rejection carrying an `ErrorId`"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const subRoomId = Number.parseInt(c.req.param("subRoomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) {
      return roomResult(c, {
        Success: false,
        ErrorId: "Rooms.DoesntExist",
        Error: "This room does not exist!"
      });
    }
    if (room.CreatorAccountId !== accountId) {
      return roomResult(c, {
        Success: false,
        ErrorId: "Rooms.NotOwner",
        Error: "You are not the owner of this room!"
      });
    }
    if (!findSubRoom(room, subRoomId)) {
      return roomResult(c, {
        Success: false,
        ErrorId: "Rooms.DoesntExist",
        Error: "This subroom does not exist!"
      });
    }
    const body = await c.req.parseBody().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name === "") {
      return roomResult(c, {
        Success: false,
        ErrorId: "Rooms.InvalidName",
        Error: "You must enter a name for your room!"
      });
    }
    const badName = roomNameRejection(name, "subroom name");
    if (badName !== null) {
      return roomResult(c, { Success: false, ErrorId: "Rooms.InvalidName", Error: badName });
    }
    const maxPlayers = typeof body.maxPlayers === "string" ? Number.parseInt(body.maxPlayers, 10) : Number.NaN;
    const updated = await modifySubRoom(c.env.DB, roomId, subRoomId, {
      name,
      // Accepts the enum name as well as the ordinal — the dedicated
      // `/accessibility` route below is sent names, so this may be too.
      accessibility: parseAccessibility(body.accessibility),
      maxPlayers: Number.isNaN(maxPlayers) || maxPlayers <= 0 ? void 0 : maxPlayers
    });
    if (!updated) {
      return roomResult(c, {
        Success: false,
        ErrorId: "Rooms.DoesntExist",
        Error: "This subroom does not exist!"
      });
    }
    await pushRoomUpdate(c, accountId, updated);
    return roomResult(c, { Success: true });
  }
).post(
  "/rooms/:roomId{[0-9]+}/subrooms/:subRoomId{[0-9]+}/publish_save",
  describeRoute({
    tags: ["Subrooms"],
    summary: "Publish one of a subroom\u2019s saves",
    description: [
      "Makes the save named by the `subRoomDataSaveId` form field the one players load \u2014",
      "it becomes the subroom\u2019s `CurrentSave`. A room save only STAGES (dorms excepted),",
      "so nothing a creator saves reaches players until this is called.",
      "",
      "The id may be any save in the subroom\u2019s history, so this doubles as restore-a-save.",
      "`StagedSubRoomDataSaveId` is cleared only when the published save IS the staged",
      "one \u2014 restoring an older version keeps newer unpublished work staged.",
      "",
      "Owner-only: co-owners may save but not decide what goes live. A save id belonging",
      "to another subroom is rejected."
    ].join(" "),
    security: AUTHED,
    parameters: [roomIdParam, subRoomIdParam],
    requestBody: form(PublishSaveRequest, "The save to publish"),
    responses: {
      200: json(RoomEnvelope, "The updated room, or a rejection with `success: false`"),
      401: UNAUTHORIZED_ENVELOPE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) {
      return c.json({ success: false, error: "Unauthorized", value: null }, 401);
    }
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const subRoomId = Number.parseInt(c.req.param("subRoomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) return roomEnvelope(c, null, "This room does not exist!");
    if (room.CreatorAccountId !== accountId) {
      return roomEnvelope(c, null, "You are not the owner of this room!");
    }
    const body = await c.req.parseBody().catch(() => ({}));
    const saveId = typeof body.subRoomDataSaveId === "string" ? Number.parseInt(body.subRoomDataSaveId, 10) : Number.NaN;
    if (Number.isNaN(saveId)) {
      return roomEnvelope(c, null, "You must provide a valid save!");
    }
    const result = await publishSubRoomSave(c.env.DB, roomId, subRoomId, saveId);
    if (!result.ok) {
      return roomEnvelope(
        c,
        null,
        result.reason === "unknown_save" ? "That save does not exist!" : "This subroom does not exist!"
      );
    }
    await pushRoomUpdate(c, accountId, result.room);
    return roomEnvelope(c, result.room);
  }
).put(
  "/rooms/:roomId{[0-9]+}/subrooms/:subRoomId{[0-9]+}/accessibility",
  describeRoute({
    tags: ["Subrooms"],
    summary: "Set a subroom\u2019s accessibility",
    description: [
      "A subroom\u2019s own visibility, independent of the room\u2019s top-level `Accessibility`.",
      "The client sends the `RoomAccessibility` NAME here (`accessibility=Private`) rather",
      "than the ordinal the room-level route takes, so both forms are accepted; an",
      "unrecognised value is rejected. Owner-only \u2014 only the room\u2019s creator may change",
      "its subrooms, not co-owners.",
      "",
      "Answers the updated ROOM, not the bare subroom, so the client can re-render the",
      "room\u2019s subroom list from `value`."
    ].join(" "),
    security: AUTHED,
    parameters: [roomIdParam, subRoomIdParam],
    requestBody: form(SubRoomAccessibilityRequest, "The new accessibility"),
    responses: {
      200: json(RoomEnvelope, "The updated room, or a rejection with `success: false`"),
      401: UNAUTHORIZED_ENVELOPE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) {
      return c.json({ success: false, error: "Unauthorized", value: null }, 401);
    }
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const subRoomId = Number.parseInt(c.req.param("subRoomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) return roomEnvelope(c, null, "This room does not exist!");
    if (room.CreatorAccountId !== accountId) {
      return roomEnvelope(c, null, "You are not the owner of this room!");
    }
    if (!findSubRoom(room, subRoomId)) {
      return roomEnvelope(c, null, "This subroom does not exist!");
    }
    const body = await c.req.parseBody().catch(() => ({}));
    const accessibility = parseAccessibility(body.accessibility);
    if (accessibility === void 0) {
      return roomEnvelope(c, null, "You must provide a valid accessibility!");
    }
    const updated = await modifySubRoom(c.env.DB, roomId, subRoomId, { accessibility });
    if (!updated) return roomEnvelope(c, null, "This subroom does not exist!");
    await pushRoomUpdate(c, accountId, updated);
    return roomEnvelope(c, updated);
  }
).put(
  "/rooms/:roomId{[0-9]+}/subrooms/:subRoomId{[0-9]+}/permissions",
  describeRoute({
    tags: ["Subrooms"],
    summary: "Set a subroom\u2019s permissions",
    description: [
      "Stores the permission entries a room\u2019s creator changed for one subroom \u2014 who may",
      "save inventions, invite players, use the delete-all button, and so on. The body is a",
      "JSON ARRAY; each entry is addressed by its (`Permission`, `Role`) pair, so re-sending",
      "a pair overwrites the stored entry rather than adding a second, and pairs that were",
      "never sent are left alone.",
      "",
      "`Override` is the checkbox the client draws beside each permission, not data:",
      "`true` stores `Value` for that pair, and `false` means \u201Cfall back to the default\u201D, so",
      "it DELETES any stored entry. Nothing is stored with `Override: false`, and reads",
      "always serve `true`. `Value` is a string \u2014 usually `True`/`False`, but it is kept",
      "verbatim, since not every permission\u2019s UI is a True/False picker.",
      "",
      "What this feeds is `GET /photon_access_token`: a stored entry replaces the default",
      "with the same (`Permission`, `Role`) in the table the client applies when it spawns,",
      "and one naming a pair the defaults don\u2019t carry (e.g. `CAN_INVITE`) is added to it.",
      "The overrides apply to the subroom the caller is standing in, resolved from presence.",
      "",
      "Creator-only \u2014 co-owners may build in a room but not decide what a role may do.",
      "The response body is EMPTY: the client doesn\u2019t read one."
    ].join("\n"),
    security: AUTHED,
    parameters: [roomIdParam, subRoomIdParam],
    requestBody: jsonBody(SubRoomPermissionsRequest, "The permission entries to set"),
    responses: {
      200: { description: "Stored (empty body)" },
      401: UNAUTHORIZED_RESPONSE,
      403: FORBIDDEN_RESPONSE,
      404: { description: "No such room or subroom" }
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const subRoomId = Number.parseInt(c.req.param("subRoomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room || !findSubRoom(room, subRoomId)) return c.notFound();
    if (room.CreatorAccountId !== accountId) return c.body(null, 403);
    const permissions = parseRoomPermissions(await c.req.json().catch(() => null));
    await setSubRoomPermissions(c.env.DB, subRoomId, permissions);
    return c.body(null, 200);
  }
).post(
  "/rooms/:roomId{[0-9]+}/subrooms/:subRoomId{[0-9]+}/clone",
  describeRoute({
    tags: ["Subrooms"],
    summary: "Clone a subroom",
    description: [
      "Copies a subroom into a new subroom of the SAME room \u2014 same scene, settings and saved",
      "data blobs, so it loads identical content \u2014 with a fresh globally-unique `SubRoomId`.",
      "Owner-only.",
      "",
      "Answers the updated ROOM, not the new subroom \u2014 the client re-renders the room\u2019s",
      "subroom list from `value`. Unlike the room-level `/clone`, whose `value` IS the new",
      "room, the thing this call creates is not what comes back."
    ].join("\n"),
    security: AUTHED,
    parameters: [roomIdParam, subRoomIdParam],
    responses: {
      200: json(RoomEnvelope, "The updated room, or a rejection with `success: false`"),
      401: UNAUTHORIZED_ENVELOPE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) {
      return c.json({ success: false, error: "Unauthorized", value: null }, 401);
    }
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const subRoomId = Number.parseInt(c.req.param("subRoomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) return roomEnvelope(c, null, "This room does not exist!");
    if (room.CreatorAccountId !== accountId) {
      return roomEnvelope(c, null, "You are not the owner of this room!");
    }
    const result = await cloneSubRoom(c.env.DB, roomId, subRoomId, accountId);
    if (!result) return roomEnvelope(c, null, "This subroom does not exist!");
    await pushRoomUpdate(c, accountId, result.room);
    return roomEnvelope(c, result.room);
  }
).post(
  "/rooms/:roomId{[0-9]+}/subrooms",
  describeRoute({
    tags: ["Subrooms"],
    summary: "Create a subroom",
    description: [
      "Adds an empty subroom to a room. Owner-only. It mints a fresh globally-unique",
      "`SubRoomId` (the game numbers subrooms from one sequence, not per room) and inherits",
      "the scene and capacity of the room\u2019s first existing subroom.",
      "",
      "Answers the updated ROOM, not the bare subroom \u2014 the client re-renders the room\u2019s",
      "subroom list from `value`. Delete answers the same shape."
    ].join("\n"),
    security: AUTHED,
    parameters: [roomIdParam],
    requestBody: form(CreateSubRoomRequest, "The new subroom\u2019s name"),
    responses: {
      200: json(RoomEnvelope, "The updated room, or a rejection with `success: false`"),
      401: UNAUTHORIZED_ENVELOPE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) {
      return c.json({ success: false, error: "Unauthorized", value: null }, 401);
    }
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) return roomEnvelope(c, null, "This room does not exist!");
    if (room.CreatorAccountId !== accountId) {
      return roomEnvelope(c, null, "You are not the owner of this room!");
    }
    const body = await c.req.parseBody().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name === "") return roomEnvelope(c, null, "You must enter a name for your subroom!");
    const badName = roomNameRejection(name, "subroom name");
    if (badName !== null) return roomEnvelope(c, null, badName);
    const result = await createSubRoom(c.env.DB, roomId, accountId, name);
    if (!result) return roomEnvelope(c, null, "This room does not exist!");
    await pushRoomUpdate(c, accountId, result.room);
    return roomEnvelope(c, result.room);
  }
).delete(
  "/rooms/:roomId{[0-9]+}/subrooms/:subRoomId{[0-9]+}",
  describeRoute({
    tags: ["Subrooms"],
    summary: "Delete a subroom",
    description: [
      "Removes a subroom from a room. Owner-only, and it refuses to remove a room\u2019s only",
      "subroom \u2014 that would leave the room with no scene to load. Any saved-data blob the",
      "subroom pointed at is left in R2, the same way deleting a room leaves the photos",
      "taken in it. Answers the updated ROOM, like create."
    ].join(" "),
    security: AUTHED,
    parameters: [roomIdParam, subRoomIdParam],
    responses: {
      200: json(RoomEnvelope, "The updated room, or a rejection with `success: false`"),
      401: UNAUTHORIZED_ENVELOPE
    }
  }),
  async (c) => {
    const accountId = await authedAccountId(c);
    if (accountId === null) {
      return c.json({ success: false, error: "Unauthorized", value: null }, 401);
    }
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const subRoomId = Number.parseInt(c.req.param("subRoomId"), 10);
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) return roomEnvelope(c, null, "This room does not exist!");
    if (room.CreatorAccountId !== accountId) {
      return roomEnvelope(c, null, "You are not the owner of this room!");
    }
    const result = await deleteSubRoom(c.env.DB, roomId, subRoomId);
    if (!result.ok) {
      return roomEnvelope(
        c,
        null,
        result.reason === "last_subroom" ? "You can't delete a room's only subroom!" : "This subroom does not exist!"
      );
    }
    await pushRoomUpdate(c, accountId, result.room);
    return roomEnvelope(c, result.room);
  }
).get(
  "/rooms/:roomId{[0-9]+}/similar",
  describeRoute({
    tags: ["Discovery"],
    summary: "Rooms similar to a room",
    description: [
      "Rooms sharing tags with the given one \u2014 the \u201Cmore like this\u201D rail. Empty when the",
      "room is unknown or carries no tags."
    ].join(" "),
    parameters: [roomIdParam, ...pageParams(100)],
    responses: { 200: json(PagedRooms, "The similar rooms") }
  }),
  async (c) => {
    const skip = Number.parseInt(c.req.query("skip") ?? "0", 10) || 0;
    const take = Number.parseInt(c.req.query("take") ?? "100", 10) || 100;
    return c.json(
      await getSimilarRooms(c.env.DB, Number.parseInt(c.req.param("roomId"), 10), skip, take)
    );
  }
).get(
  "/rooms/:roomId{[0-9]+}/playerdata/me",
  describeRoute({
    tags: ["Rooms"],
    summary: "The caller\u2019s per-room player data",
    description: [
      "Per-room save data for the calling player. Nothing stores any yet, so this is a stub",
      "serving an empty blob \u2014 which the client reads as \u201Cno saved data\u201D. No auth: there\u2019s",
      "no caller-specific state to protect until something writes here."
    ].join(" "),
    parameters: [roomIdParam],
    responses: { 200: json(PlayerDataDto, "An empty data blob") }
  }),
  (c) => c.json({ Data: "" })
).get(
  "/rooms/:roomId{[0-9]+}/experience",
  describeRoute({
    tags: ["Rooms"],
    summary: "A room\u2019s XP settings",
    description: [
      "Whether players earn XP in the room (`Enabled`) and how much of it counts toward a",
      "day (`DailyLimit`), as a bare two-key object. Fixed values, and `Enabled` is FALSE \u2014",
      "no room awards XP here. Progression is the `api` worker\u2019s and applies no per-room",
      "cap, so nothing is stored per room and nothing enforces the limit; the client is what",
      "reads it. No auth: the answer is the same for every caller and every room."
    ].join(" "),
    parameters: [roomIdParam],
    responses: { 200: json(RoomExperience, "The room\u2019s XP settings \u2014 always the same") }
  }),
  (c) => c.json({ Enabled: ROOM_XP_ENABLED, DailyLimit: ROOM_XP_DAILY_LIMIT })
).get(
  "/rooms/:roomId{[0-9]+}/experience/player",
  describeRoute({
    tags: ["Rooms"],
    summary: "The caller\u2019s per-room experience",
    description: [
      "Per-room experience/progression for the calling player. Nothing tracks any yet, so",
      "this is an empty list \u2014 which the client reads as \u201Cno progress in this room\u201D, where",
      "a 404 would stall the room load. No auth, matching `playerdata/me`: the answer is",
      "the same for every caller until something writes here."
    ].join(" "),
    parameters: [roomIdParam],
    responses: { 200: json(RoomExperiencePlayer, "An empty list") }
  }),
  (c) => c.json([])
).get(
  "/rooms/:roomId{[0-9]+}",
  describeRoute({
    tags: ["Rooms"],
    summary: "A room by id",
    description: [
      "The room as stored, with its `SubRooms` re-attached. Unlike `GET /rooms?id=`, an",
      "unknown room here is a 404, not `{}`. The `include`/`unityAsset*` query params the",
      "client sends are accepted and ignored."
    ].join(" "),
    parameters: [
      roomIdParam,
      stringQuery("include", "Accepted and ignored"),
      stringQuery("unityAssetTarget", "Accepted and ignored"),
      stringQuery("unityAssetVersion", "Accepted and ignored")
    ],
    responses: { 200: json(RoomDto, "The room"), 404: { description: "No such room" } }
  }),
  async (c) => {
    const room = await getRoomById(c.env.DB, Number.parseInt(c.req.param("roomId"), 10));
    return room ? c.json(room) : c.notFound();
  }
).get(
  "/publishState/configs",
  describeRoute({
    tags: ["Rooms"],
    summary: "Room republish limits",
    description: [
      "The limits the client enforces around republishing a room \u2014 how many updates are",
      "allowed per rolling window, and the cooldown and expiry around them. Fixed values",
      "from the reference server; nothing here enforces them server-side yet, so this is",
      "what the client shows and gates its own UI on.",
      "",
      'Note the envelope differs from the room mutations\u2019: `error` is null (not `""`) and',
      "there is an extra `error_id`."
    ].join(" "),
    responses: { 200: json(PublishStateConfigsEnvelope, "The republish limits") }
  }),
  (c) => c.json({
    value: {
      UpdateMaxCount: 3,
      UpdateRollingWindowInDays: 365,
      UpdateExpirationInDays: 30,
      UpdateCooldownInDays: 45
    },
    success: true,
    error_id: null,
    error: null
  })
).get(
  "/photon_access_token",
  describeRoute({
    tags: ["Session"],
    summary: "Photon token + room permissions",
    description: [
      "The permission table and Photon credentials the client needs to spawn into a room.",
      "`RoomInstanceId` is the caller\u2019s current instance, read from the shared `presence`",
      "table (null when they\u2019re in none).",
      "",
      "`PhotonAccessToken` is always empty: the reference server signs it with a",
      "secret/algorithm we don\u2019t have, and our Photon setup accepts an empty token. The",
      "global (Role 0) maker pen is granted only to the hardcoded dev accounts."
    ].join("\n"),
    security: AUTHED,
    responses: {
      200: json(PhotonAccessTokenDto, "The permissions and (empty) token"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  handlePhotonAccessToken
);
app.get(
  "/openapi.json",
  describeRoute({ hide: true }),
  withCleanSpec(
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "recflare rooms",
          version: "1.0.0",
          description: [
            "The room server for recflare, a private-server reimplementation of the Rec Room",
            "backend: room storage, the browse/search feeds, per-player cheers and favorites,",
            "the owner\u2019s room settings, and subrooms.",
            "",
            "A room is a single JSON blob in the shared `recflare` D1, with generated columns",
            "for the queryable fields; reads serve that blob verbatim, which is why the shapes",
            "here are the client\u2019s PascalCase ones. Subrooms live in their own table (their ids",
            "come from one global sequence, not per room) and are re-attached to each room on",
            "read. The seed rooms \u2014 including the dorm \u2014 come from `static/ImportRooms.json`.",
            "",
            "Two response envelopes appear side by side: a PascalCase",
            "`{ Success, Value, ErrorId, Error }` and a lowercase `{ success, error, value }`.",
            "Which one a route uses is dictated by the client\u2019s deserializer for that call, so",
            "the inconsistency is deliberate. Both answer HTTP 200 even for a rejection \u2014 the",
            "client reads the flag, not the status."
          ].join("\n")
        },
        servers: [{ url: "https://rooms.recflare.net", description: "Production" }],
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
