// Ported from apps/api/src/custom-avatar-items-db.ts; TypeScript types erased; native runtime imports.
const SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS custom_avatar_item (
		custom_avatar_item_id TEXT PRIMARY KEY,
		creator_account_id INTEGER NOT NULL,
		name TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		price INTEGER NOT NULL DEFAULT 0,
		accessibility INTEGER NOT NULL DEFAULT 0,
		force_cannot_publish INTEGER NOT NULL DEFAULT 0,
		is_featured INTEGER NOT NULL DEFAULT 0,
		is_rec_room_approved INTEGER NOT NULL DEFAULT 0,
		base_avatar_item_id INTEGER NOT NULL,
		base_avatar_item_color TEXT NOT NULL,
		design_filename TEXT NOT NULL,
		thumbnail_image_filename TEXT NOT NULL,
		created_at TEXT NOT NULL,
		modified_at TEXT NOT NULL,
		preview_orientation INTEGER NOT NULL DEFAULT 0,
		outfit_type INTEGER NOT NULL DEFAULT 0
	)`,
  `CREATE INDEX IF NOT EXISTS idx_custom_avatar_item_creator ON custom_avatar_item (creator_account_id)`
];
function toDto(row) {
  return {
    CustomAvatarItemId: row.custom_avatar_item_id,
    CreatorAccountId: row.creator_account_id,
    Name: row.name,
    Description: row.description,
    Price: row.price,
    Accessibility: row.accessibility,
    ForceCannotPublish: row.force_cannot_publish === 1,
    IsFeatured: row.is_featured === 1,
    IsRecRoomApproved: row.is_rec_room_approved === 1,
    BaseAvatarItemId: row.base_avatar_item_id,
    BaseAvatarItemColor: row.base_avatar_item_color,
    DesignFilename: row.design_filename,
    ThumbnailImageFilename: row.thumbnail_image_filename,
    CreatedAt: row.created_at,
    ModifiedAt: row.modified_at,
    PreviewOrientation: row.preview_orientation,
    RankingContext: null,
    OutfitType: row.outfit_type,
    CurrentSaves: [],
    PurchaseInfo: null
  };
}
async function createCustomAvatarItem(db, input, now = /* @__PURE__ */ new Date()) {
  const ts = now.toISOString();
  const row = await db.prepare(
    `INSERT INTO custom_avatar_item (
				custom_avatar_item_id, creator_account_id, name, description, price, accessibility,
				base_avatar_item_id, base_avatar_item_color, design_filename, thumbnail_image_filename,
				created_at, modified_at
			) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
			RETURNING *`
  ).bind(
    input.customAvatarItemId,
    input.creatorAccountId,
    input.name,
    input.description,
    input.price,
    input.accessibility,
    input.baseAvatarItemId,
    input.baseAvatarItemColor,
    input.designFilename,
    input.thumbnailImageFilename,
    ts
  ).first();
  if (!row) throw new Error("custom_avatar_item insert returned no row");
  return toDto(row);
}
const UGC_ITEM_TYPE_CUSTOM_AVATAR_ITEM = 3;
function toUgcPurchasable(item, roomId) {
  return {
    ItemType: UGC_ITEM_TYPE_CUSTOM_AVATAR_ITEM,
    ItemId: item.CustomAvatarItemId,
    Name: item.Name,
    Description: item.Description,
    ImageName: item.ThumbnailImageFilename,
    RoomId: roomId,
    Price: item.Price,
    PurchaseCurrencyId: null,
    CreatedAt: item.CreatedAt,
    ModifiedAt: item.ModifiedAt
  };
}
async function getCustomAvatarItems(db, ids) {
  if (ids.length === 0) return [];
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(", ");
  const { results } = await db.prepare(`SELECT * FROM custom_avatar_item WHERE custom_avatar_item_id IN (${placeholders})`).bind(...ids).all();
  const byId = new Map(results.map((r) => [r.custom_avatar_item_id, toDto(r)]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}
async function listFeaturedCustomAvatarItems(db, limit = 50) {
  const { results } = await db.prepare(
    `SELECT * FROM custom_avatar_item WHERE is_featured = 1 AND accessibility != 0
			 ORDER BY created_at DESC, custom_avatar_item_id LIMIT ?1`
  ).bind(limit).all();
  return results.map(toDto);
}
async function listHotCustomAvatarItems(db, limit = 50) {
  const { results } = await db.prepare(
    `SELECT * FROM custom_avatar_item WHERE accessibility != 0
			 ORDER BY created_at DESC, custom_avatar_item_id LIMIT ?1`
  ).bind(limit).all();
  return results.map(toDto);
}
const COACH_ACCOUNT_ID = 1;
const SEARCH_MAX_TAKE = 200;
async function searchCustomAvatarItems(db, search = {}) {
  const take = Math.min(Math.max(search.take ?? 50, 0), SEARCH_MAX_TAKE);
  const skip = Math.max(search.skip ?? 0, 0);
  if (take === 0) return [];
  const where = ["accessibility != 0"];
  const binds = [];
  const bind = (value) => `?${binds.push(value)}`;
  const needle = search.searchQuery?.trim() ?? "";
  if (needle !== "") {
    const escaped = needle.toLowerCase().replace(/[\\%_]/g, (ch) => `\\${ch}`);
    const pattern = bind(`%${escaped}%`);
    where.push(
      `(lower(name) LIKE ${pattern} ESCAPE '\\' OR lower(description) LIKE ${pattern} ESCAPE '\\')`
    );
  }
  const outfitTypes = search.outfitTypes ?? [];
  if (outfitTypes.length > 0) {
    where.push(`outfit_type IN (${outfitTypes.map((t) => bind(t)).join(", ")})`);
  }
  if (search.includeCoachItems === false) {
    where.push(`creator_account_id != ${bind(COACH_ACCOUNT_ID)}`);
  }
  if (search.minPrice !== void 0) where.push(`price >= ${bind(search.minPrice)}`);
  if (search.maxPrice !== void 0) where.push(`price <= ${bind(search.maxPrice)}`);
  const limit = bind(take);
  const offset = bind(skip);
  const { results } = await db.prepare(
    `SELECT * FROM custom_avatar_item WHERE ${where.join(" AND ")}
			 ORDER BY created_at DESC, custom_avatar_item_id
			 LIMIT ${limit} OFFSET ${offset}`
  ).bind(...binds).all();
  return results.map(toDto);
}
async function listCustomAvatarItemsByCreator(db, creatorAccountId, includeUnpublished = false) {
  const { results } = await db.prepare(
    `SELECT * FROM custom_avatar_item
			 WHERE creator_account_id = ?1 AND (accessibility != 0 OR ?2)
			 ORDER BY created_at DESC, custom_avatar_item_id`
  ).bind(creatorAccountId, includeUnpublished ? 1 : 0).all();
  const items = results.map(toDto);
  return { Results: items, TotalResults: items.length };
}
async function updateCustomAvatarItem(db, id, patch, now = /* @__PURE__ */ new Date()) {
  const row = await db.prepare(
    `UPDATE custom_avatar_item SET
				name = COALESCE(?2, name),
				description = COALESCE(?3, description),
				price = COALESCE(?4, price),
				accessibility = COALESCE(?5, accessibility),
				modified_at = ?6
			 WHERE custom_avatar_item_id = ?1
			 RETURNING *`
  ).bind(
    id,
    patch.name ?? null,
    patch.description ?? null,
    patch.price ?? null,
    patch.accessibility ?? null,
    now.toISOString()
  ).first();
  return row ? toDto(row) : null;
}
async function deleteCustomAvatarItem(db, id) {
  const row = await db.prepare("DELETE FROM custom_avatar_item WHERE custom_avatar_item_id = ?1 RETURNING *").bind(id).first();
  return row ? toDto(row) : null;
}
async function getCustomAvatarItem(db, id) {
  const row = await db.prepare("SELECT * FROM custom_avatar_item WHERE custom_avatar_item_id = ?1").bind(id).first();
  return row ? toDto(row) : null;
}
export {
  COACH_ACCOUNT_ID,
  SCHEMA_DDL,
  SEARCH_MAX_TAKE,
  UGC_ITEM_TYPE_CUSTOM_AVATAR_ITEM,
  createCustomAvatarItem,
  deleteCustomAvatarItem,
  getCustomAvatarItem,
  getCustomAvatarItems,
  listCustomAvatarItemsByCreator,
  listFeaturedCustomAvatarItems,
  listHotCustomAvatarItems,
  searchCustomAvatarItems,
  toUgcPurchasable,
  updateCustomAvatarItem
};
