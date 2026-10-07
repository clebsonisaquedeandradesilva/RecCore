// Ported from apps/econ/src/avatar-db.ts; TypeScript types erased; native runtime imports.
const SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS account (
		data TEXT NOT NULL,
		avatar TEXT,
		account_id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.accountId')) VIRTUAL,
		username_lower TEXT GENERATED ALWAYS AS (lower(json_extract(data, '$.username'))) VIRTUAL
	)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_account_id ON account (account_id)`
];
async function getAvatar(db, accountId) {
  const row = await db.prepare("SELECT avatar FROM account WHERE account_id = ?1").bind(accountId).first();
  return row?.avatar ? JSON.parse(row.avatar) : null;
}
async function setAvatar(db, accountId, avatar) {
  const { meta } = await db.prepare("UPDATE account SET avatar = ?2 WHERE account_id = ?1").bind(accountId, JSON.stringify(avatar)).run();
  return meta.changes > 0;
}
export {
  SCHEMA_DDL,
  getAvatar,
  setAvatar
};
