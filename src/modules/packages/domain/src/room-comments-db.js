// Ported from packages/domain/src/room-comments-db.ts; TypeScript types erased; native runtime imports.
const ROOM_COMMENT_SCHEMA_DDL = [
  // `comment_id` is an ordinary autoincrement integer, and it is the CURSOR the read
  // endpoint pages on (`?minId=`), so it has to be monotonic per insert. AUTOINCREMENT
  // rather than a bare rowid alias for exactly that reason: a deleted comment's id must
  // never be handed out again, or a client polling with `minId` would skip the comment
  // that reused it.
  //
  // The position is three REALs, not the strings the form body carries. The client posts a
  // C# float's shortest round-trip text (`positionX=-0.4979804`) but reads the response
  // back as a NUMBER — `"PositionX": "1.5"` fails its parser — and a float64 holds those
  // 7-9 significant digits exactly, so the text that arrives is the text that goes back out.
  `CREATE TABLE IF NOT EXISTS room_comment (
		comment_id INTEGER PRIMARY KEY AUTOINCREMENT,
		room_id INTEGER NOT NULL,
		subroom_id INTEGER NOT NULL,
		player_id INTEGER NOT NULL,
		style INTEGER NOT NULL DEFAULT 0,
		message TEXT NOT NULL DEFAULT '',
		position_x REAL NOT NULL DEFAULT 0,
		position_y REAL NOT NULL DEFAULT 0,
		position_z REAL NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL
	)`,
  // The read is always "this room, newer than this id, newest first" — one index covers
  // the filter and the ordering together.
  `CREATE INDEX IF NOT EXISTS idx_room_comment_room ON room_comment (room_id, comment_id)`
];
function toRoomComment(row) {
  return {
    CommentId: row.comment_id,
    RoomId: row.room_id,
    SubRoomId: row.subroom_id,
    AccountId: row.player_id,
    CreatedAt: row.created_at,
    Message: row.message,
    Style: row.style,
    // Always true — see RoomComment. Nothing marks a comment read.
    Unread: true,
    PositionX: row.position_x,
    PositionY: row.position_y,
    PositionZ: row.position_z
  };
}
const SELECT_COLUMNS = `comment_id, room_id, subroom_id, player_id, style, message,
	 position_x, position_y, position_z, created_at`;
const DEFAULT_COMMENT_COUNT = 100;
const MAX_COMMENT_COUNT = 500;
function clampCommentCount(count) {
  if (count === null || !Number.isFinite(count)) return DEFAULT_COMMENT_COUNT;
  return Math.min(Math.max(Math.trunc(count), 1), MAX_COMMENT_COUNT);
}
async function getRoomComments(db, roomId, opts = {}) {
  const count = clampCommentCount(opts.count ?? null);
  const minId = Number.isFinite(opts.minId) ? opts.minId : -1;
  const subRoomId = opts.subRoomId ?? null;
  const { results } = await db.prepare(
    `SELECT ${SELECT_COLUMNS}
			 FROM room_comment
			 WHERE room_id = ?1 AND comment_id > ?2 AND (?3 IS NULL OR subroom_id = ?3)
			 ORDER BY comment_id DESC
			 LIMIT ?4`
  ).bind(roomId, minId, subRoomId, count).all();
  return results.map(toRoomComment);
}
async function createRoomComment(db, roomId, playerId, fields) {
  const row = await db.prepare(
    `INSERT INTO room_comment (room_id, subroom_id, player_id, style, message,
				position_x, position_y, position_z, created_at)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
			 RETURNING ${SELECT_COLUMNS}`
  ).bind(
    roomId,
    fields.subRoomId,
    playerId,
    fields.style ?? 0,
    fields.message,
    fields.positionX ?? 0,
    fields.positionY ?? 0,
    fields.positionZ ?? 0,
    (/* @__PURE__ */ new Date()).toISOString()
  ).first();
  return row ? toRoomComment(row) : null;
}
export {
  DEFAULT_COMMENT_COUNT,
  ROOM_COMMENT_SCHEMA_DDL,
  clampCommentCount,
  createRoomComment,
  getRoomComments
};
