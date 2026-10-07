// Ported from apps/rooms/src/openapi.ts; TypeScript types erased; native runtime imports.
import { resolver } from "../../../../runtime/openapi.js";
import { z } from "../../../../../vendor/zod.js";
function json(schema, description) {
  return { description, content: { "application/json": { schema: resolver(schema) } } };
}
function toOpenApiSchema(schema) {
  const { $schema: _$schema, additionalProperties: _extra, ...jsonSchema } = z.toJSONSchema(schema);
  return jsonSchema;
}
function form(schema, description) {
  const s = toOpenApiSchema(schema);
  return {
    description,
    content: {
      "application/x-www-form-urlencoded": { schema: s },
      "multipart/form-data": { schema: s }
    }
  };
}
function jsonBody(schema, description) {
  return { description, content: { "application/json": { schema: toOpenApiSchema(schema) } } };
}
const AUTHED = [{ bearerAuth: [] }];
const UNAUTHORIZED_RESPONSE = json(
  z.object({ error: z.literal("Unauthorized") }),
  "Missing or invalid bearer token"
);
const UNAUTHORIZED_EMPTY = { description: "Missing or invalid bearer token (empty body)" };
const FORBIDDEN_RESPONSE = {
  description: "A valid token, but not the room\u2019s creator or a co-owner (empty body)"
};
const NOT_FRIENDS_RESPONSE = {
  description: "A valid token, but the caller is not that player (nor a friend of theirs) (empty body)"
};
function idParam(name, description) {
  return {
    name,
    in: "path",
    required: true,
    description,
    schema: { type: "string", pattern: "^[0-9]+$" }
  };
}
const roomIdParam = idParam("roomId", "Room id");
const subRoomIdParam = idParam("subRoomId", "Subroom id (globally unique, not per-room)");
const saveIdParam = idParam("saveId", "The save\u2019s id, as `\u2026/saves` lists it");
const playerIdParam = idParam("playerId", "The account whose list to read");
const bannedPlayerIdParam = idParam("playerId", "The banned account to unban");
const leaderboardIdParam = idParam(
  "leaderboardId",
  "The leaderboard slot within the room \u2014 small ordinals (1, 2, 3\u2026), unique per room only"
);
function stringQuery(name, description) {
  return { name, in: "query", required: false, description, schema: { type: "string" } };
}
function intQuery(name, description) {
  return { name, in: "query", required: false, description, schema: { type: "integer" } };
}
function pageParams(defaultTake) {
  return [
    intQuery("skip", "How many rooms to skip (default 0)"),
    intQuery("take", `How many rooms to return (default ${defaultTake})`)
  ];
}
const ServiceStatus = z.object({
  service: z.literal("rooms"),
  status: z.literal("ok")
});
const RoomRoleDto = z.object({
  AccountId: z.int(),
  Role: z.int().describe("10 = Host, 20 = Moderator, 30 = CoOwner, 255 = Creator"),
  LastChangedByAccountId: z.int().nullable(),
  InvitedRole: z.int()
});
const RoomTagDto = z.object({
  Tag: z.string(),
  Type: z.int().describe("0 = owner-set, 1 = client-derived (`autoTag`), 2 = server-derived"),
  IsPrimaryGenre: z.literal(true).optional().describe("Present only on the room\u2019s primary genre tag; absent, never false, on the rest")
});
const RoomStatsDto = z.object({
  CheerCount: z.int(),
  FavoriteCount: z.int(),
  VisitorCount: z.int(),
  VisitCount: z.int()
});
const LoadScreenDto = z.object({
  ImageName: z.string().describe("A CDN bucket key under `room/`"),
  Title: z.string(),
  Subtitle: z.string()
});
const SubRoomDataSaveResponseDto = z.object({
  subRoomDataSaveId: z.int(),
  subRoomId: z.int(),
  unityAssetId: z.string().nullable().describe("Null unless the save carried one"),
  unityAsset: z.string().nullable().describe("Always null \u2014 we resolve no baked assets"),
  unityAssetHash: z.string().nullable().describe("Always null \u2014 we resolve no baked assets"),
  dataBlob: z.string(),
  dataBlobHash: z.string().nullable().describe("Echoed from the request\u2019s `SubRoomData.Hash`"),
  savedByAccountId: z.int().nullable(),
  savedOnPlatform: z.int().describe(
    "Steam=0 Oculus=1 PlayStation=2 Xbox=3 RecNet=4 IOS=5 GooglePlay=6 Standalone=7 Pico=8"
  ),
  savedOnDeviceClass: z.int().describe("Unknown=0 VR=1 Screen=2 Mobile=3 VRLow=4 Quest2=5"),
  description: z.string().nullable(),
  createdAt: z.string()
});
const SubRoomDataSaveDto = z.object({
  UnitySubAssets: z.array(z.unknown()).describe("Always empty"),
  ReferencedUnityAssets: z.array(z.unknown()).describe("Always empty"),
  SubRoomDataSaveId: z.int().describe("Numbered from 1, incremented on every save"),
  SubRoomId: z.int().describe("The owning subroom \u2014 re-pointed when a subroom is cloned"),
  DataBlob: z.string().describe("The scene-data key the client downloads from the CDN"),
  ReferencedUnityAssetIds: z.array(z.string()).describe("Always empty"),
  PersistenceVersion: z.int(),
  OMVersion: z.int(),
  UgcSubVersion: z.int(),
  SavedByAccountId: z.int().nullable(),
  SavedOnPlatform: z.int().describe("0 \u2014 the save request carries no platform"),
  SavedOnDeviceClass: z.int().describe("0 \u2014 the save request carries no device class"),
  Description: z.string().describe("The save comment; empty string when none"),
  Tags: z.array(z.unknown()).describe("Always empty"),
  ModerationState: z.int(),
  CreatedAt: z.string(),
  UnityAssetId: z.string().optional().describe("Emitted only when the save carried one")
});
const SubRoomDto = z.object({
  SubRoomId: z.int(),
  RoomId: z.int(),
  CreatorAccountId: z.int().nullable().describe("Null until the subroom\u2019s first save"),
  UnitySceneId: z.string().describe("The Unity scene the client loads"),
  Name: z.string(),
  LastModeratedSaveModerationState: z.int(),
  IsSandbox: z.boolean(),
  MaxPlayers: z.int(),
  Accessibility: z.int().describe("0 Private, 1 Public, 2 Unlisted, 3 Dev_only, 4 Dev_Unlisted \u2014 set independently"),
  ShouldAutoStageSaves: z.boolean(),
  StagedSubRoomDataSaveId: z.int().nullable(),
  CurrentSave: SubRoomDataSaveDto.nullable().describe(
    "The latest room save \u2014 where the client finds the scene blob. Null until first save"
  ),
  DataBlob: z.string().optional().describe("Legacy flat key; the client reads `CurrentSave`"),
  RoomDataBlob: z.string().optional().describe("Uploaded room-data key; absent until first save"),
  DataSavedAt: z.string().optional().describe("ISO timestamp of the last save"),
  PersistenceVersion: z.int().optional(),
  InventionUsage: z.string().optional().describe("Recorded by a room save; absent until then")
});
const LocalizationContextDto = z.object({
  TargetLocale: z.string().nullable(),
  Scope: z.string().nullable(),
  LocalizedFields: z.array(z.string())
});
const RoomDto = z.object({
  RoomId: z.int(),
  Name: z.string().describe("Unique, case-insensitively"),
  Description: z.string(),
  ImageName: z.string().describe("A CDN bucket key served back under `room/`"),
  WarningMask: z.int().describe("Content-warning bit flags"),
  CustomWarning: z.string().nullable(),
  CreatorAccountId: z.int().describe("The room\u2019s owner \u2014 always passes the role checks"),
  State: z.int(),
  Accessibility: z.int().describe("0 = Private, 1 = Public, 2 = Unlisted. The room-browse feeds serve Public only"),
  PublishState: z.int(),
  SupportsLevelVoting: z.boolean(),
  IsRRO: z.boolean().describe("A Rec Room Original \u2014 the client renders a virtual `rro` tag"),
  IsRecRoomApproved: z.boolean(),
  ExcludeFromLists: z.boolean(),
  ExcludeFromSearch: z.boolean(),
  SupportsScreens: z.boolean(),
  SupportsWalkVR: z.boolean(),
  SupportsTeleportVR: z.boolean(),
  SupportsVRLow: z.boolean(),
  SupportsQuest2: z.boolean(),
  SupportsMobile: z.boolean(),
  SupportsJuniors: z.boolean(),
  MinLevel: z.int(),
  AgeRating: z.int(),
  CreatedAt: z.string(),
  PublishedAt: z.string(),
  BecameRRStudioRoomAt: z.string().nullable(),
  Stats: RoomStatsDto,
  BoostCount: z.int().describe("Boosts on the room. Nothing grants boosts here, so always 0 \u2014 but present"),
  CurrentSnapshotId: z.int().nullable().describe("The room\u2019s published snapshot. Nothing takes snapshots here, so always null"),
  CCU: z.int().nullable().describe("Concurrent users. Nothing counts live population here, so always null"),
  RankingContext: z.unknown().nullable(),
  IsDorm: z.boolean().describe("Auto-provisioned personal room; excluded from every feed"),
  IsPlacePlay: z.boolean(),
  MaxPlayerCalculationMode: z.int(),
  MaxPlayers: z.int(),
  CloningAllowed: z.boolean().describe("False blocks `POST /rooms/{roomId}/clone`"),
  DisableMicAutoMute: z.boolean(),
  DisableRoomComments: z.boolean(),
  EncryptVoiceChat: z.boolean(),
  ToxmodEnabled: z.boolean(),
  LoadScreenLocked: z.boolean(),
  UgcVersion: z.int(),
  PersistenceVersion: z.int(),
  UgcSubVersion: z.int().nullable(),
  MinUgcSubVersion: z.int().nullable(),
  AutoLocalizeRoom: z.boolean(),
  LocalizationContext: LocalizationContextDto,
  IsDeveloperOwned: z.boolean(),
  RankedEntityId: z.string(),
  SubRooms: z.array(SubRoomDto).describe("Re-attached from the subroom table on every read"),
  Roles: z.array(RoomRoleDto),
  IsJuniorCreated: z.boolean(),
  Tags: z.array(RoomTagDto),
  PromoImages: z.array(z.unknown()),
  PromoExternalContent: z.array(z.unknown()),
  LoadScreens: z.array(LoadScreenDto),
  RestrictedCircuitsAllowListNames: z.array(z.string()),
  InventionUsage: z.string().optional().describe("Legacy: room saves used to write this here; it now lives on the SUBROOM")
});
const PagedRooms = z.object({
  Results: z.array(RoomDto),
  TotalResults: z.int().describe("The full match count, not the page size")
});
const SearchSuggestions = z.array(z.string()).describe("Suggested search terms, best match first; empty when nothing matches");
const RoomExperience = z.object({
  Enabled: z.boolean().describe("Whether XP is earned in the room at all. Always false here"),
  DailyLimit: z.int().describe("XP from this room that counts toward a player\u2019s day")
});
const DormRoomId = z.int().describe("The caller\u2019s dorm RoomId");
const RoomLookup = z.union([RoomDto, z.object({})]);
const MissingLookupParam = z.string().describe("`\"Either 'id' or 'name' query parameter is required\"`");
const SuccessEnvelope = z.object({
  success: z.literal(true)
});
const IsBannedEnvelope = z.object({
  success: z.literal(true).describe("The check ran; whether the player is banned is `value`"),
  error: z.string().nullable().describe("Null \u2014 the check itself does not fail"),
  error_id: z.string().nullable().describe("Null. Present as a key, unlike the room envelope"),
  value: z.boolean().describe("Whether that player is banned from that room")
});
const IsBannedPascalEnvelope = z.object({
  Value: z.boolean().describe("Whether that player is banned from that room"),
  Success: z.literal(true).describe("The check ran; whether the player is banned is `Value`"),
  Error: z.string().nullable().describe("Null \u2014 the check itself does not fail"),
  error_id: z.string().nullable().describe("Null. Lowercase, unlike its three siblings")
});
const TooManyLookupIds = z.string().describe('`"At most 100 room ids may be looked up at once"`');
const InteractionDto = z.object({
  Cheered: z.boolean(),
  Favorited: z.boolean(),
  LastVisitedAt: z.string().describe('Always "now" \u2014 not the stored visit time')
});
const FeaturedRoomDto = z.object({
  RoomId: z.int(),
  RoomName: z.string(),
  ImageName: z.string(),
  IsRecRoomApproved: z.boolean(),
  ExcludeFromLists: z.boolean(),
  ExcludeFromSearch: z.boolean()
});
const FeaturedRoomGroupDto = z.object({
  FeaturedRoomGroupId: z.int(),
  name: z.string(),
  StartAt: z.string(),
  EndAt: z.string(),
  Rooms: z.array(FeaturedRoomDto).describe("Randomly ordered, at most 10 \u2014 no editorial curation yet")
});
const RoomResultEnvelope = z.object({
  Success: z.boolean(),
  Value: z.unknown().nullable().describe("Always null \u2014 these routes carry no entity"),
  ErrorId: z.string().nullable().describe("e.g. `Rooms.DoesntExist`, `Rooms.NotOwner`; null on success"),
  Error: z.string().nullable().describe("The message shown to the player; null on success")
});
const RoomEnvelope = z.object({
  success: z.boolean(),
  error: z.string().describe("Empty on success"),
  value: RoomDto.nullable()
});
const RoomSaveEnvelope = z.object({
  success: z.boolean(),
  error: z.string().nullable().describe("Null on success"),
  value: z.object({ room: RoomDto, subRoomDataSave: SubRoomDataSaveResponseDto }).nullable().describe("Null on a rejection")
});
const UNAUTHORIZED_ENVELOPE = json(
  z.object({ success: z.literal(false), error: z.literal("Unauthorized"), value: z.null() }),
  "Missing or invalid bearer token"
);
const CloneRoomRequest = z.object({
  name: z.string().describe("The new room\u2019s name; must be unique")
});
const DescriptionRequest = z.object({
  description: z.string().describe("An absent field clears the description")
});
const NameRequest = z.object({
  name: z.string().describe("Non-empty, and not already taken by another room")
});
const TagRequest = z.object({
  tag: z.union([z.string(), z.array(z.string())]).optional().describe(
    "Alone: toggled (added when absent, removed when present). Alongside any other field, or repeated: the COMPLETE set of user (Type 0) tags \u2014 an omitted one is removed"
  ),
  autoTag: z.union([z.string(), z.array(z.string())]).optional().describe(
    "A derived tag to add at Type 1 (`limitsv2`, `beta`). Repeatable and additive \u2014 never removes one"
  ),
  primaryGenreTag: z.string().optional().describe(
    "Set as the room\u2019s primary genre. Added as a Type 0 tag if the room lacks it; every other tag keeps its place and loses the flag"
  )
});
const ImageRequest = z.object({
  imageName: z.string().describe("A key from the storage upload, stored un-prefixed")
});
const RoleRequest = z.object({
  role: z.string().describe(
    "The role tier: 10 Host, 20 Moderator. 30 CoOwner and 255 Creator are refused on a grant \u2014 co-ownership is invited. Answering your own invite, it must equal the standing `InvitedRole`, or be `0` to decline"
  )
});
const InviteRoleRequest = z.object({
  role: z.string().describe("The role tier offered: 10 Host, 20 Moderator, 30 CoOwner")
});
const BanRequest = z.object({
  id: z.string().describe("Account id of the player to ban"),
  banMask: z.string().optional().describe("Stored verbatim; meaning unknown \u2014 the client sends `0`. Defaults to 0")
});
const RoomBanDto = z.object({
  RoomId: z.int(),
  BannedPlayerId: z.int(),
  BanMask: z.int(),
  BannedByAccountId: z.int().describe("Who issued the ban"),
  CreatedAt: z.string()
});
const RoomBanEntryDto = z.object({
  accountId: z.int().describe("The banned player"),
  bannedByAccountId: z.int().describe("Who issued the ban"),
  banStartTime: z.string().describe("ISO 8601 UTC, when the ban was issued")
});
const RoomBanEnvelope = z.object({
  success: z.boolean(),
  error: z.string().describe("Empty on success"),
  value: RoomBanDto.nullable().describe("Null on a rejection")
});
const LeaderboardRequest = z.object({
  leaderboardTitle: z.string().describe("The title the board displays"),
  statFormat: z.string().optional().describe("The stat-format int; defaults to 0"),
  sortAscending: z.string().optional().describe("`True` / `False` \u2014 whether lower scores rank first. Defaults to `False`")
});
const LeaderboardResultEnvelope = z.object({
  Success: z.boolean(),
  Error: z.string().nullable().describe("The message shown on a rejection; null on success"),
  error_id: z.string().nullable().describe("Null. Lowercase, unlike its siblings")
});
const WarningRequest = z.object({
  warningMask: z.string().describe("Content-warning bit flags, as an integer"),
  customWarning: z.string().optional().describe("Set when present; an empty value clears it")
});
const CloningRequest = z.object({
  cloningAllowed: z.string().describe("`True` / `False`")
});
const BulkRoomsRequest = z.object({
  id: z.string().describe("Repeated once per room id; each value may also be comma-separated"),
  excludePrivateRooms: z.string().optional().describe("`True` drops rooms that are not publicly visible. Default `False`")
});
const RestrictionsRequest = z.object({
  supportsScreens: z.string().optional().describe("`True` / `False`"),
  supportsWalkVR: z.string().optional().describe("`True` / `False`"),
  supportsTeleportVR: z.string().optional().describe("`True` / `False`"),
  supportsVRLow: z.string().optional().describe("`True` / `False`"),
  supportsQuest2: z.string().optional().describe("`True` / `False`"),
  supportsMobile: z.string().optional().describe("`True` / `False`"),
  supportsJuniors: z.string().optional().describe("`True` / `False`")
});
const LoadScreenRequest = z.object({
  imageName: z.string().describe("A key from the storage upload"),
  title: z.string().optional(),
  subtitle: z.string().optional()
});
const AccessibilityRequest = z.object({
  accessibility: z.string().describe("0 = Private, 1 = Public, 2 = Unlisted")
});
const SubRoomAccessibilityRequest = z.object({
  accessibility: z.string().describe(
    "A `RoomAccessibility` name \u2014 `Private`, `Public`, `Unlisted`, `Dev_only`, `Dev_Unlisted` (case-insensitive) \u2014 or its ordinal 0\u20134"
  )
});
const SubRoomPermissionsRequest = z.array(
  z.object({
    Permission: z.string().describe("e.g. `CAN_SAVE_INVENTIONS`, `CAN_INVITE`, `CAN_USE_DELETE_ALL_BUTTON`"),
    Role: z.int().describe("The role tier the entry applies to (0 = everyone, 30 = co-owner)"),
    Override: z.boolean().describe(
      "The override checkbox, and a JSON boolean unlike `Value`: true stores this entry, false DELETES any stored one so the pair falls back to its default"
    ),
    Type: z.int().describe("Always 0 in what the client sends; stored verbatim"),
    Value: z.string().describe(
      "A STRING, not a boolean \u2014 usually `True` / `False`, but kept verbatim: not every permission\u2019s UI is a True/False picker. Ignored when `Override` is false"
    )
  })
).describe("An array \u2014 the client sends one even when changing a single permission");
const PublishSaveRequest = z.object({
  subRoomDataSaveId: z.string().describe("The `SubRoomDataSaveId` to make live")
});
const CreateSubRoomRequest = z.object({
  name: z.string().describe("The new subroom\u2019s name")
});
const ModifySubRoomRequest = z.object({
  name: z.string().describe("Required \u2014 an empty name is rejected"),
  accessibility: z.string().optional().describe("A `RoomAccessibility` name (case-insensitive) or its ordinal 0\u20134"),
  maxPlayers: z.string().optional().describe("Ignored when not a positive integer")
});
const SaveSubRoomDataRequest = z.object({
  SubRoomData: z.object({ Filename: z.string() }).optional().describe("The uploaded scene-data blob \u2014 becomes the subroom\u2019s `CurrentSave.DataBlob`"),
  RoomData: z.object({ Filename: z.string() }).optional().describe("The uploaded room-level data blob \u2014 becomes `RoomDataBlob`"),
  Description: z.string().optional().describe("The save comment \u2014 a description of THIS revision, not the room\u2019s description"),
  PersistenceVersion: z.int().optional().describe("Recorded on the save and the subroom"),
  InventionUsage: z.string().optional().describe("Recorded on the subroom"),
  UnityAssetId: z.string().nullable().optional().describe("Recorded on the save when set"),
  AutoPublish: z.boolean().optional().describe("True publishes the save immediately; otherwise it is staged")
});
const SubRoomSavesPage = z.object({
  Results: z.array(SubRoomDataSaveDto).describe("The page of saves, newest first"),
  TotalResults: z.int().describe("The whole history\u2019s size, not the page\u2019s"),
  TotalCount: z.int().describe("Same value as `TotalResults` \u2014 the two references disagree")
});
const SubRoomDataSaveNoUnityAssetsDto = z.object({
  SubRoomDataSaveId: z.int(),
  SubRoomId: z.int(),
  UnityAssetId: z.string().nullable().describe("Null unless the save carried one"),
  ReferencedUnityAssetIds: z.array(z.string()).describe("Always empty \u2014 we record none"),
  DataBlob: z.string().describe("The scene-data key the client downloads from the CDN"),
  DataBlobHash: z.string().nullable(),
  PersistenceVersion: z.int(),
  OMVersion: z.int(),
  SavedByAccountId: z.int().nullable(),
  SavedOnPlatform: z.int().describe("0 \u2014 the save request carries no platform"),
  SavedOnDeviceClass: z.int().describe("0 \u2014 the save request carries no device class"),
  Description: z.string().describe("The save comment; empty string when none"),
  ModerationState: z.int(),
  CreatedAt: z.string(),
  UgcSubVersion: z.int()
});
const SubRoomSavesNoUnityAssetsPage = z.object({
  Results: z.array(SubRoomDataSaveNoUnityAssetsDto).describe("The page of saves, newest first"),
  TotalResults: z.int().describe("The whole history\u2019s size, not the page\u2019s"),
  TotalCount: z.int().describe("Same value as `TotalResults` \u2014 the two references disagree")
});
const RoomPermissionDto = z.object({
  Override: z.boolean().describe("Always true on an entry that came from a subroom\u2019s overrides"),
  Permission: z.string().describe("e.g. `CAN_USE_MAKER_PEN`, `CAN_SAVE_INVENTIONS`"),
  Role: z.int().describe("The role tier the permission applies to (0 = everyone)"),
  Type: z.int(),
  Value: z.string().describe("A STRING, not a boolean \u2014 `True` on the defaults, anything on an override")
});
const PhotonAccessTokenDto = z.object({
  Permissions: z.array(RoomPermissionDto),
  PhotonAccessToken: z.string().describe("Always empty \u2014 see above"),
  RoomInstanceId: z.int().nullable().describe("The caller\u2019s current instance, from presence; null when they\u2019re in none")
});
const PlayerDataDto = z.object({
  Data: z.string().describe("Always empty \u2014 no per-room player data is stored")
});
const RoomExperiencePlayer = z.array(z.unknown()).describe("Always empty \u2014 no per-room experience is tracked");
const ShowcasedRooms = z.array(z.unknown()).describe("Always empty \u2014 no room showcase is stored");
const CuratedPlaylists = z.array(z.unknown()).describe("Always empty \u2014 nothing curates a room playlist yet");
const PublishStateConfigsEnvelope = z.object({
  value: z.object({
    UpdateMaxCount: z.int().describe("Updates allowed per rolling window"),
    UpdateRollingWindowInDays: z.int().describe("Length of that window, in days"),
    UpdateExpirationInDays: z.int().describe("Days before an update expires"),
    UpdateCooldownInDays: z.int().describe("Days between updates")
  }),
  success: z.literal(true),
  error_id: z.null(),
  error: z.null()
});
export {
  AUTHED,
  AccessibilityRequest,
  BanRequest,
  BulkRoomsRequest,
  CloneRoomRequest,
  CloningRequest,
  CreateSubRoomRequest,
  CuratedPlaylists,
  DescriptionRequest,
  DormRoomId,
  FORBIDDEN_RESPONSE,
  FeaturedRoomDto,
  FeaturedRoomGroupDto,
  ImageRequest,
  InteractionDto,
  InviteRoleRequest,
  IsBannedEnvelope,
  IsBannedPascalEnvelope,
  LeaderboardRequest,
  LeaderboardResultEnvelope,
  LoadScreenDto,
  LoadScreenRequest,
  LocalizationContextDto,
  MissingLookupParam,
  ModifySubRoomRequest,
  NOT_FRIENDS_RESPONSE,
  NameRequest,
  PagedRooms,
  PhotonAccessTokenDto,
  PlayerDataDto,
  PublishSaveRequest,
  PublishStateConfigsEnvelope,
  RestrictionsRequest,
  RoleRequest,
  RoomBanDto,
  RoomBanEntryDto,
  RoomBanEnvelope,
  RoomDto,
  RoomEnvelope,
  RoomExperience,
  RoomExperiencePlayer,
  RoomLookup,
  RoomPermissionDto,
  RoomResultEnvelope,
  RoomRoleDto,
  RoomSaveEnvelope,
  RoomStatsDto,
  RoomTagDto,
  SaveSubRoomDataRequest,
  SearchSuggestions,
  ServiceStatus,
  ShowcasedRooms,
  SubRoomAccessibilityRequest,
  SubRoomDataSaveDto,
  SubRoomDataSaveNoUnityAssetsDto,
  SubRoomDataSaveResponseDto,
  SubRoomDto,
  SubRoomPermissionsRequest,
  SubRoomSavesNoUnityAssetsPage,
  SubRoomSavesPage,
  SuccessEnvelope,
  TagRequest,
  TooManyLookupIds,
  UNAUTHORIZED_EMPTY,
  UNAUTHORIZED_ENVELOPE,
  UNAUTHORIZED_RESPONSE,
  WarningRequest,
  bannedPlayerIdParam,
  form,
  intQuery,
  json,
  jsonBody,
  leaderboardIdParam,
  pageParams,
  playerIdParam,
  roomIdParam,
  saveIdParam,
  stringQuery,
  subRoomIdParam
};
