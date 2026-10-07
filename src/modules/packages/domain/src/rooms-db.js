// Ported from packages/domain/src/rooms-db.ts; TypeScript types erased; native runtime imports.
import { Accessibility, Role } from "./enums.js";
import { countPlayersByRoom } from "./presence-db.js";
const ROOM_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS room (
		data TEXT NOT NULL,
		room_id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.RoomId')) VIRTUAL,
		name TEXT GENERATED ALWAYS AS (json_extract(data, '$.Name')) VIRTUAL,
		name_lower TEXT GENERATED ALWAYS AS (lower(json_extract(data, '$.Name'))) VIRTUAL,
		creator_account_id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.CreatorAccountId')) VIRTUAL,
		is_dorm INTEGER GENERATED ALWAYS AS (json_extract(data, '$.IsDorm')) VIRTUAL,
		-- Lifetime visit counter (migrations/0011_room_visits.sql, which appends it here):
		-- bumped once per successful matchmake into the room by {@link recordRoomVisit},
		-- and served as the room's \`Stats.VisitCount\`. A real column rather than a field
		-- in the blob so a visit is one atomic UPDATE that can't lose a concurrent
		-- read-modify-write of the whole room.
		visits INTEGER NOT NULL DEFAULT 0,
		-- The two flags every public feed filters on, alongside \`is_dorm\`
		-- (migrations/0014_room_listable.sql, which appends them here). Generated like the
		-- rest so the blob stays the only copy; they exist to be INDEXED \u2014 see
		-- {@link LISTABLE_WHERE}.
		accessibility INTEGER GENERATED ALWAYS AS (json_extract(data, '$.Accessibility')) VIRTUAL,
		exclude_from_lists INTEGER GENERATED ALWAYS AS (json_extract(data, '$.ExcludeFromLists')) VIRTUAL
	)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_room_id ON room (room_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rooms_name_lower ON room (name_lower)`,
  `CREATE INDEX IF NOT EXISTS idx_rooms_creator ON room (creator_account_id)`,
  // PARTIAL index over the public, non-dorm rooms — the only rooms any feed can serve,
  // and a small minority of the table (most rooms are dorms, one per account). Scanning
  // it visits those rooms alone instead of every room in the database; see
  // {@link LISTABLE_WHERE} for why the feeds select on it.
  //
  // Indexed on `room_id` because a partial index needs some column to key on and the
  // feeds all order by it eventually; the WHERE clause is the point, not the key.
  `CREATE INDEX IF NOT EXISTS idx_room_public ON room (room_id)
	 WHERE is_dorm IS NOT 1 AND accessibility = 1`,
  // A room's tags, one row per tag (migrations/0013_room_tag.sql). Modelled on the
  // `api` worker's `event_tag`, and the table is AUTHORITATIVE: `serializeRoom` strips
  // `Tags` from the blob and the reads re-attach it, the same arrangement `subroom` and
  // `subroom_save` already use, so the two can't drift.
  //
  // `tag` is stored lowercased and is the lookup key, which is what lets a tag-filtered
  // feed (a discovery category row, a `#tag` search) select in SQL instead of parsing
  // every room blob to ask. `type` is the client's tag-category int — 0 user, 2 the
  // auto-derived ones like `rro` — echoed back as stored.
  //
  // `is_primary_genre` (migrations/0015_room_tag_primary_genre.sql) flags the ONE tag
  // that is the room's genre, which the 2025 client sets with `primaryGenreTag=` and
  // draws differently from the rest. It is orthogonal to `type`: the flagged tag is
  // still an ordinary Type 0 user tag, and a room carries other tags alongside it.
  `CREATE TABLE IF NOT EXISTS room_tag (
		room_id INTEGER NOT NULL,
		tag TEXT NOT NULL,
		type INTEGER NOT NULL DEFAULT 0,
		is_primary_genre INTEGER NOT NULL DEFAULT 0,
		PRIMARY KEY (room_id, tag)
	)`,
  `CREATE INDEX IF NOT EXISTS idx_room_tag_tag ON room_tag (tag)`,
  // Per-player interaction state with a room (cheered/favorited + last visit).
  // One row per (player, room); cheer/favorite are toggled in place.
  `CREATE TABLE IF NOT EXISTS interaction (
		player_id INTEGER NOT NULL,
		room_id INTEGER NOT NULL,
		cheered INTEGER NOT NULL DEFAULT 0,
		favorited INTEGER NOT NULL DEFAULT 0,
		last_visited_at TEXT,
		PRIMARY KEY (player_id, room_id)
	)`,
  // Per-room player bans (migrations/0010_room_ban.sql). One row per (room, player),
  // so re-banning someone already banned updates their row rather than appending.
  // `ban_mask` is the client's `banMask` field kept verbatim — its meaning isn't known
  // yet (the client sends 0), so nothing interprets it.
  //
  // Deliberately NOT in the room's `data` blob: that blob is served to the client
  // verbatim as the room, and a ban list is not something every reader of a room
  // should receive.
  `CREATE TABLE IF NOT EXISTS room_ban (
		room_id INTEGER NOT NULL,
		banned_player_id INTEGER NOT NULL,
		ban_mask INTEGER NOT NULL DEFAULT 0,
		banned_by_account_id INTEGER NOT NULL,
		created_at TEXT NOT NULL,
		PRIMARY KEY (room_id, banned_player_id)
	)`,
  `CREATE INDEX IF NOT EXISTS idx_room_ban_player ON room_ban (banned_player_id)`,
  // Per-room leaderboard definitions (migrations/0016_room_leaderboard.sql). One row per
  // (room, leaderboard): `leaderboard_id` is the client's slot number — small ordinals
  // (1, 2, 3…), unique only within the room — so the pair is the key, and re-posting a
  // slot reconfigures it in place rather than appending.
  //
  // Deliberately NOT in the room's `data` blob, same reasoning as `room_ban`: the blob is
  // served verbatim as the room and the client doesn't read leaderboards off it.
  `CREATE TABLE IF NOT EXISTS room_leaderboard (
		room_id INTEGER NOT NULL,
		leaderboard_id INTEGER NOT NULL,
		leaderboard_title TEXT NOT NULL,
		stat_format INTEGER NOT NULL DEFAULT 0,
		sort_ascending INTEGER NOT NULL DEFAULT 0,
		PRIMARY KEY (room_id, leaderboard_id)
	)`
];
const SUBROOM_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS subroom (
		sub_room_id INTEGER PRIMARY KEY AUTOINCREMENT,
		room_id INTEGER NOT NULL,
		data TEXT NOT NULL,
		current_save_id INTEGER,
		staged_save_id INTEGER
	)`,
  `CREATE INDEX IF NOT EXISTS idx_subroom_room ON subroom (room_id)`,
  // Room saves (migrations/0008_subroom_saves.sql). A save is its own entity with a
  // globally-unique, autoincrementing `SubRoomDataSaveId` — the same reason subrooms got
  // their own table in 0007. It HAS to be global because a subroom points at saves by
  // bare id: `current_save_id` is the live/published save the loader downloads,
  // `staged_save_id` the creator's unpublished one. Per-subroom numbering would make
  // every subroom's first save id 1 and those pointers ambiguous.
  //
  // `data` holds the save's client shape minus its two id fields; the columns are
  // authoritative and are re-injected on read, exactly how `subroom` treats its own ids.
  // A subroom's `CurrentSave` is inlined from `current_save_id` on every read and is
  // never stored in the subroom blob.
  //
  // Part of this DDL rather than its own export: reading a subroom joins this table, so
  // applying one without the other yields a schema that can't serve a room.
  `CREATE TABLE IF NOT EXISTS subroom_save (
		sub_room_data_save_id INTEGER PRIMARY KEY AUTOINCREMENT,
		sub_room_id INTEGER NOT NULL,
		data TEXT NOT NULL
	)`,
  `CREATE INDEX IF NOT EXISTS idx_subroom_save_sub ON subroom_save (sub_room_id)`,
  // Per-subroom permission overrides (migrations/0009_subroom_permissions.sql). The room
  // owner's permission table for one subroom, keyed by (permission, role) — that pair is
  // what the client's PUT addresses, and re-sending it overwrites the stored row rather
  // than appending a second one.
  //
  // A row IS an override, which is why the client's `Override` flag is not a column: it's
  // the checkbox next to the permission, so clearing it deletes the row and the pair falls
  // back to its default. `value` is the client's string, stored verbatim.
  //
  // Deliberately NOT in the subroom's `data` blob: that blob is served to the client
  // verbatim as part of the room, and these overrides are read on one path only
  // (`GET /photon_access_token`, where they overwrite the matching default entries).
  `CREATE TABLE IF NOT EXISTS subroom_permission (
		sub_room_id INTEGER NOT NULL,
		permission TEXT NOT NULL,
		role INTEGER NOT NULL,
		type INTEGER NOT NULL DEFAULT 0,
		value TEXT NOT NULL,
		PRIMARY KEY (sub_room_id, permission, role)
	)`
];
function roomRoles(room) {
  const roles = Array.isArray(room.Roles) ? room.Roles : [];
  return roles.map((r) => ({
    AccountId: Number(r.AccountId ?? 0),
    Role: Number(r.Role ?? Role.None),
    LastChangedByAccountId: r.LastChangedByAccountId ?? null,
    InvitedRole: Number(r.InvitedRole ?? Role.None)
  }));
}
const MANAGE_ROLES = /* @__PURE__ */ new Set([Role.Creator, Role.CoOwner]);
function canManageRoom(room, accountId) {
  if (room.CreatorAccountId === accountId) return true;
  return roomRoles(room).some((r) => r.AccountId === accountId && MANAGE_ROLES.has(r.Role));
}
function canModerateRoom(room, accountId) {
  if (room.CreatorAccountId === accountId) return true;
  return roomRoles(room).some((r) => r.AccountId === accountId && r.Role >= Role.Moderator);
}
function isRoomOwner(room, accountId) {
  if (room.CreatorAccountId === accountId) return true;
  return roomRoles(room).some((r) => r.AccountId === accountId && r.Role === Role.Creator);
}
const toRoomBan = (row) => ({
  RoomId: row.room_id,
  BannedPlayerId: row.banned_player_id,
  BanMask: row.ban_mask,
  BannedByAccountId: row.banned_by_account_id,
  CreatedAt: row.created_at
});
async function banPlayerFromRoom(db, roomId, bannedPlayerId, banMask, bannedByAccountId) {
  const row = await db.prepare(
    `INSERT INTO room_ban (room_id, banned_player_id, ban_mask, banned_by_account_id, created_at)
			 VALUES (?1, ?2, ?3, ?4, ?5)
			 ON CONFLICT(room_id, banned_player_id) DO UPDATE SET
				 ban_mask = ?3, banned_by_account_id = ?4, created_at = ?5
			 RETURNING *`
  ).bind(roomId, bannedPlayerId, banMask, bannedByAccountId, (/* @__PURE__ */ new Date()).toISOString()).first();
  return toRoomBan(row);
}
async function unbanPlayerFromRoom(db, roomId, bannedPlayerId) {
  const row = await db.prepare("DELETE FROM room_ban WHERE room_id = ?1 AND banned_player_id = ?2 RETURNING *").bind(roomId, bannedPlayerId).first();
  return row ? toRoomBan(row) : null;
}
async function getRoomBans(db, roomId) {
  const { results } = await db.prepare("SELECT * FROM room_ban WHERE room_id = ?1 ORDER BY created_at DESC").bind(roomId).all();
  return results.map(toRoomBan);
}
async function isPlayerBannedFromRoom(db, roomId, playerId) {
  const row = await db.prepare("SELECT 1 AS hit FROM room_ban WHERE room_id = ?1 AND banned_player_id = ?2").bind(roomId, playerId).first();
  return row !== null;
}
const toRoomLeaderboard = (row) => ({
  RoomId: row.room_id,
  LeaderboardId: row.leaderboard_id,
  LeaderboardTitle: row.leaderboard_title,
  StatFormat: row.stat_format,
  SortAscending: row.sort_ascending === 1
});
async function setRoomLeaderboard(db, roomId, leaderboardId, leaderboardTitle, statFormat, sortAscending) {
  const row = await db.prepare(
    `INSERT INTO room_leaderboard (room_id, leaderboard_id, leaderboard_title, stat_format, sort_ascending)
			 VALUES (?1, ?2, ?3, ?4, ?5)
			 ON CONFLICT(room_id, leaderboard_id) DO UPDATE SET
				 leaderboard_title = ?3, stat_format = ?4, sort_ascending = ?5
			 RETURNING *`
  ).bind(roomId, leaderboardId, leaderboardTitle, statFormat, sortAscending ? 1 : 0).first();
  return toRoomLeaderboard(row);
}
async function deleteRoomLeaderboard(db, roomId, leaderboardId) {
  const row = await db.prepare("DELETE FROM room_leaderboard WHERE room_id = ?1 AND leaderboard_id = ?2 RETURNING *").bind(roomId, leaderboardId).first();
  return row ? toRoomLeaderboard(row) : null;
}
async function cloneRoom(db, sourceRoomId, name, accountId) {
  const source = await getRoomById(db, sourceRoomId);
  if (!source || source.CloningAllowed === false) return null;
  const row = await db.prepare("SELECT MAX(room_id) AS maxId FROM room").first();
  const newRoomId = (row?.maxId ?? 0) + 1;
  const roles = [
    {
      AccountId: accountId,
      Role: Role.Creator,
      LastChangedByAccountId: null,
      InvitedRole: Role.None
    }
  ];
  const cloned = {
    ...source,
    RoomId: newRoomId,
    Name: name,
    CreatorAccountId: accountId,
    IsDorm: false,
    // Start fresh: drop every tag the source carried (including `base`).
    Tags: [],
    // A user clone is not a Rec Room Original — clear the inherited flag, or the
    // client renders a virtual "RRO" tag on the clone.
    IsRRO: false,
    // A brand-new room is unpublished: the owner publishes it by setting the room's
    // accessibility. Inheriting the source's would put the clone straight into the
    // public feeds (hot/search/recommendations/similar all key on Accessibility === 1)
    // the moment it was made — every clone of a PUBLIC source, template or player room.
    Accessibility: Accessibility.Private,
    Roles: roles,
    // A fresh room has no engagement of its own — don't inherit the source's counters
    // (the derived ones are recomputed per read, but the clone is returned as-is here).
    Stats: storedStats(source.Stats),
    CreatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await db.prepare("INSERT INTO room (data) VALUES (?1)").bind(serializeRoom(cloned)).run();
  const sourceSubRooms = Array.isArray(source.SubRooms) ? source.SubRooms : [];
  const clonedSubRooms = [];
  for (const sub of sourceSubRooms) {
    clonedSubRooms.push(await insertSubRoom(db, newRoomId, { ...sub, CreatorAccountId: accountId }));
  }
  cloned.SubRooms = clonedSubRooms;
  attachRoomDtoDefaults(cloned);
  return cloned;
}
async function setRoomDescription(db, roomId, description) {
  await db.prepare("UPDATE room SET data = json_set(data, '$.Description', ?2) WHERE room_id = ?1").bind(roomId, description).run();
}
async function setRoomName(db, roomId, name) {
  await db.prepare("UPDATE room SET data = json_set(data, '$.Name', ?2) WHERE room_id = ?1").bind(roomId, name).run();
}
async function setRoomImage(db, roomId, imageName) {
  await db.prepare("UPDATE room SET data = json_set(data, '$.ImageName', ?2) WHERE room_id = ?1").bind(roomId, imageName).run();
}
async function updateRoomFields(db, roomId, room, patch) {
  const updated = { ...room, ...patch };
  await db.prepare("UPDATE room SET data = ?2 WHERE room_id = ?1").bind(roomId, serializeRoom(updated)).run();
  return updated;
}
function roleRequiresInvite(role) {
  return role >= Role.CoOwner;
}
async function setRoomRole(db, roomId, targetAccountId, role, changedByAccountId, room) {
  if (roleRequiresInvite(role)) return null;
  const roles = roomRoles(room);
  const existing = roles.find((r) => r.AccountId === targetAccountId);
  if (existing) {
    existing.Role = role;
    existing.LastChangedByAccountId = changedByAccountId;
  } else {
    roles.push({
      AccountId: targetAccountId,
      Role: role,
      LastChangedByAccountId: changedByAccountId,
      InvitedRole: Role.None
    });
  }
  const updated = { ...room, Roles: roles };
  await db.prepare("UPDATE room SET data = ?2 WHERE room_id = ?1").bind(roomId, serializeRoom(updated)).run();
  return updated;
}
async function answerRoomRoleInvite(db, roomId, accountId, role, room) {
  const roles = roomRoles(room);
  const index = roles.findIndex((r) => r.AccountId === accountId);
  if (index === -1) return null;
  const entry = roles[index];
  if (entry.InvitedRole === Role.None) return null;
  if (role === Role.None) {
    roles.splice(index, 1);
  } else if (entry.InvitedRole !== role) {
    return null;
  } else {
    entry.Role = entry.InvitedRole;
    entry.InvitedRole = Role.None;
  }
  const updated = { ...room, Roles: roles };
  await db.prepare("UPDATE room SET data = ?2 WHERE room_id = ?1").bind(roomId, serializeRoom(updated)).run();
  return updated;
}
async function inviteRoomRole(db, roomId, targetAccountId, invitedRole, changedByAccountId, room) {
  const roles = roomRoles(room);
  const existing = roles.find((r) => r.AccountId === targetAccountId);
  if (existing) {
    existing.InvitedRole = invitedRole;
    existing.LastChangedByAccountId = changedByAccountId;
  } else {
    roles.push({
      AccountId: targetAccountId,
      Role: Role.None,
      LastChangedByAccountId: changedByAccountId,
      InvitedRole: invitedRole
    });
  }
  const updated = { ...room, Roles: roles };
  await db.prepare("UPDATE room SET data = ?2 WHERE room_id = ?1").bind(roomId, serializeRoom(updated)).run();
  return updated;
}
const MAIN_TAGS = /* @__PURE__ */ new Set(["pvp", "quest", "game", "hangout", "art"]);
const RoomTagType = {
  user: 0,
  auto: 1,
  derived: 2
};
const tagKey = (t) => String(t?.Tag).toLowerCase();
async function applyRoomTagEdit(db, roomId, room, edit) {
  const current = Array.isArray(room.Tags) ? room.Tags : [];
  let next = current.map((t) => ({ ...t }));
  if (edit.tags !== void 0) {
    const posted = new Set(edit.tags.map((t) => t.toLowerCase()));
    next = [
      ...next.filter((t) => t.Type !== RoomTagType.user && !posted.has(tagKey(t))),
      ...edit.tags.map(
        (tag) => next.find((t) => tagKey(t) === tag.toLowerCase()) ?? { Tag: tag, Type: RoomTagType.user }
      )
    ];
  } else if (edit.toggle !== void 0) {
    const lower = edit.toggle.toLowerCase();
    const existing = next.findIndex((t) => tagKey(t) === lower);
    if (existing !== -1) {
      next = next.filter((_, i) => i !== existing);
    } else {
      const kept = MAIN_TAGS.has(lower) ? next.filter((t) => !MAIN_TAGS.has(tagKey(t))) : next;
      next = [...kept, { Tag: edit.toggle, Type: RoomTagType.user }];
    }
  }
  for (const auto of edit.autoTags ?? []) {
    const existing = next.find((t) => tagKey(t) === auto.toLowerCase());
    if (existing) existing.Type = RoomTagType.auto;
    else next.push({ Tag: auto, Type: RoomTagType.auto });
  }
  if (edit.primaryGenre !== void 0) {
    const lower = edit.primaryGenre.toLowerCase();
    for (const tag of next) delete tag.IsPrimaryGenre;
    const chosen = next.find((t) => tagKey(t) === lower);
    if (chosen) chosen.IsPrimaryGenre = true;
    else next.push({ Tag: edit.primaryGenre, Type: RoomTagType.user, IsPrimaryGenre: true });
  }
  return storeRoomTags(db, roomId, room, next);
}
async function storeRoomTags(db, roomId, room, tags) {
  await setRoomTags(db, roomId, tags);
  return {
    ...room,
    Tags: tags.map((t) => {
      const stored = { Tag: t.Tag.toLowerCase(), Type: t.Type };
      if (t.IsPrimaryGenre) stored.IsPrimaryGenre = true;
      return stored;
    })
  };
}
function findSubRoom(room, subRoomId) {
  const subRooms = Array.isArray(room.SubRooms) ? room.SubRooms : [];
  return subRooms.find((s) => s.SubRoomId === subRoomId);
}
function subRoomDataBlob(sub) {
  const save = sub?.CurrentSave;
  if (save && typeof save === "object") {
    const blob = save.DataBlob;
    if (typeof blob === "string" && blob !== "") return blob;
  }
  return typeof sub?.DataBlob === "string" ? sub.DataBlob : "";
}
function buildSubRoomSave(input) {
  const save = {
    UnitySubAssets: [],
    ReferencedUnityAssets: [],
    SubRoomId: input.subRoomId,
    DataBlob: input.dataBlob,
    // The client sends `SubRoomData.Hash` (usually null); the room-save response echoes
    // it as `dataBlobHash`. One observed room payload carries it on `CurrentSave` and
    // another omits it, so storing it and letting it ride along is the safe reading.
    DataBlobHash: input.dataBlobHash,
    ReferencedUnityAssetIds: [],
    PersistenceVersion: input.persistenceVersion,
    OMVersion: 0,
    UgcSubVersion: 0,
    SavedByAccountId: input.savedByAccountId,
    SavedOnPlatform: 0,
    SavedOnDeviceClass: 0,
    Description: input.description,
    Tags: [],
    ModerationState: 0,
    CreatedAt: input.createdAt
  };
  if (input.unityAssetId) save.UnityAssetId = input.unityAssetId;
  return save;
}
function legacySubRoomSave(sub) {
  const blob = sub.DataBlob;
  if (typeof blob !== "string" || blob === "") return null;
  const savedAt = typeof sub.DataSavedAt === "string" ? sub.DataSavedAt : (/* @__PURE__ */ new Date(0)).toISOString();
  return buildSubRoomSave({
    subRoomId: sub.SubRoomId,
    dataBlob: blob,
    dataBlobHash: null,
    persistenceVersion: typeof sub.PersistenceVersion === "number" ? sub.PersistenceVersion : 0,
    // The legacy shape never recorded who saved; the subroom's creator is the best
    // available answer (the save path is owner/co-owner gated).
    savedByAccountId: sub.CreatorAccountId ?? null,
    description: "",
    createdAt: savedAt
  });
}
async function saveSubRoomData(db, roomId, subRoomId, accountId, input) {
  const room = await getRoomById(db, roomId);
  if (!room) return null;
  const sub = findSubRoom(room, subRoomId);
  if (!sub) return null;
  if (sub.CreatorAccountId == null) sub.CreatorAccountId = accountId;
  const staged = typeof sub.StagedSubRoomDataSaveId === "number" ? await getSubRoomSaveById(db, subRoomId, sub.StagedSubRoomDataSaveId) : null;
  const previous = staged ?? (sub.CurrentSave && typeof sub.CurrentSave === "object" ? sub.CurrentSave : void 0);
  const priorVersion = previous?.PersistenceVersion;
  const priorBlob = previous?.DataBlob;
  const save = await insertSubRoomSave(
    db,
    subRoomId,
    buildSubRoomSave({
      subRoomId,
      // A save that carries no new blob (e.g. a description-only save) keeps the one
      // the subroom already loads from.
      dataBlob: input.subRoomDataFilename ?? (typeof priorBlob === "string" ? priorBlob : ""),
      dataBlobHash: input.subRoomDataHash ?? null,
      persistenceVersion: input.persistenceVersion ?? (typeof priorVersion === "number" ? priorVersion : 0),
      savedByAccountId: accountId,
      // The save comment — empty string, not null, when the save carries none (the
      // reference's `roomDesc ?? ""`).
      description: input.description ?? "",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      unityAssetId: input.unityAssetId
    })
  );
  const saveId = Number(save.SubRoomDataSaveId);
  if (input.roomDataFilename) sub.RoomDataBlob = input.roomDataFilename;
  sub.DataSavedAt = (/* @__PURE__ */ new Date()).toISOString();
  if (input.persistenceVersion !== void 0) sub.PersistenceVersion = input.persistenceVersion;
  if (input.inventionUsage !== void 0) sub.InventionUsage = input.inventionUsage;
  const publishNow = input.autoPublish === true || room.IsDorm === true;
  await db.batch([
    publishNow ? db.prepare(
      "UPDATE subroom SET current_save_id = ?2, staged_save_id = NULL WHERE sub_room_id = ?1"
    ).bind(subRoomId, saveId) : db.prepare("UPDATE subroom SET staged_save_id = ?2 WHERE sub_room_id = ?1").bind(subRoomId, saveId),
    db.prepare("UPDATE subroom SET data = ?2 WHERE sub_room_id = ?1").bind(subRoomId, serializeSubRoom(sub, roomId))
  ]);
  await attachSubRooms(db, [room]);
  return { room, save };
}
async function publishSubRoomSave(db, roomId, subRoomId, saveId) {
  const sub = await getSubRoom(db, roomId, subRoomId);
  if (!sub) return { ok: false, reason: "not_found" };
  if (!await getSubRoomSaveById(db, subRoomId, saveId)) {
    return { ok: false, reason: "unknown_save" };
  }
  await db.prepare(
    `UPDATE subroom SET current_save_id = ?2,
			   staged_save_id = CASE WHEN staged_save_id = ?2 THEN NULL ELSE staged_save_id END
			 WHERE sub_room_id = ?1`
  ).bind(subRoomId, saveId).run();
  const room = await getRoomById(db, roomId);
  if (!room) return { ok: false, reason: "not_found" };
  return { ok: true, room };
}
async function modifySubRoom(db, roomId, subRoomId, input) {
  const sub = await getSubRoom(db, roomId, subRoomId);
  if (!sub) return null;
  if (input.name !== void 0) sub.Name = input.name;
  if (input.accessibility !== void 0) sub.Accessibility = input.accessibility;
  if (input.maxPlayers !== void 0) sub.MaxPlayers = input.maxPlayers;
  await updateSubRoom(db, sub);
  return getRoomById(db, roomId);
}
async function cloneSubRoom(db, roomId, subRoomId, accountId) {
  const source = await getSubRoom(db, roomId, subRoomId);
  if (!source) return null;
  const subRoom = await insertSubRoom(db, roomId, { ...source, CreatorAccountId: accountId });
  const room = await getRoomById(db, roomId);
  if (!room) return null;
  return { room, subRoom };
}
const DEFAULT_SUBROOM_SCENE = "76d98498-60a1-430c-ab76-b54a29b7a163";
async function baseSubRoomScene(db, roomId) {
  const row = await db.prepare("SELECT data FROM subroom WHERE room_id = ?1 ORDER BY sub_room_id LIMIT 1").bind(roomId).first();
  const scene = row ? JSON.parse(row.data).UnitySceneId : void 0;
  return typeof scene === "string" ? scene : DEFAULT_SUBROOM_SCENE;
}
async function createSubRoom(db, roomId, accountId, name) {
  const room = await getRoomById(db, roomId);
  if (!room) return null;
  const subRoom = await insertSubRoom(db, roomId, {
    Name: name,
    CreatorAccountId: accountId,
    UnitySceneId: await baseSubRoomScene(db, roomId),
    MaxPlayers: 4,
    Accessibility: Accessibility.Unlisted,
    IsSandbox: true,
    LastModeratedSaveModerationState: 0,
    ShouldAutoStageSaves: true
    // Nothing saved yet — the first room save mints one and points current_save_id
    // at it. Until then the subroom reads with `CurrentSave: null`.
  });
  await attachSubRooms(db, [room]);
  return { room, subRoom };
}
async function deleteSubRoom(db, roomId, subRoomId) {
  const subRooms = await getSubRooms(db, roomId);
  if (!subRooms.some((s) => s.SubRoomId === subRoomId)) return { ok: false, reason: "not_found" };
  if (subRooms.length <= 1) return { ok: false, reason: "last_subroom" };
  await db.batch([
    db.prepare("DELETE FROM subroom WHERE room_id = ?1 AND sub_room_id = ?2").bind(roomId, subRoomId),
    // The saves go with it — nothing can reference them once the subroom is gone.
    // The blobs they point at are left in R2, like a deleted room's images.
    db.prepare("DELETE FROM subroom_save WHERE sub_room_id = ?1").bind(subRoomId),
    // So do its permission overrides — subroom ids are minted from one global
    // sequence, but leaving orphans would still be dead rows nothing can reach.
    db.prepare("DELETE FROM subroom_permission WHERE sub_room_id = ?1").bind(subRoomId)
  ]);
  const room = await getRoomById(db, roomId);
  if (!room) return { ok: false, reason: "not_found" };
  return { ok: true, room };
}
const ROOM_COLUMNS = "data, visits";
const LISTABLE_WHERE = "is_dorm IS NOT 1 AND accessibility = 1 AND exclude_from_lists IS NOT 1";
const PUBLIC_WHERE = "is_dorm IS NOT 1 AND accessibility = 1";
function attachRoomDtoDefaults(room) {
  room.BoostCount ??= 0;
  room.CurrentSnapshotId ??= null;
  room.CCU ??= null;
}
const parseRow = (row) => {
  const room = JSON.parse(row.data);
  room.Stats = { ...storedStats(room.Stats), VisitCount: row.visits ?? 0 };
  attachRoomDtoDefaults(room);
  return room;
};
const parseOne = (row) => row ? parseRow(row) : null;
const parseAll = (rows) => rows.map(parseRow);
const MAX_BOUND_PARAMS = 100;
function chunkForBinds(values) {
  const chunks = [];
  for (let i = 0; i < values.length; i += MAX_BOUND_PARAMS) {
    chunks.push(values.slice(i, i + MAX_BOUND_PARAMS));
  }
  return chunks;
}
async function selectInChunks(db, ids, sql) {
  const pages = await Promise.all(
    chunkForBinds(ids).map(
      (chunk) => db.prepare(sql(chunk.map((_, i) => `?${i + 1}`).join(","))).bind(...chunk).all()
    )
  );
  return pages.flatMap((page) => page.results);
}
const SUBROOM_COLUMNS = "sub_room_id, room_id, data, current_save_id, staged_save_id";
const parseSubRoomRow = (row) => ({
  ...JSON.parse(row.data),
  SubRoomId: row.sub_room_id,
  RoomId: row.room_id,
  // Served from the column, not the blob — the creator's unpublished save (unused for
  // now, but the client expects the key present).
  StagedSubRoomDataSaveId: row.staged_save_id
});
const serializeSubRoom = (sub, roomId) => {
  const {
    SubRoomId: _id,
    RoomId: _room,
    CurrentSave: _save,
    StagedSubRoomDataSaveId: _staged,
    ...rest
  } = sub;
  return JSON.stringify({ ...rest, RoomId: roomId });
};
const serializeRoom = (room) => {
  const { SubRooms: _subRooms, Tags: _tags, Stats: stats, ...rest } = room;
  return JSON.stringify({ ...rest, Stats: storedStats(stats) });
};
async function attachCurrentSaves(db, subs, rows) {
  const saveIds = [...new Set(rows.map((r) => r.current_save_id).filter((id) => id != null))];
  const byId = /* @__PURE__ */ new Map();
  if (saveIds.length > 0) {
    const results = await selectInChunks(
      db,
      saveIds,
      (placeholders) => `SELECT sub_room_data_save_id, sub_room_id, data FROM subroom_save
				 WHERE sub_room_data_save_id IN (${placeholders})`
    );
    for (const r of results) byId.set(r.sub_room_data_save_id, parseSubRoomSaveRow(r));
  }
  subs.forEach((sub, i) => {
    const id = rows[i].current_save_id;
    sub.CurrentSave = id == null ? null : byId.get(id) ?? null;
  });
}
function toRoomTag(row) {
  const tag = { Tag: row.tag, Type: row.type };
  if (row.is_primary_genre) tag.IsPrimaryGenre = true;
  return tag;
}
function groupTags(rows) {
  const byRoom = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const list = byRoom.get(row.room_id) ?? [];
    list.push(toRoomTag(row));
    byRoom.set(row.room_id, list);
  }
  return byRoom;
}
async function tagsByRoom(db, roomIds) {
  const ids = [...new Set(roomIds)];
  if (ids.length === 0) return /* @__PURE__ */ new Map();
  if (ids.length > MAX_BOUND_PARAMS) {
    const { results: results2 } = await db.prepare("SELECT room_id, tag, type, is_primary_genre FROM room_tag ORDER BY tag").all();
    const wanted = new Set(ids);
    return groupTags(results2.filter((row) => wanted.has(row.room_id)));
  }
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(",");
  const { results } = await db.prepare(
    `SELECT room_id, tag, type, is_primary_genre FROM room_tag
			 WHERE room_id IN (${placeholders}) ORDER BY tag`
  ).bind(...ids).all();
  return groupTags(results);
}
async function attachTags(db, rooms) {
  const byRoom = await tagsByRoom(db, [...new Set(rooms.map(roomIdOf))]);
  for (const room of rooms) room.Tags = byRoom.get(roomIdOf(room)) ?? [];
}
async function parseAllWithTags(db, rows) {
  const rooms = parseAll(rows);
  await attachTags(db, rooms);
  return rooms;
}
async function setRoomTags(db, roomId, tags) {
  const statements = [db.prepare("DELETE FROM room_tag WHERE room_id = ?1").bind(roomId)];
  for (const { Tag, Type, IsPrimaryGenre } of tags) {
    statements.push(
      db.prepare(
        `INSERT INTO room_tag (room_id, tag, type, is_primary_genre) VALUES (?1, ?2, ?3, ?4)
					 ON CONFLICT (room_id, tag) DO UPDATE SET type = ?3, is_primary_genre = ?4`
      ).bind(roomId, String(Tag).toLowerCase(), Number(Type) || 0, IsPrimaryGenre ? 1 : 0)
    );
  }
  await db.batch(statements);
}
function roomsByTagsQuery(tagSets, where = "") {
  const filter = where === "" ? "" : ` WHERE ${where}`;
  if (tagSets.length === 0) return { sql: `SELECT ${ROOM_COLUMNS} FROM room${filter}`, binds: [] };
  const binds = [];
  const joins = tagSets.map((tags, i) => {
    const placeholders = tags.map((_, j) => `?${binds.length + j + 1}`).join(", ");
    binds.push(...tags);
    return `JOIN (SELECT DISTINCT room_id FROM room_tag WHERE tag IN (${placeholders})) f${i}
		         ON f${i}.room_id = r.room_id`;
  });
  return { sql: `SELECT ${ROOM_COLUMNS} FROM room r ${joins.join(" ")}${filter}`, binds };
}
async function parseSubRoomRows(db, rows) {
  const subs = rows.map(parseSubRoomRow);
  await attachCurrentSaves(db, subs, rows);
  return subs;
}
async function attachSubRooms(db, rooms) {
  const ids = rooms.map((r) => Number(r.RoomId)).filter((n) => Number.isFinite(n));
  if (ids.length === 0) {
    for (const room of rooms) room.SubRooms = [];
    return;
  }
  const results = await selectInChunks(
    db,
    ids,
    (placeholders) => `SELECT ${SUBROOM_COLUMNS} FROM subroom
			 WHERE room_id IN (${placeholders}) ORDER BY sub_room_id`
  );
  const subs = await parseSubRoomRows(db, results);
  const byRoom = /* @__PURE__ */ new Map();
  results.forEach((r, i) => {
    const list = byRoom.get(r.room_id) ?? [];
    list.push(subs[i]);
    byRoom.set(r.room_id, list);
  });
  for (const room of rooms) room.SubRooms = byRoom.get(Number(room.RoomId)) ?? [];
}
const ZERO_STATS = { CheerCount: 0, FavoriteCount: 0, VisitorCount: 0, VisitCount: 0 };
const STATS_ID_LIMIT = 90;
const roomIdOf = (room) => typeof room.RoomId === "number" ? room.RoomId : 0;
function storedStats(stats) {
  const stored = typeof stats === "object" && stats !== null ? stats : {};
  return { ...ZERO_STATS, ...stored, CheerCount: 0, FavoriteCount: 0, VisitCount: 0 };
}
async function recordRoomVisit(db, roomId) {
  await db.prepare("UPDATE room SET visits = visits + 1 WHERE room_id = ?1").bind(roomId).run();
}
async function getRoomStats(db, roomIds) {
  const byRoom = /* @__PURE__ */ new Map();
  if (roomIds && roomIds.length === 0) return byRoom;
  const ids = roomIds && roomIds.length <= STATS_ID_LIMIT ? roomIds : [];
  const where = ids.length > 0 ? `WHERE room_id IN (${ids.map((_, i) => `?${i + 1}`).join(",")})` : "";
  const { results } = await db.prepare(
    `SELECT room_id, SUM(cheered) AS cheers, SUM(favorited) AS favorites
			 FROM interaction ${where} GROUP BY room_id`
  ).bind(...ids).all();
  for (const r of results) {
    byRoom.set(r.room_id, { CheerCount: r.cheers ?? 0, FavoriteCount: r.favorites ?? 0 });
  }
  return byRoom;
}
async function attachStats(db, rooms, stats) {
  if (rooms.length === 0) return;
  const byRoom = stats ?? await getRoomStats(db, [...new Set(rooms.map(roomIdOf))]);
  for (const room of rooms) {
    const counts = byRoom.get(roomIdOf(room));
    const stats2 = room.Stats ?? {};
    room.Stats = {
      ...storedStats(stats2),
      VisitCount: typeof stats2.VisitCount === "number" ? stats2.VisitCount : 0,
      CheerCount: counts?.CheerCount ?? 0,
      FavoriteCount: counts?.FavoriteCount ?? 0
    };
  }
}
async function hydrateRoom(db, room) {
  if (room) await hydrateRooms(db, [room]);
  return room;
}
async function hydrateRooms(db, rooms, stats) {
  await Promise.all([
    attachSubRooms(db, rooms),
    attachTags(db, rooms),
    attachStats(db, rooms, stats)
  ]);
  return rooms;
}
async function getSubRoom(db, roomId, subRoomId) {
  const row = await db.prepare(`SELECT ${SUBROOM_COLUMNS} FROM subroom WHERE room_id = ?1 AND sub_room_id = ?2`).bind(roomId, subRoomId).first();
  if (!row) return null;
  return (await parseSubRoomRows(db, [row]))[0];
}
async function getSubRooms(db, roomId) {
  const { results } = await db.prepare(`SELECT ${SUBROOM_COLUMNS} FROM subroom WHERE room_id = ?1 ORDER BY sub_room_id`).bind(roomId).all();
  return parseSubRoomRows(db, results);
}
const parseSubRoomSaveRow = (row) => ({
  ...JSON.parse(row.data),
  SubRoomDataSaveId: row.sub_room_data_save_id,
  SubRoomId: row.sub_room_id
});
const serializeSubRoomSave = (save) => {
  const { SubRoomDataSaveId: _id, SubRoomId: _sub, ...rest } = save;
  return JSON.stringify(rest);
};
async function insertSubRoomSave(db, subRoomId, save) {
  const row = await db.prepare(
    "INSERT INTO subroom_save (sub_room_id, data) VALUES (?1, ?2) RETURNING sub_room_data_save_id"
  ).bind(subRoomId, serializeSubRoomSave(save)).first();
  return { ...save, SubRoomDataSaveId: row.sub_room_data_save_id, SubRoomId: subRoomId };
}
async function getSubRoomSaves(db, subRoomId) {
  const { results } = await db.prepare(
    `SELECT sub_room_data_save_id, sub_room_id, data FROM subroom_save
			 WHERE sub_room_id = ?1 ORDER BY sub_room_data_save_id DESC`
  ).bind(subRoomId).all();
  return results.map(parseSubRoomSaveRow);
}
async function getSubRoomSaveById(db, subRoomId, saveId) {
  const row = await db.prepare(
    `SELECT sub_room_data_save_id, sub_room_id, data FROM subroom_save
			 WHERE sub_room_data_save_id = ?1 AND sub_room_id = ?2`
  ).bind(saveId, subRoomId).first();
  return row ? parseSubRoomSaveRow(row) : null;
}
const toRoomPermission = (row) => ({
  // A stored row IS the override — the table holds nothing else (see RoomPermission).
  Override: true,
  Permission: row.permission,
  Role: row.role,
  Type: row.type,
  Value: row.value
});
const PERMISSION_COLUMNS = "permission, role, type, value";
async function getSubRoomPermissions(db, subRoomId) {
  const { results } = await db.prepare(
    `SELECT ${PERMISSION_COLUMNS} FROM subroom_permission WHERE sub_room_id = ?1 ORDER BY rowid`
  ).bind(subRoomId).all();
  return results.map(toRoomPermission);
}
async function setSubRoomPermissions(db, subRoomId, permissions) {
  if (permissions.length === 0) return;
  const upsert = db.prepare(
    `INSERT INTO subroom_permission (sub_room_id, ${PERMISSION_COLUMNS})
		 VALUES (?1, ?2, ?3, ?4, ?5)
		 ON CONFLICT (sub_room_id, permission, role)
		 DO UPDATE SET type = excluded.type, value = excluded.value`
  );
  const clear = db.prepare(
    "DELETE FROM subroom_permission WHERE sub_room_id = ?1 AND permission = ?2 AND role = ?3"
  );
  await db.batch(
    permissions.map(
      (p) => p.Override ? upsert.bind(subRoomId, p.Permission, p.Role, p.Type, p.Value) : clear.bind(subRoomId, p.Permission, p.Role)
    )
  );
}
async function copySubRoomPermissions(db, fromSubRoomId, toSubRoomId) {
  await db.prepare(
    `INSERT OR REPLACE INTO subroom_permission (sub_room_id, ${PERMISSION_COLUMNS})
			 SELECT ?2, ${PERMISSION_COLUMNS} FROM subroom_permission WHERE sub_room_id = ?1`
  ).bind(fromSubRoomId, toSubRoomId).run();
}
async function insertSubRoom(db, roomId, sub) {
  const row = await db.prepare("INSERT INTO subroom (room_id, data) VALUES (?1, ?2) RETURNING sub_room_id").bind(roomId, serializeSubRoom(sub, roomId)).first();
  const subRoomId = row.sub_room_id;
  const created = {
    ...sub,
    SubRoomId: subRoomId,
    RoomId: roomId,
    CurrentSave: null,
    StagedSubRoomDataSaveId: null
  };
  if (typeof sub.SubRoomId === "number") {
    await copySubRoomPermissions(db, sub.SubRoomId, subRoomId);
  }
  if (sub.CurrentSave && typeof sub.CurrentSave === "object") {
    const copy = await insertSubRoomSave(db, subRoomId, sub.CurrentSave);
    await setCurrentSave(db, subRoomId, Number(copy.SubRoomDataSaveId));
    created.CurrentSave = copy;
  }
  return created;
}
async function updateSubRoom(db, sub) {
  await db.prepare("UPDATE subroom SET data = ?2 WHERE sub_room_id = ?1").bind(sub.SubRoomId, serializeSubRoom(sub, Number(sub.RoomId))).run();
}
async function setCurrentSave(db, subRoomId, saveId) {
  await db.prepare(
    "UPDATE subroom SET current_save_id = ?2, staged_save_id = NULL WHERE sub_room_id = ?1"
  ).bind(subRoomId, saveId).run();
}
async function seedRoomWithSubRooms(db, room) {
  const roomId = Number(room.RoomId);
  const subRooms = Array.isArray(room.SubRooms) ? room.SubRooms : [];
  await db.prepare("INSERT OR IGNORE INTO room (data) VALUES (?1)").bind(serializeRoom(room)).run();
  if (Array.isArray(room.Tags) && room.Tags.length > 0) {
    await setRoomTags(db, roomId, room.Tags);
  }
  for (const sub of subRooms) {
    const subRoomId = Number(sub.SubRoomId);
    await db.prepare("INSERT INTO subroom (sub_room_id, room_id, data) VALUES (?1, ?2, ?3)").bind(subRoomId, roomId, serializeSubRoom(sub, roomId)).run();
    const seeded = sub.CurrentSave ?? legacySubRoomSave(sub);
    if (seeded && typeof seeded === "object") {
      const save = await insertSubRoomSave(db, subRoomId, seeded);
      await setCurrentSave(db, subRoomId, Number(save.SubRoomDataSaveId));
    }
  }
}
async function getRoomById(db, roomId) {
  return hydrateRoom(
    db,
    parseOne(
      await db.prepare(`SELECT ${ROOM_COLUMNS} FROM room WHERE room_id = ?1`).bind(roomId).first()
    )
  );
}
async function deleteRoom(db, roomId) {
  await db.batch([
    db.prepare("DELETE FROM room WHERE room_id = ?1").bind(roomId),
    db.prepare("DELETE FROM interaction WHERE room_id = ?1").bind(roomId),
    // Tag rows outlive the blob otherwise, and would keep answering `#tag` searches and
    // category rows for a room nobody can open.
    db.prepare("DELETE FROM room_tag WHERE room_id = ?1").bind(roomId),
    // Saves and permission overrides first — both are keyed by subroom, so they'd be
    // unreachable once the subrooms themselves are gone.
    db.prepare(
      "DELETE FROM subroom_save WHERE sub_room_id IN (SELECT sub_room_id FROM subroom WHERE room_id = ?1)"
    ).bind(roomId),
    db.prepare(
      "DELETE FROM subroom_permission WHERE sub_room_id IN (SELECT sub_room_id FROM subroom WHERE room_id = ?1)"
    ).bind(roomId),
    db.prepare("DELETE FROM subroom WHERE room_id = ?1").bind(roomId)
  ]);
}
async function getRoomByName(db, name) {
  return hydrateRoom(
    db,
    parseOne(
      await db.prepare(`SELECT ${ROOM_COLUMNS} FROM room WHERE name_lower = ?1`).bind(name.toLowerCase()).first()
    )
  );
}
async function getRoomsByIds(db, ids) {
  if (ids.length === 0) return [];
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(",");
  const { results } = await db.prepare(`SELECT ${ROOM_COLUMNS} FROM room WHERE room_id IN (${placeholders})`).bind(...ids).all();
  return hydrateRooms(db, parseAll(results));
}
async function getRoomsByCreator(db, accountId) {
  const { results } = await db.prepare(`SELECT ${ROOM_COLUMNS} FROM room WHERE creator_account_id = ?1`).bind(accountId).all();
  return hydrateRooms(db, parseAll(results));
}
async function countRoomsByCreator(db, accountId) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM room
			 WHERE creator_account_id = ?1
			   AND COALESCE(is_dorm, 0) = 0`
  ).bind(accountId).first();
  return row?.n ?? 0;
}
async function getContributedRooms(db, accountId) {
  const { results } = await db.prepare(
    `SELECT ${ROOM_COLUMNS} FROM room
			 WHERE creator_account_id = ?1
			    OR EXISTS (
			     SELECT 1 FROM json_each(room.data, '$.Roles') AS role
			     WHERE json_extract(role.value, '$.AccountId') = ?1
			   )`
  ).bind(accountId).all();
  return (await hydrateRooms(db, parseAll(results))).filter((r) => r.IsDorm !== true);
}
async function getPublicRoomsByCreator(db, accountId) {
  return (await getRoomsByCreator(db, accountId)).filter(isListable);
}
async function getFavoritedRooms(db, playerId, skip, take) {
  const { results } = await db.prepare(
    `SELECT r.data AS data, r.visits AS visits
			 FROM interaction i
			 JOIN room r ON r.room_id = i.room_id
			 WHERE i.player_id = ?1 AND i.favorited = 1
			 ORDER BY i.last_visited_at DESC`
  ).bind(playerId).all();
  return hydrateRooms(db, parseAll(results).slice(skip, skip + take));
}
async function getVisitedRooms(db, playerId, skip, take) {
  const { results } = await db.prepare(
    `SELECT r.data AS data, r.visits AS visits
			 FROM interaction i
			 JOIN room r ON r.room_id = i.room_id
			 WHERE i.player_id = ?1 AND i.last_visited_at IS NOT NULL
			 ORDER BY i.last_visited_at DESC`
  ).bind(playerId).all();
  return hydrateRooms(db, parseAll(results).slice(skip, skip + take));
}
const toInteraction = (row) => ({
  Cheered: row?.cheered === 1,
  Favorited: row?.favorited === 1
});
async function getInteraction(db, playerId, roomId) {
  return toInteraction(
    await db.prepare("SELECT cheered, favorited FROM interaction WHERE player_id = ?1 AND room_id = ?2").bind(playerId, roomId).first()
  );
}
async function toggleInteraction(db, playerId, roomId, column) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return toInteraction(
    await db.prepare(
      `INSERT INTO interaction (player_id, room_id, ${column}, last_visited_at)
				 VALUES (?1, ?2, 1, ?3)
				 ON CONFLICT(player_id, room_id)
				 DO UPDATE SET ${column} = NOT ${column}, last_visited_at = ?3
				 RETURNING cheered, favorited`
    ).bind(playerId, roomId, now).first()
  );
}
async function toggleCheer(db, playerId, roomId) {
  return toggleInteraction(db, playerId, roomId, "cheered");
}
async function toggleFavorite(db, playerId, roomId) {
  return toggleInteraction(db, playerId, roomId, "favorited");
}
async function clearInteraction(db, playerId, roomId, column) {
  await db.prepare(`UPDATE interaction SET ${column} = 0 WHERE player_id = ?1 AND room_id = ?2`).bind(playerId, roomId).run();
  return getInteraction(db, playerId, roomId);
}
async function removeCheer(db, playerId, roomId) {
  return clearInteraction(db, playerId, roomId, "cheered");
}
async function removeFavorite(db, playerId, roomId) {
  return clearInteraction(db, playerId, roomId, "favorited");
}
const TAG_ALIASES = {
  recroomoriginal: ["rro"]
};
function roomTags(room) {
  const tags = room.Tags;
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => t?.Tag).filter((v) => typeof v === "string").map((v) => v.toLowerCase());
}
function roomHasAnyTag(room, tags) {
  return roomTags(room).some((t) => tags.has(t));
}
async function searchRooms(db, query, skip, take) {
  const q = query.trim().toLowerCase();
  if (q === "") return { Results: [], TotalResults: 0 };
  const terms = q.split(/[\s+]+/).filter(Boolean);
  const tagTerms = terms.filter((t) => t.startsWith("#")).map((t) => t.slice(1));
  const communityOnly = tagTerms.includes(COMMUNITY_TAG);
  const tagSets = tagTerms.filter((tag) => tag !== COMMUNITY_TAG).map((tag) => [tag, ...TAG_ALIASES[tag] ?? []]);
  const { sql, binds } = roomsByTagsQuery(tagSets, PUBLIC_WHERE);
  const { results } = await db.prepare(sql).bind(...binds).all();
  let rooms = parseAll(results).filter((r) => r.IsDorm !== true && r.Accessibility === 1);
  if (communityOnly) rooms = rooms.filter(isPlayerMade);
  for (const term of terms) {
    if (term.startsWith("#")) continue;
    rooms = rooms.filter((r) => typeof r.Name === "string" && r.Name.toLowerCase().includes(term));
  }
  return {
    Results: await hydrateRooms(db, rooms.slice(skip, skip + take)),
    TotalResults: rooms.length
  };
}
async function autocompleteRoomSearch(db, query, take) {
  const q = query.trim().toLowerCase();
  if (q === "" || take <= 0) return [];
  const { results } = await db.prepare(`SELECT ${ROOM_COLUMNS} FROM room WHERE ${PUBLIC_WHERE}`).all();
  const rooms = (await parseAllWithTags(db, results)).filter(
    (r) => r.IsDorm !== true && r.Accessibility === 1
  );
  const tagQuery = q.startsWith("#");
  const term = tagQuery ? q.slice(1) : q;
  if (term === "") return [];
  const found = /* @__PURE__ */ new Map();
  const offer = (value, rank) => {
    const key = value.toLowerCase();
    const existing = found.get(key);
    if (existing === void 0 || existing[0] > rank) found.set(key, [rank, value]);
  };
  for (const room of rooms) {
    if (!tagQuery && typeof room.Name === "string") {
      const name = room.Name.toLowerCase();
      if (name.startsWith(term)) offer(room.Name, 0);
      else if (name.includes(term)) offer(room.Name, 1);
    }
    for (const tag of roomTags(room)) {
      if (tag.startsWith(term)) offer(`#${tag}`, tagQuery ? 0 : 2);
      else if (tag.includes(term)) offer(`#${tag}`, tagQuery ? 1 : 3);
    }
  }
  return [...found.entries()].sort(([aKey, [aRank]], [bKey, [bRank]]) => aRank - bRank || aKey.localeCompare(bKey)).slice(0, take).map(([, [, value]]) => value);
}
function hotScore(room, stats) {
  const counts = stats.get(roomIdOf(room));
  const stored = room.Stats;
  const visitors = typeof stored?.VisitorCount === "number" ? stored.VisitorCount : 0;
  return (counts?.CheerCount ?? 0) * 3 + (counts?.FavoriteCount ?? 0) * 2 + visitors;
}
const NEW_TAG = "new";
const COMMUNITY_TAG = "community";
const COACH_ACCOUNT_ID = 1;
function isRRO(room) {
  return room.IsRRO === true || roomHasAnyTag(room, /* @__PURE__ */ new Set(["rro"]));
}
function isListable(room) {
  return room.IsDorm !== true && room.Accessibility === 1 && room.ExcludeFromLists !== true;
}
function isPlayerMade(room) {
  return room.CreatorAccountId !== COACH_ACCOUNT_ID;
}
function createdAt(room) {
  const ts = typeof room.CreatedAt === "string" ? Date.parse(room.CreatedAt) : NaN;
  return Number.isNaN(ts) ? 0 : ts;
}
async function getHotRooms(db, tag, skip, take) {
  const t = tag.trim().toLowerCase();
  const isPseudo = t === "" || t === NEW_TAG || t === COMMUNITY_TAG;
  const { sql, binds } = roomsByTagsQuery(
    isPseudo ? [] : [[t, ...TAG_ALIASES[t] ?? []]],
    LISTABLE_WHERE
  );
  const { results } = await db.prepare(sql).bind(...binds).all();
  let rooms = (await parseAllWithTags(db, results)).filter(isListable);
  if (t === NEW_TAG) {
    const fresh = rooms.filter((r) => !isRRO(r)).sort((a, b) => createdAt(b) - createdAt(a) || roomIdOf(b) - roomIdOf(a));
    return {
      Results: await hydrateRooms(db, fresh.slice(skip, skip + take)),
      TotalResults: fresh.length
    };
  }
  if (t === COMMUNITY_TAG) {
    rooms = rooms.filter((r) => r.CreatorAccountId !== COACH_ACCOUNT_ID);
  }
  const players = await countPlayersByRoom(db);
  const playerCount = (r) => players.get(roomIdOf(r)) ?? 0;
  const stats = await getRoomStats(db);
  rooms.sort(
    (a, b) => playerCount(b) - playerCount(a) || hotScore(b, stats) - hotScore(a, stats) || roomIdOf(a) - roomIdOf(b)
  );
  return {
    Results: await hydrateRooms(db, rooms.slice(skip, skip + take), stats),
    TotalResults: rooms.length
  };
}
async function lastPublishedAtByRoom(db) {
  const { results } = await db.prepare(
    `SELECT s.room_id AS room_id, json_extract(sv.data, '$.CreatedAt') AS created_at
			 FROM subroom s JOIN subroom_save sv ON sv.sub_room_data_save_id = s.current_save_id`
  ).all();
  const latest = /* @__PURE__ */ new Map();
  for (const row of results) {
    const ts = typeof row.created_at === "string" ? Date.parse(row.created_at) : NaN;
    if (Number.isNaN(ts)) continue;
    const seen = latest.get(row.room_id);
    if (seen === void 0 || ts > seen) latest.set(row.room_id, ts);
  }
  return latest;
}
async function getRecentlyUpdatedRooms(db, skip, take) {
  const { results } = await db.prepare(`SELECT ${ROOM_COLUMNS} FROM room WHERE ${LISTABLE_WHERE}`).all();
  const rooms = parseAll(results).filter((r) => isListable(r) && isPlayerMade(r));
  const published = await lastPublishedAtByRoom(db);
  const updatedAt = (r) => published.get(roomIdOf(r)) ?? createdAt(r);
  rooms.sort((a, b) => updatedAt(b) - updatedAt(a) || roomIdOf(b) - roomIdOf(a));
  return {
    Results: await hydrateRooms(db, rooms.slice(skip, skip + take)),
    TotalResults: rooms.length
  };
}
async function getNewRooms(db, skip, take) {
  const { results } = await db.prepare(`SELECT ${ROOM_COLUMNS} FROM room WHERE ${LISTABLE_WHERE}`).all();
  const rooms = parseAll(results).filter((r) => isListable(r) && isPlayerMade(r)).sort((a, b) => createdAt(b) - createdAt(a) || roomIdOf(b) - roomIdOf(a));
  return {
    Results: await hydrateRooms(db, rooms.slice(skip, skip + take)),
    TotalResults: rooms.length
  };
}
async function getRecommendedRooms(db, skip, take) {
  const { results } = await db.prepare(`SELECT ${ROOM_COLUMNS} FROM room WHERE ${LISTABLE_WHERE}`).all();
  const stats = await getRoomStats(db);
  return hydrateRooms(
    db,
    parseAll(results).filter(isListable).sort((a, b) => hotScore(b, stats) - hotScore(a, stats) || roomIdOf(a) - roomIdOf(b)).slice(skip, skip + take),
    stats
  );
}
async function getTrendingRooms(db, skip, take) {
  const players = await countPlayersByRoom(db);
  if (players.size === 0) return { Results: [], TotalResults: 0 };
  const { results } = await db.prepare(`SELECT ${ROOM_COLUMNS} FROM room WHERE ${LISTABLE_WHERE}`).all();
  const stats = await getRoomStats(db);
  const playerCount = (r) => players.get(roomIdOf(r)) ?? 0;
  const rooms = parseAll(results).filter((r) => isListable(r) && playerCount(r) > 0).sort(
    (a, b) => playerCount(b) - playerCount(a) || hotScore(b, stats) - hotScore(a, stats) || roomIdOf(a) - roomIdOf(b)
  );
  return {
    Results: await hydrateRooms(db, rooms.slice(skip, skip + take), stats),
    TotalResults: rooms.length
  };
}
const FEATURED_ROOM_LIMIT = 10;
async function getFeaturedRooms(db) {
  const { results } = await db.prepare(`SELECT ${ROOM_COLUMNS} FROM room WHERE ${LISTABLE_WHERE}`).all();
  const rooms = parseAll(results).filter(isListable);
  for (let i = rooms.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rooms[i], rooms[j]] = [rooms[j], rooms[i]];
  }
  rooms.length = Math.min(rooms.length, FEATURED_ROOM_LIMIT);
  const str = (v) => typeof v === "string" ? v : "";
  const num = (v) => typeof v === "number" ? v : 0;
  return {
    FeaturedRoomGroupId: 1,
    name: "Featured Rooms",
    StartAt: "2025-12-01T11:01:00Z",
    EndAt: "9999-12-08T11:00:00Z",
    Rooms: rooms.map((r) => ({
      RoomId: num(r.RoomId),
      RoomName: str(r.Name),
      ImageName: str(r.ImageName),
      IsRecRoomApproved: r.IsRecRoomApproved === true,
      ExcludeFromLists: r.ExcludeFromLists === true,
      ExcludeFromSearch: r.ExcludeFromSearch === true
    }))
  };
}
async function getSimilarRooms(db, roomId, skip, take) {
  const empty = { Results: [], TotalResults: 0 };
  const target = await getRoomById(db, roomId);
  if (!target) return empty;
  const targetTags = new Set(roomTags(target));
  if (targetTags.size === 0) return empty;
  const { results } = await db.prepare(`SELECT ${ROOM_COLUMNS} FROM room WHERE ${LISTABLE_WHERE}`).all();
  const sharedCount = (r) => roomTags(r).filter((t) => targetTags.has(t)).length;
  const stats = await getRoomStats(db);
  const scored = (await parseAllWithTags(db, results)).filter(
    (r) => roomIdOf(r) !== roomId && r.IsDorm !== true && r.Accessibility === 1 && r.ExcludeFromLists !== true
  ).map((room) => ({ room, shared: sharedCount(room) })).filter((x) => x.shared > 0);
  scored.sort(
    (a, b) => b.shared - a.shared || hotScore(b.room, stats) - hotScore(a.room, stats) || roomIdOf(a.room) - roomIdOf(b.room)
  );
  const rooms = scored.map((x) => x.room);
  return {
    Results: await hydrateRooms(db, rooms.slice(skip, skip + take), stats),
    TotalResults: rooms.length
  };
}
async function getBaseRooms(db, skip, take) {
  const { sql, binds } = roomsByTagsQuery([["base"]]);
  const { results } = await db.prepare(sql).bind(...binds).all();
  return hydrateRooms(
    db,
    parseAll(results).sort((a, b) => roomIdOf(a) - roomIdOf(b)).slice(skip, skip + take)
  );
}
const DORM_TEMPLATE_ROOM_ID = 1;
async function getUsername(db, accountId) {
  const row = await db.prepare("SELECT data FROM account WHERE account_id = ?1").bind(accountId).first();
  if (!row) return null;
  const account = JSON.parse(row.data);
  return typeof account.username === "string" ? account.username : null;
}
async function getDormRoom(db, accountId) {
  return hydrateRoom(
    db,
    parseOne(
      await db.prepare(
        `SELECT ${ROOM_COLUMNS} FROM room WHERE creator_account_id = ?1 AND is_dorm = 1 LIMIT 1`
      ).bind(accountId).first()
    )
  );
}
async function getOrCreateDormRoom(db, accountId) {
  const existing = await getDormRoom(db, accountId);
  if (existing) return existing;
  const template = await getRoomById(db, DORM_TEMPLATE_ROOM_ID);
  const idRow = await db.prepare("SELECT COALESCE(MAX(room_id), 1) + 1 AS next FROM room").first();
  const roomId = idRow?.next ?? 2;
  const templateSub = template && Array.isArray(template.SubRooms) && template.SubRooms.length > 0 ? template.SubRooms[0] : { SubRoomId: 1, UnitySceneId: "76d98498-60a1-430c-ab76-b54a29b7a163", MaxPlayers: 4 };
  const username = await getUsername(db, accountId) ?? `Player${accountId}`;
  const room = {
    ...template ?? { Accessibility: Accessibility.Unlisted },
    RoomId: roomId,
    Name: `@${username}'s Dorm`,
    CreatorAccountId: accountId,
    IsDorm: true,
    Roles: [
      {
        AccountId: accountId,
        Role: Role.Creator,
        LastChangedByAccountId: null,
        InvitedRole: Role.None
      }
    ],
    // Counters start at zero rather than inheriting the template dorm's (see cloneRoom).
    Stats: storedStats(template?.Stats),
    CreatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await db.prepare("INSERT INTO room (data) VALUES (?1)").bind(serializeRoom(room)).run();
  const subRoom = await insertSubRoom(db, roomId, { ...templateSub, CreatorAccountId: accountId });
  room.SubRooms = [subRoom];
  attachRoomDtoDefaults(room);
  return room;
}
export {
  FEATURED_ROOM_LIMIT,
  ROOM_SCHEMA_DDL,
  RoomTagType,
  SUBROOM_SCHEMA_DDL,
  answerRoomRoleInvite,
  applyRoomTagEdit,
  autocompleteRoomSearch,
  banPlayerFromRoom,
  canManageRoom,
  canModerateRoom,
  cloneRoom,
  cloneSubRoom,
  countRoomsByCreator,
  createSubRoom,
  deleteRoom,
  deleteRoomLeaderboard,
  deleteSubRoom,
  findSubRoom,
  getBaseRooms,
  getContributedRooms,
  getDormRoom,
  getFavoritedRooms,
  getFeaturedRooms,
  getHotRooms,
  getInteraction,
  getNewRooms,
  getOrCreateDormRoom,
  getPublicRoomsByCreator,
  getRecentlyUpdatedRooms,
  getRecommendedRooms,
  getRoomBans,
  getRoomById,
  getRoomByName,
  getRoomStats,
  getRoomsByCreator,
  getRoomsByIds,
  getSimilarRooms,
  getSubRoom,
  getSubRoomPermissions,
  getSubRoomSaveById,
  getSubRoomSaves,
  getSubRooms,
  getTrendingRooms,
  getUsername,
  getVisitedRooms,
  insertSubRoom,
  inviteRoomRole,
  isPlayerBannedFromRoom,
  isRoomOwner,
  modifySubRoom,
  publishSubRoomSave,
  recordRoomVisit,
  removeCheer,
  removeFavorite,
  roleRequiresInvite,
  roomRoles,
  saveSubRoomData,
  searchRooms,
  seedRoomWithSubRooms,
  setRoomDescription,
  setRoomImage,
  setRoomLeaderboard,
  setRoomName,
  setRoomRole,
  setRoomTags,
  setSubRoomPermissions,
  subRoomDataBlob,
  toggleCheer,
  toggleFavorite,
  unbanPlayerFromRoom,
  updateRoomFields
};
