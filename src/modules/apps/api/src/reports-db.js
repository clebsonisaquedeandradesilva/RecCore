// Ported from apps/api/src/reports-db.ts; TypeScript types erased; native runtime imports.
const SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS report (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		reporter_player_id INTEGER NOT NULL,
		reported_player_id INTEGER NOT NULL,
		report_category INTEGER NOT NULL DEFAULT 0,
		details TEXT,
		height_reporter REAL,
		height_reported REAL,
		room_id INTEGER,
		room_instance_type TEXT,
		created_at TEXT NOT NULL,
		banned INTEGER NOT NULL DEFAULT 0,
		ban_expires TEXT,
		event_id INTEGER,
		invention_id INTEGER,
		custom_avatar_item_id TEXT
	)`,
  `CREATE INDEX IF NOT EXISTS idx_report_reported ON report (reported_player_id)`,
  `CREATE INDEX IF NOT EXISTS idx_report_reporter ON report (reporter_player_id)`,
  `CREATE INDEX IF NOT EXISTS idx_report_banned ON report (reported_player_id) WHERE banned = 1`
];
async function createReport(db, input) {
  const row = await db.prepare(
    `INSERT INTO report (
				reporter_player_id, reported_player_id, report_category, details,
				height_reporter, height_reported, room_id, room_instance_type, created_at,
				event_id, invention_id, custom_avatar_item_id
			 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
			 RETURNING *`
  ).bind(
    input.reporterPlayerId,
    input.reportedPlayerId,
    input.reportCategory ?? 0,
    input.details ?? null,
    input.heightReporter ?? null,
    input.heightReported ?? null,
    input.roomId ?? null,
    input.roomInstanceType ?? null,
    (/* @__PURE__ */ new Date()).toISOString(),
    input.eventId ?? null,
    input.inventionId ?? null,
    input.customAvatarItemId ?? null
  ).first();
  return row;
}
async function getReportsAgainst(db, playerId) {
  const { results } = await db.prepare("SELECT * FROM report WHERE reported_player_id = ?1 ORDER BY id DESC").bind(playerId).all();
  return results;
}
async function getActiveBan(db, playerId, now = /* @__PURE__ */ new Date()) {
  return db.prepare(
    `SELECT * FROM report
			 WHERE reported_player_id = ?1 AND banned = 1
				 AND (ban_expires IS NULL OR ban_expires > ?2)
			 ORDER BY ban_expires IS NOT NULL, ban_expires DESC
			 LIMIT 1`
  ).bind(playerId, now.toISOString()).first();
}
async function isPlayerBanned(db, playerId, now = /* @__PURE__ */ new Date()) {
  return await getActiveBan(db, playerId, now) !== null;
}
async function banFromReport(db, reportId, options = {}) {
  const banned = options.banned ?? true;
  return db.prepare("UPDATE report SET banned = ?2, ban_expires = ?3 WHERE id = ?1 RETURNING *").bind(reportId, banned ? 1 : 0, banned ? options.banExpires ?? null : null).first();
}
export {
  SCHEMA_DDL,
  banFromReport,
  createReport,
  getActiveBan,
  getReportsAgainst,
  isPlayerBanned
};
