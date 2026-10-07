// Ported from apps/auth/src/platform-db.ts; TypeScript types erased; native runtime imports.
import { PlatformType } from "../../../packages/domain/src/enums.js";
const PLATFORM_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS platform_account (
		account_id INTEGER NOT NULL,
		platform INTEGER NOT NULL,
		platform_id TEXT NOT NULL,
		linked_at TEXT NOT NULL,
		PRIMARY KEY (platform, platform_id, account_id)
	)`,
  // The picker's lookup: "which accounts does this identity open?". Covered by the
  // primary key's leading columns, so no separate index is needed for it.
  `CREATE INDEX IF NOT EXISTS idx_platform_account_account ON platform_account (account_id)`,
  // Lookup by bare platform id, across platforms — the bulk (friends) route, which
  // resolves ids it has no platform for.
  `CREATE INDEX IF NOT EXISTS idx_platform_account_platform_id ON platform_account (platform_id)`
];
const PLATFORM_BACKFILL_SQL = `INSERT OR IGNORE INTO platform_account (account_id, platform, platform_id, linked_at)
	SELECT
		account_id,
		COALESCE(json_extract(data, '$.platform'), 0),
		json_extract(data, '$.platformId'),
		COALESCE(json_extract(data, '$.createdAt'), '1970-01-01T00:00:00Z')
	FROM account
	WHERE json_extract(data, '$.platformId') IS NOT NULL
		AND json_extract(data, '$.platformId') <> ''`;
const CACHED_LOGIN_PLATFORMS = [PlatformType.Steam, PlatformType.Oculus];
const CACHED_LOGIN_FILTER = `platform IN (${CACHED_LOGIN_PLATFORMS.map((_, i) => `?${i + 2}`).join(", ")})`;
const SELECT_LINK = `SELECT account_id AS accountId, platform, platform_id AS platformId,
	linked_at AS linkedAt FROM platform_account`;
async function linkPlatformIdentity(db, accountId, platform, platformId) {
  if (platformId === "") return false;
  const res = await db.prepare(
    `INSERT OR IGNORE INTO platform_account (account_id, platform, platform_id, linked_at)
			 VALUES (?1, ?2, ?3, ?4)`
  ).bind(accountId, platform, platformId, (/* @__PURE__ */ new Date()).toISOString()).run();
  return res.meta.changes > 0;
}
async function getLinksForPlatformIdentity(db, platform, platformId) {
  if (platformId === "") return [];
  if (!CACHED_LOGIN_PLATFORMS.includes(platform)) return [];
  const { results } = await db.prepare(
    `${SELECT_LINK} WHERE platform = ?1 AND platform_id = ?2 ORDER BY linked_at, account_id`
  ).bind(platform, platformId).all();
  return results;
}
async function getLinksForPlatformId(db, platformId) {
  if (platformId === "") return [];
  const { results } = await db.prepare(
    `${SELECT_LINK} WHERE platform_id = ?1 AND ${CACHED_LOGIN_FILTER}
			 ORDER BY linked_at, account_id`
  ).bind(platformId, ...CACHED_LOGIN_PLATFORMS).all();
  return results;
}
async function getLinksForAccount(db, accountId) {
  const { results } = await db.prepare(`${SELECT_LINK} WHERE account_id = ?1 ORDER BY linked_at, platform`).bind(accountId).all();
  return results;
}
async function isPlatformIdentityLinked(db, accountId, platform, platformId) {
  if (platformId === "") return false;
  const row = await db.prepare(
    `SELECT 1 AS ok FROM platform_account
			 WHERE account_id = ?1 AND platform = ?2 AND platform_id = ?3`
  ).bind(accountId, platform, platformId).first();
  return row !== null;
}
async function countAccountsForPlatformIdentity(db, platform, platformId) {
  if (platformId === "") return 0;
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM platform_account WHERE platform = ?1 AND platform_id = ?2`).bind(platform, platformId).first();
  return row?.n ?? 0;
}
export {
  CACHED_LOGIN_PLATFORMS,
  PLATFORM_BACKFILL_SQL,
  PLATFORM_SCHEMA_DDL,
  countAccountsForPlatformIdentity,
  getLinksForAccount,
  getLinksForPlatformId,
  getLinksForPlatformIdentity,
  isPlatformIdentityLinked,
  linkPlatformIdentity
};
