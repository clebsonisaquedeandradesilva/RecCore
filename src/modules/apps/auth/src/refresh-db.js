// Ported from apps/auth/src/refresh-db.ts; TypeScript types erased; native runtime imports.
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const REFRESH_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS refresh_tokens (
		token_hash TEXT PRIMARY KEY,
		account_id INTEGER NOT NULL,
		created_at INTEGER NOT NULL,
		expires_at INTEGER NOT NULL
	)`,
  `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_account ON refresh_tokens (account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens (expires_at)`
];
async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function issueRefreshToken(db, accountId) {
  const token = `${crypto.randomUUID()}`;
  const now = Math.floor(Date.now() / 1e3);
  await db.prepare(
    `INSERT INTO refresh_tokens (token_hash, account_id, created_at, expires_at)
			 VALUES (?1, ?2, ?3, ?4)`
  ).bind(await hashToken(token), accountId, now, now + REFRESH_TTL_SECONDS).run();
  return token;
}
const MAX_ATTEMPTS = 3;
async function consumeRefreshToken(db, token) {
  const now = Math.floor(Date.now() / 1e3);
  const statement = db.prepare(
    `DELETE FROM refresh_tokens WHERE token_hash = ?1
			 RETURNING account_id AS accountId, expires_at AS expiresAt`
  ).bind(await hashToken(token));
  let row = null;
  for (let attempt = 1; ; attempt++) {
    try {
      row = await statement.first();
      break;
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) throw err;
      await new Promise((resolve) => setTimeout(resolve, attempt * attempt * 250));
    }
  }
  if (!row || row.expiresAt < now) return null;
  return row.accountId;
}
export {
  REFRESH_SCHEMA_DDL,
  REFRESH_TTL_SECONDS,
  consumeRefreshToken,
  issueRefreshToken
};
