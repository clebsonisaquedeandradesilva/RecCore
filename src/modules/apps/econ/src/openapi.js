// Ported from apps/econ/src/openapi.ts; TypeScript types erased; native runtime imports.
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
const JsonObject = z.record(z.string(), z.unknown());
const JsonArray = z.array(z.unknown());
const AvatarV2Dto = z.object({
  OutfitSelections: z.unknown(),
  FaceFeatures: z.unknown(),
  SkinColor: z.unknown(),
  HairColor: z.unknown()
});
const ConsumeEnvelope = z.object({
  error: z.string(),
  success: z.boolean(),
  value: z.null()
});
const BalanceEntry = z.object({
  CurrencyType: z.int(),
  Platform: z.int().describe("-2 = all platforms (account-wide)"),
  Balance: z.int()
});
const RoomEconConfig = z.object({
  RoomId: z.int().describe("Echoed back from the path"),
  EnableSortingTabs: z.boolean().describe("Always false \u2014 no per-room config is stored")
});
const CustomAvatarItemsResponse = z.object({
  Results: JsonArray,
  TotalResults: z.int()
});
const SubscriptionDto = z.object({
  SubscriptionId: z.int().describe("Placeholder \u2014 no subscription is stored"),
  RecNetPlayerId: z.int().describe("The subscribed player: the caller"),
  PlatformType: z.int().nullable().describe(
    "Which store sold it: -1 All, 0 Steam, 1 Oculus, 2 PlayStation, 3 Xbox, 4 RecNet, 5 IOS, 6 GooglePlay, 7 Standalone, 8 Pico. -1 here \u2014 no store did"
  ),
  PlatformId: z.string().describe("Empty \u2014 no store account behind it"),
  PlatformPurchaseId: z.string().describe("Empty \u2014 nothing was purchased"),
  Level: z.int().describe("0 Gold, 1 Platinum"),
  Period: z.int().describe("0 Month, 1 Year, 2 ThreeMonth, 3 SixMonth"),
  ExpirationDate: z.string().describe("ISO 8601 UTC; a year out, recomputed per call"),
  IsAutoRenewing: z.boolean(),
  CreatedAt: z.string(),
  ModifiedAt: z.string()
});
const AvatarItemV4Dto = z.object({
  avatarItemId: z.int(),
  avatarItemDesc: z.string().describe("The comma-delimited item descriptor, commas and all"),
  friendlyName: z.string(),
  tooltip: z.string(),
  tagList: z.string(),
  avatarItemType: z.int(),
  rarity: z.int(),
  isBaseAvatarItem: z.boolean()
});
const CompleteChecklistRequest = z.object({
  ItemIndex: z.int().describe("The row\u2019s index \u2014 what the client actually sends"),
  Id: z.int().optional().describe("Fallback row id, read when ItemIndex is absent or 0")
});
const ChecklistCompleteResponse = z.object({
  BalanceUpdates: z.array(z.object({ UpdateResponse: z.int(), Data: z.array(JsonObject) })),
  Balance: z.int().describe("The change applied \u2014 0 while completion is stubbed"),
  CurrencyType: z.int(),
  BalanceType: z.int().describe("-2 = account-wide")
});
const ChecklistEntry = z.object({
  Order: z.int().describe("Position in the list, from 0"),
  Objective: z.int().describe("ObjectiveType ordinal, e.g. 38 = SaveOutfitSlot"),
  Count: z.int().describe("How many times the objective must happen"),
  CreditAmount: z.int().describe("Tokens awarded on completion")
});
const SubscriptionResponse = z.union([
  z.object({
    Subscription: SubscriptionDto,
    PlatformAccountSubscribedPlayerId: z.null().describe("The platform account holding the sub, when it is shared. Never set here")
  }),
  z.object({}).describe("`{}` \u2014 no subscription")
]);
const RRPlusSignUpBonus = z.object({
  RRPlusSignUpBonusId: z.int().describe("Which sign-up bonus is running"),
  MinFreeItemsPrice: z.int().describe("Lowest token price a free item may have"),
  MaxFreeItemsPrice: z.int().describe("Highest token price a free item may have")
});
const InfluencerIdsResponse = z.object({
  InfluencerIds: z.array(z.int()).describe("Account ids in the partner program. Empty \u2014 no programme runs here")
});
const InfluencerTierResponse = z.literal(0).describe("The account\u2019s partner tier. Always 0 \u2014 nobody here is an influencer");
const ReferralProgressResponse = z.object({
  success: z.boolean(),
  value: z.object({
    ReferralsVerifiedCount: z.int().describe("Referrals that have been verified. Always 0"),
    PlayerReferralRewards: z.array(z.unknown()).describe("Rewards claimed off the referral track. Always empty")
  })
});
const MakerAiFreeTrialEligibilityResponse = z.boolean().describe("Whether the caller can start a Maker AI free trial; always false");
const ChallengeProgressResponse = z.object({
  ChallengeMapId: z.int(),
  ChallengeId: z.int(),
  Config: z.string().describe("The STORED rule tree \u2014 a report carrying none keeps (and echoes) the last one"),
  Complete: z.boolean().describe("The STORED completion \u2014 latches true within a rotation, so it may differ")
});
const UpdateObjectiveResponse = z.object({
  group: z.int().describe("Echoed back from the request"),
  isCompleted: z.boolean().describe("Always false \u2014 no objectives store yet"),
  clearedAt: z.string().describe("When the group was cleared \u2014 now, since nothing persists")
});
const BuyItemResponse = z.object({
  BalanceUpdates: z.array(
    z.object({
      UpdateResponse: z.int(),
      Data: z.array(JsonObject).describe("The gift-drop(s) granted")
    })
  ),
  Balance: z.int().describe("The change applied (negated price), not the new total"),
  CurrencyType: z.int(),
  BalanceType: z.int().describe("-2 = account-wide")
});
const ItemPurchaseMethodId = z.object({
  Type: z.int().describe("0 = NumberId. Anything else names a guid-keyed item we can\u2019t sell"),
  NumberId: z.int().nullable().optional().describe("The storefront PurchasableItemId"),
  Guid: z.string().nullable().optional().describe("The guid-keyed item id; always null here")
});
const BulkPurchaseResponse = z.object({
  Success: z.boolean().describe("False only when the bag bought nothing at all"),
  Error: z.string().nullable().describe("Why nothing was bought; null on success"),
  error_id: z.string().nullable().describe("Always null \u2014 no error-id catalog here"),
  Value: z.object({
    Balance: z.int().describe("The RESULTING total in the bucket below, NOT buyItem\u2019s change"),
    CurrencyType: z.int(),
    Platform: z.int().describe(
      "The balance bucket \u2014 the client\u2019s `BalanceType` under a [DataMember] rename. -2, account-wide: the reference server said 4 (RecNetPurchased) because it kept a wallet per store; this one keeps a single bucket, and the client SUMS its buckets"
    ),
    BalanceUpdates: z.array(
      z.object({
        UpdateResponse: z.int().describe(
          "This line\u2019s outcome: 0 OK, 1 TooManyRequests, 2 NotEnoughCredit, 3 AlreadyOwned, 4 NoItemAvailable, 5 CouponNotApplicable, 6 RequestedPriceDoesNotMatch, 7 RequestedAmountNotAllowed, 8 PlayerNotEligible, 9 RequestCannotBeRefunded, 10 PlayerNotApproved"
        ),
        Data: z.object({
          GiftPackage: JsonObject.nullable().describe(
            "The box created for this line (20 keys). Null on a line that didn\u2019t sell, and under `BypassGiftPackages` \u2014 the item is granted either way"
          ),
          PurchasableItemId: z.int().nullable().describe("The catalog item this line named"),
          CustomAvatarItem: z.null().describe("The UGC counterpart; never sold here")
        })
      })
    ).describe("One entry per REQUESTED item, in request order \u2014 failures included")
  }).nullable().describe("Null when nothing was bought")
});
const BuyInventionRequest = z.object({
  InventionId: z.int().describe("The invention to buy; missing or non-integer is 400"),
  RequestedPrice: z.int().optional().describe("The price the client rendered; a mismatch is 409. Absent reads as 0")
});
const BuyInventionResponse = z.object({
  BalanceUpdateResponse: z.object({
    Balance: z.int().describe("The resulting balance \u2014 NOT the change, unlike buyItem"),
    BalanceType: z.int().describe("-2 = account-wide"),
    CurrencyType: z.int().describe("2 = RecCenterTokens"),
    BalanceUpdates: z.array(
      z.object({
        UpdateResponse: z.int(),
        Data: JsonObject.describe("The bought invention (`RRInvention`)")
      })
    )
  }),
  InventionResponse: z.object({
    Status: z.int(),
    Invention: JsonObject,
    InventionVersion: JsonObject
  }).describe("The same envelope `POST /api/inventions/v6/save` returns")
});
const BuyInventionV3Response = z.object({
  InventionResponse: z.object({
    Value: z.object({
      Status: z.int().describe("0 on success"),
      Invention: JsonObject.describe("The bought invention as the 28-key `RRInvention`"),
      InventionVersion: z.null().describe("Always null \u2014 a buy mints no version"),
      TagsResponse: z.null().describe("Always null \u2014 a buy takes no tags")
    }).describe("Never null under `Success: true` \u2014 the client dereferences it unguarded"),
    Success: z.boolean(),
    Error: z.string().nullable().describe('Null on success \u2014 not `""`'),
    error_id: z.string().nullable().describe("Always null \u2014 no error-id catalog here")
  }).describe("The same envelope `POST /api/inventions/v9/save` returns"),
  BalanceUpdateResponse: z.object({
    BalanceUpdates: z.array(
      z.object({
        UpdateResponse: z.int(),
        Data: JsonObject.describe("The bought invention, the same `RRInvention` as above")
      })
    ),
    Balance: z.int().describe("The resulting balance \u2014 NOT the change, unlike buyItem"),
    CurrencyType: z.int().describe("2 = RecCenterTokens"),
    Platform: z.int().describe(
      "The balance bucket \u2014 the client\u2019s `BalanceType` under a [DataMember] rename. -2, account-wide: the capture said 0 (SteamPurchased) because the reference server kept a wallet per platform; this one keeps a single bucket, and the client SUMS them"
    )
  })
});
const UgcPurchasableBulkRequest = z.object({
  RoomId: z.number().int().describe("Echoed back on each item; not otherwise used"),
  Ids: z.array(
    z.object({
      itemType: z.number().int().describe("3 = custom avatar item (the only type served)"),
      itemId: z.string().describe("The `CustomAvatarItemId`")
    })
  )
});
const UgcPurchasableItemDto = z.object({
  ItemType: z.number().int(),
  ItemId: z.string(),
  Name: z.string(),
  Description: z.string(),
  ImageName: z.string(),
  RoomId: z.number().int(),
  Price: z.number().int(),
  PurchaseCurrencyId: z.string().nullable(),
  CreatedAt: z.string(),
  ModifiedAt: z.string()
});
const UgcPurchasableItemList = z.array(UgcPurchasableItemDto);
const ItemPurchaseInfosRequest = z.object({
  Ids: z.array(
    z.object({
      itemType: z.number().int().describe("3 = custom avatar item (the only type served)"),
      itemId: z.string().describe("The `CustomAvatarItemId`")
    })
  )
});
const ItemPriceDto = z.object({
  CurrencyType: z.number().int().describe("2 = RecCenterTokens \u2014 what UGC items are priced in"),
  Price: z.number().int(),
  StorefrontSaleData: z.object({
    SalePercent: z.number().int(),
    SaleStartDate: z.string().nullable(),
    SaleEndDate: z.string().nullable()
  }).nullable().describe("Always a zero-percent sale here; nothing discounts UGC items yet")
});
const ItemPurchaseInfoDto = z.object({
  ItemId: z.object({ itemType: z.number().int(), itemId: z.string() }),
  PurchaseMethodId: z.object({
    Type: z.number().int(),
    NumberId: z.number().int().nullable(),
    Guid: z.string().nullable()
  }),
  Prices: z.array(ItemPriceDto),
  NewUntil: z.string().nullable(),
  AvailableAt: z.string().nullable(),
  AvailableUntil: z.string().nullable(),
  CanBeGifted: z.boolean(),
  CanApplySubscriberDiscount: z.boolean(),
  SubscribersOnly: z.boolean(),
  IsFeatured: z.boolean()
});
const ItemPurchaseInfoList = z.array(ItemPurchaseInfoDto);
const LockedItemsBulkRequest = z.object({
  AvatarItemDescriptions: z.array(z.string()).describe("The `AvatarItemDesc` of each item the client is about to draw")
});
const ErrorResponse = z.object({ error: z.string() });
const GiftBlock = z.object({
  ToPlayerId: z.int().optional(),
  Anonymous: z.boolean().optional(),
  Message: z.string().optional(),
  GiftContext: z.int().optional()
}).describe("Present when buying for another player; the caller still pays");
const BuyItemRequest = z.object({
  StorefrontType: z.int().describe("Which storefront catalog (sf{N}.json)"),
  PurchasableItemId: z.int(),
  CurrencyType: z.int().describe("Must be a spendable account currency"),
  RequestedPrice: z.int().describe("The price the client rendered; a mismatch is 409"),
  Gift: GiftBlock.optional()
});
const BulkPurchaseRequest = z.object({
  PurchaseItemRequests: z.array(
    z.object({
      ItemPurchaseMethodId,
      RequestedPrice: z.int().describe("The UNIT price the client rendered; a mismatch fails the line"),
      Gift: GiftBlock.nullable().optional(),
      CouponConsumablePlayerMappingId: z.int().nullable().optional().describe("Unsupported \u2014 nothing issues coupons, so a non-null one fails the line"),
      DuplicateItemCount: z.int().optional().describe("Copies of this item; defaults to 1")
    })
  ).describe("One line per item in the bag; at most Econ.BulkPurchaseCap (200) copies in total"),
  StorefrontType: z.int().describe("Which storefront catalog (sf{N}.json) every line comes from"),
  CurrencyType: z.int().describe("Must be a spendable account currency"),
  BypassGiftPackages: z.boolean().optional().describe("Grant the items without wrapping them in gift boxes"),
  AllowPartialSuccess: z.boolean().optional().describe("Buy the lines that work and report the rest; false is all-or-nothing"),
  ShoppingBagId: z.union([z.string(), z.int()]).nullable().optional().describe("The client\u2019s bag id, echoed back untouched")
});
const ConsumeConsumableRequest = z.object({
  Id: z.int().describe("The consumable row id to spend from"),
  DeltaCount: z.int().optional().describe("How many to spend; defaults to 1")
});
const ConsumeGiftRequest = z.object({
  Id: z.string().describe("The gift-box id to open"),
  UnlockedLevel: z.string().optional().describe("Consumable-level hint; unused")
});
const ChallengeProgressRequest = z.object({
  ChallengeMapId: z.union([z.string(), z.int()]).optional(),
  ChallengeId: z.union([z.string(), z.int()]).optional(),
  Config: z.string().optional().describe(
    "The client-evaluated rule tree, with its running count in `cc`; stored as the player\u2019s progress"
  ),
  Complete: z.union([z.string(), z.boolean()]).optional().describe('The client\u2019s verdict \u2014 sent as .NET\u2019s `"True"`/`"False"`')
});
const GameRewardRequest = z.object({
  rewardType: z.string().describe("The reward being asked for, e.g. `FirstActivityOfDay`, `PostGameActivity`"),
  Message: z.string().optional().describe("The message to show for the reward"),
  giftContext: z.string().optional().describe(
    "The activity it came from, e.g. `Soccer` \u2014 part of the cooldown key. A key of `quest-rewards.json` (`Dodgeball`, `Quest_Goblin_S`, \u2026) also picks the prize from that activity\u2019s table"
  )
});
const UpdateObjectiveRequest = z.object({
  Index: z.int().describe("Which objective within the group"),
  Group: z.int().describe("Which objective group"),
  Progress: z.int().optional(),
  VisualProgress: z.int().optional().describe("What the client animates towards"),
  IsCompleted: z.boolean().optional(),
  HasClaimedReward: z.boolean().optional()
});
const SaveOutfitRequest = z.object({ Slot: z.int().describe("Which slot to overwrite; a non-integer is 400") }).catchall(z.unknown()).describe("Plus opaque outfit fields (OutfitSelectionsV2, FaceFeatures, \u2026) stored verbatim");
const SaveOutfitV4Response = z.object({
  Success: z.boolean(),
  Slot: z.int().describe("The slot that was written")
});
const EquipmentUpdateRequest = z.array(
  z.object({
    ModificationGuid: z.string().describe("Identifies the owned equipment row"),
    Favorited: z.boolean()
  }).catchall(z.unknown()).describe("Plus the echoed-back PrefabName / FriendlyName / Tooltip / Rarity, all ignored")
);
const OpaqueJsonBody = JsonObject.describe("Stored verbatim and echoed back");
export {
  AUTHED,
  AvatarItemV4Dto,
  AvatarV2Dto,
  BalanceEntry,
  BulkPurchaseRequest,
  BulkPurchaseResponse,
  BuyInventionRequest,
  BuyInventionResponse,
  BuyInventionV3Response,
  BuyItemRequest,
  BuyItemResponse,
  ChallengeProgressRequest,
  ChallengeProgressResponse,
  ChecklistCompleteResponse,
  ChecklistEntry,
  CompleteChecklistRequest,
  ConsumeConsumableRequest,
  ConsumeEnvelope,
  ConsumeGiftRequest,
  CustomAvatarItemsResponse,
  EquipmentUpdateRequest,
  ErrorResponse,
  GameRewardRequest,
  GiftBlock,
  InfluencerIdsResponse,
  InfluencerTierResponse,
  ItemPriceDto,
  ItemPurchaseInfoDto,
  ItemPurchaseInfoList,
  ItemPurchaseInfosRequest,
  ItemPurchaseMethodId,
  JsonArray,
  JsonObject,
  LockedItemsBulkRequest,
  MakerAiFreeTrialEligibilityResponse,
  OPTIONAL_AUTHED,
  OpaqueJsonBody,
  RRPlusSignUpBonus,
  ReferralProgressResponse,
  RoomEconConfig,
  SaveOutfitRequest,
  SaveOutfitV4Response,
  SubscriptionDto,
  SubscriptionResponse,
  UNAUTHORIZED_RESPONSE,
  UgcPurchasableBulkRequest,
  UgcPurchasableItemDto,
  UgcPurchasableItemList,
  UpdateObjectiveRequest,
  UpdateObjectiveResponse,
  form,
  json,
  jsonBody
};
