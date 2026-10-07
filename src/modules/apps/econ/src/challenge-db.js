// Ported from apps/econ/src/challenge-db.ts; TypeScript types erased; native runtime imports.
const CHALLENGE_STATUS_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS challenge_status (
		account_id INTEGER NOT NULL,
		challenge_id INTEGER NOT NULL,
		challenge_map_id INTEGER NOT NULL,
		complete INTEGER NOT NULL,
		config TEXT,
		updated_at TEXT NOT NULL,
		PRIMARY KEY (account_id, challenge_id)
	)`
];
async function recordChallengeProgress(db, accountId, progress) {
  const row = await db.prepare(
    `INSERT INTO challenge_status (account_id, challenge_id, challenge_map_id, complete, config, updated_at)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
			 ON CONFLICT (account_id, challenge_id) DO UPDATE SET
			   complete = CASE
			     WHEN challenge_status.challenge_map_id = excluded.challenge_map_id
			     THEN MAX(challenge_status.complete, excluded.complete)
			     ELSE excluded.complete
			   END,
			   config = CASE
			     WHEN challenge_status.challenge_map_id = excluded.challenge_map_id
			     THEN COALESCE(excluded.config, challenge_status.config)
			     ELSE excluded.config
			   END,
			   challenge_map_id = excluded.challenge_map_id,
			   updated_at = excluded.updated_at
			 RETURNING complete, config`
  ).bind(
    accountId,
    progress.challengeId,
    progress.challengeMapId,
    progress.complete ? 1 : 0,
    progress.config,
    (/* @__PURE__ */ new Date()).toISOString()
  ).first();
  return { complete: row?.complete === 1, config: row?.config ?? null };
}
async function getChallengeStatuses(db, accountId, challengeMapId) {
  const { results } = await db.prepare(
    `SELECT challenge_id, complete, config FROM challenge_status
			 WHERE account_id = ?1 AND challenge_map_id = ?2`
  ).bind(accountId, challengeMapId).all();
  return new Map(
    results.map((r) => [r.challenge_id, { complete: r.complete === 1, config: r.config }])
  );
}
const CHALLENGE_GIFT_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS challenge_gift (
		account_id INTEGER NOT NULL,
		challenge_map_id INTEGER NOT NULL,
		granted_at TEXT NOT NULL,
		PRIMARY KEY (account_id, challenge_map_id)
	)`
];
async function claimChallengeGift(db, accountId, challengeMapId, now = /* @__PURE__ */ new Date()) {
  const row = await db.prepare(
    `INSERT INTO challenge_gift (account_id, challenge_map_id, granted_at)
			 VALUES (?1, ?2, ?3)
			 ON CONFLICT (account_id, challenge_map_id) DO NOTHING
			 RETURNING granted_at`
  ).bind(accountId, challengeMapId, now.toISOString()).first();
  return row !== null;
}
export {
  CHALLENGE_GIFT_SCHEMA_DDL,
  CHALLENGE_STATUS_SCHEMA_DDL,
  claimChallengeGift,
  getChallengeStatuses,
  recordChallengeProgress
};
