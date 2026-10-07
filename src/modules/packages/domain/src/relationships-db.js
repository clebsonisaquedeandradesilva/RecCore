// Ported from packages/domain/src/relationships-db.ts; TypeScript types erased; native runtime imports.
var RelationshipType = /* @__PURE__ */ ((RelationshipType2) => {
  RelationshipType2[RelationshipType2["None"] = 0] = "None";
  RelationshipType2[RelationshipType2["FriendRequestSent"] = 1] = "FriendRequestSent";
  RelationshipType2[RelationshipType2["FriendRequestReceived"] = 2] = "FriendRequestReceived";
  RelationshipType2[RelationshipType2["Friend"] = 3] = "Friend";
  return RelationshipType2;
})(RelationshipType || {});
const RELATIONSHIP_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS relationship (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		requester_id INTEGER NOT NULL,
		target_id INTEGER NOT NULL,
		relationship_type INTEGER NOT NULL DEFAULT 0,
		requester_favorited INTEGER NOT NULL DEFAULT 0,
		requester_ignored INTEGER NOT NULL DEFAULT 0,
		requester_muted INTEGER NOT NULL DEFAULT 0,
		target_favorited INTEGER NOT NULL DEFAULT 0,
		target_ignored INTEGER NOT NULL DEFAULT 0,
		target_muted INTEGER NOT NULL DEFAULT 0
	)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_relationship ON relationship (requester_id, target_id)`,
  `CREATE INDEX IF NOT EXISTS idx_relationship_target ON relationship (target_id)`
];
function noneResponse(otherId) {
  return {
    PlayerID: otherId,
    RelationshipType: 0 /* None */,
    Favorited: 0,
    Ignored: 0,
    Muted: 0
  };
}
function flipType(type) {
  if (type === 1 /* FriendRequestSent */) return 2 /* FriendRequestReceived */;
  if (type === 2 /* FriendRequestReceived */) return 1 /* FriendRequestSent */;
  return type;
}
function toResponse(row, playerId) {
  const isRequester = row.requester_id === playerId;
  return {
    PlayerID: isRequester ? row.target_id : row.requester_id,
    RelationshipType: isRequester ? row.relationship_type : flipType(row.relationship_type),
    Favorited: isRequester ? row.requester_favorited : row.target_favorited,
    Ignored: isRequester ? row.requester_ignored : row.target_ignored,
    Muted: isRequester ? row.requester_muted : row.target_muted
  };
}
function toChange(row, playerId, otherId, changed) {
  return { self: toResponse(row, playerId), other: toResponse(row, otherId), changed };
}
async function findPair(db, a, b) {
  return db.prepare(
    `SELECT * FROM relationship
			 WHERE (requester_id = ?1 AND target_id = ?2) OR (requester_id = ?2 AND target_id = ?1)`
  ).bind(a, b).first();
}
async function getRelationshipsForPlayer(db, playerId) {
  const { results } = await db.prepare(
    `SELECT * FROM relationship
			 WHERE requester_id = ?1 OR target_id = ?1`
  ).bind(playerId).all();
  return results.map((row) => toResponse(row, playerId));
}
async function getFriendIds(db, playerId) {
  const { results } = await db.prepare(
    `SELECT CASE WHEN requester_id = ?1 THEN target_id ELSE requester_id END AS id
			 FROM relationship
			 WHERE relationship_type = ?2 AND (requester_id = ?1 OR target_id = ?1)`
  ).bind(playerId, 3 /* Friend */).all();
  return results.map((r) => r.id);
}
async function areFriends(db, playerId, otherId) {
  const row = await db.prepare(
    `SELECT 1 AS ok FROM relationship
			 WHERE relationship_type = ?3
			   AND ((requester_id = ?1 AND target_id = ?2) OR (requester_id = ?2 AND target_id = ?1))
			 LIMIT 1`
  ).bind(playerId, otherId, 3 /* Friend */).first();
  return row !== null;
}
async function countOnlineFriends(db, playerId, now = Math.floor(Date.now() / 1e3)) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM relationship r
			 JOIN presence p
			   ON p.account_id = CASE WHEN r.requester_id = ?1 THEN r.target_id ELSE r.requester_id END
			 WHERE r.relationship_type = ?2
			   AND (r.requester_id = ?1 OR r.target_id = ?1)
			   AND p.expires_at > ?3`
  ).bind(playerId, 3 /* Friend */, now).first();
  return row?.n ?? 0;
}
const MUTUAL_FRIENDS_LIMIT = 100;
async function getMutualFriendIds(db, playerId, otherId) {
  const [mine, theirs] = await Promise.all([
    getFriendIds(db, playerId),
    getFriendIds(db, otherId)
  ]);
  const ours = new Set(theirs);
  return mine.filter((id) => ours.has(id)).sort((a, b) => a - b).slice(0, MUTUAL_FRIENDS_LIMIT);
}
async function upsertPair(db, requesterId, targetId, type) {
  const existing = await findPair(db, requesterId, targetId);
  if (!existing) {
    await db.prepare(
      `INSERT INTO relationship (requester_id, target_id, relationship_type)
				 VALUES (?1, ?2, ?3)`
    ).bind(requesterId, targetId, type).run();
    return {
      requester_id: requesterId,
      target_id: targetId,
      relationship_type: type,
      requester_favorited: 0,
      requester_ignored: 0,
      requester_muted: 0,
      target_favorited: 0,
      target_ignored: 0,
      target_muted: 0
    };
  }
  const reqIsRequester = existing.requester_id === requesterId;
  const reqFlags = {
    favorited: reqIsRequester ? existing.requester_favorited : existing.target_favorited,
    ignored: reqIsRequester ? existing.requester_ignored : existing.target_ignored,
    muted: reqIsRequester ? existing.requester_muted : existing.target_muted
  };
  const tgtFlags = {
    favorited: reqIsRequester ? existing.target_favorited : existing.requester_favorited,
    ignored: reqIsRequester ? existing.target_ignored : existing.requester_ignored,
    muted: reqIsRequester ? existing.target_muted : existing.requester_muted
  };
  await db.prepare(
    `UPDATE relationship
			 SET requester_id = ?1, target_id = ?2, relationship_type = ?3,
			     requester_favorited = ?4, requester_ignored = ?5, requester_muted = ?6,
			     target_favorited = ?7, target_ignored = ?8, target_muted = ?9
			 WHERE (requester_id = ?1 AND target_id = ?2) OR (requester_id = ?2 AND target_id = ?1)`
  ).bind(
    requesterId,
    targetId,
    type,
    reqFlags.favorited,
    reqFlags.ignored,
    reqFlags.muted,
    tgtFlags.favorited,
    tgtFlags.ignored,
    tgtFlags.muted
  ).run();
  return {
    requester_id: requesterId,
    target_id: targetId,
    relationship_type: type,
    requester_favorited: reqFlags.favorited,
    requester_ignored: reqFlags.ignored,
    requester_muted: reqFlags.muted,
    target_favorited: tgtFlags.favorited,
    target_ignored: tgtFlags.ignored,
    target_muted: tgtFlags.muted
  };
}
async function sendFriendRequest(db, requesterId, targetId) {
  const existing = await findPair(db, requesterId, targetId);
  if (existing) {
    if (existing.relationship_type === 3 /* Friend */ || existing.requester_id === requesterId && existing.relationship_type === 1 /* FriendRequestSent */) {
      return toChange(existing, requesterId, targetId, false);
    }
    if (existing.requester_id === targetId && existing.relationship_type === 1 /* FriendRequestSent */) {
      const row2 = await upsertPair(db, requesterId, targetId, 3 /* Friend */);
      return toChange(row2, requesterId, targetId, true);
    }
  }
  const row = await upsertPair(db, requesterId, targetId, 1 /* FriendRequestSent */);
  return toChange(row, requesterId, targetId, true);
}
async function acceptFriendRequest(db, accepterId, otherId) {
  const existing = await findPair(db, accepterId, otherId);
  if (existing && existing.requester_id === otherId && existing.relationship_type === 1 /* FriendRequestSent */) {
    const row = await upsertPair(db, otherId, accepterId, 3 /* Friend */);
    return toChange(row, accepterId, otherId, true);
  }
  return existing ? toChange(existing, accepterId, otherId, false) : { self: noneResponse(otherId), other: noneResponse(accepterId), changed: false };
}
async function addFriend(db, requesterId, targetId) {
  const existing = await findPair(db, requesterId, targetId);
  if (existing && existing.relationship_type === 3 /* Friend */) {
    return toChange(existing, requesterId, targetId, false);
  }
  const row = await upsertPair(db, requesterId, targetId, 3 /* Friend */);
  return toChange(row, requesterId, targetId, true);
}
async function removeFriend(db, playerId, otherId) {
  await db.prepare(
    `UPDATE relationship SET relationship_type = ?3
			 WHERE (requester_id = ?1 AND target_id = ?2) OR (requester_id = ?2 AND target_id = ?1)`
  ).bind(playerId, otherId, 0 /* None */).run();
  const updated = await findPair(db, playerId, otherId);
  return updated ? toChange(updated, playerId, otherId, true) : { self: noneResponse(otherId), other: noneResponse(playerId), changed: true };
}
async function setRelationshipFlag(db, playerId, otherId, flag, value) {
  const existing = await findPair(db, playerId, otherId);
  const v = value ? 1 : 0;
  if (!existing) {
    await db.prepare(
      `INSERT INTO relationship (requester_id, target_id, relationship_type, requester_${flag})
				 VALUES (?1, ?2, ?3, ?4)`
    ).bind(playerId, otherId, 0 /* None */, v).run();
  } else {
    const side = existing.requester_id === playerId ? "requester" : "target";
    await db.prepare(
      `UPDATE relationship SET ${side}_${flag} = ?3
				 WHERE (requester_id = ?1 AND target_id = ?2) OR (requester_id = ?2 AND target_id = ?1)`
    ).bind(playerId, otherId, v).run();
  }
  const updated = await findPair(db, playerId, otherId);
  return updated ? toResponse(updated, playerId) : noneResponse(otherId);
}
export {
  MUTUAL_FRIENDS_LIMIT,
  RELATIONSHIP_SCHEMA_DDL,
  RelationshipType,
  acceptFriendRequest,
  addFriend,
  areFriends,
  countOnlineFriends,
  getFriendIds,
  getMutualFriendIds,
  getRelationshipsForPlayer,
  removeFriend,
  sendFriendRequest,
  setRelationshipFlag
};
