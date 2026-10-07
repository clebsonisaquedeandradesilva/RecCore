// Ported from apps/econ/src/consumables-db.ts; TypeScript types erased; native runtime imports.
const CONSUMABLE_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS consumable (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		account_id INTEGER NOT NULL,
		consumable_item_desc TEXT NOT NULL,
		count INTEGER NOT NULL,
		created_at TEXT NOT NULL
	)`,
  `CREATE INDEX IF NOT EXISTS idx_consumable_account ON consumable (account_id)`
];
async function grantConsumable(db, accountId, consumableItemDesc, count) {
  const row = await db.prepare(
    `INSERT INTO consumable (account_id, consumable_item_desc, count, created_at)
			 VALUES (?1, ?2, ?3, ?4) RETURNING id`
  ).bind(accountId, consumableItemDesc, count, (/* @__PURE__ */ new Date()).toISOString()).first();
  return row?.id ?? 0;
}
async function countConsumable(db, accountId, consumableItemDesc) {
  const row = await db.prepare(
    "SELECT COALESCE(SUM(count), 0) AS total FROM consumable WHERE account_id = ?1 AND consumable_item_desc = ?2"
  ).bind(accountId, consumableItemDesc).first();
  return row?.total ?? 0;
}
async function consumeConsumable(db, accountId, id, deltaCount) {
  const row = await db.prepare(
    "SELECT consumable_item_desc, count, created_at FROM consumable WHERE id = ?1 AND account_id = ?2"
  ).bind(id, accountId).first();
  if (row === null) return null;
  const remaining = row.count - deltaCount;
  if (remaining > 0) {
    await db.prepare("UPDATE consumable SET count = ?2 WHERE id = ?1").bind(id, remaining).run();
  } else {
    await db.prepare("DELETE FROM consumable WHERE id = ?1 AND account_id = ?2").bind(id, accountId).run();
  }
  return {
    id,
    consumableItemDesc: row.consumable_item_desc,
    createdAt: row.created_at,
    previousCount: row.count,
    remaining: Math.max(remaining, 0)
  };
}
async function getConsumables(db, accountId) {
  const { results } = await db.prepare(
    `SELECT id, consumable_item_desc, count, created_at
			 FROM consumable WHERE account_id = ?1 ORDER BY id`
  ).bind(accountId).all();
  const byDesc = /* @__PURE__ */ new Map();
  for (const r of results) {
    const existing = byDesc.get(r.consumable_item_desc);
    if (existing === void 0) {
      byDesc.set(r.consumable_item_desc, {
        Ids: [r.id],
        CreatedAts: [r.created_at],
        ConsumableItemDesc: r.consumable_item_desc,
        Count: r.count,
        InitialCount: r.count,
        IsActive: false,
        ActiveDurationMinutes: 0,
        IsTransferable: false
      });
    } else {
      existing.Ids.push(r.id);
      existing.CreatedAts.push(r.created_at);
      existing.Count += r.count;
      existing.InitialCount += r.count;
    }
  }
  return [...byDesc.values()];
}
export {
  CONSUMABLE_SCHEMA_DDL,
  consumeConsumable,
  countConsumable,
  getConsumables,
  grantConsumable
};
