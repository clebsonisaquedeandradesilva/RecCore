// Ported from apps/econ/src/reward-db.ts; TypeScript types erased; native runtime imports.
const REWARD_STATUS_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS reward_status (
		account_id INTEGER NOT NULL,
		reward_type TEXT NOT NULL,
		gift_context TEXT NOT NULL,
		granted_at TEXT NOT NULL,
		grant_count INTEGER NOT NULL,
		PRIMARY KEY (account_id, reward_type, gift_context)
	)`
];
const REWARD_COOLDOWN_MS = 60 * 60 * 1e3;
async function claimReward(db, accountId, rewardType, giftContext = "", now = /* @__PURE__ */ new Date()) {
  const cutoff = new Date(now.getTime() - REWARD_COOLDOWN_MS).toISOString();
  const row = await db.prepare(
    `INSERT INTO reward_status (account_id, reward_type, gift_context, granted_at, grant_count)
			 VALUES (?1, ?2, ?3, ?4, 1)
			 ON CONFLICT (account_id, reward_type, gift_context) DO UPDATE SET
			   granted_at = excluded.granted_at,
			   grant_count = reward_status.grant_count + 1
			 WHERE reward_status.granted_at <= ?5
			 RETURNING grant_count`
  ).bind(accountId, rewardType, giftContext, now.toISOString(), cutoff).first();
  return row?.grant_count ?? null;
}
export {
  REWARD_COOLDOWN_MS,
  REWARD_STATUS_SCHEMA_DDL,
  claimReward
};
