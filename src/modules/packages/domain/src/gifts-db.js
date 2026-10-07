// Ported from packages/domain/src/gifts-db.ts; TypeScript types erased; native runtime imports.
const RECEIVED_GIFT_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS received_gift (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		account_id INTEGER NOT NULL,
		data TEXT NOT NULL,
		created_at TEXT NOT NULL
	)`,
  `CREATE INDEX IF NOT EXISTS idx_received_gift_account ON received_gift (account_id)`
];
async function createGift(db, accountId, content) {
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const row = await db.prepare(
    "INSERT INTO received_gift (account_id, data, created_at) VALUES (?1, ?2, ?3) RETURNING id"
  ).bind(accountId, JSON.stringify(content), createdAt).first();
  return { id: row?.id ?? 0, createdAt };
}
async function getGift(db, giftId) {
  const row = await db.prepare("SELECT id, account_id, data, created_at FROM received_gift WHERE id = ?1").bind(giftId).first();
  if (row === null) return null;
  return {
    accountId: row.account_id,
    gift: { ...JSON.parse(row.data), Id: row.id, CreatedAt: row.created_at }
  };
}
async function getPendingGifts(db, accountId) {
  const { results } = await db.prepare("SELECT id, data, created_at FROM received_gift WHERE account_id = ?1 ORDER BY id").bind(accountId).all();
  return results.map((r) => ({
    ...JSON.parse(r.data),
    Id: r.id,
    CreatedAt: r.created_at
  }));
}
async function consumeGift(db, accountId, giftId) {
  const row = await db.prepare(
    "DELETE FROM received_gift WHERE id = ?1 AND account_id = ?2 RETURNING id, data, created_at"
  ).bind(giftId, accountId).first();
  if (row === null) return null;
  return { ...JSON.parse(row.data), Id: row.id, CreatedAt: row.created_at };
}
export {
  RECEIVED_GIFT_SCHEMA_DDL,
  consumeGift,
  createGift,
  getGift,
  getPendingGifts
};
