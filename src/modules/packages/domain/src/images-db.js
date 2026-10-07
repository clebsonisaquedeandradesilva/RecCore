// Ported from packages/domain/src/images-db.ts; TypeScript types erased; native runtime imports.
const IMAGE_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS image (
		data TEXT NOT NULL,
		id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.Id')) VIRTUAL,
		image_name TEXT GENERATED ALWAYS AS (json_extract(data, '$.ImageName')) VIRTUAL,
		player_id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.PlayerId')) VIRTUAL,
		room_id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.RoomId')) VIRTUAL
	)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_image_id ON image (id)`,
  `CREATE INDEX IF NOT EXISTS idx_image_image_name ON image (image_name)`,
  `CREATE INDEX IF NOT EXISTS idx_image_player_id ON image (player_id)`,
  `CREATE INDEX IF NOT EXISTS idx_image_room_id ON image (room_id)`,
  // A player's interaction with a saved image — one row per (player, image). Only
  // `cheered` for now; named generically so other per-user interactions (e.g.
  // favorited) can be added as columns. The `api` worker writes it (cheer endpoints)
  // and keeps the image's denormalized `CheerCount` in sync from it.
  `CREATE TABLE IF NOT EXISTS image_interaction (
		player_id INTEGER NOT NULL,
		saved_image_id INTEGER NOT NULL,
		cheered INTEGER NOT NULL DEFAULT 0,
		created_at TEXT,
		PRIMARY KEY (player_id, saved_image_id)
	)`,
  `CREATE INDEX IF NOT EXISTS idx_image_interaction_image ON image_interaction (saved_image_id)`
];
const SavedImageType = {
  None: 0,
  ShareCamera: 1,
  OutfitThumbnail: 2,
  RoomThumbnail: 3,
  ProfileThumbnail: 4,
  InventionThumbnail: 5
};
const placeholders = (n) => Array.from({ length: n }, (_, i) => `?${i + 1}`).join(",");
async function createImage(db, input) {
  const row = await db.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS next FROM image").first();
  const image = {
    Id: row?.next ?? 1,
    Type: input.type ?? 1,
    Accessibility: input.accessibility ?? 1,
    AccessibilityLocked: false,
    ImageName: input.imageName,
    Description: input.description ?? null,
    PlayerId: input.playerId,
    TaggedPlayerIds: input.taggedPlayerIds ?? [],
    RoomId: input.roomId ?? null,
    PlayerEventId: input.playerEventId ?? null,
    CreatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    CheerCount: 0,
    CommentCount: 0
  };
  await db.prepare("INSERT INTO image (data) VALUES (?1)").bind(JSON.stringify(image)).run();
  return image;
}
async function syncImageCheerCount(db, savedImageId) {
  const row = await db.prepare(
    "SELECT COUNT(*) AS n FROM image_interaction WHERE saved_image_id = ?1 AND cheered = 1"
  ).bind(savedImageId).first();
  const count = row?.n ?? 0;
  await db.prepare(
    "UPDATE image SET data = json_set(data, '$.CheerCount', CAST(?2 AS INTEGER)) WHERE id = ?1"
  ).bind(savedImageId, count).run();
  return count;
}
async function setImageCheer(db, playerId, savedImageId, cheer) {
  await db.prepare(
    `INSERT INTO image_interaction (player_id, saved_image_id, cheered, created_at)
			 VALUES (?1, ?2, ?3, ?4)
			 ON CONFLICT(player_id, saved_image_id) DO UPDATE SET cheered = ?3`
  ).bind(playerId, savedImageId, cheer ? 1 : 0, (/* @__PURE__ */ new Date()).toISOString()).run();
  await syncImageCheerCount(db, savedImageId);
}
const CHEER_ID_LIMIT = 99;
async function getCheeredImageIds(db, playerId, ids) {
  const cheered = /* @__PURE__ */ new Set();
  for (let i = 0; i < ids.length; i += CHEER_ID_LIMIT) {
    const page = ids.slice(i, i + CHEER_ID_LIMIT);
    const inList = page.map((_, n) => `?${n + 2}`).join(",");
    const { results } = await db.prepare(
      `SELECT saved_image_id AS id FROM image_interaction
			 WHERE player_id = ?1 AND cheered = 1 AND saved_image_id IN (${inList})`
    ).bind(playerId, ...page).all();
    for (const row of results) cheered.add(row.id);
  }
  return cheered;
}
async function getImageByName(db, name) {
  const row = await db.prepare("SELECT data FROM image WHERE image_name = ?1").bind(name).first();
  return row ? JSON.parse(row.data) : null;
}
async function getSavedImagesByNames(db, names) {
  if (names.length === 0) return /* @__PURE__ */ new Map();
  const { results } = await db.prepare(`SELECT data FROM image WHERE image_name IN (${placeholders(names.length)})`).bind(...names).all();
  return new Map(
    results.map((r) => {
      const image = JSON.parse(r.data);
      return [image.ImageName, image];
    })
  );
}
const IMAGE_ID_LIMIT = 100;
async function getImagesByIds(db, ids) {
  if (ids.length === 0) return [];
  const found = /* @__PURE__ */ new Map();
  for (let i = 0; i < ids.length; i += IMAGE_ID_LIMIT) {
    const page = ids.slice(i, i + IMAGE_ID_LIMIT);
    const { results } = await db.prepare(`SELECT data FROM image WHERE id IN (${placeholders(page.length)})`).bind(...page).all();
    for (const row of results) {
      const image = JSON.parse(row.data);
      if (image.Accessibility === 1) found.set(image.Id, image);
    }
  }
  return ids.map((id) => found.get(id)).filter((image) => image !== void 0);
}
function placeholderSavedImage(imageName) {
  return {
    Id: 0,
    Type: 1,
    Accessibility: 1,
    AccessibilityLocked: false,
    ImageName: imageName,
    Description: null,
    PlayerId: 0,
    TaggedPlayerIds: [],
    RoomId: null,
    PlayerEventId: null,
    CreatedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
    CheerCount: 0,
    CommentCount: 0
  };
}
async function deleteImage(db, image) {
  await db.batch([
    db.prepare("DELETE FROM image WHERE image_name = ?1").bind(image.ImageName),
    db.prepare("DELETE FROM image_interaction WHERE saved_image_id = ?1").bind(image.Id)
  ]);
}
async function getImagesByRoom(db, roomId, sort, filter, skip, take) {
  const { results } = await db.prepare("SELECT data FROM image WHERE room_id = ?1").bind(roomId).all();
  let images = results.map((r) => JSON.parse(r.data)).filter((img) => img.Accessibility === 1);
  if (filter > 0) images = images.filter((img) => img.Type === filter);
  images.sort(sort === 1 ? (a, b) => b.CheerCount - a.CheerCount || newestFirst(a, b) : newestFirst);
  return images.slice(skip, skip + take);
}
const newestFirst = (a, b) => b.CreatedAt.localeCompare(a.CreatedAt) || b.Id - a.Id;
async function getImagesByPlayer(db, playerId, sort, skip, take) {
  const { results } = await db.prepare("SELECT data FROM image WHERE player_id = ?1").bind(playerId).all();
  return results.map((r) => JSON.parse(r.data)).filter((img) => img.Accessibility === 1).sort(sort === 1 ? (a, b) => b.CheerCount - a.CheerCount || newestFirst(a, b) : newestFirst).slice(skip, skip + take);
}
function toImageMetadata(img) {
  return {
    SavedImageId: img.Id,
    ImageName: img.ImageName,
    PlayerId: img.PlayerId,
    // Null means "not taken in a room" / "no event"; the client's DTO has no null to put
    // there, and 0 is the id it treats as none.
    RoomId: img.RoomId ?? 0,
    PlayerEventId: img.PlayerEventId ?? 0,
    ClubId: 0,
    Description: img.Description ?? "",
    Accessibility: img.Accessibility,
    AccessibilityLocked: img.AccessibilityLocked,
    SavedImageType: img.Type,
    CreatedAt: img.CreatedAt,
    CheerCount: img.CheerCount,
    CommentCount: img.CommentCount
  };
}
function toImagesPlayer(img) {
  return {
    Accessibility: img.Accessibility,
    AccessibilityLocked: img.AccessibilityLocked,
    CheerCount: img.CheerCount,
    CommentCount: img.CommentCount,
    CreatedAt: img.CreatedAt,
    Description: img.Description,
    ImageName: img.ImageName,
    PlayerEventId: img.PlayerEventId,
    PlayerId: img.PlayerId,
    RoomId: img.RoomId,
    SavedImageId: img.Id,
    SavedImageType: img.Type
  };
}
const SLIDESHOW_LIMIT = 10;
const SLIDESHOW_MAX_LIMIT = 100;
async function getUsernames(db, ids) {
  if (ids.length === 0) return /* @__PURE__ */ new Map();
  const { results } = await db.prepare(
    `SELECT account_id AS id, json_extract(data, '$.username') AS username
			 FROM account WHERE account_id IN (${placeholders(ids.length)})`
  ).bind(...ids).all();
  return new Map(results.map((r) => [r.id, r.username]));
}
async function getRoomNames(db, ids) {
  if (ids.length === 0) return /* @__PURE__ */ new Map();
  const { results } = await db.prepare(
    `SELECT room_id AS id, json_extract(data, '$.Name') AS name
			 FROM room WHERE room_id IN (${placeholders(ids.length)})`
  ).bind(...ids).all();
  return new Map(results.map((r) => [r.id, r.name]));
}
async function getSlideshowImages(db, limit = SLIDESHOW_LIMIT) {
  const { results } = await db.prepare(
    `SELECT data FROM image
			 WHERE json_extract(data, '$.Accessibility') IN (0, 1)
			   AND json_extract(data, '$.Type') = ?1
			 ORDER BY id DESC LIMIT ?2`
  ).bind(SavedImageType.ShareCamera, limit).all();
  const images = results.map((r) => JSON.parse(r.data));
  const roomIds = [...new Set(images.map((i) => i.RoomId).filter((v) => v != null))];
  const usernames = await getUsernames(db, [...new Set(images.map((i) => i.PlayerId))]);
  const roomNames = await getRoomNames(db, roomIds);
  return images.map((img) => ({
    SavedImageId: img.Id,
    ImageName: img.ImageName,
    // Fall back to the synthesized "Player<id>" name for accounts not in the table.
    Username: usernames.get(img.PlayerId) ?? `Player${img.PlayerId}`,
    RoomName: img.RoomId != null ? roomNames.get(img.RoomId) ?? null : null,
    RoomId: img.RoomId,
    SavedImageType: img.Type,
    PlayerEventId: img.PlayerEventId,
    Accessibility: img.Accessibility,
    PlayerIds: img.TaggedPlayerIds
  }));
}
async function getPlayerFeed(db, playerId, skip, take) {
  const { results } = await db.prepare(
    `SELECT data FROM image
			 WHERE player_id = ?1
			    OR EXISTS (SELECT 1 FROM json_each(image.data, '$.TaggedPlayerIds') WHERE value = ?1)`
  ).bind(playerId).all();
  return results.map((r) => JSON.parse(r.data)).filter((img) => img.Accessibility === 1).sort(newestFirst).slice(skip, skip + take);
}
export {
  IMAGE_SCHEMA_DDL,
  SLIDESHOW_LIMIT,
  SLIDESHOW_MAX_LIMIT,
  SavedImageType,
  createImage,
  deleteImage,
  getCheeredImageIds,
  getImageByName,
  getImagesByIds,
  getImagesByPlayer,
  getImagesByRoom,
  getPlayerFeed,
  getSavedImagesByNames,
  getSlideshowImages,
  placeholderSavedImage,
  setImageCheer,
  toImageMetadata,
  toImagesPlayer
};
