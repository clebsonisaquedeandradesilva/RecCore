// Ported from packages/domain/src/inventory-invention-db.ts; TypeScript types erased; native runtime imports.
const INVENTORY_INVENTION_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS inventory_invention (
		account_id INTEGER NOT NULL,
		invention_id INTEGER NOT NULL,
		acquired_at TEXT NOT NULL,
		PRIMARY KEY (account_id, invention_id)
	)`
];
async function grantInvention(db, accountId, inventionId) {
  await db.prepare(
    "INSERT OR IGNORE INTO inventory_invention (account_id, invention_id, acquired_at) VALUES (?1, ?2, ?3)"
  ).bind(accountId, inventionId, (/* @__PURE__ */ new Date()).toISOString()).run();
}
async function ownsInvention(db, accountId, inventionId) {
  const row = await db.prepare(
    "SELECT 1 AS owned FROM inventory_invention WHERE account_id = ?1 AND invention_id = ?2"
  ).bind(accountId, inventionId).first();
  return row !== null;
}
async function getInventionAcquisitionCounts(db, since) {
  const { results } = await db.prepare(
    `SELECT invention_id, COUNT(*) AS count FROM inventory_invention
			 WHERE acquired_at >= ?1
			 GROUP BY invention_id
			 ORDER BY count DESC, invention_id DESC`
  ).bind(since).all();
  return results.map((r) => ({ inventionId: r.invention_id, count: r.count }));
}
async function getOwnedInventionIds(db, accountId) {
  const { results } = await db.prepare(
    "SELECT invention_id FROM inventory_invention WHERE account_id = ?1 ORDER BY acquired_at, invention_id"
  ).bind(accountId).all();
  return results.map((r) => r.invention_id);
}
export {
  INVENTORY_INVENTION_SCHEMA_DDL,
  getInventionAcquisitionCounts,
  getOwnedInventionIds,
  grantInvention,
  ownsInvention
};
