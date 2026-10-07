// Ported from packages/domain/src/room-instance-db.ts; TypeScript types erased; native runtime imports.
import { countPlayersInInstance, getPlayerIdsByRoomInstance } from "./presence-db.js";
const ROOM_INSTANCE_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS room_instance (
		data TEXT NOT NULL,
		id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.roomInstanceId')) VIRTUAL,
		owner_account_id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.ownerAccountId')) VIRTUAL,
		room_id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.roomId')) VIRTUAL,
		sub_room_id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.subRoomId')) VIRTUAL,
		location TEXT GENERATED ALWAYS AS (json_extract(data, '$.location')) VIRTUAL,
		data_blob TEXT GENERATED ALWAYS AS (json_extract(data, '$.dataBlob')) VIRTUAL,
		event_id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.eventId')) VIRTUAL,
		photon_region_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.photonRegionId')) VIRTUAL,
		photon_room_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.photonRoomId')) VIRTUAL,
		name TEXT GENERATED ALWAYS AS (json_extract(data, '$.name')) VIRTUAL,
		max_capacity INTEGER GENERATED ALWAYS AS (json_extract(data, '$.maxCapacity')) VIRTUAL,
		is_full INTEGER GENERATED ALWAYS AS (json_extract(data, '$.isFull')) VIRTUAL,
		is_private INTEGER GENERATED ALWAYS AS (json_extract(data, '$.isPrivate')) VIRTUAL,
		is_in_progress INTEGER GENERATED ALWAYS AS (json_extract(data, '$.isInProgress')) VIRTUAL,
		room_code TEXT GENERATED ALWAYS AS (json_extract(data, '$.roomCode')) VIRTUAL,
		room_instance_type INTEGER GENERATED ALWAYS AS (json_extract(data, '$.roomInstanceType')) VIRTUAL,
		club_id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.clubId')) VIRTUAL,
		encrypt_voice_chat INTEGER GENERATED ALWAYS AS (json_extract(data, '$.EncryptVoiceChat')) VIRTUAL,
		matchmaking_policy INTEGER GENERATED ALWAYS AS (json_extract(data, '$.matchmakingPolicy')) VIRTUAL,
		allow_new_users INTEGER GENERATED ALWAYS AS (json_extract(data, '$.allowNewUsers')) VIRTUAL,
		join_disabled INTEGER GENERATED ALWAYS AS (json_extract(data, '$.joinDisabled')) VIRTUAL,
		created_at TEXT GENERATED ALWAYS AS (json_extract(data, '$.createdAt')) VIRTUAL,
		game_version TEXT GENERATED ALWAYS AS (json_extract(data, '$.gameVersion')) VIRTUAL
	)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_room_instance_id ON room_instance (id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_room_instance_photon_room_id ON room_instance (photon_room_id)`,
  `CREATE INDEX IF NOT EXISTS idx_room_instance_room_id ON room_instance (room_id)`
];
function toDto(s) {
  return {
    roomInstanceId: s.roomInstanceId,
    roomId: s.roomId,
    subRoomId: s.subRoomId,
    location: s.location,
    eventId: s.eventId,
    photonRegionId: s.photonRegionId,
    photonRoomId: s.photonRoomId,
    name: s.name,
    maxCapacity: s.maxCapacity,
    isFull: s.isFull,
    isPrivate: s.isPrivate,
    isInProgress: s.isInProgress,
    roomCode: s.roomCode,
    roomInstanceType: s.roomInstanceType,
    clubId: s.clubId,
    EncryptVoiceChat: s.EncryptVoiceChat,
    matchmakingPolicy: s.matchmakingPolicy,
    createdAt: s.createdAt
  };
}
const parse = (data) => JSON.parse(data);
const ID_BASE = 1e6;
async function createRoomInstance(db, input) {
  const idRow = await db.prepare(`SELECT COALESCE(MAX(id), ${ID_BASE}) + 1 AS next FROM room_instance`).first();
  const stored = {
    roomInstanceId: idRow?.next ?? ID_BASE + 1,
    ownerAccountId: input.ownerAccountId,
    roomId: input.roomId,
    subRoomId: input.subRoomId ?? 0,
    location: input.location ?? "",
    dataBlob: input.dataBlob ?? "",
    eventId: input.eventId ?? 0,
    photonRegionId: input.photonRegionId ?? "us",
    photonRoomId: input.photonRoomId,
    name: input.name ?? "",
    maxCapacity: input.maxCapacity ?? 0,
    isFull: input.isFull ?? false,
    isPrivate: input.isPrivate ?? false,
    isInProgress: input.isInProgress ?? false,
    roomCode: input.roomCode ?? "",
    roomInstanceType: input.roomInstanceType ?? 0,
    clubId: input.clubId ?? 0,
    EncryptVoiceChat: input.encryptVoiceChat ?? false,
    matchmakingPolicy: input.matchmakingPolicy ?? 0,
    allowNewUsers: input.allowNewUsers ?? true,
    joinDisabled: input.joinDisabled ?? false,
    gameVersion: input.gameVersion ?? "",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await db.prepare("INSERT INTO room_instance (data) VALUES (?1)").bind(JSON.stringify(stored)).run();
  return toDto(stored);
}
async function getRoomInstance(db, id) {
  const row = await db.prepare("SELECT data FROM room_instance WHERE id = ?1").bind(id).first();
  return row ? toDto(parse(row.data)) : null;
}
async function getStoredRoomInstance(db, id) {
  const row = await db.prepare("SELECT data FROM room_instance WHERE id = ?1").bind(id).first();
  if (!row) return null;
  const stored = parse(row.data);
  return { ...stored, gameVersion: stored.gameVersion || "" };
}
async function setRoomInstanceInProgress(db, id, isInProgress) {
  const row = await db.prepare("SELECT data FROM room_instance WHERE id = ?1").bind(id).first();
  if (!row) return null;
  const stored = parse(row.data);
  stored.isInProgress = isInProgress;
  await db.prepare("UPDATE room_instance SET data = ?1 WHERE id = ?2").bind(JSON.stringify(stored), id).run();
  return toDto(stored);
}
async function setRoomInstancePrivate(db, id, isPrivate) {
  const row = await db.prepare("SELECT data FROM room_instance WHERE id = ?1").bind(id).first();
  if (!row) return null;
  const stored = parse(row.data);
  stored.isPrivate = isPrivate;
  await db.prepare("UPDATE room_instance SET data = ?1 WHERE id = ?2").bind(JSON.stringify(stored), id).run();
  return toDto(stored);
}
async function refreshInstanceFullness(db, roomInstanceId) {
  const row = await db.prepare("SELECT data FROM room_instance WHERE id = ?1").bind(roomInstanceId).first();
  if (!row) return null;
  const stored = parse(row.data);
  const count = await countPlayersInInstance(db, roomInstanceId);
  const isFull = stored.maxCapacity > 0 && count >= stored.maxCapacity;
  if (stored.isFull !== isFull) {
    stored.isFull = isFull;
    await db.prepare("UPDATE room_instance SET data = ?1 WHERE id = ?2").bind(JSON.stringify(stored), roomInstanceId).run();
  }
  return isFull;
}
const EMPTY_INSTANCE_GRACE_SECONDS = 300;
async function deleteEmptyRoomInstances(db, graceSeconds = EMPTY_INSTANCE_GRACE_SECONDS, now = Date.now()) {
  const createdBefore = new Date(now - graceSeconds * 1e3).toISOString();
  const { results } = await db.prepare(
    `DELETE FROM room_instance
			 WHERE created_at < ?1
			   AND NOT EXISTS (
			     SELECT 1 FROM presence WHERE presence.room_instance_id = room_instance.id
			   )
			 RETURNING json_extract(data, '$.roomInstanceId') AS id`
  ).bind(createdBefore).all();
  return results.map((r) => r.id);
}
async function getJoinableInstance(db, roomId, gameVersion, subRoomId, excludeInstanceId) {
  const binds = [roomId, gameVersion];
  const filters = [];
  if (subRoomId !== void 0) {
    binds.push(subRoomId);
    filters.push(`AND sub_room_id = ?${binds.length}`);
  }
  if (excludeInstanceId !== void 0) {
    binds.push(excludeInstanceId);
    filters.push(`AND id != ?${binds.length}`);
  }
  const row = await db.prepare(
    `SELECT data FROM room_instance
			 WHERE room_id = ?1 AND game_version = ?2
			   AND is_private = 0 AND is_full = 0 AND join_disabled = 0
			   AND is_in_progress = 0 ${filters.join(" ")}
			 ORDER BY id LIMIT 1`
  ).bind(...binds).first();
  return row ? toDto(parse(row.data)) : null;
}
async function getRoomInstancesByRoom(db, roomId, gameVersion) {
  const { results } = await db.prepare(
    `SELECT data FROM room_instance WHERE room_id = ?1${gameVersion === void 0 ? "" : " AND game_version = ?2"}`
  ).bind(...gameVersion === void 0 ? [roomId] : [roomId, gameVersion]).all();
  return results.map((r) => toDto(parse(r.data)));
}
async function getRoomInstanceSummariesByRoom(db, roomId) {
  const [{ results }, playersByInstance] = await Promise.all([
    db.prepare("SELECT data FROM room_instance WHERE room_id = ?1 ORDER BY id").bind(roomId).all(),
    getPlayerIdsByRoomInstance(db, roomId)
  ]);
  return results.map((r) => {
    const s = parse(r.data);
    return {
      roomInstanceId: s.roomInstanceId,
      roomId: s.roomId,
      subRoomId: s.subRoomId,
      isFull: s.isFull,
      createdAt: s.createdAt,
      playerIds: playersByInstance.get(s.roomInstanceId) ?? []
    };
  });
}
export {
  EMPTY_INSTANCE_GRACE_SECONDS,
  ROOM_INSTANCE_SCHEMA_DDL,
  createRoomInstance,
  deleteEmptyRoomInstances,
  getJoinableInstance,
  getRoomInstance,
  getRoomInstanceSummariesByRoom,
  getRoomInstancesByRoom,
  getStoredRoomInstance,
  refreshInstanceFullness,
  setRoomInstanceInProgress,
  setRoomInstancePrivate
};
