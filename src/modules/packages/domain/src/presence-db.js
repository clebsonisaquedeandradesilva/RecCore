// Ported from packages/domain/src/presence-db.ts; TypeScript types erased; native runtime imports.
const PRESENCE_TTL_SECONDS = 900;
const GAME_VERSION = "20230414";
const SUPPORTED_GAME_VERSIONS = [
  GAME_VERSION,
  // default
  "20250718.01",
  // beta
  "20230616",
  // alpha
  "20231207",
  // alpha
  "20250424.01"
  // alpha
];
function isSupportedGameVersion(version) {
  return version != null && SUPPORTED_GAME_VERSIONS.includes(version);
}
const PRESENCE_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS presence (
		data TEXT NOT NULL,
		account_id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.accountId')) VIRTUAL,
		room_instance_id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.roomInstance.roomInstanceId')) VIRTUAL,
		room_id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.roomInstance.roomId')) VIRTUAL,
		expires_at INTEGER GENERATED ALWAYS AS (json_extract(data, '$.expiresAt')) VIRTUAL
	)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_presence_account ON presence (account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_presence_room_instance ON presence (room_instance_id)`,
  `CREATE INDEX IF NOT EXISTS idx_presence_expires ON presence (expires_at)`
];
const nowSeconds = () => Math.floor(Date.now() / 1e3);
async function setPresence(db, input) {
  const stored = {
    ...input,
    expiresAt: nowSeconds() + PRESENCE_TTL_SECONDS
  };
  await db.prepare("INSERT OR REPLACE INTO presence (data) VALUES (?1)").bind(JSON.stringify(stored)).run();
  return stored;
}
async function getPresence(db, accountId, now = nowSeconds()) {
  const row = await db.prepare("SELECT data FROM presence WHERE account_id = ?1 AND expires_at > ?2").bind(accountId, now).first();
  return row ? JSON.parse(row.data) : null;
}
async function getPresences(db, accountIds, now = nowSeconds()) {
  const out = /* @__PURE__ */ new Map();
  if (accountIds.length === 0) return out;
  const placeholders = accountIds.map((_, i) => `?${i + 1}`).join(", ");
  const { results } = await db.prepare(
    `SELECT data FROM presence
			 WHERE account_id IN (${placeholders}) AND expires_at > ?${accountIds.length + 1}`
  ).bind(...accountIds, now).all();
  for (const r of results) {
    const p = JSON.parse(r.data);
    out.set(p.accountId, p);
  }
  return out;
}
async function countPlayersInInstance(db, roomInstanceId, now = nowSeconds()) {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM presence WHERE room_instance_id = ?1 AND expires_at > ?2").bind(roomInstanceId, now).first();
  return row?.n ?? 0;
}
async function getPlayerIdsInInstance(db, roomInstanceId, now = nowSeconds()) {
  const { results } = await db.prepare(
    `SELECT account_id AS accountId FROM presence
			 WHERE room_instance_id = ?1 AND expires_at > ?2
			 ORDER BY account_id`
  ).bind(roomInstanceId, now).all();
  return results.map((r) => r.accountId);
}
async function getPlayerIdsInRoom(db, roomId, now = nowSeconds()) {
  const { results } = await db.prepare(
    `SELECT DISTINCT account_id AS accountId FROM presence
			 WHERE room_id = ?1 AND expires_at > ?2 AND room_instance_id IS NOT NULL
			 ORDER BY account_id`
  ).bind(roomId, now).all();
  return results.map((r) => r.accountId);
}
async function countOnlinePlayers(db, now = nowSeconds()) {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM presence WHERE expires_at > ?1").bind(now).first();
  return row?.n ?? 0;
}
async function countPlayersByRoom(db, now = nowSeconds()) {
  const { results } = await db.prepare(
    `SELECT room_id AS roomId, COUNT(*) AS n FROM presence
			 WHERE expires_at > ?1 AND room_instance_id IS NOT NULL AND room_id IS NOT NULL
			 GROUP BY room_id`
  ).bind(now).all();
  return new Map(results.map((r) => [r.roomId, r.n]));
}
async function getPlayerIdsByRoomInstance(db, roomId, now = nowSeconds()) {
  const { results } = await db.prepare(
    `SELECT room_instance_id AS instanceId, account_id AS accountId FROM presence
			 WHERE room_id = ?1 AND expires_at > ?2 AND room_instance_id IS NOT NULL
			 ORDER BY account_id`
  ).bind(roomId, now).all();
  const out = /* @__PURE__ */ new Map();
  for (const r of results) {
    const players = out.get(r.instanceId);
    if (players) players.push(r.accountId);
    else out.set(r.instanceId, [r.accountId]);
  }
  return out;
}
async function getExpiredPresenceInstanceIds(db, now = nowSeconds()) {
  const { results } = await db.prepare(
    `SELECT DISTINCT room_instance_id AS id FROM presence
			 WHERE expires_at <= ?1 AND room_instance_id IS NOT NULL`
  ).bind(now).all();
  return results.map((r) => r.id);
}
async function deleteExpiredPresence(db, now = nowSeconds()) {
  const res = await db.prepare("DELETE FROM presence WHERE expires_at <= ?1").bind(now).run();
  return res.meta.changes ?? 0;
}
async function deletePresence(db, accountId) {
  const res = await db.prepare("DELETE FROM presence WHERE account_id = ?1").bind(accountId).run();
  return res.meta.changes ?? 0;
}
export {
  GAME_VERSION,
  PRESENCE_SCHEMA_DDL,
  PRESENCE_TTL_SECONDS,
  SUPPORTED_GAME_VERSIONS,
  countOnlinePlayers,
  countPlayersByRoom,
  countPlayersInInstance,
  deleteExpiredPresence,
  deletePresence,
  getExpiredPresenceInstanceIds,
  getPlayerIdsByRoomInstance,
  getPlayerIdsInInstance,
  getPlayerIdsInRoom,
  getPresence,
  getPresences,
  isSupportedGameVersion,
  setPresence
};
