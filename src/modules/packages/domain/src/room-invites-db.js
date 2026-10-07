// Ported from packages/domain/src/room-invites-db.ts; TypeScript types erased; native runtime imports.
const ROOM_INVITE_SCHEMA_DDL = [
  // `room_invite_id` is AUTOINCREMENT rather than a bare rowid alias: the id is handed to
  // the client, and expiring old invites deletes rows, so a reused id would point a
  // client's stale invite at somebody else's.
  //
  // `room_id` is nullable because the invite is: the caller names a room INSTANCE, and one
  // that has already died (or was never real) leaves the invite with nothing to resolve —
  // `match` sends it anyway, with a null RoomId, so the row records the same thing.
  //
  // `created_at` is epoch SECONDS, like `presence.expires_at` on the same database and for
  // the same reason: the sweep that will expire these compares it against `Date.now()/1000`
  // in SQL, and an integer compare needs no parsing. Indexed for that sweep.
  `CREATE TABLE IF NOT EXISTS room_invite (
		room_invite_id INTEGER PRIMARY KEY AUTOINCREMENT,
		from_player_id INTEGER NOT NULL,
		to_player_id INTEGER NOT NULL,
		room_id INTEGER,
		created_at INTEGER NOT NULL
	)`,
  `CREATE INDEX IF NOT EXISTS idx_room_invite_created ON room_invite (created_at)`
];
const SELECT_COLUMNS = `room_invite_id, from_player_id, to_player_id, room_id`;
const nowSeconds = () => Math.floor(Date.now() / 1e3);
async function getRoomInvite(db, roomInviteId) {
  const row = await db.prepare(`SELECT ${SELECT_COLUMNS} FROM room_invite WHERE room_invite_id = ?1`).bind(roomInviteId).first();
  if (!row) return null;
  return {
    RoomInviteId: row.room_invite_id,
    FromPlayerId: row.from_player_id,
    ToPlayerId: row.to_player_id,
    RoomId: row.room_id
  };
}
async function getLatestRoomInviteBetween(db, fromPlayerId, toPlayerId) {
  const row = await db.prepare(
    `SELECT ${SELECT_COLUMNS} FROM room_invite
			 WHERE from_player_id = ?1 AND to_player_id = ?2
			 ORDER BY room_invite_id DESC LIMIT 1`
  ).bind(fromPlayerId, toPlayerId).first();
  if (!row) return null;
  return {
    RoomInviteId: row.room_invite_id,
    FromPlayerId: row.from_player_id,
    ToPlayerId: row.to_player_id,
    RoomId: row.room_id
  };
}
async function createRoomInvite(db, fromPlayerId, toPlayerId, roomId) {
  const row = await db.prepare(
    `INSERT INTO room_invite (from_player_id, to_player_id, room_id, created_at)
			 VALUES (?1, ?2, ?3, ?4)
			 RETURNING ${SELECT_COLUMNS}`
  ).bind(fromPlayerId, toPlayerId, roomId, nowSeconds()).first();
  if (!row) return null;
  return {
    RoomInviteId: row.room_invite_id,
    FromPlayerId: row.from_player_id,
    ToPlayerId: row.to_player_id,
    RoomId: row.room_id
  };
}
async function deleteRoomInvite(db, roomInviteId) {
  const row = await db.prepare(`DELETE FROM room_invite WHERE room_invite_id = ?1 RETURNING room_invite_id`).bind(roomInviteId).first();
  return row !== null;
}
export {
  ROOM_INVITE_SCHEMA_DDL,
  createRoomInvite,
  deleteRoomInvite,
  getLatestRoomInviteBetween,
  getRoomInvite
};
