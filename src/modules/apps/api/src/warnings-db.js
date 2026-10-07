// Ported from apps/api/src/warnings-db.ts; TypeScript types erased; native runtime imports.
const SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS warning (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		moderator_player_id INTEGER NOT NULL,
		warned_player_id INTEGER NOT NULL,
		report_category INTEGER NOT NULL DEFAULT 0,
		display_reason TEXT,
		moderator_note TEXT,
		created_at TEXT NOT NULL
	)`,
  `CREATE INDEX IF NOT EXISTS idx_warning_warned ON warning (warned_player_id)`,
  `CREATE INDEX IF NOT EXISTS idx_warning_moderator ON warning (moderator_player_id)`
];
async function createWarning(db, input) {
  const row = await db.prepare(
    `INSERT INTO warning (
				moderator_player_id, warned_player_id, report_category,
				display_reason, moderator_note, created_at
			 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
			 RETURNING *`
  ).bind(
    input.moderatorPlayerId,
    input.warnedPlayerId,
    input.reportCategory ?? 0,
    input.displayReason ?? null,
    input.moderatorNote ?? null,
    (/* @__PURE__ */ new Date()).toISOString()
  ).first();
  return row;
}
async function getWarningsAgainst(db, playerId) {
  const { results } = await db.prepare("SELECT * FROM warning WHERE warned_player_id = ?1 ORDER BY id DESC").bind(playerId).all();
  return results;
}
export {
  SCHEMA_DDL,
  createWarning,
  getWarningsAgainst
};
