// Ported from apps/api/src/bans-db.ts; TypeScript types erased; native runtime imports.
const DEFAULT_BAN_MATCH_ARMS = { ip: true, platform: true };
function banEvasionMatch(value) {
  if (value === void 0) return DEFAULT_BAN_MATCH_ARMS;
  const names = value.split(",").map((n) => n.trim().toLowerCase()).filter((n) => n !== "");
  if (names.length === 0 || names.includes("off") || names.includes("none")) {
    return { ip: false, platform: false };
  }
  return { ip: names.includes("ip"), platform: names.includes("platform") };
}
const RESOLVE_BAN_SQL = `
WITH me AS (
	SELECT
		NULLIF(json_extract(data, '$.signupIp'), '') AS signup_ip,
		NULLIF(json_extract(data, '$.lastLoginIp'), '') AS last_login_ip
	FROM account WHERE account_id = ?1
),
ips AS (
	SELECT signup_ip AS ip FROM me WHERE signup_ip IS NOT NULL
	UNION SELECT last_login_ip FROM me WHERE last_login_ip IS NOT NULL
	UNION SELECT ?3 WHERE ?3 IS NOT NULL
),
ids AS (
	SELECT platform, platform_id FROM platform_account WHERE account_id = ?1
	UNION SELECT ?4, ?5 WHERE ?5 IS NOT NULL
)
SELECT * FROM (
	SELECT r.*,
		(r.reported_player_id = ?1) AS via_account,
		(?6 = 1 AND EXISTS (
			SELECT 1 FROM account a, ips
			WHERE a.account_id = r.reported_player_id
				AND a.account_id <> COALESCE(?1, -1)
				AND ips.ip IN (
					json_extract(a.data, '$.signupIp'),
					json_extract(a.data, '$.lastLoginIp')
				)
		)) AS via_ip,
		(?7 = 1 AND EXISTS (
			SELECT 1 FROM platform_account p, ids
			WHERE p.account_id = r.reported_player_id
				AND p.account_id <> COALESCE(?1, -1)
				AND p.platform = ids.platform
				AND p.platform_id = ids.platform_id
		)) AS via_platform
	FROM report r
	WHERE r.banned = 1 AND (r.ban_expires IS NULL OR r.ban_expires > ?2)
)
WHERE via_account = 1 OR via_ip = 1 OR via_platform = 1
ORDER BY via_account DESC, via_platform DESC, ban_expires IS NOT NULL, ban_expires DESC
LIMIT 1`;
async function resolveBan(db, accountId, options = {}) {
  const arms = options.arms ?? DEFAULT_BAN_MATCH_ARMS;
  const identity = options.identity ?? {};
  const row = await db.prepare(RESOLVE_BAN_SQL).bind(
    accountId,
    (options.now ?? /* @__PURE__ */ new Date()).toISOString(),
    identity.ip || null,
    identity.platform ?? 0,
    identity.platformId || null,
    arms.ip ? 1 : 0,
    arms.platform ? 1 : 0
  ).first();
  if (!row) return null;
  const { via_account, via_ip: _via_ip, via_platform, ...ban } = row;
  const via = via_account === 1 ? "account" : via_platform === 1 ? "platform" : "ip";
  return { ban, via, bannedAccountId: ban.reported_player_id };
}
async function isPlayerBlocked(db, accountId, options = {}) {
  return await resolveBan(db, accountId, options) !== null;
}
export {
  DEFAULT_BAN_MATCH_ARMS,
  banEvasionMatch,
  isPlayerBlocked,
  resolveBan
};
