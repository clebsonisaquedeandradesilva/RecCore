// Ported from apps/api/src/inventions-db.ts; TypeScript types erased; native runtime imports.
import { getInventionAcquisitionCounts, getOwnedInventionIds } from "../../../packages/domain/src/index.js";
const SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS invention (
		data TEXT NOT NULL,
		id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.InventionId')) VIRTUAL,
		creator_player_id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.CreatorPlayerId')) VIRTUAL,
		is_featured INTEGER GENERATED ALWAYS AS (json_extract(data, '$.IsFeatured')) VIRTUAL,
		is_published INTEGER GENERATED ALWAYS AS (json_extract(data, '$.IsPublished')) VIRTUAL,
		hide_from_player INTEGER GENERATED ALWAYS AS (json_extract(data, '$.HideFromPlayer')) VIRTUAL
	)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_invention_id ON invention (id)`,
  `CREATE INDEX IF NOT EXISTS idx_invention_creator ON invention (creator_player_id)`,
  `CREATE INDEX IF NOT EXISTS idx_invention_featured ON invention (is_featured)`,
  `CREATE TABLE IF NOT EXISTS invention_interaction (
		player_id INTEGER NOT NULL,
		invention_id INTEGER NOT NULL,
		cheered INTEGER NOT NULL DEFAULT 0,
		created_at TEXT,
		PRIMARY KEY (player_id, invention_id)
	)`,
  `CREATE INDEX IF NOT EXISTS idx_invention_interaction_invention
		ON invention_interaction (invention_id)`
];
const INVENTION_TAG_TYPE = {
  custom: 0,
  // user submitted
  unknown: 1,
  auto: 2
  // derived from the invention itself, e.g. `useonly` / `lowink`
};
function toSaveResult(invention) {
  return { Status: 0, Invention: invention, InventionVersion: invention.CurrentVersion };
}
const INVENTION_TAG_RESULT = {
  success: 0,
  rejected: 1
};
function toInventionV9(invention) {
  return {
    InventionId: invention.InventionId,
    ReplicationId: invention.ReplicationId,
    CreatorPlayerId: invention.CreatorPlayerId,
    Name: invention.Name,
    Description: invention.Description,
    ImageName: invention.ImageName,
    UgcVersion: invention.UgcVersion ?? 0,
    CurrentVersionNumber: invention.CurrentVersionNumber,
    // One save, one version: the newest is the current one.
    LatestVersionNumber: invention.CurrentVersionNumber,
    Accessibility: invention.Accessibility,
    ForceCannotPublish: false,
    ModifiedAt: invention.ModifiedAt,
    CreatedAt: invention.CreatedAt,
    FirstPublishedAt: invention.FirstPublishedAt,
    CreationRoomId: invention.CreationRoomId,
    NumPlayersHaveUsedInRoom: invention.NumPlayersHaveUsedInRoom,
    NumDownloads: invention.NumDownloads,
    CheerCount: invention.CheerCount,
    CreatorPermission: invention.CreatorPermission,
    GeneralPermission: invention.GeneralPermission,
    IsAGInvention: invention.IsAGInvention,
    IsCertifiedInvention: invention.IsCertifiedInvention,
    IsRecRoomApproved: false,
    AllowTrial: invention.AllowTrial,
    Price: invention.Price,
    HideFromPlayer: invention.HideFromPlayer,
    DisplayMetadataJson: invention.DisplayMetadataJson ?? null
  };
}
function toSaveResultV9(invention, tags, tagResult = INVENTION_TAG_RESULT.success) {
  const version = invention.CurrentVersion;
  return {
    Value: {
      Status: 0,
      Invention: toInventionV9(invention),
      InventionVersion: {
        InventionId: version.InventionId,
        ReplicationId: version.ReplicationId,
        VersionNumber: version.VersionNumber,
        HasBetaContent: version.HasBetaContent ?? false,
        InstantiationCost: version.InstantiationCost,
        LightsCost: version.LightsCost,
        ChipsCost: version.ChipsCost,
        CloudVariablesCost: version.CloudVariablesCost,
        BlobName: version.BlobName,
        BlobHash: version.BlobHash,
        // The version is minted with the invention, so they share a timestamp.
        CreatedAt: invention.CreatedAt,
        UgcAccessibility: null,
        ReferencedInventions: invention.ReferencedInventions,
        ReferencedUnityAssetIds: invention.ReferencedUnityAssetIds ?? []
      },
      TagsResponse: { Result: tagResult, Tags: tags.map((t) => t.Tag) }
    },
    Success: true,
    Error: null,
    error_id: null
  };
}
function inventionSaveV9Failure(message) {
  return { Value: null, Success: false, Error: message, error_id: null };
}
function inventionBlobName(filename) {
  return filename.toLowerCase().endsWith(".inv") ? filename : `${filename}.inv`;
}
function toBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}
async function inventionBlobHash(bucket, blobName) {
  const key = `invention/${inventionBlobName(blobName)}`;
  const head = await bucket.head(key);
  if (head === null) return null;
  const recorded = head.checksums.sha256;
  if (recorded !== void 0) return toBase64(recorded);
  const object = await bucket.get(key);
  return object === null ? null : toBase64(await crypto.subtle.digest("SHA-256", await object.arrayBuffer()));
}
async function createInvention(db, bucket, input) {
  const row = await db.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS next FROM invention").first();
  const inventionId = row?.next ?? 1;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const blobName = inventionBlobName(input.inventionDataFilename);
  const invention = {
    InventionId: inventionId,
    ReplicationId: crypto.randomUUID(),
    CreatorPlayerId: input.creatorPlayerId,
    Name: input.name?.trim() || "Untitled",
    Description: input.description?.trim() || "No description yet",
    ImageName: input.imageName ?? "",
    CurrentVersionNumber: 1,
    CurrentVersion: {
      InventionId: inventionId,
      ReplicationId: crypto.randomUUID(),
      VersionNumber: 1,
      BlobName: blobName,
      BlobHash: await inventionBlobHash(bucket, blobName),
      InstantiationCost: input.instantiationCost ?? 0,
      LightsCost: input.lightsCost ?? 0,
      ChipsCost: input.chipsCost ?? 0,
      CloudVariablesCost: input.cloudVariablesCost ?? 0,
      AICost: input.aiCost ?? 0,
      ...input.hasBetaContent === void 0 ? {} : { HasBetaContent: input.hasBetaContent }
    },
    Accessibility: 0,
    IsPublished: false,
    IsFeatured: false,
    ModifiedAt: now,
    CreatedAt: now,
    FirstPublishedAt: null,
    CreationRoomId: input.creationRoomId ?? 0,
    NumPlayersHaveUsedInRoom: 0,
    NumDownloads: 0,
    CheerCount: 0,
    CreatorPermission: INVENTION_PERMISSION.unlimited,
    GeneralPermission: INVENTION_PERMISSION.unlimited,
    IsAGInvention: false,
    IsCertifiedInvention: false,
    Price: 0,
    AllowTrial: true,
    HideFromPlayer: false,
    ReferencedInventions: input.referencedInventions ?? [],
    ...input.referencedUnityAssetIds === void 0 ? {} : { ReferencedUnityAssetIds: input.referencedUnityAssetIds },
    ...input.ugcVersion === void 0 ? {} : { UgcVersion: input.ugcVersion },
    ...input.longDescription ? { LongDescription: input.longDescription } : {},
    ...input.displayMetadataJson ? { DisplayMetadataJson: input.displayMetadataJson } : {},
    ...typeof input.convertedFromInventionId === "number" ? { ConvertedFromInventionId: input.convertedFromInventionId } : {},
    ...input.tags?.length ? { Tags: input.tags } : {}
  };
  await db.prepare("INSERT INTO invention (data) VALUES (?1)").bind(JSON.stringify(invention)).run();
  return invention;
}
async function getInventionsByCreator(db, creatorPlayerId) {
  const { results } = await db.prepare("SELECT data FROM invention WHERE creator_player_id = ?1").bind(creatorPlayerId).all();
  return results.map((r) => JSON.parse(r.data)).sort((a, b) => b.CreatedAt.localeCompare(a.CreatedAt) || b.InventionId - a.InventionId);
}
async function getMyInventions(db, playerId) {
  const [created, ownedIds] = await Promise.all([
    getInventionsByCreator(db, playerId),
    getOwnedInventionIds(db, playerId)
  ]);
  const bought = await getInventionsByIds(db, ownedIds);
  const byId = /* @__PURE__ */ new Map();
  for (const invention of [...created, ...bought]) byId.set(invention.InventionId, invention);
  return [...byId.values()].sort(
    (a, b) => b.CreatedAt.localeCompare(a.CreatedAt) || b.InventionId - a.InventionId
  );
}
async function ownsAllInventions(db, playerId, inventionIds) {
  if (inventionIds.length === 0) return true;
  const unique = [...new Set(inventionIds)];
  const [inventions, ownedIds] = await Promise.all([
    getInventionsByIds(db, unique),
    getOwnedInventionIds(db, playerId)
  ]);
  const bought = new Set(ownedIds);
  const creators = new Map(inventions.map((i) => [i.InventionId, i.CreatorPlayerId]));
  return unique.every((id) => creators.get(id) === playerId || creators.has(id) && bought.has(id));
}
async function searchInventions(db, value, skip, take) {
  const limit = Math.max(take, 0);
  const offset = Math.max(skip, 0);
  if (limit === 0) return [];
  const where = [...VISIBLE_IN_FEEDS];
  const binds = [];
  const bind = (v) => `?${binds.push(v)}`;
  for (const term of value.trim().toLowerCase().split(/[\s+]+/).filter(Boolean)) {
    const escaped = term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    const pattern = bind(`%${escaped}%`);
    where.push(
      `(lower(json_extract(data, '$.Name')) LIKE ${pattern} ESCAPE '\\' OR lower(json_extract(data, '$.Description')) LIKE ${pattern} ESCAPE '\\')`
    );
  }
  const limitAt = bind(limit);
  const offsetAt = bind(offset);
  const { results } = await db.prepare(
    `SELECT data FROM invention WHERE ${where.join(" AND ")}
			 ORDER BY json_extract(data, '$.CreatedAt') DESC, id DESC
			 LIMIT ${limitAt} OFFSET ${offsetAt}`
  ).bind(...binds).all();
  return results.map((r) => JSON.parse(r.data));
}
async function publicInventions(db, featuredOnly = false) {
  const { results } = await db.prepare(
    `SELECT data FROM invention
			 WHERE ${VISIBLE_IN_FEEDS.join(" AND ")}
			   ${featuredOnly ? "AND is_featured = 1" : ""}`
  ).all();
  return results.map((r) => JSON.parse(r.data));
}
const TOP_TODAY_WINDOW_MS = 24 * 60 * 60 * 1e3;
function startOfWindow() {
  return new Date(Date.now() - TOP_TODAY_WINDOW_MS).toISOString();
}
async function getTopInventions(db, skip, take) {
  const counts = await getInventionAcquisitionCounts(db, startOfWindow());
  if (counts.length === 0) return [];
  const ranked = await getInventionsByIds(
    db,
    counts.map((c) => c.inventionId)
  );
  return ranked.filter((i) => i.IsPublished && !i.HideFromPlayer).slice(skip, skip + take);
}
async function getFeaturedInventions(db, skip, take) {
  const featured = await publicInventions(db, true);
  return featured.sort((a, b) => b.CreatedAt.localeCompare(a.CreatedAt) || b.InventionId - a.InventionId).slice(skip, skip + take);
}
async function setInventionTags(db, inventionId, autoTags, customTags) {
  const invention = await getInventionById(db, inventionId);
  if (invention === null) return null;
  const tags = normalizeInventionTags(autoTags, customTags);
  await writeInvention(db, { ...invention, Tags: tags });
  return tags;
}
function normalizeInventionTags(autoTags, customTags) {
  const tags = [];
  const seen = /* @__PURE__ */ new Set();
  for (const [list, type] of [
    [autoTags, INVENTION_TAG_TYPE.auto],
    [customTags, INVENTION_TAG_TYPE.custom]
  ]) {
    for (const raw of list) {
      const tag = raw.trim().toLowerCase();
      if (tag === "" || seen.has(tag)) continue;
      seen.add(tag);
      tags.push({ Tag: tag, Type: type });
    }
  }
  return tags;
}
const INVENTION_PERMISSION = {
  unassigned: 0,
  limitedoneuseonly: 10,
  // Recovered from the client's own ladder; nothing here sends it, and no name for it
  // appears in `v1/update`'s picker.
  disallowkeylock: 15,
  useonly: 20,
  editandsave: 40,
  publish: 60,
  charge: 80,
  unlimited: 100
};
const INVENTION_ACCESSIBILITY = {
  private: 0,
  public: 1,
  unlisted: 2
};
const VISIBLE_IN_FEEDS = [
  "is_published = 1",
  "hide_from_player = 0",
  `COALESCE(json_extract(data, '$.Accessibility'), 0) <> ${INVENTION_ACCESSIBILITY.unlisted}`
];
function parsePermissionLevel(value) {
  const key = value.trim().toLowerCase().replace(/_/g, "");
  if (key in INVENTION_PERMISSION) {
    return INVENTION_PERMISSION[key];
  }
  const numeric = Number.parseInt(value.trim(), 10);
  return Number.isNaN(numeric) ? void 0 : numeric;
}
async function updateInvention(db, inventionId, patch) {
  const invention = await getInventionById(db, inventionId);
  if (invention === null) return null;
  const updated = {
    ...invention,
    Name: patch.name ?? invention.Name,
    Description: patch.description ?? invention.Description,
    ImageName: patch.imageName ?? invention.ImageName,
    AllowTrial: patch.allowTrial ?? invention.AllowTrial,
    GeneralPermission: patch.generalPermission ?? invention.GeneralPermission,
    // Both of these are optional ON the record, so an untouched one resolves to
    // undefined and JSON.stringify drops the key — an invention that never had a long
    // description doesn't acquire an empty one by being edited.
    LongDescription: patch.longDescription ?? invention.LongDescription,
    Tags: patch.tags ?? invention.Tags
  };
  await writeInvention(db, updated);
  return updated;
}
async function publishInvention(db, inventionId, publish = {}) {
  const invention = await getInventionById(db, inventionId);
  if (invention === null) return null;
  const updated = {
    ...invention,
    IsPublished: true,
    GeneralPermission: publish.permissionLevel ?? INVENTION_PERMISSION.useonly,
    Accessibility: publish.accessibility ?? invention.Accessibility,
    // An unmentioned price is the price it already has, not zero: a republish that says
    // nothing about money must not quietly give away something that was for sale. A
    // first publish is unaffected — a fresh invention's price is 0 either way.
    Price: publish.price ?? invention.Price,
    // The FIRST publish is the one that gets dated; re-publishing doesn't reset it.
    FirstPublishedAt: invention.FirstPublishedAt ?? (/* @__PURE__ */ new Date()).toISOString()
  };
  await writeInvention(db, updated);
  return updated;
}
async function setInventionPrice(db, inventionId, price) {
  const invention = await getInventionById(db, inventionId);
  if (invention === null) return null;
  const updated = { ...invention, Price: price };
  await writeInvention(db, updated);
  return updated;
}
async function deleteInvention(db, inventionId) {
  const invention = await getInventionById(db, inventionId);
  if (invention === null) return null;
  await db.batch([
    db.prepare("DELETE FROM invention WHERE id = ?1").bind(inventionId),
    db.prepare("DELETE FROM invention_interaction WHERE invention_id = ?1").bind(inventionId)
  ]);
  return invention;
}
async function setInventionCheer(db, playerId, inventionId, cheer) {
  await db.prepare(
    `INSERT INTO invention_interaction (player_id, invention_id, cheered, created_at)
			 VALUES (?1, ?2, ?3, ?4)
			 ON CONFLICT(player_id, invention_id) DO UPDATE SET cheered = ?3`
  ).bind(playerId, inventionId, cheer ? 1 : 0, (/* @__PURE__ */ new Date()).toISOString()).run();
  const row = await db.prepare(
    "SELECT COUNT(*) AS n FROM invention_interaction WHERE invention_id = ?1 AND cheered = 1"
  ).bind(inventionId).first();
  const count = row?.n ?? 0;
  await db.prepare(
    "UPDATE invention SET data = json_set(data, '$.CheerCount', CAST(?2 AS INTEGER)) WHERE id = ?1"
  ).bind(inventionId, count).run();
  return count;
}
async function isInventionCheered(db, playerId, inventionId) {
  const row = await db.prepare(
    `SELECT 1 AS found FROM invention_interaction
			 WHERE player_id = ?1 AND invention_id = ?2 AND cheered = 1`
  ).bind(playerId, inventionId).first();
  return row !== null;
}
function inventionDeleteResult(error = null) {
  return { Value: null, Success: error === null, Error: error, error_id: null };
}
async function getInventionTagFilters(db) {
  const counts = /* @__PURE__ */ new Map();
  for (const invention of await publicInventions(db)) {
    for (const tag of invention.Tags ?? []) {
      counts.set(tag.Tag, (counts.get(tag.Tag) ?? 0) + 1);
    }
  }
  const popular = [...counts.entries()].sort(([tagA, countA], [tagB, countB]) => countB - countA || tagA.localeCompare(tagB)).slice(0, 20).map(([tag]) => tag);
  return {
    PinnedFilters: popular.slice(0, 5),
    PopularFilters: popular,
    TrendingFilters: null
  };
}
async function getInventionsByIds(db, inventionIds) {
  if (inventionIds.length === 0) return [];
  const placeholders = inventionIds.map((_, i) => `?${i + 1}`).join(", ");
  const { results } = await db.prepare(`SELECT data FROM invention WHERE id IN (${placeholders})`).bind(...inventionIds).all();
  const byId = /* @__PURE__ */ new Map();
  for (const row of results) {
    const invention = JSON.parse(row.data);
    byId.set(invention.InventionId, invention);
  }
  return inventionIds.map((id) => byId.get(id)).filter((i) => i !== void 0);
}
async function getInventionsByRoom(db, roomId, skip, take) {
  const { results } = await db.prepare(
    `SELECT data FROM invention
			 WHERE json_extract(data, '$.CreationRoomId') = ?1
			   AND ${VISIBLE_IN_FEEDS.join(" AND ")}`
  ).bind(roomId).all();
  return results.map((r) => JSON.parse(r.data)).sort((a, b) => b.CreatedAt.localeCompare(a.CreatedAt) || b.InventionId - a.InventionId).slice(skip, skip + take);
}
const CURRENT_INVENTION_VERSION = 0;
async function getInventionVersion(db, bucket, inventionId, versionNumber) {
  const invention = await getInventionById(db, inventionId);
  if (invention === null) return null;
  if (versionNumber !== CURRENT_INVENTION_VERSION && invention.CurrentVersionNumber !== versionNumber) {
    return null;
  }
  if (invention.CurrentVersion.BlobHash === null) {
    const hash = await inventionBlobHash(bucket, invention.CurrentVersion.BlobName);
    if (hash !== null) {
      invention.CurrentVersion = { ...invention.CurrentVersion, BlobHash: hash };
      await storeInvention(db, invention);
    }
  }
  return invention.CurrentVersion;
}
async function writeInvention(db, invention) {
  await storeInvention(db, { ...invention, ModifiedAt: (/* @__PURE__ */ new Date()).toISOString() });
}
async function storeInvention(db, invention) {
  await db.prepare("UPDATE invention SET data = ?1 WHERE id = ?2").bind(JSON.stringify(invention), invention.InventionId).run();
}
async function getInventionTags(db, inventionId) {
  const invention = await getInventionById(db, inventionId);
  return invention === null ? null : invention.Tags ?? [];
}
async function getInventionById(db, inventionId) {
  const row = await db.prepare("SELECT data FROM invention WHERE id = ?1").bind(inventionId).first();
  return row ? JSON.parse(row.data) : null;
}
export {
  INVENTION_ACCESSIBILITY,
  INVENTION_PERMISSION,
  INVENTION_TAG_RESULT,
  INVENTION_TAG_TYPE,
  SCHEMA_DDL,
  createInvention,
  deleteInvention,
  getFeaturedInventions,
  getInventionById,
  getInventionTagFilters,
  getInventionTags,
  getInventionVersion,
  getInventionsByCreator,
  getInventionsByIds,
  getInventionsByRoom,
  getMyInventions,
  getTopInventions,
  inventionBlobHash,
  inventionDeleteResult,
  inventionSaveV9Failure,
  isInventionCheered,
  normalizeInventionTags,
  ownsAllInventions,
  parsePermissionLevel,
  publishInvention,
  searchInventions,
  setInventionCheer,
  setInventionPrice,
  setInventionTags,
  toInventionV9,
  toSaveResult,
  toSaveResultV9,
  updateInvention
};
