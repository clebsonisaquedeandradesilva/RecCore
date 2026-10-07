// Ported from packages/domain/src/notifications-db.ts; TypeScript types erased; native runtime imports.
const MAX_NOTIFICATIONS_PER_PLAYER = 20;
const NOTIFICATION_SCHEMA_DDL = [
  // `notification_id` is AUTOINCREMENT rather than a bare rowid alias: it is handed to the
  // client (on the frame and in the inbox) and deleting a notification frees its rowid, so a
  // reused id would point a client's stale row at somebody else's.
  //
  // `data` is nullable because a Message's `Data` is: the types that carry no payload of
  // their own send null, distinct from the empty string a DM sends. Where it is set it is
  // always a STRING, whatever it means to that type (a room-role invite puts the offered
  // role tier in it). `room_id`/`player_event_id` are the optional context a notification
  // can name.
  //
  // `sent_time` is an ISO-8601 UTC string, which is fixed-width and so orders correctly
  // under SQLite's plain string comparison — though reads order by `notification_id`, which
  // is monotonic and doesn't tie when two land in the same millisecond.
  `CREATE TABLE IF NOT EXISTS notification (
		notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
		from_player_id INTEGER NOT NULL,
		to_player_id INTEGER NOT NULL,
		type INTEGER NOT NULL,
		data TEXT,
		room_id INTEGER,
		player_event_id INTEGER,
		sent_time TEXT NOT NULL
	)`,
  // The inbox read and the newest-wins trim are both "this player's notifications, newest
  // first", which is the whole access pattern.
  `CREATE INDEX IF NOT EXISTS idx_notification_recipient ON notification (to_player_id, notification_id DESC)`
];
const SELECT_COLUMNS = `notification_id, from_player_id, to_player_id, type, data, room_id, player_event_id, sent_time`;
const toNotification = (row) => ({
  Id: row.notification_id,
  FromPlayerId: row.from_player_id,
  ToPlayerId: row.to_player_id,
  SentTime: row.sent_time,
  Type: row.type,
  Data: row.data,
  RoomId: row.room_id,
  PlayerEventId: row.player_event_id
});
async function createNotification(db, notification) {
  const [inserted] = await db.batch([
    db.prepare(
      `INSERT INTO notification (from_player_id, to_player_id, type, data, room_id, player_event_id, sent_time)
				 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
				 RETURNING ${SELECT_COLUMNS}`
    ).bind(
      notification.FromPlayerId,
      notification.ToPlayerId,
      notification.Type,
      notification.Data ?? null,
      notification.RoomId ?? null,
      notification.PlayerEventId ?? null,
      (/* @__PURE__ */ new Date()).toISOString()
    ),
    db.prepare(
      `DELETE FROM notification
				 WHERE to_player_id = ?1 AND notification_id NOT IN (
				   SELECT notification_id FROM notification WHERE to_player_id = ?1
				   ORDER BY notification_id DESC LIMIT ?2
				 )`
    ).bind(notification.ToPlayerId, MAX_NOTIFICATIONS_PER_PLAYER)
  ]);
  return toNotification(inserted.results[0]);
}
async function getNotificationsForPlayer(db, playerId) {
  const { results } = await db.prepare(
    `SELECT ${SELECT_COLUMNS} FROM notification
			 WHERE to_player_id = ?1 ORDER BY notification_id DESC LIMIT ?2`
  ).bind(playerId, MAX_NOTIFICATIONS_PER_PLAYER).all();
  return results.map(toNotification);
}
async function deleteNotifications(db, playerId, notificationIds) {
  if (notificationIds.length === 0) return 0;
  const placeholders = notificationIds.map((_, i) => `?${i + 2}`).join(", ");
  const { results } = await db.prepare(
    `DELETE FROM notification
			 WHERE to_player_id = ?1 AND notification_id IN (${placeholders})
			 RETURNING notification_id`
  ).bind(playerId, ...notificationIds).all();
  return results.length;
}
export {
  MAX_NOTIFICATIONS_PER_PLAYER,
  NOTIFICATION_SCHEMA_DDL,
  createNotification,
  deleteNotifications,
  getNotificationsForPlayer
};
