// Ported from apps/econ/src/catalog-load.ts; TypeScript types erased; native runtime imports.
const CatalogKind = {
  /** An avatar item: something worn. Its `item_key` is the `AvatarItemDesc`. */
  AvatarItem: "avatar_item",
  /** An equipment skin: a re-skin of a held prefab. Its `item_key` is the `ModificationGuid`. */
  Skin: "skin"
};
const CATALOG_ID_BASE = 1e4;
const CATALOG_INSERT_COLUMNS = [
  "item_key",
  "catalog_id",
  "kind",
  "friendly_name",
  "tooltip",
  "rarity",
  "platform_mask",
  "thumbnail_image",
  "avatar_item_type",
  "avatar_item_id",
  "is_base_avatar_item",
  "tag_list",
  "created_at",
  "prefab_name",
  "unlocked_level"
];
function avatarItemRow(i) {
  return {
    key: i.AvatarItemDesc,
    label: `${i.FriendlyName} (avatar item)`,
    values: [
      i.AvatarItemDesc,
      // Filled in by buildCatalogLoad once the de-duplicated order is known.
      null,
      CatalogKind.AvatarItem,
      i.FriendlyName,
      i.Tooltip,
      i.Rarity,
      i.PlatformMask,
      i.ThumbnailImage,
      i.AvatarItemType,
      i.AvatarItemId,
      i.IsBaseAvatarItem ?? false,
      i.TagList,
      i.CreatedAt,
      null,
      null
    ]
  };
}
function skinRow(s) {
  return {
    key: s.ModificationGuid,
    label: `${s.FriendlyName} (skin, ${s.PrefabName})`,
    values: [
      s.ModificationGuid,
      // Filled in by buildCatalogLoad once the de-duplicated order is known.
      null,
      CatalogKind.Skin,
      s.FriendlyName,
      s.Tooltip,
      s.Rarity,
      s.PlatformMask,
      s.ThumbnailImage,
      null,
      null,
      null,
      null,
      null,
      s.PrefabName,
      s.UnlockedLevel
    ]
  };
}
function buildCatalogLoad(avatarItems, skins) {
  const seen = /* @__PURE__ */ new Map();
  const rows = [];
  const collisions = [];
  const idAt = CATALOG_INSERT_COLUMNS.indexOf("catalog_id");
  for (const row of [...avatarItems.map(avatarItemRow), ...skins.map(skinRow)]) {
    const kept = seen.get(row.key);
    if (kept !== void 0) {
      collisions.push({ key: row.key, kept, dropped: row.label });
      continue;
    }
    seen.set(row.key, row.label);
    const id = CATALOG_ID_BASE + rows.length;
    row.values[idAt] = id;
    rows.push({ ...row, id });
  }
  return { rows, collisions };
}
const UNSELLABLE_RARITIES = [-1];
const isSellableRarity = (rarity) => !UNSELLABLE_RARITIES.includes(rarity);
const PRICE_BY_RARITY = {
  0: 150,
  10: 600,
  20: 700,
  30: 800,
  50: 3e3
};
const DEFAULT_PRICE = 150;
const priceForRarity = (rarity) => PRICE_BY_RARITY[rarity] ?? DEFAULT_PRICE;
const SUBSCRIBER_DISCOUNT_PERCENT = 10;
const subscriberPriceFor = (regular) => Math.floor(regular * (100 - SUBSCRIBER_DISCOUNT_PERCENT) / 100);
const LEGACY_CLIENT_BUILD = 20230414;
const LEGACY_CLIENT_BUILD_DATE = "2023-04-14";
const existedByLegacyBuild = (createdAt) => typeof createdAt === "string" && createdAt.slice(0, 10) < LEGACY_CLIENT_BUILD_DATE;
export {
  CATALOG_ID_BASE,
  CATALOG_INSERT_COLUMNS,
  CatalogKind,
  DEFAULT_PRICE,
  LEGACY_CLIENT_BUILD,
  LEGACY_CLIENT_BUILD_DATE,
  PRICE_BY_RARITY,
  SUBSCRIBER_DISCOUNT_PERCENT,
  UNSELLABLE_RARITIES,
  buildCatalogLoad,
  existedByLegacyBuild,
  isSellableRarity,
  priceForRarity,
  subscriberPriceFor
};
