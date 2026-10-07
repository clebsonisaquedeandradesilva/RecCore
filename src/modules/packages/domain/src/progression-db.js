// Ported from packages/domain/src/progression-db.ts; TypeScript types erased; native runtime imports.
const PROGRESSION_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS progression (
		account_id INTEGER PRIMARY KEY,
		level INTEGER NOT NULL DEFAULT 1,
		xp INTEGER NOT NULL DEFAULT 0
	)`
];
const LEVEL_REQUIRED_XP = [
  0,
  10,
  10,
  10,
  20,
  20,
  20,
  20,
  20,
  20,
  20,
  45,
  45,
  45,
  45,
  45,
  45,
  45,
  45,
  45,
  45,
  115,
  115,
  115,
  115,
  115,
  115,
  115,
  115,
  115,
  115,
  360,
  360,
  360,
  360,
  360,
  360,
  360,
  360,
  360,
  360,
  1080,
  1080,
  1080,
  1080,
  1080,
  1080,
  1080,
  1080,
  1080,
  1080
];
const CONSUMABLE_REWARD = -1;
const LEVEL_REWARDS = [
  // Level 0 is not a level anyone reaches; 0 is "no reward" rather than a rarity.
  0,
  // 1–10: consumables interleaved with the first clothing drops.
  CONSUMABLE_REWARD,
  10,
  CONSUMABLE_REWARD,
  10,
  CONSUMABLE_REWARD,
  CONSUMABLE_REWARD,
  CONSUMABLE_REWARD,
  10,
  CONSUMABLE_REWARD,
  10,
  // 11–20: 2-Star clothing all the way.
  10,
  10,
  10,
  10,
  10,
  10,
  10,
  10,
  10,
  10,
  // 21–30: 2-Star alternating with 3-Star.
  10,
  20,
  10,
  20,
  10,
  20,
  10,
  20,
  10,
  20,
  // 31–40: 3-Star with a 4-Star every few levels.
  30,
  20,
  20,
  20,
  30,
  20,
  20,
  20,
  20,
  30,
  // 41–50: 4-Star to the top, then the game's only 5-Star.
  30,
  30,
  30,
  30,
  30,
  30,
  30,
  30,
  30,
  50
];
function levelReward(level) {
  const reward = LEVEL_REWARDS[level];
  if (reward === void 0 || reward === 0) return null;
  return reward === CONSUMABLE_REWARD ? { kind: "consumable" } : { kind: "clothing", rarity: reward };
}
const MAX_LEVEL = LEVEL_REQUIRED_XP.length - 1;
function applyLevelUps(level, xp) {
  let currentLevel = level;
  let remaining = xp;
  while (currentLevel < MAX_LEVEL) {
    const cost = LEVEL_REQUIRED_XP[currentLevel] ?? 0;
    if (cost <= 0 || remaining < cost) break;
    remaining -= cost;
    currentLevel += 1;
  }
  return { level: currentLevel, xp: remaining };
}
function defaultProgression(accountId) {
  return { PlayerId: accountId, Level: 1, XP: 0 };
}
function levelsReached(grant) {
  const from = grant.progression.Level - grant.levelsGained;
  return Array.from({ length: grant.levelsGained }, (_, i) => from + i + 1);
}
async function addXp(db, accountId, xp) {
  if (xp <= 0) return { progression: await getProgression(db, accountId), levelsGained: 0 };
  const row = await db.prepare(
    `INSERT INTO progression (account_id, level, xp) VALUES (?1, 1, ?2)
			 ON CONFLICT (account_id) DO UPDATE SET xp = progression.xp + excluded.xp
			 RETURNING level, xp`
  ).bind(accountId, xp).first();
  if (row === null) return { progression: defaultProgression(accountId), levelsGained: 0 };
  const leveled = applyLevelUps(row.level, row.xp);
  const levelsGained = leveled.level - row.level;
  if (levelsGained > 0) {
    await db.prepare("UPDATE progression SET level = ?2, xp = ?3 WHERE account_id = ?1").bind(accountId, leveled.level, leveled.xp).run();
  }
  return {
    progression: { PlayerId: accountId, Level: leveled.level, XP: leveled.xp },
    levelsGained
  };
}
async function getProgression(db, accountId) {
  const row = await db.prepare("SELECT level, xp FROM progression WHERE account_id = ?1").bind(accountId).first();
  if (row === null) return defaultProgression(accountId);
  return { PlayerId: accountId, Level: row.level, XP: row.xp };
}
async function getProgressions(db, accountIds) {
  if (accountIds.length === 0) return [];
  const placeholders = accountIds.map((_, i) => `?${i + 1}`).join(", ");
  const { results } = await db.prepare(`SELECT account_id, level, xp FROM progression WHERE account_id IN (${placeholders})`).bind(...accountIds).all();
  const stored = new Map(results.map((r) => [r.account_id, r]));
  return accountIds.map((id) => {
    const row = stored.get(id);
    return row === void 0 ? defaultProgression(id) : { PlayerId: id, Level: row.level, XP: row.xp };
  });
}
export {
  CONSUMABLE_REWARD,
  LEVEL_REQUIRED_XP,
  LEVEL_REWARDS,
  MAX_LEVEL,
  PROGRESSION_SCHEMA_DDL,
  addXp,
  applyLevelUps,
  defaultProgression,
  getProgression,
  getProgressions,
  levelReward,
  levelsReached
};
