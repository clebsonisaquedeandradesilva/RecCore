// Ported from apps/api/src/reputation-db.ts; TypeScript types erased; native runtime imports.
const SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS reputation (
		account_id INTEGER PRIMARY KEY,
		noteriety INTEGER NOT NULL DEFAULT 0,
		cheer_general INTEGER NOT NULL DEFAULT 0,
		cheer_helpful INTEGER NOT NULL DEFAULT 0,
		cheer_creative INTEGER NOT NULL DEFAULT 0,
		cheer_great_host INTEGER NOT NULL DEFAULT 0,
		cheer_sportsman INTEGER NOT NULL DEFAULT 0,
		subscriber_count INTEGER NOT NULL DEFAULT 0,
		subscribed_count INTEGER NOT NULL DEFAULT 0,
		is_cheerful INTEGER NOT NULL DEFAULT 1,
		selected_cheer INTEGER NOT NULL DEFAULT 0
	)`,
  `CREATE TABLE IF NOT EXISTS player_cheer (
		player_id INTEGER PRIMARY KEY,
		cheers_left INTEGER NOT NULL,
		created TEXT NOT NULL
	)`
];
var CheerCategory = /* @__PURE__ */ ((CheerCategory2) => {
  CheerCategory2[CheerCategory2["None"] = -1] = "None";
  CheerCategory2[CheerCategory2["General"] = 0] = "General";
  CheerCategory2[CheerCategory2["Helpful"] = 10] = "Helpful";
  CheerCategory2[CheerCategory2["Sportmanship"] = 20] = "Sportmanship";
  CheerCategory2[CheerCategory2["GreatHost"] = 30] = "GreatHost";
  CheerCategory2[CheerCategory2["Creative"] = 40] = "Creative";
  return CheerCategory2;
})(CheerCategory || {});
const CHEER_COLUMN = {
  [0 /* General */]: "cheer_general",
  [10 /* Helpful */]: "cheer_helpful",
  [20 /* Sportmanship */]: "cheer_sportsman",
  [30 /* GreatHost */]: "cheer_great_host",
  [40 /* Creative */]: "cheer_creative"
};
function isCheerCategory(value) {
  return value in CHEER_COLUMN;
}
const DAILY_CHEER_CREDIT = 20;
const CHEER_WINDOW_MS = 24 * 60 * 60 * 1e3;
function defaultReputation(accountId, credit = DAILY_CHEER_CREDIT) {
  return {
    AccountId: accountId,
    IsCheerful: true,
    Noteriety: 0,
    SelectedCheer: 0,
    CheerCredit: credit,
    CheerGeneral: 0,
    CheerHelpful: 0,
    CheerCreative: 0,
    CheerGreatHost: 0,
    CheerSportsman: 0,
    SubscriberCount: 0,
    SubscribedCount: 0
  };
}
function toReputation(row, credit) {
  return {
    AccountId: row.account_id,
    IsCheerful: row.is_cheerful !== 0,
    Noteriety: row.noteriety,
    SelectedCheer: row.selected_cheer,
    CheerCredit: credit,
    CheerGeneral: row.cheer_general,
    CheerHelpful: row.cheer_helpful,
    CheerCreative: row.cheer_creative,
    CheerGreatHost: row.cheer_great_host,
    CheerSportsman: row.cheer_sportsman,
    SubscriberCount: row.subscriber_count,
    SubscribedCount: row.subscribed_count
  };
}
function windowCutoff(now) {
  return new Date(now.getTime() - CHEER_WINDOW_MS).toISOString();
}
async function getCheerCredits(db, playerIds, now = /* @__PURE__ */ new Date()) {
  const credits = /* @__PURE__ */ new Map();
  if (playerIds.length === 0) return credits;
  const placeholders = playerIds.map((_, i) => `?${i + 2}`).join(", ");
  const { results } = await db.prepare(
    `SELECT player_id, cheers_left FROM player_cheer
			 WHERE created > ?1 AND player_id IN (${placeholders})`
  ).bind(windowCutoff(now), ...playerIds).all();
  for (const row of results) credits.set(row.player_id, row.cheers_left);
  return credits;
}
async function getCheerCredit(db, playerId, now = /* @__PURE__ */ new Date()) {
  const credits = await getCheerCredits(db, [playerId], now);
  return credits.get(playerId) ?? DAILY_CHEER_CREDIT;
}
async function getReputations(db, accountIds, now = /* @__PURE__ */ new Date()) {
  if (accountIds.length === 0) return [];
  const placeholders = accountIds.map((_, i) => `?${i + 1}`).join(", ");
  const [{ results }, credits] = await Promise.all([
    db.prepare(`SELECT * FROM reputation WHERE account_id IN (${placeholders})`).bind(...accountIds).all(),
    getCheerCredits(db, accountIds, now)
  ]);
  const stored = new Map(results.map((r) => [r.account_id, r]));
  return accountIds.map((id) => {
    const credit = credits.get(id) ?? DAILY_CHEER_CREDIT;
    const row = stored.get(id);
    return row === void 0 ? defaultReputation(id, credit) : toReputation(row, credit);
  });
}
async function getReputation(db, accountId, now = /* @__PURE__ */ new Date()) {
  const [reputation] = await getReputations(db, [accountId], now);
  return reputation;
}
async function spendCheerCredit(db, playerId, now = /* @__PURE__ */ new Date()) {
  const cutoff = windowCutoff(now);
  const row = await db.prepare(
    `INSERT INTO player_cheer (player_id, cheers_left, created) VALUES (?1, ?2, ?3)
			 ON CONFLICT (player_id) DO UPDATE SET
				cheers_left = CASE WHEN player_cheer.created <= ?4
					THEN ?2 ELSE player_cheer.cheers_left - 1 END,
				created = CASE WHEN player_cheer.created <= ?4
					THEN ?3 ELSE player_cheer.created END
			 WHERE player_cheer.created <= ?4 OR player_cheer.cheers_left > 0
			 RETURNING cheers_left`
  ).bind(playerId, DAILY_CHEER_CREDIT - 1, now.toISOString(), cutoff).first();
  return row === null ? null : row.cheers_left;
}
async function addCheer(db, accountId, category, now = /* @__PURE__ */ new Date()) {
  const column = CHEER_COLUMN[category];
  if (column === void 0) throw new Error(`unknown cheer category ${category}`);
  const [row, credit] = await Promise.all([
    db.prepare(
      `INSERT INTO reputation (account_id, ${column}) VALUES (?1, 1)
				 ON CONFLICT (account_id) DO UPDATE SET ${column} = reputation.${column} + 1
				 RETURNING *`
    ).bind(accountId).first(),
    getCheerCredit(db, accountId, now)
  ]);
  return toReputation(row, credit);
}
async function setSelectedCheer(db, accountId, category, now = /* @__PURE__ */ new Date()) {
  const selected = category === -1 /* None */ ? 0 : category;
  const [row, credit] = await Promise.all([
    db.prepare(
      `INSERT INTO reputation (account_id, selected_cheer) VALUES (?1, ?2)
				 ON CONFLICT (account_id) DO UPDATE SET selected_cheer = ?2
				 RETURNING *`
    ).bind(accountId, selected).first(),
    getCheerCredit(db, accountId, now)
  ]);
  return toReputation(row, credit);
}
export {
  CHEER_WINDOW_MS,
  CheerCategory,
  DAILY_CHEER_CREDIT,
  SCHEMA_DDL,
  addCheer,
  defaultReputation,
  getCheerCredit,
  getCheerCredits,
  getReputation,
  getReputations,
  isCheerCategory,
  setSelectedCheer,
  spendCheerCredit
};
