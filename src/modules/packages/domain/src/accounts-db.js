// Ported from packages/domain/src/accounts-db.ts; TypeScript types erased; native runtime imports.
const SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS account (
		data TEXT NOT NULL,
		avatar TEXT,
		account_id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.accountId')) VIRTUAL,
		username_lower TEXT GENERATED ALWAYS AS (lower(json_extract(data, '$.username'))) VIRTUAL
	)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_account_id ON account (account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_accounts_username_lower ON account (username_lower)`
];
const parseOne = (row) => row ? JSON.parse(row.data) : null;
const parseAll = (rows) => rows.map((r) => JSON.parse(r.data));
const ADJECTIVES = [
  "Swift",
  "Brave",
  "Clever",
  "Happy",
  "Mighty",
  "Lucky",
  "Sunny",
  "Cosmic",
  "Witty",
  "Nimble",
  "Jolly",
  "Bold",
  "Gentle",
  "Fuzzy",
  "Speedy",
  "Shiny"
];
const NOUNS = [
  "Fox",
  "Otter",
  "Falcon",
  "Panda",
  "Tiger",
  "Comet",
  "Maple",
  "Pixel",
  "Robin",
  "Wolf",
  "Koala",
  "Dragon",
  "Penguin",
  "Badger",
  "Heron",
  "Lynx"
];
function randomUsername() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const n = Math.floor(Math.random() * 1e4);
  return `${adj}${noun}${n}`;
}
function defaultAccount(id, overrides = {}) {
  return {
    accountId: id,
    username: `Player${id}`,
    displayName: `Player${id}`,
    profileImage: "DefaultProfileImage.jpg",
    bannerImage: "",
    displayEmoji: "",
    isJunior: false,
    platforms: 0,
    personalPronouns: 0,
    identityFlags: 0,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    ...overrides
  };
}
async function getAccount(db, id) {
  return parseOne(
    await db.prepare("SELECT data FROM account WHERE account_id = ?1").bind(id).first()
  );
}
async function getAccountByUsername(db, username) {
  return parseOne(
    await db.prepare("SELECT data FROM account WHERE username_lower = ?1").bind(username.toLowerCase()).first()
  );
}
const SEARCH_LIMIT = 20;
const escapeLike = (s) => s.replace(/[\\%_]/g, "\\$&");
async function searchAccounts(db, name, limit = SEARCH_LIMIT) {
  const q = name.trim().toLowerCase();
  if (q === "") return [];
  const { results } = await db.prepare(
    `SELECT data FROM account WHERE username_lower LIKE ?1 ESCAPE '\\' ORDER BY username_lower LIMIT ?2`
  ).bind(`${escapeLike(q)}%`, limit).all();
  return parseAll(results);
}
async function getAccountsByDeviceId(db, deviceId) {
  if (deviceId === "") return [];
  const { results } = await db.prepare("SELECT data FROM account WHERE json_extract(data, '$.deviceId') = ?1").bind(deviceId).all();
  return parseAll(results);
}
async function setLastLoginTime(db, id, time) {
  await db.prepare(
    "UPDATE account SET data = json_set(data, '$.lastLoginTime', ?2) WHERE account_id = ?1"
  ).bind(id, time).run();
}
async function setLoginContext(db, id, ctx) {
  const sets = [];
  const binds = [];
  if (ctx.deviceId) {
    sets.push(`'$.deviceId', ?${binds.length + 2}`);
    binds.push(ctx.deviceId);
    if (ctx.deviceClass !== void 0) {
      sets.push(`'$.deviceClass', CAST(?${binds.length + 2} AS INTEGER)`);
      binds.push(ctx.deviceClass);
    }
  }
  if (ctx.ip) {
    sets.push(`'$.lastLoginIp', ?${binds.length + 2}`);
    binds.push(ctx.ip);
  }
  if (sets.length === 0) return;
  await db.prepare(`UPDATE account SET data = json_set(data, ${sets.join(", ")}) WHERE account_id = ?1`).bind(id, ...binds).run();
}
async function countAccountsBySignupIp(db, ip) {
  if (ip === "") return 0;
  const row = await db.prepare("SELECT COUNT(*) AS n FROM account WHERE json_extract(data, '$.signupIp') = ?1").bind(ip).first();
  return row?.n ?? 0;
}
async function getAccountsByIds(db, ids) {
  if (ids.length === 0) return [];
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(",");
  const { results } = await db.prepare(`SELECT data FROM account WHERE account_id IN (${placeholders})`).bind(...ids).all();
  return parseAll(results);
}
async function updateAccount(db, id, overrides) {
  const current = await getAccount(db, id) ?? defaultAccount(id);
  const updated = { ...current, ...overrides, accountId: id };
  const data = JSON.stringify(updated);
  const res = await db.prepare("UPDATE account SET data = ?2 WHERE account_id = ?1").bind(id, data).run();
  if (!res.meta.changes) {
    await db.prepare("INSERT INTO account (data) VALUES (?1)").bind(data).run();
  }
  return updated;
}
async function createAccount(db, overrides = {}) {
  const row = await db.prepare("SELECT COALESCE(MAX(account_id), 1) + 1 AS next FROM account").first();
  const id = row?.next ?? 2;
  const username = overrides.username ?? randomUsername();
  const account = defaultAccount(id, { username, displayName: username, ...overrides });
  await db.prepare("INSERT INTO account (data) VALUES (?1)").bind(JSON.stringify(account)).run();
  return account;
}
async function getPasswordHash(db, id) {
  const row = await db.prepare(
    "SELECT json_extract(data, '$.passwordHash') AS hash FROM account WHERE account_id = ?1"
  ).bind(id).first();
  return row?.hash ?? null;
}
async function setPasswordHash(db, id, hash) {
  const { meta } = await db.prepare("UPDATE account SET data = json_set(data, '$.passwordHash', ?2) WHERE account_id = ?1").bind(id, hash).run();
  return meta.changes > 0;
}
export {
  SCHEMA_DDL,
  SEARCH_LIMIT,
  countAccountsBySignupIp,
  createAccount,
  defaultAccount,
  getAccount,
  getAccountByUsername,
  getAccountsByDeviceId,
  getAccountsByIds,
  getPasswordHash,
  randomUsername,
  searchAccounts,
  setLastLoginTime,
  setLoginContext,
  setPasswordHash,
  updateAccount
};
