// Ported from apps/econ/src/inventory-db.ts; TypeScript types erased; native runtime imports.
const INVENTORY_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS inventory (
		account_id INTEGER NOT NULL,
		avatar_item_desc TEXT NOT NULL,
		data TEXT NOT NULL,
		PRIMARY KEY (account_id, avatar_item_desc)
	)`
];
function toAvatarItemV4(item) {
  const str = (v) => typeof v === "string" ? v : "";
  const num = (v) => typeof v === "number" ? v : 0;
  return {
    avatarItemId: num(item.AvatarItemId),
    avatarItemDesc: str(item.AvatarItemDesc),
    friendlyName: str(item.FriendlyName),
    tooltip: str(item.Tooltip),
    tagList: str(item.TagList),
    avatarItemType: num(item.AvatarItemType),
    rarity: num(item.Rarity),
    isBaseAvatarItem: item.IsBaseAvatarItem === true
  };
}
async function grantItem(db, accountId, item) {
  await db.prepare(
    `INSERT INTO inventory (account_id, avatar_item_desc, data) VALUES (?1, ?2, ?3)
			 ON CONFLICT (account_id, avatar_item_desc) DO UPDATE SET data = ?3`
  ).bind(accountId, item.AvatarItemDesc, JSON.stringify(item)).run();
}
async function getInventory(db, accountId) {
  const { results } = await db.prepare("SELECT data FROM inventory WHERE account_id = ?1 ORDER BY avatar_item_desc").bind(accountId).all();
  return results.map((r) => JSON.parse(r.data));
}
export {
  INVENTORY_SCHEMA_DDL,
  getInventory,
  grantItem,
  toAvatarItemV4
};
