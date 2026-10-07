// Ported from packages/domain/src/stats-db.ts; TypeScript types erased; native runtime imports.
const STAT_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS stat (
		stat_type TEXT NOT NULL,
		value INTEGER NOT NULL,
		datetime TEXT NOT NULL
	)`,
  `CREATE INDEX IF NOT EXISTS idx_stat_type_datetime ON stat (stat_type, datetime)`
];
async function recordStat(db, statType, value, now = /* @__PURE__ */ new Date()) {
  await db.prepare("INSERT INTO stat (stat_type, value, datetime) VALUES (?1, ?2, ?3)").bind(statType, value, now.toISOString()).run();
}
async function getStats(db, statType, limit = 1e3) {
  const { results } = await db.prepare(
    "SELECT stat_type, value, datetime FROM stat WHERE stat_type = ?1 ORDER BY datetime ASC LIMIT ?2"
  ).bind(statType, limit).all();
  return results.map((r) => ({ statType: r.stat_type, value: r.value, datetime: r.datetime }));
}
export {
  STAT_SCHEMA_DDL,
  getStats,
  recordStat
};
