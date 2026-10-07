// Ported from packages/domain/src/lists-db.ts; TypeScript types erased; native runtime imports.
const CURATED_LIST_SCHEMA_DDL = [
  // `list_id` is an ordinary autoincrement integer. The reference's own ids run to 18
  // digits (`624765592684307326`) and the static captures still carry theirs verbatim, but
  // nothing requires a list this server MINTS to look like that — and a small id stays well
  // inside what a JS number holds exactly, so it can't be rounded on its way through D1 or
  // JSON. AUTOINCREMENT rather than a bare rowid alias: a list id is handed to the client,
  // so a deleted list's id must not be handed out again to a different list.
  `CREATE TABLE IF NOT EXISTS list (
		list_id INTEGER PRIMARY KEY AUTOINCREMENT,
		creator_account_id INTEGER NOT NULL,
		list_type INTEGER NOT NULL,
		list_name TEXT NOT NULL,
		list_name_lower TEXT GENERATED ALWAYS AS (lower(list_name)) VIRTUAL,
		list_description TEXT,
		image_name TEXT NOT NULL DEFAULT '',
		accessibility INTEGER NOT NULL DEFAULT 1,
		created_at TEXT NOT NULL
	)`,
  // The lookup the client actually makes: `?creatorAccountId=&type=&name=`, all three at
  // once. UNIQUE because that triple is a list's identity — the client asks for
  // `__SavedForLater_Rooms` by name expecting the one it has been appending to, so a
  // player must never end up with two. Folded, since the casing that reaches us is the
  // client's.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_list_owner_type_name
		ON list (creator_account_id, list_type, list_name_lower)`,
  `CREATE INDEX IF NOT EXISTS idx_list_creator ON list (creator_account_id)`,
  // A list's contents — one row per item, insertion order preserved by the surrogate key,
  // which is the order the `ItemIds` array is served in.
  //
  // UNIQUE on the pair: saving the same room twice is a no-op, not a carousel showing it
  // twice. The section's own `supportsDedupe` is about dedupe ACROSS rows and doesn't help
  // here.
  `CREATE TABLE IF NOT EXISTS list_item (
		list_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
		list_id INTEGER NOT NULL,
		item_id TEXT NOT NULL
	)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_list_item_pair ON list_item (list_id, item_id)`,
  `CREATE INDEX IF NOT EXISTS idx_list_item_list ON list_item (list_id)`
];
const DEFAULT_LIST_IMAGE = "DefaultRoomImage.jpg";
function toCuratedList(row, itemIds) {
  return {
    ListId: String(row.list_id),
    CreatorAccountId: row.creator_account_id,
    Name: row.list_name,
    Description: row.list_description,
    ImageName: row.image_name,
    Type: row.list_type,
    ItemIds: itemIds,
    Accessibility: row.accessibility,
    CreatedAt: row.created_at
  };
}
async function getListItems(db, listId) {
  const { results } = await db.prepare("SELECT item_id FROM list_item WHERE list_id = ?1 ORDER BY list_item_id").bind(listId).all();
  return results.map((r) => r.item_id);
}
async function addPlayerListItem(db, key, itemId) {
  await db.prepare(
    `INSERT OR IGNORE INTO list (creator_account_id, list_type, list_name,
			                             list_description, image_name, accessibility, created_at)
			 VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6)`
  ).bind(
    key.creatorAccountId,
    key.type,
    key.name,
    DEFAULT_LIST_IMAGE,
    key.accessibility,
    (/* @__PURE__ */ new Date()).toISOString()
  ).run();
  const row = await db.prepare(
    `SELECT list_id FROM list
			 WHERE creator_account_id = ?1 AND list_type = ?2 AND list_name_lower = lower(?3)`
  ).bind(key.creatorAccountId, key.type, key.name).first();
  const listId = row.list_id;
  await db.prepare("INSERT OR IGNORE INTO list_item (list_id, item_id) VALUES (?1, ?2)").bind(listId, itemId).run();
  return await getPlayerList(db, key.creatorAccountId, key.type, key.name);
}
async function getPlayerList(db, creatorAccountId, type, name) {
  const row = await db.prepare(
    `SELECT list_id, creator_account_id, list_type, list_name, list_description,
			        image_name, accessibility, created_at
			 FROM list
			 WHERE creator_account_id = ?1 AND list_type = ?2 AND list_name_lower = lower(?3)`
  ).bind(creatorAccountId, type, name).first();
  if (row === null) return void 0;
  return toCuratedList(row, await getListItems(db, row.list_id));
}
export {
  CURATED_LIST_SCHEMA_DDL,
  DEFAULT_LIST_IMAGE,
  addPlayerListItem,
  getPlayerList
};
