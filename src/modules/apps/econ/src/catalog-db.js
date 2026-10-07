// Ported from apps/econ/src/catalog-db.ts; TypeScript types erased; native runtime imports.
import { CatalogKind } from "./catalog-load.js";
import {
  buildCatalogLoad,
  CATALOG_INSERT_COLUMNS,
  CatalogKind as CatalogKind2
} from "./catalog-load.js";
const CATALOG_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS catalog (
		item_key TEXT PRIMARY KEY,
		catalog_id INTEGER,
		kind TEXT NOT NULL,
		friendly_name TEXT NOT NULL,
		tooltip TEXT,
		rarity INTEGER NOT NULL DEFAULT 0,
		platform_mask INTEGER NOT NULL DEFAULT -1,
		thumbnail_image TEXT,
		avatar_item_type INTEGER,
		avatar_item_id INTEGER,
		is_base_avatar_item INTEGER,
		tag_list TEXT,
		created_at TEXT,
		prefab_name TEXT,
		unlocked_level INTEGER
	)`,
  // The search index. Folded, because a name search is case-insensitive and SQLite's LIKE is
  // only case-insensitive for ASCII — which these names are not all of.
  `CREATE INDEX IF NOT EXISTS idx_catalog_name ON catalog (kind, lower(friendly_name))`,
  // Every skin of one prefab, which is how a skin picker is filled.
  `CREATE INDEX IF NOT EXISTS idx_catalog_prefab ON catalog (prefab_name) WHERE prefab_name IS NOT NULL`,
  // Seasonal rows ('halloween', 'music', …) — a handful of tags over 3000-odd rows, so the
  // index is worth far more than its size.
  `CREATE INDEX IF NOT EXISTS idx_catalog_tag ON catalog (tag_list) WHERE tag_list IS NOT NULL`,
  // The numeric handle. Unique where set — a number that names two rows is useless as a handle
  // — and partial, because a row is un-numbered between existing and being numbered by a load.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_id ON catalog (catalog_id) WHERE catalog_id IS NOT NULL`
];
function toCatalogAvatarItem(row) {
  if (row.kind !== CatalogKind.AvatarItem) {
    throw new Error(`catalog row ${row.item_key} is a ${row.kind}, not an avatar item`);
  }
  return {
    // The key IS the desc — that is what makes it the key.
    AvatarItemDesc: row.item_key,
    AvatarItemType: row.avatar_item_type ?? 0,
    PlatformMask: row.platform_mask,
    FriendlyName: row.friendly_name,
    Tooltip: row.tooltip,
    Rarity: row.rarity,
    TagList: row.tag_list,
    AvatarItemId: row.avatar_item_id,
    IsBaseAvatarItem: row.is_base_avatar_item === 1,
    CreatedAt: row.created_at,
    ThumbnailImage: row.thumbnail_image
  };
}
function toCatalogSkin(row) {
  if (row.kind !== CatalogKind.Skin) {
    throw new Error(`catalog row ${row.item_key} is a ${row.kind}, not a skin`);
  }
  return {
    PrefabName: row.prefab_name ?? "",
    // The key IS the guid.
    ModificationGuid: row.item_key,
    UnlockedLevel: row.unlocked_level ?? 0,
    Favorited: false,
    PlatformMask: row.platform_mask,
    FriendlyName: row.friendly_name,
    Tooltip: row.tooltip,
    Rarity: row.rarity,
    ThumbnailImage: row.thumbnail_image
  };
}
function baseAsset(desc) {
  return desc.split(",")[0] ?? "";
}
async function getCatalogItem(db, itemKey) {
  return await db.prepare("SELECT * FROM catalog WHERE item_key = ?1").bind(itemKey).first();
}
async function getCatalogItemById(db, catalogId) {
  return await db.prepare("SELECT * FROM catalog WHERE catalog_id = ?1").bind(catalogId).first();
}
async function getCatalogItems(db, itemKeys) {
  if (itemKeys.length === 0) return [];
  const placeholders = itemKeys.map((_, i) => `?${i + 1}`).join(", ");
  const { results } = await db.prepare(`SELECT * FROM catalog WHERE item_key IN (${placeholders})`).bind(...itemKeys).all();
  const byKey = new Map(results.map((r) => [r.item_key, r]));
  return itemKeys.flatMap((key) => byKey.get(key) ?? []);
}
async function getAvatarItem(db, avatarItemDesc) {
  const row = await getCatalogItem(db, avatarItemDesc);
  return row?.kind === CatalogKind.AvatarItem ? toCatalogAvatarItem(row) : null;
}
async function getSkin(db, modificationGuid) {
  const row = await getCatalogItem(db, modificationGuid);
  return row?.kind === CatalogKind.Skin ? toCatalogSkin(row) : null;
}
async function getSkinsForPrefab(db, prefabName) {
  const { results } = await db.prepare("SELECT * FROM catalog WHERE prefab_name = ?1 ORDER BY friendly_name").bind(prefabName).all();
  return results.map(toCatalogSkin);
}
async function searchCatalog(db, kind, needle, limit = 50) {
  const escaped = needle.toLowerCase().replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const { results } = await db.prepare(
    `SELECT * FROM catalog
			 WHERE kind = ?1 AND lower(friendly_name) LIKE ?2 ESCAPE '\\'
			 ORDER BY friendly_name, item_key LIMIT ?3`
  ).bind(kind, `%${escaped}%`, limit).all();
  return results;
}
async function getAvatarItemsByTag(db, tag) {
  const { results } = await db.prepare("SELECT * FROM catalog WHERE tag_list = ?1 ORDER BY friendly_name").bind(tag).all();
  return results.map(toCatalogAvatarItem);
}
async function countCatalog(db) {
  const { results } = await db.prepare("SELECT kind, COUNT(*) AS n FROM catalog GROUP BY kind").all();
  return Object.fromEntries(results.map((r) => [r.kind, r.n]));
}
export {
  CATALOG_INSERT_COLUMNS,
  CATALOG_SCHEMA_DDL,
  CatalogKind2 as CatalogKind,
  baseAsset,
  buildCatalogLoad,
  countCatalog,
  getAvatarItem,
  getAvatarItemsByTag,
  getCatalogItem,
  getCatalogItemById,
  getCatalogItems,
  getSkin,
  getSkinsForPrefab,
  searchCatalog,
  toCatalogAvatarItem,
  toCatalogSkin
};
