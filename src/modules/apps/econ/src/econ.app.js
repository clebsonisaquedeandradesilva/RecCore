// Ported from apps/econ/src/econ.app.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../runtime/router.js";
import { describeRoute, openAPIRouteHandler } from "../../../../runtime/openapi.js";
import { useWorkersLogger } from "../../../../runtime/logger.js";
import {
  addXp,
  consumeGift,
  createGift,
  getAccount,
  getGift,
  getOutfits,
  getPendingGifts,
  grantInvention,
  levelReward,
  levelsReached,
  ownsInvention,
  setOutfit
} from "../../../packages/domain/src/index.js";
import { intVar, logger, withCleanSpec, withNotFound, withOnError } from "../../../packages/hono-helpers/src/index.js";
import { validateAndGetAccountId, validateAndGetPlus, validateAndGetVersion } from "../../../packages/jwt/src/index.js";
import {
  getCustomAvatarItems,
  toUgcPurchasable,
  UGC_ITEM_TYPE_CUSTOM_AVATAR_ITEM
} from "../../api/src/custom-avatar-items-db.js";
import { getInventionById, toInventionV9, toSaveResult } from "../../api/src/inventions-db.js";
import { censorSwears } from "../../api/src/sanitize.js";
import { BalanceAddType } from "../../notify/src/notification-payloads.js";
import { NotificationType } from "../../notify/src/notification-types.js";
import adCarouselItems from "../static/ad-carousel-items.json.js";
import avatarItemCatalog from "../static/db/avatar-items.json.js";
import defaultAvatarItems from "../static/default-avatar-items.json.js";
import defaultAvatar from "../static/default-avatar.json.js";
import defaultBaseAvatarItems from "../static/default-base-avatar-items.json.js";
import myProgress from "../static/my-progress.json.js";
import questRewards from "../static/quest-rewards.json.js";
import { getAvatar, setAvatar } from "./avatar-db.js";
import {
  ALL_PLATFORMS,
  creditCurrency,
  CurrencyType,
  DEFAULT_STARTING_TOKENS,
  ensureStartingBalances,
  getBalance,
  isSpendable,
  spendCurrency
} from "./balance-db.js";
import { getCatalogItem } from "./catalog-db.js";
import {
  CATALOG_ID_BASE,
  CatalogKind,
  isSellableRarity,
  LEGACY_CLIENT_BUILD,
  priceForRarity,
  subscriberPriceFor
} from "./catalog-load.js";
import { claimChallengeGift, getChallengeStatuses, recordChallengeProgress } from "./challenge-db.js";
import { buildRotation, rotationMapId, withWeeklyGift } from "./challenge-rotation.js";
import {
  consumeConsumable,
  countConsumable,
  getConsumables,
  grantConsumable
} from "./consumables-db.js";
import { getEquipment, grantEquipment, setEquipmentFavorited } from "./equipment-db.js";
import { getInventory, grantItem, toAvatarItemV4 } from "./inventory-db.js";
import {
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
  form,
  GameRewardRequest,
  InfluencerIdsResponse,
  InfluencerTierResponse,
  ItemPurchaseInfoList,
  ItemPurchaseInfosRequest,
  json,
  JsonArray,
  jsonBody,
  JsonObject,
  LockedItemsBulkRequest,
  MakerAiFreeTrialEligibilityResponse,
  OpaqueJsonBody,
  OPTIONAL_AUTHED,
  ReferralProgressResponse,
  RoomEconConfig,
  RRPlusSignUpBonus,
  SaveOutfitRequest,
  SaveOutfitV4Response,
  SubscriptionResponse,
  UgcPurchasableBulkRequest,
  UgcPurchasableItemList,
  UNAUTHORIZED_RESPONSE,
  UpdateObjectiveRequest,
  UpdateObjectiveResponse
} from "./openapi.js";
import { claimReward } from "./reward-db.js";
async function authedId(c) {
  return validateAndGetAccountId(c.req.raw, await c.env.JWT_SECRET.get());
}
async function authedBuild(c) {
  const version = await validateAndGetVersion(c.req.raw, await c.env.JWT_SECRET.get());
  if (version === null) return null;
  const build = Number.parseInt(version.split(".")[0] ?? "", 10);
  return Number.isInteger(build) ? build : null;
}
function unauthorized(c) {
  return c.body(null, 401);
}
function parseBool(value) {
  return typeof value === "boolean" ? value : String(value).toLowerCase() === "true";
}
async function persistPostedOutfit(c) {
  const id = await authedId(c);
  if (id === null) return unauthorized(c);
  const body = await c.req.json().catch(() => null);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return c.body(null, 400);
  }
  if (!Number.isInteger(body.Slot)) return c.body(null, 400);
  const outfit = body;
  await setOutfit(c.env.DB, id, outfit);
  return outfit;
}
const HUB_INSTANCE = "global";
async function pushConsumableRemoved(c, accountId, consumed) {
  try {
    await c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE).notifyPlayer(
      accountId,
      NotificationType.ConsumableMappingRemoved,
      {
        Id: consumed.id,
        ConsumableItemDesc: consumed.consumableItemDesc,
        CreatedAt: consumed.createdAt,
        Count: consumed.remaining,
        InitialCount: consumed.previousCount,
        IsActive: false,
        ActiveDurationMinutes: 0,
        IsTransferable: false
      }
    );
  } catch (err) {
    logger.error("failed to push ConsumableMappingRemoved notification", {
      accountId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
async function pushConsumableAdded(c, accountId, gift) {
  try {
    await c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE).notifyPlayer(
      accountId,
      NotificationType.ConsumableMappingAdded,
      {
        Id: gift.ConsumableMappingId ?? 0,
        ConsumableItemDesc: gift.ConsumableItemDesc,
        CreatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        Count: gift.ConsumableCount,
        InitialCount: gift.ConsumablePreExistingCount ?? 0,
        IsActive: false,
        ActiveDurationMinutes: 0,
        IsTransferable: false
      }
    );
  } catch (err) {
    logger.error("failed to push ConsumableMappingAdded notification", {
      accountId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
async function pushBalanceUpdate(c, accountId, currencyType, balance) {
  const payload = {
    Balance: balance,
    CurrencyType: currencyType,
    Platform: ALL_PLATFORMS
  };
  try {
    await c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE).notifyPlayer(
      accountId,
      NotificationType.StorefrontBalanceUpdate,
      payload
    );
  } catch (err) {
    logger.error("failed to push StorefrontBalanceUpdate notification", {
      accountId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
async function pushBalancePurchase(c, accountId, currencyType, delta, balance) {
  const payload = {
    BalanceAddType: BalanceAddType.CommercePurchase,
    Delta: delta,
    Balance: balance,
    Platform: ALL_PLATFORMS,
    CurrencyType: currencyType
  };
  try {
    await c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE).notifyPlayer(
      accountId,
      NotificationType.StorefrontBalancePurchase,
      payload
    );
  } catch (err) {
    logger.error("failed to push StorefrontBalancePurchase notification", {
      accountId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
const NOT_AN_INFLUENCER = 0;
async function isSubscriber(c) {
  return validateAndGetPlus(c.req.raw, await c.env.JWT_SECRET.get());
}
const SUBSCRIPTION_LEVEL_GOLD = 0;
const SUBSCRIPTION_PERIOD_YEAR = 1;
const SUBSCRIPTION_PLATFORM_ALL = -1;
const STUB_SUBSCRIPTION_ID = 1;
function plusSubscription(accountId) {
  const now = /* @__PURE__ */ new Date();
  const expires = new Date(now);
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);
  return {
    SubscriptionId: STUB_SUBSCRIPTION_ID,
    RecNetPlayerId: accountId,
    PlatformType: SUBSCRIPTION_PLATFORM_ALL,
    PlatformId: "",
    PlatformPurchaseId: "",
    Level: SUBSCRIPTION_LEVEL_GOLD,
    Period: SUBSCRIPTION_PERIOD_YEAR,
    ExpirationDate: expires.toISOString(),
    IsAutoRenewing: true,
    CreatedAt: now.toISOString(),
    ModifiedAt: now.toISOString()
  };
}
function toAvatarV2Dto(avatar) {
  return {
    OutfitSelections: avatar.OutfitSelections,
    FaceFeatures: avatar.FaceFeatures,
    SkinColor: avatar.SkinColor,
    HairColor: avatar.HairColor
  };
}
const SUBSCRIBER_DISCOUNT_PERCENT = 10;
function subscriberFloor(regular) {
  return Math.floor(regular * (100 - SUBSCRIBER_DISCOUNT_PERCENT) / 100);
}
function priceCheck(item, currencyType, subscriber, requestedPrice) {
  const regular = item.Prices.find((p) => p.CurrencyType === currencyType);
  if (regular === void 0) return "no-currency";
  if (!Number.isInteger(requestedPrice)) return "mismatch";
  const requested = requestedPrice;
  if (requested === regular.Price) return { charge: requested };
  if (!subscriber) return "mismatch";
  const listed = item.SubscriberPrices?.find((p) => p.CurrencyType === currencyType);
  const floor = Math.min(subscriberFloor(regular.Price), listed?.Price ?? regular.Price);
  return requested >= floor && requested < regular.Price ? { charge: requested } : "mismatch";
}
const STOREFRONT_ALIASES = {
  // Empty. 1704 was here for a while, standing in for a 2025 gift-drop storefront nobody had
  // captured; the items it was meant to sell turned out to belong in the general store, so
  // they are in `sf3-2025.json` and served as storefront 3 — see {@link STOREFRONT_BY_BUILD}.
  // That is a per-BUILD variant of one storefront rather than an alias between two ids, which
  // is why nothing is listed here.
};
const STOREFRONT_BY_BUILD = {
  "3": "sf3-2025"
};
function storefrontAssetPath(id, build) {
  const aliased = STOREFRONT_ALIASES[id] ?? id;
  const variant = STOREFRONT_BY_BUILD[aliased];
  if (variant !== void 0 && build !== null && build > LEGACY_CLIENT_BUILD) {
    return `/${variant}.json`;
  }
  return `/sf${aliased}.json`;
}
async function loadStorefront(c, storefrontType) {
  const build = await authedBuild(c);
  const res = await c.env.ASSETS.fetch(
    new URL(storefrontAssetPath(String(storefrontType), build), c.req.url)
  );
  if (!res.ok) return null;
  return await res.json();
}
async function findStoreItem(c, storefrontType, purchasableItemId) {
  const storefront = await loadStorefront(c, storefrontType);
  if (storefront === null) return null;
  return storefront.StoreItems.find((it) => it.PurchasableItemId === purchasableItemId) ?? null;
}
const PURCHASE_METHOD_TYPE_GUID = 1;
function toItemPurchaseInfo(item) {
  return {
    ItemId: { itemType: UGC_ITEM_TYPE_CUSTOM_AVATAR_ITEM, itemId: item.CustomAvatarItemId },
    PurchaseMethodId: {
      Type: PURCHASE_METHOD_TYPE_GUID,
      NumberId: null,
      Guid: item.CustomAvatarItemId
    },
    Prices: [
      {
        CurrencyType: CurrencyType.RecCenterTokens,
        Price: item.Price,
        StorefrontSaleData: { SalePercent: 0, SaleStartDate: null, SaleEndDate: null }
      }
    ],
    NewUntil: null,
    AvailableAt: item.CreatedAt,
    AvailableUntil: null,
    CanBeGifted: true,
    CanApplySubscriberDiscount: false,
    SubscribersOnly: false,
    IsFeatured: item.IsFeatured
  };
}
function toAvatarItem(giftDrop) {
  return {
    AvatarItemType: giftDrop.AvatarItemType,
    AvatarItemDesc: giftDrop.AvatarItemDesc,
    PlatformMask: -1,
    FriendlyName: giftDrop.FriendlyName,
    Tooltip: giftDrop.Tooltip ?? "",
    Rarity: giftDrop.Rarity
  };
}
function toEquipment(giftDrop) {
  return {
    ModificationGuid: giftDrop.EquipmentModificationGuid,
    PrefabName: giftDrop.EquipmentPrefabName,
    FriendlyName: giftDrop.FriendlyName,
    Tooltip: giftDrop.Tooltip ?? "",
    Rarity: giftDrop.Rarity,
    PlatformMask: -1,
    Favorited: false
  };
}
const CONSUMABLE_GRANT_COUNT = 1;
const COACH_ACCOUNT_ID = 1;
const DEFAULT_GIFT_MESSAGE = "A gift for you <3";
const MAX_GIFT_MESSAGE_LENGTH = 150;
function giftMessage(gift) {
  if (typeof gift?.Message !== "string") return DEFAULT_GIFT_MESSAGE;
  return censorSwears(truncateGiftMessage(gift.Message));
}
function truncateGiftMessage(message) {
  if (message.length <= MAX_GIFT_MESSAGE_LENGTH) return message;
  const cut = message.slice(0, MAX_GIFT_MESSAGE_LENGTH);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 55296 && last <= 56319 ? cut.slice(0, -1) : cut;
}
function toGiftContent(giftDrop, message, consumableCount, consumableMappingId = 0, consumablePreExistingCount = 0, fromPlayerId = COACH_ACCOUNT_ID, giftContext = null) {
  return {
    FromPlayerId: fromPlayerId,
    GiftContext: giftContext ?? giftDrop.Context,
    ConsumableItemDesc: giftDrop.ConsumableItemDesc,
    ConsumableCount: consumableCount,
    ConsumableMappingId: consumableMappingId,
    ConsumablePreExistingCount: consumablePreExistingCount,
    AvatarItemDesc: giftDrop.AvatarItemDesc,
    AvatarItemType: giftDrop.AvatarItemType,
    CurrencyType: giftDrop.CurrencyType,
    Currency: giftDrop.Currency,
    Xp: giftDrop.Xp ?? 0,
    PackageType: 0,
    Message: message,
    EquipmentPrefabName: giftDrop.EquipmentPrefabName,
    EquipmentModificationGuid: giftDrop.EquipmentModificationGuid,
    GiftRarity: giftDrop.Rarity,
    Platform: -1,
    PlatformsToSpawnOn: -1,
    BalanceType: null
  };
}
async function pushGiftReceived(c, accountId, gift, message, fromPlayerId, giftContext = null) {
  try {
    await c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE).notifyPlayer(
      accountId,
      NotificationType.GiftPackageReceivedImmediate,
      {
        Id: gift.id,
        FromGiftDropId: 0,
        FromPlayerId: fromPlayerId,
        ConsumableItemDesc: gift.drop.ConsumableItemDesc,
        AvatarItemDesc: gift.drop.AvatarItemDesc,
        AvatarItemType: gift.drop.AvatarItemType ?? 0,
        EquipmentPrefabName: gift.drop.EquipmentPrefabName,
        EquipmentModificationGuid: gift.drop.EquipmentModificationGuid,
        CurrencyType: gift.drop.CurrencyType,
        Currency: gift.drop.Currency,
        Xp: gift.drop.Xp ?? 0,
        Level: 0,
        Platform: -1,
        PlatformsToSpawnOn: -1,
        BalanceType: ALL_PLATFORMS,
        GiftContext: giftContext ?? gift.drop.Context,
        GiftRarity: gift.drop.Rarity,
        Message: message
      }
    );
  } catch (err) {
    logger.error("failed to push GiftPackageReceivedImmediate notification", {
      accountId,
      giftId: gift.id,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
async function pushProgressionUpdate(c, accountId, progression) {
  try {
    await c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE).notifyPlayer(
      accountId,
      NotificationType.PlayerProgressionLevelUpdate,
      { PlayerId: progression.PlayerId, Level: progression.Level, XP: progression.XP }
    );
  } catch (err) {
    logger.error("failed to push PlayerProgressionLevelUpdate notification", {
      accountId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
const ROLL_STOREFRONT_TYPE = 3;
async function loadRollCatalog(c) {
  const storefront = await loadStorefront(c, ROLL_STOREFRONT_TYPE);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM catalog WHERE kind = ?1 AND catalog_id IS NOT NULL`
  ).bind(CatalogKind.Skin).all();
  return [...storefront?.StoreItems ?? [], ...results.map(toSkinStoreItem)];
}
function toSkinStoreItem(row) {
  return {
    GiftDrop: {
      FriendlyName: row.friendly_name,
      Tooltip: row.tooltip ?? "",
      ConsumableItemDesc: "",
      AvatarItemDesc: "",
      AvatarItemType: 0,
      EquipmentPrefabName: row.prefab_name ?? "",
      EquipmentModificationGuid: row.item_key,
      Rarity: row.rarity,
      Context: 0,
      Currency: 0,
      CurrencyType: 0
    },
    Prices: [],
    PurchasableItemId: row.catalog_id
  };
}
const WEEKLY_GIFT_EXCLUDED_PREFABS = ["[Sandbox_"];
function toEquipmentGiftPool(catalog) {
  return catalog.filter(
    (item) => item.GiftDrop.EquipmentModificationGuid !== "" && !WEEKLY_GIFT_EXCLUDED_PREFABS.some(
      (prefix) => item.GiftDrop.EquipmentPrefabName.startsWith(prefix)
    )
  ).map((item) => ({
    GiftDropId: item.PurchasableItemId,
    EquipmentPrefabName: item.GiftDrop.EquipmentPrefabName,
    EquipmentModificationGuid: item.GiftDrop.EquipmentModificationGuid,
    Rarity: item.GiftDrop.Rarity,
    // Carried so the rotation can theme the week on the item it rolled; the grant path
    // resolves the same name from this entry when it hands the item over.
    FriendlyName: item.GiftDrop.FriendlyName
  }));
}
let cachedGiftPool = null;
async function loadEquipmentGiftPool(c) {
  if (cachedGiftPool !== null) return cachedGiftPool;
  const pool = toEquipmentGiftPool(await loadRollCatalog(c));
  if (pool.length > 0) cachedGiftPool = pool;
  return pool;
}
async function ownsGiftDrop(db, accountId, giftDrop) {
  if (typeof giftDrop.AvatarItemDesc === "string" && giftDrop.AvatarItemDesc !== "") {
    const owned = await getInventory(db, accountId);
    return owned.some((item) => item.AvatarItemDesc === giftDrop.AvatarItemDesc);
  }
  if (typeof giftDrop.EquipmentModificationGuid === "string" && giftDrop.EquipmentModificationGuid !== "") {
    const owned = await getEquipment(db, accountId);
    return owned.some((eq) => eq.ModificationGuid === giftDrop.EquipmentModificationGuid);
  }
  return true;
}
async function rollQueryDrop(c, accountId, rarity, options = {}) {
  const [catalog, ownedItems, ownedEquipment] = await Promise.all([
    options.rollCatalog ?? loadRollCatalog(c),
    getInventory(c.env.DB, accountId),
    options.avatarItemsOnly === true ? [] : getEquipment(c.env.DB, accountId)
  ]);
  const haveItem = new Set(ownedItems.map((item) => item.AvatarItemDesc));
  const haveEquipment = new Set(ownedEquipment.map((eq) => eq.ModificationGuid));
  const pool = catalog.filter(({ GiftDrop: drop }) => {
    if (drop.IsQuery === true || drop.Rarity !== rarity) return false;
    if (typeof drop.AvatarItemDesc === "string" && drop.AvatarItemDesc !== "") {
      return !haveItem.has(drop.AvatarItemDesc);
    }
    if (options.avatarItemsOnly === true) return false;
    if (typeof drop.EquipmentModificationGuid === "string" && drop.EquipmentModificationGuid !== "") {
      return !haveEquipment.has(drop.EquipmentModificationGuid);
    }
    return false;
  });
  const rolled = pool[Math.floor(Math.random() * pool.length)];
  return rolled?.GiftDrop ?? null;
}
function rollConsumableDrop(catalog) {
  const pool = catalog.filter(
    ({ GiftDrop: drop }) => drop.IsQuery !== true && typeof drop.ConsumableItemDesc === "string" && drop.ConsumableItemDesc !== ""
  );
  return pool[Math.floor(Math.random() * pool.length)]?.GiftDrop ?? null;
}
async function grantGiftDrop(c, accountId, drop, message, options = {}) {
  let giftDrop = drop;
  if (drop.IsQuery === true) {
    const rarity = drop.QueryRedirectRarity ?? drop.Rarity;
    const rolled = await rollQueryDrop(c, accountId, rarity, options);
    if (rolled === null) {
      logger.warn("query gift-drop rolled nothing", {
        accountId,
        rarity,
        friendlyName: drop.FriendlyName
      });
    } else {
      giftDrop = rolled;
    }
  }
  const db = c.env.DB;
  if (typeof giftDrop.AvatarItemDesc === "string" && giftDrop.AvatarItemDesc !== "") {
    await grantItem(db, accountId, toAvatarItem(giftDrop));
  }
  if (typeof giftDrop.EquipmentModificationGuid === "string" && giftDrop.EquipmentModificationGuid !== "") {
    await grantEquipment(db, accountId, toEquipment(giftDrop));
  }
  const isConsumable = typeof giftDrop.ConsumableItemDesc === "string" && giftDrop.ConsumableItemDesc !== "";
  const consumableCount = isConsumable ? CONSUMABLE_GRANT_COUNT * (options.copies ?? 1) : 0;
  let consumableMappingId = 0;
  let consumablePreExisting = 0;
  if (isConsumable) {
    consumablePreExisting = await countConsumable(db, accountId, giftDrop.ConsumableItemDesc);
    consumableMappingId = await grantConsumable(
      db,
      accountId,
      giftDrop.ConsumableItemDesc,
      consumableCount
    );
  }
  if (options.skipGiftBox === true) return { id: 0, drop: giftDrop };
  const { id } = await createGift(
    db,
    accountId,
    toGiftContent(
      giftDrop,
      message,
      consumableCount,
      consumableMappingId,
      consumablePreExisting,
      options.fromPlayerId,
      options.giftContext
    )
  );
  return { id, drop: giftDrop };
}
function toBalanceUpdateData(granted, fromPlayerId, message, giftContext) {
  const drop = granted.drop;
  return {
    Id: granted.id,
    FromPlayerId: fromPlayerId,
    ConsumableItemDesc: drop.ConsumableItemDesc,
    AvatarItemDesc: drop.AvatarItemDesc,
    AvatarItemType: drop.AvatarItemType ?? 0,
    EquipmentPrefabName: drop.EquipmentPrefabName,
    EquipmentModificationGuid: drop.EquipmentModificationGuid,
    CurrencyType: drop.CurrencyType,
    Currency: drop.Currency,
    Xp: drop.Xp ?? 0,
    Level: 0,
    Platform: -1,
    PlatformsToSpawnOn: -1,
    BalanceType: ALL_PLATFORMS,
    GiftContext: giftContext ?? drop.Context,
    GiftRarity: drop.Rarity,
    Message: message
  };
}
const BULK_PURCHASE_CAP = 200;
const UpdateResponse = {
  OK: 0,
  TooManyRequests: 1,
  NotEnoughCredit: 2,
  AlreadyOwned: 3,
  NoItemAvailable: 4,
  CouponNotApplicable: 5,
  RequestedPriceDoesNotMatch: 6,
  RequestedAmountNotAllowed: 7,
  PlayerNotEligible: 8,
  RequestCannotBeRefunded: 9,
  PlayerNotApproved: 10
};
const PURCHASE_METHOD_NUMBER_ID = 0;
function toGiftPackage(granted, playerId, fromPlayerId, message, giftContext) {
  const drop = granted.drop;
  return {
    Id: granted.id,
    PlayerId: playerId,
    FromPlayerId: fromPlayerId,
    ConsumableItemDesc: drop.ConsumableItemDesc,
    AvatarItemType: drop.AvatarItemType ?? 0,
    AvatarItemDesc: drop.AvatarItemDesc,
    CustomAvatarItemId: null,
    EquipmentPrefabName: drop.EquipmentPrefabName,
    EquipmentModificationGuid: drop.EquipmentModificationGuid,
    CurrencyType: drop.CurrencyType,
    Currency: drop.Currency,
    Xp: drop.Xp ?? 0,
    GiftContext: giftContext ?? drop.Context,
    GiftRarity: drop.Rarity,
    Message: message,
    Signature: null,
    IsSignatureValid: false,
    Platform: -1,
    PlatformsToSpawnOn: -1,
    BalanceType: ALL_PLATFORMS
  };
}
function toPurchaseMethodId(raw) {
  const id = typeof raw === "object" && raw !== null ? raw : {};
  return {
    Type: Number.isInteger(id.Type) ? id.Type : PURCHASE_METHOD_NUMBER_ID,
    NumberId: Number.isInteger(id.NumberId) ? id.NumberId : null,
    Guid: typeof id.Guid === "string" ? id.Guid : null
  };
}
async function catalogStoreItems(db, catalogIds) {
  if (catalogIds.length === 0) return [];
  const placeholders = catalogIds.map((_, i) => `?${i + 1}`).join(", ");
  const { results } = await db.prepare(`SELECT * FROM catalog WHERE catalog_id IN (${placeholders})`).bind(...catalogIds).all();
  return results.filter(
    (row) => row.catalog_id !== null && row.kind === CatalogKind.AvatarItem && isSellableRarity(row.rarity)
  ).map((row) => {
    const price = priceForRarity(row.rarity);
    return {
      GiftDrop: {
        FriendlyName: row.friendly_name,
        // The client's field is a string; the catalog keeps NULL and "" apart.
        Tooltip: row.tooltip ?? "",
        ConsumableItemDesc: "",
        // `item_key` IS the `AvatarItemDesc` for an avatar item — that is what makes it the
        // key. The equipment fields stay empty: only avatar items reach here.
        AvatarItemDesc: row.item_key,
        AvatarItemType: row.avatar_item_type ?? 0,
        EquipmentPrefabName: "",
        EquipmentModificationGuid: "",
        Rarity: row.rarity,
        Context: 0,
        Currency: 0,
        CurrencyType: 0
      },
      Prices: [{ CurrencyType: CurrencyType.RecCenterTokens, Price: price }],
      SubscriberPrices: [
        { CurrencyType: CurrencyType.RecCenterTokens, Price: subscriberPriceFor(price) }
      ],
      PurchasableItemId: row.catalog_id
    };
  });
}
function resolveBulkLine(line, storefront, currencyType, subscriber) {
  const method = toPurchaseMethodId(line.ItemPurchaseMethodId);
  if (method.Type !== PURCHASE_METHOD_NUMBER_ID || method.NumberId === null) {
    return {
      method,
      code: UpdateResponse.NoItemAvailable,
      error: "Only numeric storefront item ids can be bought"
    };
  }
  if (line.CouponConsumablePlayerMappingId !== null && line.CouponConsumablePlayerMappingId !== void 0) {
    return {
      method,
      code: UpdateResponse.CouponNotApplicable,
      error: "Coupons are not supported"
    };
  }
  const count = line.DuplicateItemCount ?? 1;
  if (!Number.isInteger(count) || count < 1) {
    return {
      method,
      code: UpdateResponse.RequestedAmountNotAllowed,
      error: "DuplicateItemCount must be a positive integer"
    };
  }
  if (storefront === null) {
    return { method, code: UpdateResponse.NoItemAvailable, error: "No such storefront" };
  }
  const item = storefront.StoreItems.find((it) => it.PurchasableItemId === method.NumberId);
  if (item === void 0) {
    return { method, code: UpdateResponse.NoItemAvailable, error: "Item not found" };
  }
  if (count > 1 && item.GiftDrop.ConsumableItemDesc === "") {
    return {
      method,
      code: UpdateResponse.RequestedAmountNotAllowed,
      error: "This item can only be bought once per line"
    };
  }
  const checked = priceCheck(item, currencyType, subscriber, line.RequestedPrice);
  if (checked === "no-currency") {
    return {
      method,
      code: UpdateResponse.NoItemAvailable,
      error: "Currency type not available for this item"
    };
  }
  if (checked === "mismatch") {
    return {
      method,
      code: UpdateResponse.RequestedPriceDoesNotMatch,
      error: !Number.isInteger(line.RequestedPrice) ? "RequestedPrice is required" : "Price has changed"
    };
  }
  const gift = typeof line.Gift === "object" && line.Gift !== null ? line.Gift : null;
  return { method, item, price: checked.charge, count, gift };
}
function isBulkLine(resolved) {
  return "item" in resolved;
}
const GAME_REWARD_XP = 5;
const GIFT_CONTEXT_GAME_REWARDS = 50;
const DEFAULT_GAME_REWARD_MESSAGE = "Reward earned!";
function toGameRewardDrop() {
  return {
    FriendlyName: "",
    Tooltip: "",
    ConsumableItemDesc: "",
    AvatarItemDesc: "",
    AvatarItemType: null,
    EquipmentPrefabName: "",
    EquipmentModificationGuid: "",
    Rarity: 0,
    Context: GIFT_CONTEXT_GAME_REWARDS,
    Currency: 0,
    CurrencyType: 0,
    Xp: GAME_REWARD_XP
  };
}
const QUEST_REWARDS = questRewards;
async function pickQuestReward(db, accountId, giftContext) {
  if (!Object.hasOwn(QUEST_REWARDS, giftContext)) return null;
  const rows = QUEST_REWARDS[giftContext] ?? [];
  if (rows.length === 0) return null;
  const ownedItems = new Set((await getInventory(db, accountId)).map((i) => i.AvatarItemDesc));
  const ownedGuids = new Set((await getEquipment(db, accountId)).map((e) => e.ModificationGuid));
  const pool = rows.filter(
    (r) => !(r.AvatarItemDesc !== "" && ownedItems.has(r.AvatarItemDesc)) && !(r.EquipmentModificationGuid !== "" && ownedGuids.has(r.EquipmentModificationGuid))
  );
  if (pool.length === 0) {
    logger.info("quest rewards exhausted for player", { accountId, giftContext });
    return null;
  }
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}
function toQuestRewardDrop(reward, catalog) {
  return {
    FriendlyName: catalog?.friendly_name ?? "",
    Tooltip: catalog?.tooltip ?? "",
    ConsumableItemDesc: reward.ConsumableItemDesc,
    AvatarItemDesc: reward.AvatarItemDesc,
    AvatarItemType: catalog?.avatar_item_type ?? null,
    EquipmentPrefabName: reward.EquipmentPrefabName,
    EquipmentModificationGuid: reward.EquipmentModificationGuid,
    Rarity: reward.GiftRarity,
    Context: reward.Context,
    Currency: reward.Currency,
    CurrencyType: reward.CurrencyType,
    Xp: GAME_REWARD_XP
  };
}
function toLevelUpDrop(rarity) {
  return {
    FriendlyName: "",
    Tooltip: "",
    ConsumableItemDesc: "",
    AvatarItemDesc: "",
    AvatarItemType: null,
    EquipmentPrefabName: "",
    EquipmentModificationGuid: "",
    Rarity: rarity,
    Context: GIFT_CONTEXT_GAME_REWARDS,
    Currency: 0,
    CurrencyType: 0,
    IsQuery: true
  };
}
async function grantLevelUpGifts(c, accountId, grant) {
  const levels = levelsReached(grant);
  if (levels.length === 0) return;
  try {
    const rollCatalog = await loadRollCatalog(c);
    for (const level of levels) {
      const reward = levelReward(level);
      if (reward === null) continue;
      const message = `Level ${level}!`;
      const drop = reward.kind === "consumable" ? rollConsumableDrop(rollCatalog) : toLevelUpDrop(reward.rarity);
      if (drop === null) {
        logger.warn("level up reward rolled nothing", { accountId, level, kind: reward.kind });
        continue;
      }
      const granted = await grantGiftDrop(c, accountId, drop, message, {
        avatarItemsOnly: reward.kind === "clothing",
        rollCatalog
      });
      await pushGiftReceived(c, accountId, granted, message, COACH_ACCOUNT_ID);
      logger.info("level up gift granted", {
        accountId,
        level,
        kind: reward.kind,
        rarity: reward.kind === "clothing" ? reward.rarity : null,
        giftId: granted.id,
        avatarItemDesc: granted.drop.AvatarItemDesc,
        consumableItemDesc: granted.drop.ConsumableItemDesc
      });
    }
  } catch (err) {
    logger.error("failed to grant level up gift", {
      accountId,
      levels,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
const CHALLENGE_GIFT_MESSAGE = "Weekly challenge complete!";
const STAR_RARITY = [0, 10, 20, 30, 50];
const DEFAULT_FALLBACK_STARS = 4;
function fallbackGiftRarity(rotation) {
  const stars = Number(/^(\d+)-star/i.exec(rotation.FallbackGiftName)?.[1]);
  return STAR_RARITY[stars - 1] ?? STAR_RARITY[DEFAULT_FALLBACK_STARS - 1] ?? 0;
}
function toChallengeGiftDrop(rotation, catalog) {
  const gift = rotation.Gift;
  const sold = catalog.find(
    ({ GiftDrop: drop }) => gift.EquipmentModificationGuid !== "" && drop.EquipmentModificationGuid === gift.EquipmentModificationGuid || gift.AvatarItemDesc !== "" && drop.AvatarItemDesc === gift.AvatarItemDesc
  )?.GiftDrop;
  return {
    FriendlyName: gift.FriendlyName ?? sold?.FriendlyName ?? rotation.FallbackGiftName,
    Tooltip: gift.Tooltip ?? sold?.Tooltip ?? "",
    ConsumableItemDesc: gift.ConsumableItemDesc,
    AvatarItemDesc: gift.AvatarItemDesc,
    AvatarItemType: gift.AvatarItemType,
    EquipmentPrefabName: gift.EquipmentPrefabName,
    EquipmentModificationGuid: gift.EquipmentModificationGuid,
    // The block's own `GiftRarity` is 0 in the captured rotation even though the item it
    // names sells at rarity 5, so the catalog's rarity wins where there is one.
    Rarity: sold?.Rarity ?? gift.GiftRarity,
    Context: gift.GiftContext,
    Currency: 0,
    CurrencyType: 0
  };
}
function toChallengeFallbackDrop(rotation) {
  return {
    FriendlyName: rotation.FallbackGiftName,
    Tooltip: "",
    ConsumableItemDesc: "",
    AvatarItemDesc: "",
    AvatarItemType: null,
    EquipmentPrefabName: "",
    EquipmentModificationGuid: "",
    Rarity: fallbackGiftRarity(rotation),
    Context: rotation.Gift.GiftContext,
    Currency: 0,
    CurrencyType: 0,
    IsQuery: true
  };
}
const CHALLENGES_REQUIRED_FOR_GIFT = 3;
function challengesRequiredForGift(rotation) {
  const published = rotation.Challenges.length;
  return rotation.CompletedRequired ? published : Math.min(CHALLENGES_REQUIRED_FOR_GIFT, published);
}
async function awardChallengeGift(c, accountId) {
  const rotation = buildRotation(/* @__PURE__ */ new Date());
  try {
    if (rotation.Challenges.length === 0) return;
    const statuses = await getChallengeStatuses(c.env.DB, accountId, rotation.ChallengeMapId);
    const done = rotation.Challenges.filter(
      (ch) => statuses.get(ch.ChallengeId)?.complete === true
    ).length;
    if (done < challengesRequiredForGift(rotation)) return;
    const claimed = await claimChallengeGift(c.env.DB, accountId, rotation.ChallengeMapId);
    if (!claimed) return;
    const catalog = await loadRollCatalog(c);
    const week = withWeeklyGift(rotation, toEquipmentGiftPool(catalog));
    const reward = toChallengeGiftDrop(week, catalog);
    const duplicate = await ownsGiftDrop(c.env.DB, accountId, reward);
    const granted = await grantGiftDrop(
      c,
      accountId,
      duplicate ? toChallengeFallbackDrop(week) : reward,
      CHALLENGE_GIFT_MESSAGE,
      { rollCatalog: catalog }
    );
    await pushGiftReceived(c, accountId, granted, CHALLENGE_GIFT_MESSAGE, COACH_ACCOUNT_ID);
    logger.info("weekly challenge gift granted", {
      accountId,
      challengeMapId: rotation.ChallengeMapId,
      giftId: granted.id,
      fallbackRoll: duplicate,
      challengesComplete: done
    });
  } catch (err) {
    logger.error("failed to grant weekly challenge gift", {
      accountId,
      challengeMapId: rotation.ChallengeMapId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
const DEFAULT_CHECKLIST = [
  { Order: 0, Objective: 38, Count: 1, CreditAmount: 25 },
  // SaveOutfitSlot
  { Order: 1, Objective: 32, Count: 1, CreditAmount: 25 },
  // VisitACustomRoom
  { Order: 2, Objective: 2, Count: 1, CreditAmount: 25 },
  // AddAFriend
  { Order: 3, Objective: 30, Count: 1, CreditAmount: 25 },
  // GoToRecCenter
  { Order: 4, Objective: 6, Count: 1, CreditAmount: 25 }
  // CheerAPlayer
];
const CHECKLIST_REWARD_CONTEXT = 303;
function listRoute(summary, description, auth = false) {
  return describeRoute({
    tags: ["Econ"],
    summary,
    description,
    ...auth ? { security: AUTHED } : {},
    responses: {
      200: json(JsonArray, description),
      ...auth ? { 401: UNAUTHORIZED_RESPONSE } : {}
    }
  });
}
async function settleInventionPurchase(c, id, inventionId, requestedPrice) {
  const invention = await getInventionById(c.env.DB, inventionId);
  if (invention === null) return c.json({ error: "Invention not found" }, 404);
  if (!invention.IsPublished) return c.json({ error: "Invention is not for sale" }, 403);
  if (invention.CreatorPlayerId === id) {
    return c.json({ error: "Cannot buy your own invention" }, 400);
  }
  if (await ownsInvention(c.env.DB, id, inventionId)) {
    return c.json({ error: "Already owned" }, 409);
  }
  if (invention.Price !== requestedPrice) {
    return c.json({ error: "Price has changed" }, 409);
  }
  const startingTokens = intVar(c.env.STARTING_TOKENS, DEFAULT_STARTING_TOKENS);
  const price = invention.Price;
  if (price > 0) {
    const paid = await spendCurrency(
      c.env.DB,
      id,
      CurrencyType.RecCenterTokens,
      price,
      startingTokens
    );
    if (!paid) return c.json({ error: "Insufficient balance" }, 400);
  }
  await grantInvention(c.env.DB, id, inventionId);
  if (price > 0) {
    await ensureStartingBalances(c.env.DB, invention.CreatorPlayerId, startingTokens);
    const creatorBalance = await creditCurrency(
      c.env.DB,
      invention.CreatorPlayerId,
      CurrencyType.RecCenterTokens,
      price,
      startingTokens
    );
    await pushBalanceUpdate(
      c,
      invention.CreatorPlayerId,
      CurrencyType.RecCenterTokens,
      creatorBalance
    );
  }
  const balance = await getBalance(c.env.DB, id, CurrencyType.RecCenterTokens, startingTokens);
  if (price > 0) {
    await pushBalancePurchase(c, id, CurrencyType.RecCenterTokens, -price, balance);
  }
  return { invention, balance };
}
const app = new Hono({ strict: false }).use(
  "*",
  // middleware
  (c, next) => useWorkersLogger(c.env.NAME, {
    environment: c.env.ENVIRONMENT,
    release: c.env.SENTRY_RELEASE
  })(c, next)
).onError(withOnError()).notFound(withNotFound()).post(
  "/api/avatar/v1/lockeditems/bulk",
  describeRoute({
    tags: ["Avatar"],
    summary: "Locked avatar items in bulk",
    description: [
      "Resolves `AvatarItemDescriptions` against the bundled item catalogue and answers the",
      "matching records as a bare array. The match is on the WHOLE `AvatarItemDesc`, so a",
      "colourway is not found by its base asset alone.",
      "An empty or absent list answers the WHOLE catalogue, which is the reference\u2019s own",
      "behaviour rather than a degenerate empty match.",
      "Results come back in CATALOGUE order, not request order \u2014 the filter walks the",
      "catalogue \u2014 so the response must not be read positionally. Unknown descs are simply",
      "absent; a miss is not an error.",
      "Nothing records a LOCK yet, so what comes back is the item records rather than a",
      "genuine locked/unlocked answer."
    ].join(" "),
    requestBody: jsonBody(LockedItemsBulkRequest, "The descs to resolve"),
    responses: { 200: json(JsonArray, "The matching items, in catalogue order") }
  }),
  async (c) => {
    const body = await c.req.json().catch(() => null);
    const requested = Array.isArray(body?.AvatarItemDescriptions) ? body.AvatarItemDescriptions.filter((d) => typeof d === "string") : [];
    if (requested.length === 0) return c.json(avatarItemCatalog);
    const wanted = new Set(requested);
    return c.json(avatarItemCatalog.filter((item) => wanted.has(item.AvatarItemDesc)));
  }
).get(
  "/api/avatar/v1/defaultunlocked",
  listRoute("Default-unlocked avatar items", "The bundled default avatar-item catalog"),
  (c) => c.json(defaultAvatarItems)
).get(
  "/api/avatar/v1/defaultbaseavataritems",
  listRoute("Default base avatar items", "The bundled base items UGC clothing builds on"),
  (c) => c.json(defaultBaseAvatarItems)
).get(
  "/api/avatar/v4/items",
  describeRoute({
    tags: ["Avatar"],
    summary: "The player\u2019s avatar items",
    description: [
      "The items the player has bought (from buyItem, in the inventory table) prepended",
      "to the default catalog. A player who has bought nothing gets just the catalog.",
      "Both sources are projected into the camelCase v4 DTO \u2014 the sibling item endpoints",
      "(`defaultunlocked`, `defaultbaseavataritems`) serve their records raw instead."
    ].join(" "),
    security: AUTHED,
    responses: {
      200: json(AvatarItemV4Dto.array(), "Owned items followed by the default catalog"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const owned = await getInventory(c.env.DB, id);
    return c.json([...owned, ...defaultAvatarItems].map(toAvatarItemV4));
  }
).get(
  "/econ/customAvatarItems/v1/owned",
  describeRoute({
    tags: ["Avatar"],
    summary: "Owned custom avatar items",
    description: [
      "Paginated owned custom items. Empty stub for now. The client requests this when",
      "custom-item creation is allowed; a 404 shows as \u201CFailed to download unlocked",
      "avatar items\u201D."
    ].join(" "),
    security: AUTHED,
    responses: {
      200: json(CustomAvatarItemsResponse, "Paginated results (empty for now)"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json({ Results: [], TotalResults: 0 });
  }
).get(
  "/api/objectives/v1/myprogress",
  describeRoute({
    tags: ["Econ"],
    summary: "Objectives progress",
    description: "Serves the bundled static progress verbatim (no per-player store yet). No auth.",
    responses: { 200: json(JsonObject, "The bundled objectives-progress default") }
  }),
  (c) => c.json(myProgress)
).on(
  ["GET", "POST"],
  "/api/objectives/v1/cleargroup",
  describeRoute({
    tags: ["Econ"],
    summary: "Clear an objectives group (no-op)",
    description: "No per-player progress to clear yet \u2192 []. Accepts GET or POST.",
    responses: { 200: json(JsonArray, "Always empty for now") }
  }),
  (c) => c.json([])
).post(
  "/api/objectives/v1/updateobjective",
  describeRoute({
    tags: ["Econ"],
    summary: "Report objective progress",
    description: [
      "Stubbed: with no objectives store we persist nothing and never complete a group.",
      "Echoes `Group` back as camelCase `group` with `isCompleted: false` so the client",
      "gets a well-formed body."
    ].join(" "),
    requestBody: jsonBody(UpdateObjectiveRequest, "The objective as the client now sees it"),
    responses: { 200: json(UpdateObjectiveResponse, "The echoed group, never completed") }
  }),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return c.json({
      group: Number(body.Group) || 0,
      isCompleted: false,
      clearedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
).get(
  "/api/avatar/v2",
  describeRoute({
    tags: ["Avatar"],
    summary: "The player\u2019s own avatar",
    description: [
      "The avatar JSON blob stored on the account row, or the default outfit when none is",
      "saved (the client NREs on an empty OutfitSelections)."
    ].join(" "),
    security: AUTHED,
    responses: {
      200: json(JsonObject, "The stored avatar blob (or the default)"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json(await getAvatar(c.env.DB, id) ?? defaultAvatar);
  }
).post(
  "/api/avatar/v2/set",
  describeRoute({
    tags: ["Avatar"],
    summary: "Save the player\u2019s avatar",
    description: "Stores the posted JSON blob verbatim on the account row and echoes it back.",
    security: AUTHED,
    requestBody: jsonBody(OpaqueJsonBody, "The avatar blob"),
    responses: {
      200: json(JsonObject, "The saved avatar (echoed back)"),
      400: { description: "Body was not a JSON object (empty body)" },
      401: UNAUTHORIZED_RESPONSE,
      404: { description: "No account row to attach it to (empty body)" }
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const avatar = await c.req.json().catch(() => null);
    if (avatar === null || typeof avatar !== "object" || Array.isArray(avatar)) {
      return c.body(null, 400);
    }
    if (!await setAvatar(c.env.DB, id, avatar)) return c.body(null, 404);
    return c.json(avatar);
  }
).on(
  "GET",
  ["/api/checklist/v1/current", "/api/checklist/v2/current"],
  describeRoute({
    tags: ["Econ"],
    summary: "NUX checklist",
    description: "The new-user checklist, as the default brand-new-account list \u2014 nothing records per-player progress yet, so the same rows come back however much the player has done. `Objective` is an `ObjectiveType` ordinal the client matches its own progress events against. v1 and v2 serve the same list.",
    security: AUTHED,
    responses: {
      200: json(ChecklistEntry.array(), "The checklist rows, in `Order`"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json(DEFAULT_CHECKLIST);
  }
).on(
  "POST",
  ["/api/checklist/v1/complete", "/api/checklist/v2/complete"],
  describeRoute({
    tags: ["Econ"],
    summary: "Complete a checklist row (stub)",
    description: "Marks a NUX checklist row done. Stubbed: nothing records the completion (no objective-progress table) and nothing is granted \u2014 a reward is worth 25 XP and 25 tokens, but making that once-only needs a ledger we do not have, and without one re-posting the same row would mint tokens indefinitely. The response is still the balance-update envelope, with `Balance` (the change) 0. v1 and v2 behave alike.",
    security: AUTHED,
    requestBody: jsonBody(CompleteChecklistRequest, "Which row was completed \u2014 `{ ItemIndex }`"),
    responses: {
      200: json(ChecklistCompleteResponse, "The balance-update envelope, granting nothing"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json({
      BalanceUpdates: [{ UpdateResponse: CHECKLIST_REWARD_CONTEXT, Data: [] }],
      Balance: 0,
      CurrencyType: CurrencyType.RecCenterTokens,
      BalanceType: -2
    });
  }
).get(
  "/api/itemWishlists/v1/wishlist/me",
  listRoute("The player\u2019s item wishlist", "Empty for now", true),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json([]);
  }
).get(
  "/api/itemWishlists/v1/wishlist/:accountId{[0-9]+}",
  describeRoute({
    tags: ["Econ"],
    summary: "Another player\u2019s item wishlist",
    description: [
      "The wishlist of the account named in the path, as a bare array. Empty for now \u2014",
      "nothing on this server stores wishlists, so every player\u2019s is empty, and an empty",
      "list is what the client renders as \u201Cnothing wished for\u201D where a 404 would read as a",
      "failed load."
    ].join(" "),
    security: AUTHED,
    parameters: [
      {
        name: "accountId",
        in: "path",
        required: true,
        description: "The account whose wishlist to read",
        schema: { type: "string", pattern: "^[0-9]+$" }
      }
    ],
    responses: {
      200: json(JsonArray, "That player\u2019s wishlist \u2014 empty for now"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json([]);
  }
).get(
  "/api/avatar/v3/saved",
  describeRoute({
    tags: ["Avatar"],
    summary: "The player\u2019s saved outfits",
    description: "Served back as the client posted them (see /saved/set); [] when none.",
    security: AUTHED,
    responses: {
      200: json(JsonArray, "Saved outfits (empty when none)"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json(await getOutfits(c.env.DB, id));
  }
).post(
  "/api/avatar/v3/saved/set",
  describeRoute({
    tags: ["Avatar"],
    summary: "Save an outfit into a slot",
    description: [
      "Writes the posted outfit into the given `Slot` (overwriting it) and echoes it back.",
      "The payload is stored verbatim \u2014 its inner fields are JSON-in-a-string from the",
      "client\u2019s own serializer. A missing/non-integer `Slot` is a 400 (guessing would",
      "silently overwrite another outfit)."
    ].join(" "),
    security: AUTHED,
    requestBody: jsonBody(SaveOutfitRequest, "The outfit, with a target Slot"),
    responses: {
      200: json(JsonObject, "The saved outfit (echoed back)"),
      400: { description: "Non-object body or missing/non-integer Slot (empty body)" },
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const result = await persistPostedOutfit(c);
    if (result instanceof Response) return result;
    return c.json(result);
  }
).post(
  "/api/avatar/v4/saved/set",
  describeRoute({
    tags: ["Avatar"],
    summary: "Save an outfit into a slot (v4)",
    description: [
      "Writes the posted outfit into the given `Slot` (overwriting it), same as",
      "`POST /api/avatar/v3/saved/set`, but answers a lean `{ Success, Slot }` ack instead",
      "of echoing the outfit. A missing/non-integer `Slot` is a 400."
    ].join(" "),
    security: AUTHED,
    requestBody: jsonBody(SaveOutfitRequest, "The outfit, with a target Slot"),
    responses: {
      200: json(SaveOutfitV4Response, "Save acknowledgement"),
      400: { description: "Non-object body or missing/non-integer Slot (empty body)" },
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const result = await persistPostedOutfit(c);
    if (result instanceof Response) return result;
    return c.json({ Success: true, Slot: result.Slot });
  }
).get(
  "/api/avatar/v2/gifts",
  describeRoute({
    tags: ["Gifts"],
    summary: "Pending gift boxes",
    description: [
      "The player\u2019s unopened gift boxes from their purchases (and, later, from other",
      "players). The item was already granted at purchase, so an unopened box is cosmetic."
    ].join(" "),
    security: AUTHED,
    responses: {
      200: json(JsonArray, "Unopened gift boxes (empty when none)"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json(await getPendingGifts(c.env.DB, id));
  }
).post(
  "/api/avatar/v2/gifts/consume",
  describeRoute({
    tags: ["Gifts"],
    summary: "Open (consume) a gift box",
    description: [
      "Deletes the box (the item was already granted at purchase). Always answers the",
      "`{ error, success, value }` envelope with HTTP 200 \u2014 even with no token, a zero id,",
      "or a box already gone \u2014 because the client parses it to finish opening the box. The",
      "delete is scoped to the caller; opening someone else\u2019s box is 403. Also served by",
      "the `api` worker."
    ].join(" "),
    requestBody: form(ConsumeGiftRequest, "The gift-box id"),
    responses: {
      200: json(ConsumeEnvelope, "Success envelope"),
      403: { description: "The box belongs to another player (empty body)" }
    }
  }),
  async (c) => {
    const id = await authedId(c);
    const body = await c.req.parseBody().catch(() => ({}));
    const giftId = typeof body.Id === "string" ? Number.parseInt(body.Id, 10) || 0 : 0;
    if (id !== null && giftId !== 0) {
      const gift = await consumeGift(c.env.DB, id, giftId);
      if (gift !== null) {
        if (gift.ConsumableItemDesc !== "") await pushConsumableAdded(c, id, gift);
      } else {
        const other = await getGift(c.env.DB, giftId);
        if (other !== null && other.accountId !== id) return c.body(null, 403);
      }
    }
    return c.json({ error: "", success: true, value: null });
  }
).get(
  "/api/avatar/v2/:id",
  describeRoute({
    tags: ["Avatar"],
    summary: "Another player\u2019s avatar (render subset)",
    description: [
      "The public render subset used to draw another player\u2019s avatar. No auth. Falls back",
      "to the default outfit when the player hasn\u2019t saved one."
    ].join(" "),
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "Account id; non-numeric is 400",
        schema: { type: "string" }
      }
    ],
    responses: {
      200: json(AvatarV2Dto, "The render subset"),
      400: { description: "Non-numeric id (empty body)" }
    }
  }),
  async (c) => {
    const accountId = Number.parseInt(c.req.param("id"), 10);
    if (Number.isNaN(accountId)) return c.body(null, 400);
    return c.json(toAvatarV2Dto(await getAvatar(c.env.DB, accountId) ?? defaultAvatar));
  }
).get(
  "/api/equipment/v2/getUnlocked",
  listRoute("Unlocked equipment", "The equipment skins the player has bought", true),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json(await getEquipment(c.env.DB, id));
  }
).on(
  ["PUT", "POST"],
  "/api/equipment/v1/update",
  describeRoute({
    tags: ["Equipment"],
    summary: "Update owned equipment",
    description: [
      "Applies the posted `Favorited` flags to the caller\u2019s owned equipment, matched by",
      "`ModificationGuid`. Everything else in each entry is ignored, and a guid the caller",
      "doesn\u2019t own is silently skipped. Empty body on success. Accepts PUT or POST \u2014 the",
      "client uses both, with the same body."
    ].join(" "),
    security: AUTHED,
    requestBody: jsonBody(EquipmentUpdateRequest, "The entries to update"),
    responses: {
      200: { description: "Applied (empty body)" },
      400: { description: "Body isn\u2019t a JSON array (empty body)" },
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const body = await c.req.json().catch(() => null);
    if (!Array.isArray(body)) return c.body(null, 400);
    const updates = body.filter((e) => typeof e === "object" && e !== null).filter((e) => typeof e.ModificationGuid === "string" && e.ModificationGuid !== "").map((e) => ({
      ModificationGuid: e.ModificationGuid,
      Favorited: e.Favorited === true
    }));
    await setEquipmentFavorited(c.env.DB, id, updates);
    return c.body(null, 200);
  }
).get(
  "/api/roomconsumables/v1/roomConsumable/room/:roomId",
  listRoute("Room consumables", "Empty stub so the client doesn\u2019t 404"),
  (c) => c.json([])
).get(
  "/api/roomconsumables/v1/roomConsumable/room/:roomId/me",
  listRoute("The caller\u2019s room consumables", "Empty stub"),
  (c) => c.json([])
).get(
  "/api/roomcurrencies/v1/currencies",
  listRoute("Room currencies", "Empty stub"),
  (c) => c.json([])
).get(
  "/api/roomcurrencies/v1/getAllBalances",
  listRoute("Room balances", "Empty stub"),
  (c) => c.json([])
).get(
  "/econ/roomInventory/room/:roomId",
  listRoute("A room\u2019s inventory", "Empty stub so the client doesn\u2019t 404"),
  (c) => c.json([])
).get(
  "/econ/roomInventory/room/:roomId/player",
  listRoute("The caller\u2019s inventory in a room", "Empty stub"),
  (c) => c.json([])
).get(
  "/econ/roomInventoryItemTags/room/:roomId",
  listRoute("A room\u2019s inventory item tags", "Empty stub"),
  (c) => c.json([])
).get(
  "/econ/roomOffer/room/:roomId",
  listRoute("A room\u2019s offers", "Empty stub"),
  (c) => c.json([])
).get(
  "/econ/roomOffer/room/:roomId/purchaseCounts",
  listRoute("Per-offer purchase counts for a room", "Empty stub"),
  (c) => c.json([])
).get(
  "/econ/roomGiftDropShops/room/:roomId",
  listRoute("A room\u2019s gift-drop shops", "Empty stub"),
  (c) => c.json([])
).get(
  "/econ/roomEconConfig/:roomId",
  describeRoute({
    tags: ["Econ"],
    summary: "A room\u2019s economy config",
    description: [
      "Whether the room\u2019s shop groups offers into sorting tabs. No per-room config is",
      "stored, so this is always false; the `RoomId` is echoed from the path."
    ].join(" "),
    security: AUTHED,
    responses: {
      200: json(RoomEconConfig, "The room\u2019s economy config"),
      400: { description: "Non-numeric roomId (empty body)" },
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    if (Number.isNaN(roomId)) return c.body(null, 400);
    return c.json({ RoomId: roomId, EnableSortingTabs: false });
  }
).get(
  "/api/ugcPurchasables/v1/items/room/:roomId",
  listRoute("A room\u2019s UGC purchasables", "Empty stub so the client doesn\u2019t 404"),
  (c) => c.json([])
).post(
  "/api/ugcPurchasables/v1/items/bulk",
  describeRoute({
    tags: ["Rooms"],
    summary: "Look up UGC purchasables by id",
    description: "Resolves `Ids[]` (`{ itemType, itemId }`) against the `custom_avatar_item` table and answers the store-facing `UgcPurchasableItem` view of each, in request order. Only `itemType` 3 (custom avatar item) is served; other types and unknown ids are dropped. `RoomId` is echoed onto every item \u2014 what the client wants it for is not yet known. `PurchaseCurrencyId` is null until a currency exists.",
    security: AUTHED,
    requestBody: jsonBody(UgcPurchasableBulkRequest, "The room and the ids to resolve"),
    responses: {
      200: json(UgcPurchasableItemList, "The resolved items (unknown ids omitted)"),
      400: json(ErrorResponse, "Malformed body"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const body = await c.req.json().catch(() => null);
    if (!body || !Array.isArray(body.Ids)) return c.json({ error: "Ids is required" }, 400);
    const roomId = typeof body.RoomId === "number" ? body.RoomId : 0;
    const ids = body.Ids.flatMap((ref) => {
      if (!ref || typeof ref !== "object") return [];
      const { itemType, itemId } = ref;
      return itemType === UGC_ITEM_TYPE_CUSTOM_AVATAR_ITEM && typeof itemId === "string" ? [itemId] : [];
    });
    const items = await getCustomAvatarItems(c.env.DB, ids);
    return c.json(items.map((item) => toUgcPurchasable(item, roomId)));
  }
).post(
  "/api/items/purchaseInfos",
  describeRoute({
    tags: ["Storefront"],
    summary: "Purchase info for a bag of items",
    description: [
      "Resolves `Ids[]` (`{ itemType, itemId }`) against the `custom_avatar_item` table and",
      "answers how each may be bought: its price in RecCenterTokens, its availability window",
      "and the flags the store row draws. Only `itemType` 3 (custom avatar item) is served;",
      "other types and unknown ids are dropped, so the response is one entry per RESOLVED",
      "id in request order \u2014 never a positional match for `Ids[]`."
    ].join(" "),
    security: AUTHED,
    requestBody: jsonBody(ItemPurchaseInfosRequest, "The ids to price"),
    responses: {
      200: json(ItemPurchaseInfoList, "The resolved items\u2019 purchase info (unknown ids omitted)"),
      400: json(ErrorResponse, "Malformed body"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const body = await c.req.json().catch(() => null);
    if (!body || !Array.isArray(body.Ids)) return c.json({ error: "Ids is required" }, 400);
    const ids = body.Ids.flatMap((ref) => {
      if (!ref || typeof ref !== "object") return [];
      const { itemType, itemId } = ref;
      return itemType === UGC_ITEM_TYPE_CUSTOM_AVATAR_ITEM && typeof itemId === "string" ? [itemId] : [];
    });
    const items = await getCustomAvatarItems(c.env.DB, ids);
    return c.json(items.map(toItemPurchaseInfo));
  }
).get(
  "/api/consumables/v2/getUnlocked",
  describeRoute({
    tags: ["Consumables"],
    summary: "Unlocked consumables",
    description: [
      "The consumables the player has bought (from buyItem, in the consumable table),",
      "grouped by item into the unlocked-consumable DTO (Ids/CreatedAts per instance,",
      "Count their sum). [] when they\u2019ve bought none."
    ].join(" "),
    security: AUTHED,
    responses: {
      200: json(JsonArray, "Grouped unlocked consumables (empty when none)"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json(await getConsumables(c.env.DB, id));
  }
).post(
  "/api/consumables/v1/consume",
  describeRoute({
    tags: ["Consumables"],
    summary: "Consume a quantity of an owned consumable",
    description: [
      "Reduces the given consumable instance\u2019s count by `DeltaCount` (default 1), deleting",
      "the row at zero. Scoped to the caller. Pushes a ConsumableMappingRemoved socket",
      "notification. Envelope mirrors the gift-consume ack."
    ].join(" "),
    security: AUTHED,
    requestBody: jsonBody(ConsumeConsumableRequest, "The consumable id and delta"),
    responses: {
      200: json(ConsumeEnvelope, "Success envelope"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const body = await c.req.json().catch(() => ({}));
    const consumableId = typeof body.Id === "number" ? body.Id : Number.NaN;
    const delta = typeof body.DeltaCount === "number" ? body.DeltaCount : 1;
    if (!Number.isNaN(consumableId) && delta > 0) {
      const consumed = await consumeConsumable(c.env.DB, id, consumableId, delta);
      if (consumed !== null) await pushConsumableRemoved(c, id, consumed);
    }
    return c.json({ error: "", success: true, value: null });
  }
).get(
  "/api/storefronts/v4/balance/:currencyType",
  describeRoute({
    tags: ["Storefront"],
    summary: "Currency balance",
    description: [
      "The player\u2019s balance in a CurrencyType (the client fetches `/balance/2`,",
      "RecCenterTokens, on load). A first read seeds their starting balance. An unknown or",
      "non-account currency returns a 0 balance rather than 404."
    ].join(" "),
    security: AUTHED,
    parameters: [
      {
        name: "currencyType",
        in: "path",
        required: true,
        description: "CurrencyType integer; non-numeric is 400",
        schema: { type: "string" }
      }
    ],
    responses: {
      200: json(BalanceEntry.array(), "A single-entry balance array"),
      400: { description: "Non-numeric currencyType (empty body)" },
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const currencyType = Number.parseInt(c.req.param("currencyType"), 10);
    if (Number.isNaN(currencyType)) return c.body(null, 400);
    const amount = isSpendable(currencyType) ? await getBalance(
      c.env.DB,
      id,
      currencyType,
      intVar(c.env.STARTING_TOKENS, DEFAULT_STARTING_TOKENS)
    ) : 0;
    return c.json([{ CurrencyType: currencyType, Platform: ALL_PLATFORMS, Balance: amount }]);
  }
).get(
  "/api/storefronts/v3/giftdropstore/:id",
  describeRoute({
    tags: ["Storefront"],
    summary: "Gift-drop storefront catalog",
    description: [
      "Serves the `sf{id}.json` catalog via the ASSETS binding. 404 when none exists. An id",
      "with no capture of its own may stand in for another storefront\u2019s catalog (see",
      "`STOREFRONT_ALIASES`, currently empty), and such an alias applies to purchases from",
      "that storefront too, not just to this listing. Which FILE a storefront reads from can",
      "also depend on the caller\u2019s build (`rn.ver`): storefront `3` serves the captured",
      "`sf3.json` to builds up to 20230414 and the merged `sf3-2025.json` \u2014 that same store",
      "plus every sellable row of the item catalog \u2014 to later ones. The id does not change,",
      "and the same resolution applies to purchases, so what is browsed is what is charged."
    ].join(" "),
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "Storefront id (selects sf{id}.json)",
        schema: { type: "string" }
      }
    ],
    responses: {
      200: json(JsonObject, "The storefront catalog"),
      404: { description: "No such storefront catalog" }
    }
  }),
  async (c) => {
    const id = c.req.param("id");
    const path = storefrontAssetPath(id, await authedBuild(c));
    const res = await c.env.ASSETS.fetch(new URL(path, c.req.url));
    if (!res.ok) return c.notFound();
    return c.json(await res.json());
  }
).post(
  "/api/storefronts/v2/buyItem",
  describeRoute({
    tags: ["Storefront"],
    summary: "Buy a storefront item",
    description: [
      "Looks the item up in its storefront catalog, confirms the client\u2019s `RequestedPrice`",
      "still matches the `Prices` entry \u2014 a Rec Room Plus subscriber (the same `rn.plus`",
      "check as `UpdateAndGetSubscription`) may pay anywhere from that down to 10% off, since their",
      "client applies the discount itself and not to every item \u2014 debits the buyer atomically,",
      "grants the item (into the inventory or",
      "consumable table), and returns a gift box. A `Gift` block routes the item \u2014 and its",
      "box \u2014 to the player it names, who is handed it over the hub as",
      "`GiftPackageReceivedImmediate`; the caller always pays, and `Anonymous` hides them",
      "from the box rather than withholding it. `Balance` in the response is the CHANGE (negated",
      "price), not the new total. Pushes a StorefrontBalancePurchase socket frame that SETS the",
      "buyer\u2019s account-wide bucket to the RESULTING total, so the frame, this body and a",
      "`GET /balance` re-fetch all agree (`Delta` there is display-only)."
    ].join(" "),
    security: AUTHED,
    requestBody: jsonBody(BuyItemRequest, "The item, currency, price, and optional Gift"),
    responses: {
      200: json(BuyItemResponse, "The purchase result (gift box + balance change)"),
      400: json(ErrorResponse, "Invalid body, unavailable currency, or insufficient balance"),
      401: UNAUTHORIZED_RESPONSE,
      404: json(ErrorResponse, "No such item, or a `Gift` naming a player that does not exist"),
      409: json(ErrorResponse, "The price has changed since the client rendered it")
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const body = await c.req.json().catch(() => null);
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "Invalid request body" }, 400);
    }
    const storefrontType = body.StorefrontType;
    const purchasableItemId = body.PurchasableItemId;
    const currencyType = body.CurrencyType;
    const requestedPrice = body.RequestedPrice;
    if (!Number.isInteger(storefrontType) || !Number.isInteger(purchasableItemId) || !Number.isInteger(currencyType) || !Number.isInteger(requestedPrice)) {
      return c.json(
        {
          error: "StorefrontType, PurchasableItemId, CurrencyType and RequestedPrice are required"
        },
        400
      );
    }
    const item = await findStoreItem(c, storefrontType, purchasableItemId);
    if (item === null) return c.json({ error: "Item not found" }, 404);
    const checked = priceCheck(
      item,
      currencyType,
      await isSubscriber(c),
      requestedPrice
    );
    if (checked === "no-currency") {
      return c.json({ error: "Currency type not available for this item" }, 400);
    }
    if (checked === "mismatch") {
      return c.json({ error: "Price has changed" }, 409);
    }
    const price = checked.charge;
    if (!isSpendable(currencyType)) {
      return c.json({ error: "Currency type is not spendable" }, 400);
    }
    const gift = typeof body.Gift === "object" && body.Gift !== null ? body.Gift : null;
    const receiverId = Number.isInteger(gift?.ToPlayerId) ? gift?.ToPlayerId : id;
    const fromPlayerId = gift !== null && gift.Anonymous !== true ? id : COACH_ACCOUNT_ID;
    const message = giftMessage(gift);
    const giftContext = Number.isInteger(gift?.GiftContext) ? gift?.GiftContext : null;
    if (receiverId !== id && await getAccount(c.env.DB, receiverId) === null) {
      return c.json({ error: "No such player to gift to" }, 404);
    }
    const startingTokens = intVar(c.env.STARTING_TOKENS, DEFAULT_STARTING_TOKENS);
    const paid = await spendCurrency(c.env.DB, id, currencyType, price, startingTokens);
    if (!paid) return c.json({ error: "Insufficient balance" }, 400);
    const granted = await grantGiftDrop(c, receiverId, item.GiftDrop, message, {
      fromPlayerId,
      giftContext
    });
    if (receiverId !== id) {
      await pushGiftReceived(c, receiverId, granted, message, fromPlayerId, giftContext);
    }
    const newBalance = await getBalance(c.env.DB, id, currencyType, startingTokens);
    await pushBalancePurchase(c, id, currencyType, -price, newBalance);
    return c.json({
      BalanceUpdates: [
        {
          UpdateResponse: 0,
          Data: [toBalanceUpdateData(granted, fromPlayerId, message, giftContext)]
        }
      ],
      Balance: -price,
      CurrencyType: currencyType,
      BalanceType: ALL_PLATFORMS
    });
  }
).post(
  "/api/items/bulkpurchase",
  describeRoute({
    tags: ["Storefront"],
    summary: "Buy a bag of storefront items",
    description: [
      "Resolves every line against the bag\u2019s storefront catalog (one read for the whole",
      "bag), confirms each line\u2019s `RequestedPrice` still matches, debits the total in ONE",
      "atomic spend, grants what sold, and answers the `{ Success, Error, error_id, Value }`",
      "envelope. `Value.Balance` is the RESULTING total (not buyItem\u2019s change) in the",
      "`Platform` bucket named beside it, and `BalanceUpdates` carries one entry per",
      "REQUESTED item, each with its own `UpdateResponse`. `AllowPartialSuccess` lets some",
      "of those be non-OK while `Success` stays true; without it a single bad line refuses",
      "the bag and nothing is charged."
    ].join(" "),
    security: AUTHED,
    requestBody: jsonBody(BulkPurchaseRequest, "The bag: its lines, storefront and currency"),
    responses: {
      200: json(BulkPurchaseResponse, "The bag\u2019s result, or `Success: false` if nothing sold"),
      400: json(BulkPurchaseResponse, "A request that could not be evaluated at all"),
      401: UNAUTHORIZED_RESPONSE,
      404: json(BulkPurchaseResponse, "A line gifts to a player that does not exist")
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const refuse = (error, status = 200) => c.json({ Success: false, Error: error, error_id: null, Value: null }, status);
    const body = await c.req.json().catch(() => null);
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return refuse("Invalid request body", 400);
    }
    const lines = body.PurchaseItemRequests;
    if (!Array.isArray(lines) || lines.length === 0) {
      return refuse("PurchaseItemRequests must be a non-empty array", 400);
    }
    const storefrontType = body.StorefrontType;
    const currencyType = body.CurrencyType;
    if (!Number.isInteger(storefrontType) || !Number.isInteger(currencyType)) {
      return refuse("StorefrontType and CurrencyType are required", 400);
    }
    if (!isSpendable(currencyType)) {
      return refuse("Currency type is not spendable", 400);
    }
    const allowPartial = body.AllowPartialSuccess === true;
    const skipGiftBox = body.BypassGiftPackages === true;
    const storefront = await loadStorefront(c, storefrontType);
    const build = await authedBuild(c);
    const catalogItems = build !== null && build > LEGACY_CLIENT_BUILD ? await catalogStoreItems(
      c.env.DB,
      lines.flatMap((line) => {
        const numberId = toPurchaseMethodId(line.ItemPurchaseMethodId).NumberId;
        return numberId !== null && numberId >= CATALOG_ID_BASE ? [numberId] : [];
      })
    ) : [];
    const bagCatalog = catalogItems.length === 0 ? storefront : { StoreItems: [...storefront?.StoreItems ?? [], ...catalogItems] };
    const subscriber = await isSubscriber(c);
    const resolved = lines.map(
      (line) => resolveBulkLine(line, bagCatalog, currencyType, subscriber)
    );
    const buyable = resolved.filter(isBulkLine);
    const copies = buyable.reduce((n, line) => n + line.count, 0);
    if (copies > BULK_PURCHASE_CAP) {
      return refuse(`A bulk purchase is capped at ${BULK_PURCHASE_CAP} items`, 400);
    }
    const firstFailure = resolved.find((line) => !isBulkLine(line));
    if (!allowPartial && firstFailure !== void 0) return refuse(firstFailure.error);
    const recipients = /* @__PURE__ */ new Set();
    for (const line of buyable) {
      const to = line.gift?.ToPlayerId;
      if (Number.isInteger(to) && to !== id) recipients.add(to);
    }
    for (const to of recipients) {
      if (await getAccount(c.env.DB, to) === null) {
        return refuse("No such player to gift to", 404);
      }
    }
    const startingTokens = intVar(c.env.STARTING_TOKENS, DEFAULT_STARTING_TOKENS);
    const balance = await getBalance(c.env.DB, id, currencyType, startingTokens);
    const affordable = [];
    let total = 0;
    for (const line of buyable) {
      const cost = line.price * line.count;
      if (total + cost > balance) continue;
      total += cost;
      affordable.push(line);
    }
    const bought = new Set(affordable);
    if (!allowPartial && affordable.length !== buyable.length) {
      return refuse("Insufficient balance");
    }
    if (affordable.length === 0) {
      return refuse(firstFailure?.error ?? "Insufficient balance");
    }
    if (total > 0 && !await spendCurrency(c.env.DB, id, currencyType, total, startingTokens)) {
      return refuse("Insufficient balance");
    }
    const rollCatalog = affordable.some((line) => line.item.GiftDrop.IsQuery === true) ? await loadRollCatalog(c) : void 0;
    const packages = /* @__PURE__ */ new Map();
    for (const line of affordable) {
      const gift = line.gift;
      const receiverId = Number.isInteger(gift?.ToPlayerId) ? gift?.ToPlayerId : id;
      const fromPlayerId = gift !== null && gift.Anonymous !== true ? id : COACH_ACCOUNT_ID;
      const message = giftMessage(gift);
      const giftContext = Number.isInteger(gift?.GiftContext) ? gift?.GiftContext : null;
      const granted = await grantGiftDrop(c, receiverId, line.item.GiftDrop, message, {
        rollCatalog,
        skipGiftBox,
        copies: line.count,
        fromPlayerId,
        giftContext
      });
      if (receiverId !== id && !skipGiftBox) {
        await pushGiftReceived(c, receiverId, granted, message, fromPlayerId, giftContext);
      }
      packages.set(
        line,
        // Null under `BypassGiftPackages`, which is the flag asking for exactly that —
        // the item is granted either way.
        skipGiftBox ? null : toGiftPackage(granted, receiverId, fromPlayerId, message, giftContext)
      );
    }
    const updates = resolved.map((line) => {
      if (!isBulkLine(line)) {
        return {
          UpdateResponse: line.code,
          Data: {
            GiftPackage: null,
            PurchasableItemId: line.method.NumberId,
            CustomAvatarItem: null
          }
        };
      }
      return {
        UpdateResponse: bought.has(line) ? UpdateResponse.OK : UpdateResponse.NotEnoughCredit,
        Data: {
          GiftPackage: packages.get(line) ?? null,
          PurchasableItemId: line.method.NumberId,
          CustomAvatarItem: null
        }
      };
    });
    let newBalance = balance;
    if (total > 0) {
      newBalance = await getBalance(c.env.DB, id, currencyType, startingTokens);
      await pushBalancePurchase(c, id, currencyType, -total, newBalance);
    }
    return c.json({
      Success: true,
      Error: null,
      error_id: null,
      Value: {
        // The RESULTING total, unlike buyItem's change — and the bucket it belongs to.
        // `Platform` here is the client's `BalanceType` under a [DataMember] rename. A
        // capture from the reference server says 4 (RecNetPurchased) because it kept a
        // wallet per store; this server keeps ONE account-wide bucket, and the client SUMS
        // its buckets, so naming any other platform invents a second balance beside the
        // real one. See the frame rule above pushBalanceUpdate.
        Balance: newBalance,
        CurrencyType: currencyType,
        Platform: ALL_PLATFORMS,
        BalanceUpdates: updates
      }
    });
  }
).get(
  "/api/storefronts/v2/buyInvention",
  describeRoute({
    tags: ["Storefront"],
    summary: "Buy an invention",
    description: [
      "Looks the invention up by id, confirms the client\u2019s `requestedPrice` still matches",
      "its stored `Price`, debits the buyer and pays the creator that price in",
      "RecCenterTokens (a free invention moves nothing), records ownership in",
      "`inventory_invention`, and returns the invention alongside the buyer\u2019s resulting",
      "balance. When tokens moved, both players get a socket push carrying their RESULTING",
      "total \u2014 the buyer a StorefrontBalancePurchase, the CREATOR a StorefrontBalanceUpdate \u2014",
      "which sets the account-wide bucket their client shows, agreeing with this body.",
      "A GET because that is how the client sends it."
    ].join(" "),
    security: AUTHED,
    parameters: [
      {
        name: "inventionId",
        in: "query",
        required: true,
        description: "Invention id; missing or non-numeric is 400",
        schema: { type: "integer" }
      },
      {
        name: "requestedPrice",
        in: "query",
        required: false,
        description: "The price the client rendered; a mismatch is 409. Defaults to 0",
        schema: { type: "integer" }
      }
    ],
    responses: {
      200: json(BuyInventionResponse, "The purchase result (invention + balance)"),
      400: json(
        ErrorResponse,
        "Missing/non-numeric inventionId, buying your own, or insufficient balance"
      ),
      401: UNAUTHORIZED_RESPONSE,
      403: json(ErrorResponse, "The invention is not published, so it is not for sale"),
      404: json(ErrorResponse, "No such invention"),
      409: json(ErrorResponse, "Already owned, or the price has changed")
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const inventionId = Number.parseInt(c.req.query("inventionId") ?? "", 10);
    if (Number.isNaN(inventionId)) return c.json({ error: "inventionId is required" }, 400);
    const requestedPrice = Number.parseInt(c.req.query("requestedPrice") ?? "0", 10) || 0;
    const settled = await settleInventionPurchase(c, id, inventionId, requestedPrice);
    if (settled instanceof Response) return settled;
    return c.json({
      BalanceUpdateResponse: {
        Balance: settled.balance,
        BalanceType: ALL_PLATFORMS,
        CurrencyType: CurrencyType.RecCenterTokens,
        BalanceUpdates: [{ UpdateResponse: 0, Data: settled.invention }]
      },
      // The bare `{ Status, Invention, InventionVersion }` the v6 save serves — this
      // build's invention endpoints answer in it, and the client re-renders from it.
      InventionResponse: toSaveResult(settled.invention)
    });
  }
).post(
  "/api/storefronts/v3/buyInvention",
  describeRoute({
    tags: ["Storefront"],
    summary: "Buy an invention (JSON body)",
    description: [
      "The same purchase as `GET /api/storefronts/v2/buyInvention` \u2014 confirms the client\u2019s",
      "`RequestedPrice` still matches the invention\u2019s stored `Price`, debits the buyer and",
      "pays the creator that price in RecCenterTokens (a free invention moves nothing),",
      "records ownership in `inventory_invention`, and pushes both players a socket frame",
      "carrying their RESULTING total \u2014 but answered in a DIFFERENT envelope, which is why",
      "the route exists at all: `InventionResponse` is the v9 save\u2019s",
      "`{ Value, Success, Error, error_id }` (its `InventionVersion` and `TagsResponse` null,",
      "since a buy mints neither) and the balance half names its bucket `Platform`, not v2\u2019s",
      "`BalanceType`."
    ].join(" "),
    security: AUTHED,
    requestBody: jsonBody(BuyInventionRequest, "The invention id and the price rendered"),
    responses: {
      200: json(BuyInventionV3Response, "The purchase result (invention + balance)"),
      400: json(
        ErrorResponse,
        "Invalid body, missing InventionId, buying your own, or insufficient balance"
      ),
      401: UNAUTHORIZED_RESPONSE,
      403: json(ErrorResponse, "The invention is not published, so it is not for sale"),
      404: json(ErrorResponse, "No such invention"),
      409: json(ErrorResponse, "Already owned, or the price has changed")
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const body = await c.req.json().catch(() => null);
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "Invalid request body" }, 400);
    }
    const inventionId = body.InventionId;
    if (!Number.isInteger(inventionId)) {
      return c.json({ error: "InventionId is required" }, 400);
    }
    const requestedPrice = Number.isInteger(body.RequestedPrice) ? body.RequestedPrice : 0;
    const settled = await settleInventionPurchase(c, id, inventionId, requestedPrice);
    if (settled instanceof Response) return settled;
    return c.json({
      // The v9 SAVE envelope, not v6's bare `{ Status, Invention, InventionVersion }`:
      // `Value` under `{ Success, Error, error_id }`, with `Invention` the client's 28-key
      // `RRInvention`. A buy mints no version and takes no tags, so both of those keys are
      // present and NULL — which is safe here for the same reason it is on the save: the
      // client reads `Success` and `Value.Invention` and nothing else. `Value` itself must
      // never be null under `Success: true` — that dereference is what crashes it.
      InventionResponse: {
        Value: {
          Status: 0,
          Invention: toInventionV9(settled.invention),
          InventionVersion: null,
          TagsResponse: null
        },
        Success: true,
        Error: null,
        error_id: null
      },
      // `BalanceResponseDTO`, the same one the bulk purchase answers in — so the bucket key
      // is `Platform`, NOT the `BalanceType` the v2 body sends. The client's member IS named
      // `BalanceType`, but it carries a [DataMember] rename to `Platform` and its decoder
      // drops what it doesn't know, so spelling it `BalanceType` here would land this balance
      // in bucket 0 beside the real one. `Balance` is the RESULTING total, as in v2.
      BalanceUpdateResponse: {
        BalanceUpdates: [{ UpdateResponse: 0, Data: toInventionV9(settled.invention) }],
        Balance: settled.balance,
        CurrencyType: CurrencyType.RecCenterTokens,
        // The capture says 0 (SteamPurchased) because the reference server kept a wallet per
        // platform. This one keeps ONE bucket and the client SUMS them, so naming 0 here
        // while every socket frame names -2 is exactly the phantom second balance that
        // doubled players' tokens twice before. -2, like every other surface.
        Platform: ALL_PLATFORMS
      }
    });
  }
).get(
  "/api/storefronts/v1/adcarouselitems",
  listRoute("Storefront ad-carousel items", "The bundled carousel (one placeholder banner)"),
  (c) => c.json(adCarouselItems)
).get(
  "/api/challenge/v2/getCurrent",
  describeRoute({
    tags: ["Econ"],
    summary: "Current weekly challenge",
    description: [
      "This week\u2019s rotation \u2014 generated from the calendar week \u2014 with each challenge\u2019s",
      "`Complete` and `Config` stamped from the caller\u2019s progress rows, the stored `Config`",
      "carrying the client\u2019s running counts. Auth is optional: unauthenticated callers get",
      "the week unstamped, every `Complete` false and every `Config` as published."
    ].join(" "),
    security: OPTIONAL_AUTHED,
    responses: { 200: json(JsonObject, "The current weekly challenge") }
  }),
  async (c) => {
    const rotation = withWeeklyGift(buildRotation(/* @__PURE__ */ new Date()), await loadEquipmentGiftPool(c));
    const id = await authedId(c);
    if (id === null) return c.json(rotation);
    const statuses = await getChallengeStatuses(c.env.DB, id, rotation.ChallengeMapId);
    if (statuses.size === 0) return c.json(rotation);
    return c.json({
      ...rotation,
      Challenges: rotation.Challenges.map((challenge) => {
        const status = statuses.get(challenge.ChallengeId);
        if (status === void 0) return challenge;
        return {
          ...challenge,
          Complete: status.complete,
          Config: status.config ?? challenge.Config
        };
      })
    });
  }
).post(
  "/api/challenge/v2/updateProgress",
  describeRoute({
    tags: ["Econ"],
    summary: "Report weekly-challenge progress",
    description: [
      "Persists the reported completion and rule tree into `challenge_status`, keyed by",
      "account + challenge, so `getCurrent` can serve the player\u2019s own progress back.",
      "Completion latches within a rotation and a report carrying no `Config` keeps the",
      "stored tree, so the echoed fields are the stored values, not the posted ones."
    ].join(" "),
    security: AUTHED,
    requestBody: jsonBody(ChallengeProgressRequest, "Challenge ids + the evaluated rule tree"),
    responses: {
      200: json(ChallengeProgressResponse, "Echoed fields with the stored completion"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const body = await c.req.json().catch(() => ({}));
    const challengeMapId = Number(body.ChallengeMapId) || 0;
    const challengeId = Number(body.ChallengeId) || 0;
    const config = typeof body.Config === "string" ? body.Config : null;
    const stored = challengeId === 0 ? { complete: parseBool(body.Complete), config } : await recordChallengeProgress(c.env.DB, id, {
      challengeMapId,
      challengeId,
      complete: parseBool(body.Complete),
      config
    });
    if (stored.complete && challengeId !== 0 && challengeMapId === rotationMapId(/* @__PURE__ */ new Date())) {
      await awardChallengeGift(c, id);
    }
    return c.json({
      ChallengeMapId: challengeMapId,
      ChallengeId: challengeId,
      Config: stored.config ?? "",
      Complete: stored.complete
    });
  }
).get(
  "/api/gamerewards/v1/pending",
  listRoute("Pending game rewards", "Empty for now"),
  (c) => c.json([])
).post(
  "/api/gamerewards/v1/request",
  describeRoute({
    tags: ["Econ"],
    summary: "Request a game reward",
    description: [
      "Claims one reward of `rewardType` in `giftContext` per hour per player, recorded in",
      "`reward_status`. The cooldown is per (type, activity), so a different activity is",
      "owed another reward while the same one is not; an ask with no `giftContext` keys on",
      "the empty context. A `giftContext` that names an activity in `quest-rewards.json`",
      "(`Dodgeball`, `Quest_Goblin_S`, \u2026) draws one of that activity\u2019s rewards and grants it;",
      "any other claim pays XP only. The reward rides in a gift box, so a claim and a",
      "rejected (on-cooldown) ask both answer `[]`."
    ].join(" "),
    security: AUTHED,
    requestBody: form(GameRewardRequest, "The reward type and its display message"),
    responses: {
      200: json(JsonArray, "The rewards granted \u2014 always [] while the payload is stubbed"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const body = await c.req.parseBody().catch(() => ({}));
    const rewardType = typeof body.rewardType === "string" ? body.rewardType : "";
    if (rewardType === "") return c.json([]);
    const giftContext = typeof body.giftContext === "string" ? body.giftContext : "";
    const claimed = await claimReward(c.env.DB, id, rewardType, giftContext);
    if (claimed === null) return c.json([]);
    const message = typeof body.Message === "string" && body.Message !== "" ? body.Message : DEFAULT_GAME_REWARD_MESSAGE;
    const { progression, levelsGained } = await addXp(c.env.DB, id, GAME_REWARD_XP);
    const questReward = await pickQuestReward(c.env.DB, id, giftContext);
    const itemKey = questReward?.AvatarItemDesc || questReward?.EquipmentModificationGuid;
    const drop = questReward === null ? toGameRewardDrop() : toQuestRewardDrop(questReward, itemKey ? await getCatalogItem(c.env.DB, itemKey) : null);
    if (drop.Currency > 0 && drop.CurrencyType !== CurrencyType.Invalid) {
      const startingTokens = intVar(c.env.STARTING_TOKENS, DEFAULT_STARTING_TOKENS);
      await ensureStartingBalances(c.env.DB, id, startingTokens);
      const balance = await creditCurrency(
        c.env.DB,
        id,
        drop.CurrencyType,
        drop.Currency,
        startingTokens
      );
      await pushBalanceUpdate(c, id, drop.CurrencyType, balance);
    }
    const granted = await grantGiftDrop(c, id, drop, message);
    await pushGiftReceived(c, id, granted, message, COACH_ACCOUNT_ID);
    await pushProgressionUpdate(c, id, progression);
    await grantLevelUpGifts(c, id, { progression, levelsGained });
    logger.info("game reward claimed", {
      accountId: id,
      rewardType,
      giftContext,
      grantCount: claimed,
      message,
      xp: GAME_REWARD_XP,
      level: progression.Level,
      levelsGained,
      levelXp: progression.XP,
      giftId: granted.id
    });
    return c.json([]);
  }
).get(
  "/api/roomkeys/v1/mine",
  listRoute("The player\u2019s room keys", "Empty for now"),
  (c) => c.json([])
).get(
  "/api/roomkeys/v1/room",
  listRoute("Room keys for a room", "Empty for now"),
  (c) => c.json([])
).get(
  "/api/CampusCard/v1/SignUpBonus",
  describeRoute({
    tags: ["Econ"],
    summary: "Rec Room Plus sign-up bonus",
    description: [
      "The bonus a player gets for taking out Rec Room Plus: which bonus is running",
      "(`RRPlusSignUpBonusId`) and the token price window the free items are picked from.",
      "Fixed values \u2014 nothing here is per-account or stored, so no auth is required and",
      "every caller gets the same three numbers."
    ].join(" "),
    responses: { 200: json(RRPlusSignUpBonus, "The running sign-up bonus") }
  }),
  (c) => c.json({
    RRPlusSignUpBonusId: 3,
    MinFreeItemsPrice: 6e3,
    MaxFreeItemsPrice: 1e4
  })
).post(
  "/api/CampusCard/v1/UpdateAndGetSubscription",
  describeRoute({
    tags: ["Econ"],
    summary: "Subscription lookup",
    description: [
      "The caller\u2019s Rec Room Plus subscription. Nothing sells subscriptions here: Plus is",
      "claimed on the website by proving a qualifying role in the community Discord, and",
      "arrives as the token\u2019s `rn.plus` claim. A token carrying it reports an active Gold",
      "(`Level` 0) yearly (`Period` 1) subscription on `PlatformType` -1 (All), expiring a",
      "year from the call; every other caller gets `{}`. The `developer` role does NOT",
      "confer it. Auth is optional \u2014 a missing or invalid token reads as \u201Cnot subscribed\u201D,",
      "not 401. The subscription itself is not persisted, and because the claim is stamped",
      "at login, a player who has just claimed must sign in again before it appears."
    ].join(" "),
    responses: {
      200: json(SubscriptionResponse, "The subscription, or `{}` for no subscription")
    }
  }),
  async (c) => {
    if (!await isSubscriber(c)) return c.json({});
    const id = await authedId(c);
    if (id === null) return c.json({});
    return c.json({
      Subscription: plusSubscription(id),
      PlatformAccountSubscribedPlayerId: null
    });
  }
).get(
  "/api/subscriptionseasons/v1/seasons/current",
  listRoute("Current subscription seasons", "Empty stub \u2014 no RR+ season is running"),
  (c) => c.json([])
).get(
  "/api/makerai/checkfreetrialeligibility",
  describeRoute({
    tags: ["Econ"],
    summary: "Maker AI free-trial eligibility",
    description: [
      "Whether the caller can start a Maker AI free trial. Always `false` \u2014 nothing here",
      "runs trials. The body is a bare JSON boolean, not an envelope."
    ].join(" "),
    security: AUTHED,
    responses: {
      200: json(MakerAiFreeTrialEligibilityResponse, "Always `false`"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json(false);
  }
).get(
  "/api/incentivizedreferrals/progress",
  describeRoute({
    tags: ["Econ"],
    summary: "The caller\u2019s referral-reward progress",
    description: [
      "How many of the caller\u2019s referrals have been verified and which referral rewards they",
      "have claimed, under a `{ success, value }` envelope. Always 0 and empty \u2014 no referral",
      "programme runs here \u2014 which the client renders as an untouched reward track."
    ].join(" "),
    security: AUTHED,
    responses: {
      200: json(ReferralProgressResponse, "The caller\u2019s progress \u2014 always zero"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json({
      success: true,
      value: { ReferralsVerifiedCount: 0, PlayerReferralRewards: [] }
    });
  }
).get(
  "/api/influencerpartnerprogram/influencers",
  describeRoute({
    tags: ["Econ"],
    summary: "Every influencer in the partner program",
    description: [
      "The account ids in the influencer partner program, as `{ InfluencerIds }` \u2014 an object",
      "around the list, not a bare array. Always empty here: no programme runs on this",
      "server. `take` is accepted and ignored, there being nothing to page."
    ].join(" "),
    security: AUTHED,
    parameters: [
      {
        name: "take",
        in: "query",
        required: false,
        description: "How many ids to return. Accepted and ignored.",
        schema: { type: "integer" }
      }
    ],
    responses: {
      200: json(InfluencerIdsResponse, "The influencer ids \u2014 always empty"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json({ InfluencerIds: [] });
  }
).get(
  "/api/influencerpartnerprogram/influencer",
  describeRoute({
    tags: ["Econ"],
    summary: "An account\u2019s influencer partner program tier",
    description: [
      "The partner tier of the account named by `accountId`, as a BARE NUMBER \u2014 the whole",
      "body is `0`, not an object around it. Always 0: this server runs no partner program,",
      "so no account is an influencer. Auth-gated; a missing or invalid token is a 401."
    ].join(" "),
    security: AUTHED,
    parameters: [
      {
        name: "accountId",
        in: "query",
        required: false,
        description: "The account being asked about. Every account answers 0.",
        schema: { type: "integer" }
      }
    ],
    responses: {
      200: json(InfluencerTierResponse, "The account\u2019s tier \u2014 always 0"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json(NOT_AN_INFLUENCER);
  }
).get(
  "/api/influencerpartnerprogram/myinfluencer",
  describeRoute({
    tags: ["Econ"],
    summary: "The caller\u2019s influencer partner program tier",
    description: [
      "The caller\u2019s own partner tier \u2014 the `my` form of the route above, taking the account",
      "from the token rather than a query parameter. A BARE NUMBER, always `0`: this server",
      "runs no partner program. Auth-gated; a missing or invalid token is a 401."
    ].join(" "),
    security: AUTHED,
    responses: {
      200: json(InfluencerTierResponse, "The caller\u2019s tier \u2014 always 0"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json(NOT_AN_INFLUENCER);
  }
);
app.get(
  "/openapi.json",
  describeRoute({ hide: true }),
  withCleanSpec(
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "recflare econ",
          version: "1.0.0",
          description: [
            "Avatar and economy endpoints for recflare, a private-server reimplementation of the",
            "Rec Room backend. The client calls these on the `econ` host; many are also served by",
            "the `api` worker. Storefront catalogs are static assets (`sf{N}.json`); balances,",
            "inventory, consumables, saved outfits and gift boxes are D1-backed."
          ].join("\n")
        },
        servers: [{ url: "https://econ.recflare.net", description: "Production" }],
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
