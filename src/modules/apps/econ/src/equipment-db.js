// Ported from apps/econ/src/equipment-db.ts; TypeScript types erased; native runtime imports.
const EQUIPMENT_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS equipment (
		account_id INTEGER NOT NULL,
		equipment_modification_guid TEXT NOT NULL,
		data TEXT NOT NULL,
		PRIMARY KEY (account_id, equipment_modification_guid)
	)`
];
async function grantEquipment(db, accountId, equipment) {
  await db.prepare(
    `INSERT INTO equipment (account_id, equipment_modification_guid, data) VALUES (?1, ?2, ?3)
			 ON CONFLICT (account_id, equipment_modification_guid) DO UPDATE SET
			   data = json_set(?3, '$.Favorited',
			     json(CASE WHEN json_extract(equipment.data, '$.Favorited') THEN 'true' ELSE 'false' END))`
  ).bind(accountId, equipment.ModificationGuid, JSON.stringify(equipment)).run();
}
async function setEquipmentFavorited(db, accountId, updates) {
  if (updates.length === 0) return;
  const stmt = db.prepare(
    `UPDATE equipment SET data = json_set(data, '$.Favorited', json(?3))
		 WHERE account_id = ?1 AND equipment_modification_guid = ?2`
  );
  await db.batch(
    updates.map((u) => stmt.bind(accountId, u.ModificationGuid, u.Favorited ? "true" : "false"))
  );
}
async function getEquipment(db, accountId) {
  const { results } = await db.prepare(
    "SELECT data FROM equipment WHERE account_id = ?1 ORDER BY equipment_modification_guid"
  ).bind(accountId).all();
  return results.map((r) => JSON.parse(r.data));
}
export {
  EQUIPMENT_SCHEMA_DDL,
  getEquipment,
  grantEquipment,
  setEquipmentFavorited
};
