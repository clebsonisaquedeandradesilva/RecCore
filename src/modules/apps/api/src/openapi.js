// Ported from apps/api/src/openapi.ts; TypeScript types erased; native runtime imports.
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
const UNAUTHORIZED_RESPONSE = { description: "Missing or invalid bearer token (empty body)" };
const AUTHED = [{ bearerAuth: [] }];
const OPTIONAL_AUTHED = [{}, { bearerAuth: [] }];
function idParam(name, description) {
  return { name, in: "path", required: true, description, schema: { type: "integer" } };
}
function stringParam(name, description) {
  return { name, in: "path", required: true, description, schema: { type: "string" } };
}
function stringQuery(name, description) {
  return { name, in: "query", required: false, description, schema: { type: "string" } };
}
function intQuery(name, description) {
  return { name, in: "query", required: false, description, schema: { type: "integer" } };
}
function pageParams(defaultTake) {
  return [
    intQuery("skip", "How many entries to skip (default 0)"),
    intQuery("take", `How many entries to return (default ${defaultTake})`)
  ];
}
const JsonObject = z.record(z.string(), z.unknown());
const JsonArray = z.array(z.unknown());
const BareBoolean = z.boolean();
const BareInteger = z.number().int();
const BareString = z.string();
const ErrorResponse = z.object({ error: z.string() });
const SuccessErrorEnvelope = z.object({
  success: z.boolean(),
  error: z.string().describe("Empty string when the call succeeded")
});
const AmplitudeConfig = z.object({
  AmplitudeKey: z.string(),
  UseRudderStack: z.boolean(),
  RudderStackKey: z.string(),
  UseStatSig: z.boolean(),
  StatSigKey: z.string(),
  StatSigEnvironment: z.number().int()
});
const AzureSpeechConfig = z.object({
  Key: z.string(),
  Region: z.string(),
  Enabled: z.boolean()
});
const BacktraceConfig = z.object({
  ReportBudget: z.int(),
  FilterType: z.int(),
  SampleRate: z.int(),
  LogLineCount: z.int(),
  CaptureNativeCrashes: z.int(),
  AMRThresholdMS: z.int(),
  MessageCount: z.int(),
  MessageRegex: z.string(),
  VersionRegex: z.string()
});
const StatsigUserProperties = z.object({
  success: z.boolean().describe("The Statsig-enabled flag (true)")
});
const ApiConfigV2 = JsonObject.describe(
  "The static client config, plus a ShareBaseUrl templated from the deploy domain"
);
const IslandedVersions = z.array(z.string());
const VersionCheck = z.object({
  VersionStatus: z.int().describe("0 = current, 1 = client on a different build"),
  UpdateNotificationStage: z.int(),
  IsVersionIslanded: z.boolean(),
  IsCrossPlayDisabled: z.boolean()
});
const RelationshipDto = z.object({
  PlayerID: z.int().describe("The other player in the pair"),
  RelationshipType: z.int().describe("0 = none, 1 = friend request sent, 2 = friend request received, 3 = friend"),
  Favorited: z.int().describe("0/1 \u2014 the caller\u2018s own flag"),
  Ignored: z.int().describe("0/1 \u2014 the caller\u2018s own flag"),
  Muted: z.int().describe("0/1 \u2014 the caller\u2018s own flag")
});
const SendMessageRequest = z.object({
  ToPlayerId: z.string().describe("Account id of the recipient"),
  Type: z.string().optional().describe("The Message-model type, e.g. `10`. Passed through unmapped; defaults to 0"),
  Data: z.string().optional().describe("The message payload; often empty")
});
const SendMultipleMessagesRequest = z.object({
  ToPlayerIds: z.array(z.int()).describe("Account ids of the recipients"),
  Type: z.int().optional().describe("The Message-model type, e.g. `20`. Passed through unmapped; defaults to 0"),
  Data: z.string().optional().describe("The message payload; often empty")
});
const DeleteMessagesRequest = z.object({
  MessageIds: z.array(z.int()).describe("Ids of the messages to delete")
});
const MessageDto = z.object({
  Id: z.int().describe("The message\u2019s id \u2014 also the `Id` on the frame that delivered it"),
  FromPlayerId: z.int(),
  ToPlayerId: z.int(),
  SentTime: z.string().describe("ISO-8601 UTC"),
  Type: z.int().describe("The Message-model type (a different enum from `NotificationType`)"),
  Data: z.string().nullable().describe("Null on the types carrying no payload of their own"),
  RoomId: z.int().nullable(),
  PlayerEventId: z.int().nullable()
});
const FriendOnlineCountResponse = z.object({
  success: z.boolean(),
  value: z.object({
    FriendsOnlineCount: z.int().describe("Friends with live presence right now")
  })
});
const AckResponse = z.object({ Success: z.boolean(), Message: z.string() });
const MutualFriendDto = z.object({
  AccountId: z.int(),
  Username: z.string(),
  DisplayName: z.string(),
  ProfileImage: z.string().describe("The image name; an empty string when the account has none")
});
const ReputationDto = z.object({
  AccountId: z.int(),
  IsCheerful: z.boolean(),
  Noteriety: z.int(),
  SelectedCheer: z.int().describe("The cheer pinned to the profile; 0 = none selected"),
  CheerCredit: z.int(),
  CheerGeneral: z.int(),
  CheerHelpful: z.int(),
  CheerCreative: z.int(),
  CheerGreatHost: z.int(),
  CheerSportsman: z.int(),
  SubscriberCount: z.int(),
  SubscribedCount: z.int()
});
const ProgressionDto = z.object({
  PlayerId: z.int(),
  Level: z.int(),
  XP: z.int()
});
const CheerPlayerRequest = z.object({
  PlayerIdTo: z.string().describe("The account being cheered"),
  CheerCategory: z.string().describe("0 General, 10 Helpful, 20 Sportmanship, 30 GreatHost, 40 Creative"),
  RoomId: z.string().optional().describe(
    "The room it happened in. Accepted but NOT used \u2014 the audience for the cheer\u2019s effect comes from the caller\u2019s live presence, so a client cannot aim it at a room it is not in"
  ),
  Anonymous: z.string().optional().describe(
    "`True`/`False` (default `False`). Not stored \u2014 it picks the `PlayerCheerAnonymous` message type (sender 0) over `PlayerCheer` for the frame that plays the cheer"
  )
});
const SetSelectedCheerRequest = z.object({
  CheerCategory: z.string().describe(
    "The category to pin: 0 General, 10 Helpful, 20 Sportmanship, 30 GreatHost, 40 Creative; -1 unpins"
  )
});
const CheerPlayerResponse = z.object({
  Success: z.boolean(),
  Message: z.string().nullable().describe("Null when the cheer landed")
});
const CreateCustomAvatarItemMetadata = z.object({
  Name: z.string(),
  Description: z.string().optional(),
  Price: z.number().int().optional(),
  BaseAvatarItemId: z.number().int(),
  BaseAvatarItemColor: z.string().describe("Hex colour, e.g. `#F55C1A`"),
  Accessibility: z.number().int().optional()
});
const CreateCustomAvatarItemRequest = z.object({
  metadata: z.string().describe("JSON `CreateCustomAvatarItemMetadata`, posted as a text field"),
  thumbnailImage: z.string().describe("The thumbnail PNG (binary file part)"),
  design: z.string().describe("The design blob (binary file part)")
});
const CustomAvatarItemDto = z.object({
  CustomAvatarItemId: z.string(),
  CreatorAccountId: z.number().int(),
  Name: z.string(),
  Description: z.string(),
  Price: z.number().int(),
  Accessibility: z.number().int(),
  ForceCannotPublish: z.boolean(),
  IsFeatured: z.boolean(),
  IsRecRoomApproved: z.boolean(),
  BaseAvatarItemId: z.number().int(),
  BaseAvatarItemColor: z.string(),
  DesignFilename: z.string(),
  ThumbnailImageFilename: z.string(),
  CreatedAt: z.string(),
  ModifiedAt: z.string(),
  PreviewOrientation: z.number().int(),
  RankingContext: z.null(),
  OutfitType: z.number().int(),
  CurrentSaves: z.array(z.unknown()),
  PurchaseInfo: z.null()
});
const UpdateCustomAvatarItemRequest = z.object({
  Name: z.string().nullable().optional(),
  Description: z.string().nullable().optional(),
  Price: z.number().int().nullable().optional(),
  Accessibility: z.number().int().nullable().optional()
});
const CustomAvatarItemList = z.array(CustomAvatarItemDto);
const CustomAvatarItemResponse = z.object({
  Value: CustomAvatarItemDto.nullable(),
  Success: z.boolean(),
  Error: z.string().nullable(),
  error_id: z.string().nullable()
});
const BulkIdsRequest = z.object({
  Ids: z.union([z.string(), z.array(z.string())]).describe("Repeated (`Ids=101&Ids=102`) or comma-separated (`Ids=1,2,3`)")
});
const InventionVersionDto = z.object({
  InventionId: z.int(),
  ReplicationId: z.string(),
  VersionNumber: z.int(),
  BlobName: z.string().describe("The `.inv` key in the storage worker\u2018s bucket"),
  BlobHash: z.string().nullable().describe("Base64 SHA-256 of the blob; null when it was never uploaded"),
  InstantiationCost: z.int(),
  LightsCost: z.int(),
  ChipsCost: z.int(),
  CloudVariablesCost: z.int(),
  AICost: z.int(),
  HasBetaContent: z.boolean().optional().describe("Set from `v9/save` on \u2014 absent on a version saved through `v6/save`")
});
const InventionTagDto = z.object({
  Tag: z.string(),
  Type: z.int().describe("0 = custom, 2 = auto")
});
const InventionDto = z.object({
  InventionId: z.int(),
  ReplicationId: z.string(),
  CreatorPlayerId: z.int(),
  Name: z.string(),
  Description: z.string(),
  ImageName: z.string(),
  CurrentVersionNumber: z.int(),
  CurrentVersion: InventionVersionDto,
  Accessibility: z.int(),
  IsPublished: z.boolean().describe("Unpublished inventions are visible only to their creator"),
  IsFeatured: z.boolean(),
  ModifiedAt: z.string(),
  CreatedAt: z.string(),
  FirstPublishedAt: z.string().nullable(),
  CreationRoomId: z.int(),
  NumPlayersHaveUsedInRoom: z.int(),
  NumDownloads: z.int(),
  CheerCount: z.int(),
  CreatorPermission: z.int(),
  GeneralPermission: z.int().describe("What other players may do with it once published"),
  IsAGInvention: z.boolean(),
  IsCertifiedInvention: z.boolean(),
  Price: z.int(),
  AllowTrial: z.boolean(),
  HideFromPlayer: z.boolean(),
  ReferencedInventions: z.array(z.int()),
  ReferencedUnityAssetIds: z.array(z.string()).optional().describe("Set from `v9/save` on \u2014 absent on an invention saved through `v6/save`"),
  UgcVersion: z.int().optional().describe("An invention field, not a version one \u2014 set from `v9/save` on"),
  LongDescription: z.string().optional().describe("Set from `v9/save` on, when non-empty"),
  DisplayMetadataJson: z.string().optional().describe("The client\u2019s own display state, stored as the opaque string it sent"),
  ConvertedFromInventionId: z.int().optional().describe("The invention this one was converted from, when `v9/save` named one"),
  Tags: z.array(InventionTagDto).optional().describe(
    "The real RRInvention carries no Tags field. Unset by `v6/save`; set by `v9/save` when its `tagsRequest` names at least one tag"
  )
});
const InventionSaveResult = z.object({
  Status: z.int().describe("0 = success"),
  Invention: InventionDto,
  InventionVersion: InventionVersionDto
});
const InventionV9Dto = z.object({
  InventionId: z.int(),
  ReplicationId: z.string(),
  CreatorPlayerId: z.int(),
  Name: z.string(),
  Description: z.string(),
  ImageName: z.string(),
  UgcVersion: z.int().describe("The UGC format the blob was written in; 0 when unsent"),
  CurrentVersionNumber: z.int(),
  LatestVersionNumber: z.int().describe("The same as CurrentVersionNumber on a fresh save"),
  Accessibility: z.int(),
  ForceCannotPublish: z.boolean().describe("Always false \u2014 nothing here forbids publishing"),
  ModifiedAt: z.string(),
  CreatedAt: z.string(),
  FirstPublishedAt: z.string().nullable(),
  CreationRoomId: z.int().nullable(),
  NumPlayersHaveUsedInRoom: z.int(),
  NumDownloads: z.int(),
  CheerCount: z.int(),
  CreatorPermission: z.int(),
  GeneralPermission: z.int(),
  IsAGInvention: z.boolean(),
  IsCertifiedInvention: z.boolean(),
  IsRecRoomApproved: z.boolean().describe("Always false \u2014 nothing here approves an invention"),
  AllowTrial: z.boolean(),
  Price: z.int().nullable(),
  HideFromPlayer: z.boolean(),
  DisplayMetadataJson: z.string().nullable()
});
const InventionVersionV9Dto = z.object({
  InventionId: z.int(),
  ReplicationId: z.string(),
  VersionNumber: z.int(),
  HasBetaContent: z.boolean(),
  InstantiationCost: z.int(),
  LightsCost: z.int(),
  ChipsCost: z.int(),
  CloudVariablesCost: z.int(),
  BlobName: z.string(),
  BlobHash: z.string().nullable(),
  CreatedAt: z.string(),
  UgcAccessibility: z.int().nullable().describe("Always null \u2014 versions carry no accessibility"),
  ReferencedInventions: z.array(z.int()),
  ReferencedUnityAssetIds: z.array(z.string())
});
const InventionSaveV9Result = z.object({
  Value: z.object({
    Status: z.int().describe("0 = success; the client never reads it on this route"),
    Invention: InventionV9Dto,
    InventionVersion: InventionVersionV9Dto,
    TagsResponse: z.object({
      Result: z.int().describe("0 = success; non-zero when a tag broke the tag rule"),
      Tags: z.array(z.string()).describe("The stored tag NAMES, auto first, then custom")
    })
  }).nullable().describe("Null when Success is false \u2014 and only then"),
  Success: z.boolean(),
  Error: z.string().nullable().describe("The refusal message; the only text the client shows"),
  error_id: z.string().nullable().describe("Always null")
});
const TagFilters = z.object({
  PinnedFilters: z.array(z.string()),
  PopularFilters: z.array(z.string()),
  TrendingFilters: z.array(z.string()).nullable().describe("Null \u2014 needs recent-activity data we don\u2018t keep")
});
const InventionDetails = z.object({ Tags: z.array(InventionTagDto) });
const InventionPersonalDetails = z.object({
  IsCheering: z.boolean().describe("Whether the caller currently cheers this invention")
});
const InventionCheerRequest = z.object({
  InventionId: z.int().describe("The invention whose cheer state is changing"),
  Cheer: z.boolean().describe("True to cheer; false to remove the cheer")
});
const SetTagsRequest = z.object({
  InventionId: z.int(),
  AutoTags: z.array(z.string()).optional().describe("Client-derived tags (Type 2); each at most 15 letters once lowercased"),
  CustomTags: z.array(z.string()).optional().describe("Creator-submitted tags (Type 0); each at most 15 letters once lowercased")
});
const SetTagsResponse = z.object({
  Result: z.int().describe("0 = success"),
  Tags: z.array(z.string()).describe("Auto tags first, then custom")
});
const UpdateInventionMetadataRequest = z.object({
  InventionId: z.int(),
  Name: z.string().nullable().optional().describe("3\u201324 chars, letters/digits/spaces/dashes/colons; null leaves it alone"),
  Description: z.string().nullable().optional().describe("Max 512 chars; empty clears it"),
  LongDescription: z.string().nullable().optional().describe("Empty clears it"),
  ImageName: z.string().nullable().optional().describe("New thumbnail; empty clears it"),
  TagsRequest: z.object({
    AutoTags: z.array(z.string()).nullable().optional(),
    CustomTags: z.array(z.string()).nullable().optional()
  }).nullable().optional().describe("Replaces both lists wholesale, as `v1/settags` does; null leaves them alone")
});
const PublishInventionRequest = z.object({
  InventionId: z.int(),
  Permission: z.int().nullable().optional().describe(
    "The `GeneralPermission` other players get, as a raw ladder number: Unassigned 0, LimitedOneUseOnly 10, DisallowKeyLock 15, UseOnly 20, EditAndSave 40, Publish 60, Charge 80, Unlimited 100. Null publishes as UseOnly"
  ),
  Accessibility: z.int().nullable().optional().describe("Private 0, Public 1, Unlisted 2. Unlisted stays out of browse and search"),
  Price: z.int().nullable().optional().describe("Price in tokens; null leaves it as it is, and a negative one is ignored")
});
const DeleteInventionRequest = z.object({
  InventionId: z.int().describe("The invention to delete; the caller must have created it")
});
const InventionDeleteResult = z.object({
  Value: z.null().describe("Always null \u2014 the invention no longer exists"),
  Success: z.boolean(),
  Error: z.string().nullable().describe("The refusal message; null on success"),
  error_id: z.string().nullable().describe("Always null")
});
const UpdatePriceRequest = z.object({
  InventionId: z.int(),
  Price: z.int().describe("Must be >= 0")
});
const SaveInventionRequest = z.object({
  inventionDataFilename: z.string().describe("The blob uploaded through the storage worker; the one required field"),
  name: z.string().optional().describe("3\u201324 chars: letters, digits, spaces, dashes, colons. Omitted/blank \u21D2 \u201CUntitled\u201D"),
  description: z.string().optional().describe("At most 512 chars. Omitted/blank \u21D2 \u201CNo description yet\u201D"),
  imageName: z.string().optional(),
  instantiationCost: z.int().optional(),
  lightsCost: z.int().optional(),
  chipsCost: z.int().optional(),
  cloudVariablesCost: z.int().optional(),
  aiCost: z.int().optional(),
  creationRoomId: z.int().optional(),
  referencedInventions: z.array(z.int()).optional(),
  creatorAccountRole: z.int().optional().describe("Accepted and ignored \u2014 a room role, not a permission over the invention")
});
const SaveInventionV9Request = SaveInventionRequest.extend({
  ugcVersion: z.int().optional().describe("The UGC format the blob was written in"),
  hasBetaContent: z.boolean().optional(),
  referencedUnityAssetIds: z.array(z.string()).optional(),
  longDescription: z.string().optional().describe("Stored when non-empty"),
  displayMetadataJson: z.string().optional().describe('Opaque client display state, e.g. `{"0":0,"99":0}`; stored verbatim'),
  convertedFromInventionId: z.int().nullable().optional(),
  tagsRequest: z.object({
    AutoTags: z.array(z.string()).nullable().optional(),
    CustomTags: z.array(z.string()).nullable().optional()
  }).optional().describe("The same two lists `v1/settags` takes, folded into the save")
});
const GeneratedGift = z.object({
  Id: z.int().describe("Always 0 \u2014 gifts generated here are not persisted"),
  FromPlayerId: z.int(),
  ConsumableItemDesc: z.string(),
  AvatarItemDesc: z.string(),
  FriendlyName: z.string(),
  AvatarItemType: z.int(),
  EquipmentPrefabName: z.string(),
  EquipmentModificationGuid: z.string(),
  CurrencyType: z.int(),
  Currency: z.int().describe("A random token amount"),
  Xp: z.int(),
  Level: z.int(),
  Platform: z.int(),
  PlatformsToSpawnOn: z.int(),
  BalanceType: z.int(),
  GiftContext: z.int(),
  GiftRarity: z.int(),
  Message: z.string()
});
const GenerateGiftRequest = z.object({
  GiftContext: z.string().optional().describe("Where the gift was earned"),
  Message: z.string().optional(),
  Xp: z.string().optional()
});
const BulkCustomAvatarItemsRequest = z.object({
  customAvatarItemIds: z.array(z.string()).describe("The ids to resolve; repeat the field once per id")
});
const CustomAvatarItemsPage = z.object({
  Results: CustomAvatarItemList,
  TotalResults: z.int()
});
const CustomAvatarItemSave = z.object({
  customAvatarItemSaveId: z.int().describe("The save\u2019s id"),
  customAvatarItemId: z.string().describe("Guid of the custom item this save belongs to"),
  unityAssetId: z.string().describe("Guid of the built Unity asset"),
  createdAt: z.string().describe("ISO 8601 timestamp"),
  thumbnailFileName: z.string(),
  additionalConfiguration: z.string(),
  unityAsset: z.string(),
  unityAssetHash: z.string()
});
const LegacyAvatarItemSaves = z.object({
  customAvatarItemSavesByAvatarItemDesc: z.record(z.string(), CustomAvatarItemSave)
});
const StoredOutfit = z.object({
  LegacyData: z.object({
    SelectionsV1: z.string().nullable().describe("Semicolon-delimited legacy descriptors"),
    SelectionsV2: z.string().nullable().describe("JSON-in-a-string: `{ selections: [...] }`"),
    FaceFeatures: z.string().nullable().describe("JSON-in-a-string"),
    SkinColor: z.string().nullable(),
    HairColor: z.string().nullable()
  }),
  Selections: JsonArray,
  DataVersion: z.int().describe("The client\u2019s outfit format version, as saved"),
  CustomizationSettings: z.string().nullable().describe("JSON-in-a-string: the same outfit in the newer structured form"),
  ThumbnailFileName: z.string().nullable(),
  Name: z.string().nullable(),
  Accessibility: z.int(),
  Slot: z.int().describe("0 \u2014 the outfit being worn")
});
const EmptyOutfit = z.object({
  FaceFeatures: z.string(),
  HairColor: z.string(),
  OutfitSelections: z.string(),
  SkinColor: z.string()
});
const OutfitsMeResponse = z.union([StoredOutfit, EmptyOutfit]);
const OutfitsMeRequest = z.object({
  DataVersion: z.int().describe("The client\u2019s outfit format version (2 in observed saves)"),
  LegacyData: z.object({
    SelectionsV1: z.string().nullable().describe("Semicolon-delimited legacy descriptors"),
    SelectionsV2: z.string().nullable().describe("JSON-in-a-string: `{ selections: [...] }`"),
    FaceFeatures: z.string().nullable().describe("JSON-in-a-string"),
    SkinColor: z.string().nullable(),
    HairColor: z.string().nullable()
  }),
  CustomizationSettings: z.string().nullable().describe("JSON-in-a-string: the same outfit in the newer structured form"),
  Selections: JsonArray.describe("Empty in observed saves"),
  Slot: z.int(),
  Name: z.string().nullable(),
  Accessibility: z.int(),
  ThumbnailFileName: z.string().nullable()
});
const OutfitsBulkRequest = z.object({
  AccountIds: z.array(z.int()).describe("The accounts whose worn outfit is wanted"),
  UnityAssetTarget: z.string().nullable().describe("Baked-asset platform. Accepted and ignored \u2014 nothing bakes assets here"),
  UnityAssetVersion: z.string().nullable().describe("Baked-asset version. Accepted and ignored, like its sibling")
});
const OutfitsBulkResponse = z.object({
  OutfitsByAccountId: z.record(z.string(), StoredOutfit).describe("Keyed by account id as a string. Accounts with no saved outfit are omitted")
});
const OutfitSaveResponse = z.object({
  Success: z.boolean(),
  Error: z.string().nullable().describe("Null on success"),
  error_id: z.string().nullable().describe("Null on success. snake_case, unlike its siblings")
});
const SuccessValueEnvelope = z.object({ success: z.boolean(), value: z.null() });
const SanitizeRequest = z.object({
  Value: z.string().describe("The text to clean or check"),
  ReplacementChar: z.string().optional().describe("The mask a swear\u2019s characters are replaced with. Defaults to `*`"),
  PreRemoveBlockedCharacters: z.boolean().optional().describe("Strip control and zero-width characters before filtering"),
  Context: z.string().optional().describe("The surface being checked, e.g. `RoomChat`. Ignored"),
  Intent: z.int().optional().describe("Reference filtering intent. Ignored"),
  ruleset: z.int().optional().describe("Reference ruleset \u2014 lowercase, as the client sends it. Ignored")
});
const IsPureResponse = z.object({ IsPure: z.boolean() });
const KeepsakeConfig = z.object({
  KeepsakeFeatureEnabled: z.boolean(),
  KeepsakeRoomLimit: z.int(),
  SocialXpBoostEnabled: z.boolean()
});
const KeepsakeCategories = z.object({
  Results: JsonArray.describe("The categories \u2014 empty, as no keepsake catalog is stored"),
  TotalResults: z.int().describe("How many results `Results` carries")
});
const PlayerEventDto = z.object({
  PlayerEventId: z.int(),
  CreatorPlayerId: z.int(),
  ImageName: z.string().nullable().describe("Banner image; null until one is uploaded"),
  RoomId: z.int(),
  SubRoomId: z.int().nullable().describe("Null when the event doesn\u2019t pin a subroom"),
  ClubId: z.int().nullable().describe("Null when the event isn\u2019t a club\u2019s"),
  Name: z.string(),
  Description: z.string(),
  StartTime: z.string().describe("ISO 8601 UTC, seconds precision (`2020-11-29T22:00:00Z`)"),
  EndTime: z.string().describe("ISO 8601 UTC, seconds precision; at most 24 hours after `StartTime`"),
  AttendeeCount: z.int().describe("Starts at 1 \u2014 the creator attends their own event"),
  State: z.int().describe("0 = scheduled"),
  Accessibility: z.int(),
  IsMultiInstance: z.boolean(),
  SupportMultiInstanceRoomChat: z.boolean(),
  DefaultBroadcastPermissions: z.int(),
  CanRequestBroadcastPermissions: z.int()
});
const PlayerEventDetailsDto = PlayerEventDto.extend({
  tags: z.array(z.object({ tag: z.string(), type: z.int() })).optional().describe("Present only with `includeDetails=True`; the stored `{ tag, type }` pairs")
});
const PlayerEventBaseDto = PlayerEventDto.omit({ State: true, ImageName: true }).extend({
  ImageName: z.string().describe("Empty string when the event has no image, never null"),
  BroadcastingRoomInstanceId: z.int().nullable().describe("Always null \u2014 no event broadcasts to a room instance yet")
});
const PlayerEventEnvelopeDto = PlayerEventBaseDto.extend({
  Tags: z.union([z.array(z.string()), z.array(z.object({ Tag: z.string(), Type: z.int() }))]).describe(
    "The event\u2019s tags: names for a build newer than 20230414, `{ Tag, Type }` pairs for that build and older"
  )
});
const PlayerEventResultDto = z.object({
  PlayerEvent: PlayerEventEnvelopeDto,
  Result: z.int().describe("0 = success"),
  TagModifyResult: z.object({
    Result: z.int().describe("0 = success"),
    Tags: z.array(z.string()).describe("The tags the event now carries")
  })
});
const PlayerEventDeletedDto = z.object({
  PlayerEvent: z.null(),
  Result: z.int().describe("0 = success"),
  TagModifyResult: z.null()
});
const PlayerEventRequest = PlayerEventDto.partial().extend({
  PlayerEvent: z.unknown().optional().describe("The event\u2019s fields, if nested rather than posted at the top level")
});
const PlayerEventTimeRequest = z.object({
  startTime: z.string().optional().describe("New start, any parseable ISO 8601 \u2014 the client sends .NET tick precision"),
  endTime: z.string().optional().describe("New end, same form")
});
const PlayerEventAccessibilityRequest = z.object({
  accessibility: z.string().describe(
    "`Private`, `Public`, `Unlisted`, `Dev_only` or `Dev_Unlisted` (case-insensitive) \u2014 or its ordinal 0\u20134"
  )
});
const PlayerEventNameRequest = z.object({
  name: z.string().describe("The new title; blank is refused \u2014 an event always has a name")
});
const PlayerEventDescriptionRequest = z.object({
  description: z.string().optional().describe("The new blurb; absent clears it")
});
const PlayerEventTagsRequest = z.array(z.string()).describe("The event\u2019s whole tag set");
const PlayerEventResponseDto = z.object({
  PlayerEventResponseId: z.int().describe("Stable id of the RSVP row"),
  PlayerEventId: z.int(),
  PlayerId: z.int(),
  CreatedAt: z.string().describe(
    "When the answer that stands was given \u2014 a changed answer updates the row, so this moves with it rather than recording the player\u2019s first response"
  ),
  Type: z.int().describe("0 Going, 1 Interested, 2 Can\u2019t go")
});
const PlayerEventRespondRequest = z.object({
  PlayerEventId: z.int(),
  Type: z.int().describe("0 Going, 1 Interested, 2 Can\u2019t go")
});
const PlayerEventReportRequest = z.object({
  PlayerEventId: z.int().describe("The event being reported"),
  ReportCategory: z.int().optional().describe("The reason picked in the report UI, e.g. `101`. Stored verbatim; unmapped"),
  Details: z.string().optional().describe("The free-text description the reporter typed")
});
const CustomAvatarItemReportRequest = z.object({
  ReportCategory: z.int().optional().describe("The reason picked in the report UI. Stored verbatim; unmapped"),
  Details: z.string().optional().describe("The free-text description the reporter typed"),
  ReportedPlayerId: z.int().nullable().optional().describe("Sent as null and IGNORED \u2014 the reported player is the item\u2019s creator")
});
const InventionReportRequest = z.object({
  InventionId: z.int().describe("The invention being reported"),
  ReportCategory: z.int().optional().describe("The reason picked in the report UI. Stored verbatim; unmapped"),
  Details: z.string().optional().describe("The free-text description the reporter typed")
});
const PlayerEventBulkInviteRequest = z.object({
  PlayerEventId: z.int(),
  InvitedPlayerIds: z.array(z.int()).describe("Ids to invite; duplicates and the caller are ignored")
});
const PlayerEventsAll = z.object({
  Created: z.array(PlayerEventDto).describe("Events the caller created, soonest first"),
  Responses: JsonArray.describe(
    "Events the caller RSVP\u2019d to \u2014 always empty; RSVPs are stored, but this field\u2019s entry shape has not been observed yet"
  )
});
const PlayerEventsPage = z.object({
  ContinuationToken: z.string().describe("Empty = no next page"),
  Events: JsonArray
});
const VoteToKickReason = z.object({
  Reason: z.string().describe("The label shown on the button"),
  ReportCategory: z.int().describe("The category the resulting report is filed under: 101, 102, 103 or 6")
});
const ModerationBlockDetails = z.object({
  ReportCategory: z.int().describe(
    "The category the ban\u2019s report was filed under; -1 = ReportCategory.Unknown when not blocked (0 is a real category)"
  ),
  Duration: z.int().describe(
    "Length of the block in seconds from `TimeoutStartedAt`; 2147483647 (int32 max) for a permanent ban; 0 when not blocked"
  ),
  GameSessionId: z.int(),
  IsHostKick: z.boolean().describe("Always false \u2014 no host kick is ever recorded here"),
  Message: z.string().nullable().describe("\u201CRule violation\u201D on a ban; null when not blocked"),
  PlayerIdReporter: z.int().nullable().describe("Always null \u2014 the reporter is not shown to the reported"),
  IsBan: z.boolean().describe("True when an account-wide ban is in force"),
  IsVoiceModAutoban: z.boolean().describe("Always false"),
  IsDeviceBan: z.boolean().describe("Always false \u2014 bans here are account-wide, not per device"),
  IsWarning: z.boolean().describe("Always false \u2014 warnings are delivered as notifications, not here"),
  VoteKickReason: z.string().nullable().describe("Always null \u2014 no vote-kick is recorded here"),
  TimeoutStartedAt: z.string().nullable().describe(
    "When the block began \u2014 the ban\u2019s report `created_at` (ISO-8601 UTC); `Duration` runs from it. Null when not blocked"
  ),
  AssociatedAccountUsername: z.string().nullable().describe("Always null"),
  ShowCreatorCodeOfConduct: z.boolean().describe("Always false"),
  TopMessageOverride: z.string().nullable().describe("Always null \u2014 the client\u2019s default block-screen text stands"),
  BottomMessageOverride: z.string().nullable().describe("Always null \u2014 the client\u2019s default block-screen text stands")
});
const CreateReportRequest = z.object({
  PlayerIdReported: z.string().describe("Account id of the player being reported"),
  ReportCategory: z.string().optional().describe("The reason picked in the report UI, e.g. `100`. Stored verbatim; unmapped"),
  Details: z.string().optional().describe("The free-text description the reporter typed"),
  HeightReporter: z.string().optional().describe("Reporter\u2019s player height in metres at report time, e.g. `1.64`"),
  HeightReported: z.string().optional().describe("Reported player\u2019s height in metres"),
  RoomId: z.string().optional().describe("Room the report was raised in, if any"),
  RoomInstanceType: z.string().optional().describe("Instance type name, e.g. `Public`. Stored verbatim")
});
const CreateWarningRequest = z.object({
  WarnedPlayerId: z.string().describe("Account id of the player being warned"),
  ReportCategory: z.string().optional().describe("The reason category, e.g. `101`. Stored verbatim; unmapped"),
  DisplayReason: z.string().optional().describe("What the warned player is shown, e.g. `Sexual gestures`"),
  ModeratorNote: z.string().optional().describe("Internal note; never shown to the player")
});
const VoteToKickRequest = z.object({
  PlayerId: z.string().describe("Account id of the player being voted on"),
  Response: z.string().describe("The caller\u2019s own vote, e.g. `True`"),
  Reason: z.string().optional().describe("A `voteToKickReasons` label, e.g. `Inactive in games (AFK)`"),
  GameSessionId: z.string().describe("The room instance both players are standing in")
});
const InstantKickRequest = z.object({
  GameSessionId: z.int().describe("The room instance (game session) to eject them from"),
  PlayerIds: z.array(z.int()).describe("Account ids to kick out of that instance")
});
const DeviceIdRequest = z.object({
  oldDeviceId: z.string().optional().describe("The id the client thinks we hold"),
  newDeviceId: z.string().optional(),
  platform: z.string().optional()
});
const QuickPlayResponse = z.object({
  RoomName: z.string().nullable(),
  ActionCode: z.string().nullable(),
  TargetPlayerId: z.int().nullable()
});
const VerifyRoleRequest = z.object({
  roomId: z.string(),
  role: z.string().describe("The minimum role level required"),
  context: z.string().optional().describe("e.g. MakerPen \u2014 accepted and ignored")
});
const SavedImageDto = z.object({
  Id: z.int(),
  Type: z.int().describe("SavedImageType: 1 = share camera, 3 = room, 4 = profile, \u2026"),
  Accessibility: z.int(),
  AccessibilityLocked: z.boolean(),
  ImageName: z.string().describe("The bucket key the img worker serves it back by"),
  Description: z.string().nullable(),
  PlayerId: z.int(),
  TaggedPlayerIds: z.array(z.int()),
  RoomId: z.int().nullable(),
  PlayerEventId: z.int().nullable(),
  CreatedAt: z.string(),
  CheerCount: z.int(),
  CommentCount: z.int()
});
const ImageMetadataDto = z.object({
  SavedImageId: z.int(),
  ImageName: z.string().describe("The bucket key the img worker serves it back by"),
  PlayerId: z.int(),
  RoomId: z.int().describe("0 when the photo was not taken in a room"),
  PlayerEventId: z.int().describe("0 when it belongs to no event"),
  ClubId: z.int().describe("Always 0 \u2014 nothing here associates an image with a club"),
  Description: z.string().describe("Empty string, never null"),
  Accessibility: z.int(),
  AccessibilityLocked: z.boolean(),
  SavedImageType: z.int().describe("1 = share camera, 3 = room, 4 = profile, \u2026"),
  CreatedAt: z.string(),
  CheerCount: z.int(),
  CommentCount: z.int()
});
const ImagesPlayerDto = z.object({
  SavedImageId: z.int(),
  SavedImageType: z.int(),
  Accessibility: z.int(),
  AccessibilityLocked: z.boolean(),
  CheerCount: z.int(),
  CommentCount: z.int(),
  CreatedAt: z.string(),
  Description: z.string().nullable(),
  ImageName: z.string(),
  PlayerEventId: z.int().nullable(),
  PlayerId: z.int(),
  RoomId: z.int().nullable()
});
const SlideshowImageDto = z.object({
  SavedImageId: z.int(),
  ImageName: z.string(),
  Username: z.string(),
  RoomName: z.string().nullable(),
  RoomId: z.int().nullable(),
  SavedImageType: z.int(),
  PlayerEventId: z.int().nullable(),
  Accessibility: z.int(),
  PlayerIds: z.array(z.int())
});
const SlideshowResponse = z.object({
  Images: z.array(SlideshowImageDto),
  ValidTill: z.string().describe("ISO timestamp ~2 minutes out; the client refreshes against it")
});
const UploadImageRequest = z.object({
  image: z.string().describe("The image file (`file` is accepted too)"),
  imgMeta: z.string().optional().describe(
    "A JSON `SavedImageMetaDTO`: { playerIds, savedImageType, roomId, playerEventId, accessibility, description }"
  )
});
const UploadImageResponse = z.object({
  ImageName: z.string().describe("The bucket key; the img worker serves the object by it")
});
const DeleteImageRequest = z.object({ ImageName: z.string() });
const CheeredBulkRequest = z.object({
  id: z.string().describe("Repeated once per image id; each value may also be comma-separated")
});
const CheerImageRequest = z.object({
  SavedImageId: z.int(),
  Cheer: z.boolean().describe("True to cheer, false to un-cheer")
});
const PhotoTaggingSettingRequest = z.object({
  Setting: z.int().describe("The preference\u2019s enum ordinal, stored verbatim")
});
const PhotoTaggingSettingResponse = z.int().describe("The caller\u2019s photo-tagging preference; 0 until they set one");
const SuccessResponse = z.object({ success: z.boolean() });
const CheeredEntry = z.object({
  SavedImageId: z.int(),
  IsCheered: z.boolean()
});
export {
  AUTHED,
  AckResponse,
  AmplitudeConfig,
  ApiConfigV2,
  AzureSpeechConfig,
  BacktraceConfig,
  BareBoolean,
  BareInteger,
  BareString,
  BulkCustomAvatarItemsRequest,
  BulkIdsRequest,
  CheerImageRequest,
  CheerPlayerRequest,
  CheerPlayerResponse,
  CheeredBulkRequest,
  CheeredEntry,
  CreateCustomAvatarItemMetadata,
  CreateCustomAvatarItemRequest,
  CreateReportRequest,
  CreateWarningRequest,
  CustomAvatarItemDto,
  CustomAvatarItemList,
  CustomAvatarItemReportRequest,
  CustomAvatarItemResponse,
  CustomAvatarItemSave,
  CustomAvatarItemsPage,
  DeleteImageRequest,
  DeleteInventionRequest,
  DeleteMessagesRequest,
  DeviceIdRequest,
  EmptyOutfit,
  ErrorResponse,
  FriendOnlineCountResponse,
  GenerateGiftRequest,
  GeneratedGift,
  ImageMetadataDto,
  ImagesPlayerDto,
  InstantKickRequest,
  InventionCheerRequest,
  InventionDeleteResult,
  InventionDetails,
  InventionDto,
  InventionPersonalDetails,
  InventionReportRequest,
  InventionSaveResult,
  InventionSaveV9Result,
  InventionTagDto,
  InventionV9Dto,
  InventionVersionDto,
  InventionVersionV9Dto,
  IsPureResponse,
  IslandedVersions,
  JsonArray,
  JsonObject,
  KeepsakeCategories,
  KeepsakeConfig,
  LegacyAvatarItemSaves,
  MessageDto,
  ModerationBlockDetails,
  MutualFriendDto,
  OPTIONAL_AUTHED,
  OutfitSaveResponse,
  OutfitsBulkRequest,
  OutfitsBulkResponse,
  OutfitsMeRequest,
  OutfitsMeResponse,
  PhotoTaggingSettingRequest,
  PhotoTaggingSettingResponse,
  PlayerEventAccessibilityRequest,
  PlayerEventBaseDto,
  PlayerEventBulkInviteRequest,
  PlayerEventDeletedDto,
  PlayerEventDescriptionRequest,
  PlayerEventDetailsDto,
  PlayerEventDto,
  PlayerEventEnvelopeDto,
  PlayerEventNameRequest,
  PlayerEventReportRequest,
  PlayerEventRequest,
  PlayerEventRespondRequest,
  PlayerEventResponseDto,
  PlayerEventResultDto,
  PlayerEventTagsRequest,
  PlayerEventTimeRequest,
  PlayerEventsAll,
  PlayerEventsPage,
  ProgressionDto,
  PublishInventionRequest,
  QuickPlayResponse,
  RelationshipDto,
  ReputationDto,
  SanitizeRequest,
  SaveInventionRequest,
  SaveInventionV9Request,
  SavedImageDto,
  SendMessageRequest,
  SendMultipleMessagesRequest,
  SetSelectedCheerRequest,
  SetTagsRequest,
  SetTagsResponse,
  SlideshowImageDto,
  SlideshowResponse,
  StatsigUserProperties,
  StoredOutfit,
  SuccessErrorEnvelope,
  SuccessResponse,
  SuccessValueEnvelope,
  TagFilters,
  UNAUTHORIZED_RESPONSE,
  UpdateCustomAvatarItemRequest,
  UpdateInventionMetadataRequest,
  UpdatePriceRequest,
  UploadImageRequest,
  UploadImageResponse,
  VerifyRoleRequest,
  VersionCheck,
  VoteToKickReason,
  VoteToKickRequest,
  form,
  idParam,
  intQuery,
  json,
  jsonBody,
  pageParams,
  stringParam,
  stringQuery
};
