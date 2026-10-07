// Ported from packages/domain/src/outfits-db.ts; TypeScript types erased; native runtime imports.
const OUTFIT_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS outfit (
		account_id INTEGER NOT NULL,
		set_id INTEGER NOT NULL,
		avatar TEXT NOT NULL,
		PRIMARY KEY (account_id, set_id)
	)`
];
const CURRENT_OUTFIT_SLOT = 0;
async function getOutfits(db, accountId) {
  const { results } = await db.prepare("SELECT avatar FROM outfit WHERE account_id = ?1 ORDER BY set_id").bind(accountId).all();
  return results.map((r) => JSON.parse(r.avatar));
}
async function getOutfit(db, accountId, slot) {
  const row = await db.prepare("SELECT avatar FROM outfit WHERE account_id = ?1 AND set_id = ?2").bind(accountId, slot).first();
  return row ? JSON.parse(row.avatar) : null;
}
const MAX_BULK_OUTFIT_ACCOUNTS = 99;
async function getOutfitsByAccounts(db, accountIds, slot) {
  const ids = [...new Set(accountIds)];
  if (ids.length === 0) return /* @__PURE__ */ new Map();
  const placeholders = ids.map((_, n) => `?${n + 2}`).join(", ");
  const { results } = await db.prepare(
    `SELECT account_id, avatar FROM outfit WHERE set_id = ?1 AND account_id IN (${placeholders})`
  ).bind(slot, ...ids).all();
  return new Map(results.map((row) => [row.account_id, JSON.parse(row.avatar)]));
}
async function setOutfit(db, accountId, outfit) {
  await db.prepare(
    `INSERT INTO outfit (account_id, set_id, avatar) VALUES (?1, ?2, ?3)
			 ON CONFLICT (account_id, set_id) DO UPDATE SET avatar = ?3`
  ).bind(accountId, outfit.Slot, JSON.stringify(outfit)).run();
}
export {
  CURRENT_OUTFIT_SLOT,
  MAX_BULK_OUTFIT_ACCOUNTS,
  OUTFIT_SCHEMA_DDL,
  getOutfit,
  getOutfits,
  getOutfitsByAccounts,
  setOutfit
};
