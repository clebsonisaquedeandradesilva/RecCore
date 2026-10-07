// Ported from apps/chat/src/thread-db.ts; TypeScript types erased; native runtime imports.
import { insertMessage } from "./message-db.js";
const THREAD_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS message_thread (
		chat_thread_id INTEGER PRIMARY KEY AUTOINCREMENT,
		chat_thread_name TEXT,
		chat_thread_type INTEGER NOT NULL DEFAULT 0,
		latest_message_id INTEGER,
		created_at TEXT NOT NULL
	)`,
  `CREATE INDEX IF NOT EXISTS idx_message_thread_latest ON message_thread (latest_message_id)`,
  `CREATE TABLE IF NOT EXISTS thread_member (
		chat_thread_id INTEGER NOT NULL,
		player_id INTEGER NOT NULL,
		last_read_message_id INTEGER,
		snoozed_until TEXT,
		is_favorited INTEGER NOT NULL DEFAULT 0,
		PRIMARY KEY (chat_thread_id, player_id)
	)`,
  // The thread-list query is "every thread this player is in", so player_id leads.
  `CREATE INDEX IF NOT EXISTS idx_thread_member_player ON thread_member (player_id)`
];
const ChatThreadType = {
  Player: 0,
  Club: 1,
  Party: 2
};
function toThread(row) {
  return {
    latestMessage: row.msg_chat_message_id === null ? null : {
      chatMessageId: row.msg_chat_message_id,
      chatThreadId: row.msg_chat_thread_id,
      senderPlayerId: row.msg_sender_player_id,
      timeSent: row.msg_time_sent,
      contents: row.msg_contents,
      moderationState: row.msg_moderation_state
    },
    chatThreadId: row.chat_thread_id,
    // group_concat of the membership rows, already ordered by player id.
    playerIds: row.player_ids === null ? [] : row.player_ids.split(",").map(Number),
    // Null in the column means "never read"; the client insists on a number.
    lastReadMessageId: row.last_read_message_id ?? 0,
    // Null in the column means "unnamed"; the client dereferences it unchecked.
    chatThreadName: row.chat_thread_name ?? "",
    chatThreadType: row.chat_thread_type,
    snoozedUntil: row.snoozed_until,
    isFavorited: row.is_favorited !== 0
  };
}
const THREAD_SELECT = `SELECT
				t.chat_thread_id,
				t.chat_thread_name,
				t.chat_thread_type,
				(SELECT group_concat(player_id) FROM
					(SELECT player_id FROM thread_member WHERE chat_thread_id = t.chat_thread_id
					 ORDER BY player_id)) AS player_ids,
				me.last_read_message_id,
				me.snoozed_until,
				me.is_favorited,
				msg.chat_message_id AS msg_chat_message_id,
				msg.chat_thread_id AS msg_chat_thread_id,
				msg.sender_player_id AS msg_sender_player_id,
				msg.time_sent AS msg_time_sent,
				msg.contents AS msg_contents,
				msg.moderation_state AS msg_moderation_state
			 FROM thread_member me
			 JOIN message_thread t ON t.chat_thread_id = me.chat_thread_id
			 LEFT JOIN message msg ON msg.chat_message_id = t.latest_message_id`;
async function getThreadsForPlayer(db, playerId, { limit = 50 } = {}) {
  const { results } = await db.prepare(
    `${THREAD_SELECT}
			 WHERE me.player_id = ?1
			 ORDER BY t.latest_message_id DESC
			 LIMIT ?2`
  ).bind(playerId, limit).all();
  return results.map(toThread);
}
async function getThreadForPlayer(db, chatThreadId, playerId) {
  const row = await db.prepare(
    `${THREAD_SELECT}
			 WHERE me.chat_thread_id = ?1 AND me.player_id = ?2`
  ).bind(chatThreadId, playerId).first();
  return row === null ? null : toThread(row);
}
async function getPartyThreadForPlayer(db, playerId) {
  const row = await db.prepare(
    `${THREAD_SELECT}
			 WHERE me.player_id = ?1 AND t.chat_thread_type = ?2
			 ORDER BY t.chat_thread_id DESC
			 LIMIT 1`
  ).bind(playerId, ChatThreadType.Party).first();
  return row === null ? null : toThread(row);
}
async function getThreadMeta(db, chatThreadId) {
  const row = await db.prepare(
    "SELECT chat_thread_type, created_at FROM message_thread WHERE chat_thread_id = ?1"
  ).bind(chatThreadId).first();
  return row === null ? null : { chatThreadType: row.chat_thread_type, createdAt: row.created_at };
}
async function isThreadMember(db, chatThreadId, playerId) {
  const row = await db.prepare("SELECT 1 AS ok FROM thread_member WHERE chat_thread_id = ?1 AND player_id = ?2").bind(chatThreadId, playerId).first();
  return row !== null;
}
const SYSTEM_SENDER_ID = -5;
function startedChatContents(playerId) {
  return JSON.stringify({
    Type: 0,
    Version: 1,
    Data: `Player <@U${playerId}> started a chat`
  });
}
function leftChatContents(playerId) {
  return JSON.stringify({ Type: 0, Version: 1, Data: `Player <@U${playerId}> left` });
}
function joinedChatContents(playerId) {
  return JSON.stringify({ Type: 0, Version: 1, Data: `Player <@U${playerId}> joined` });
}
async function setThreadName(db, chatThreadId, name) {
  await db.prepare("UPDATE message_thread SET chat_thread_name = ?2 WHERE chat_thread_id = ?1").bind(chatThreadId, name === "" ? null : name).run();
}
async function createThread(db, playerIds, name = null, startedBy, type = ChatThreadType.Player) {
  const row = await db.prepare(
    `INSERT INTO message_thread (chat_thread_name, chat_thread_type, created_at)
			 VALUES (?1, ?2, ?3)
			 RETURNING chat_thread_id`
  ).bind(name, type, (/* @__PURE__ */ new Date()).toISOString()).first();
  if (row === null) throw new Error("failed to create chat thread");
  const members = [...new Set(playerIds)];
  if (members.length > 0) {
    await db.batch(
      members.map(
        (playerId) => db.prepare(
          `INSERT OR IGNORE INTO thread_member (chat_thread_id, player_id)
						 VALUES (?1, ?2)`
        ).bind(row.chat_thread_id, playerId)
      )
    );
  }
  if (startedBy !== void 0) {
    await postMessage(db, {
      chatThreadId: row.chat_thread_id,
      senderPlayerId: SYSTEM_SENDER_ID,
      contents: startedChatContents(startedBy)
    });
  }
  return row.chat_thread_id;
}
async function findThreadWithMembers(db, playerIds, type = ChatThreadType.Player) {
  const members = [...new Set(playerIds)];
  if (members.length === 0) return null;
  const placeholders = members.map((_, i) => `?${i + 3}`).join(", ");
  const row = await db.prepare(
    `SELECT m.chat_thread_id FROM thread_member m
			 JOIN message_thread t ON t.chat_thread_id = m.chat_thread_id
			 WHERE t.chat_thread_type = ?2
			 GROUP BY m.chat_thread_id
			 HAVING COUNT(*) = ?1
			    AND COUNT(CASE WHEN m.player_id IN (${placeholders}) THEN 1 END) = ?1
			 ORDER BY m.chat_thread_id
			 LIMIT 1`
  ).bind(members.length, type, ...members).first();
  return row?.chat_thread_id ?? null;
}
async function getOrCreateThreadWithMembers(db, playerIds, startedBy) {
  const existing = await findThreadWithMembers(db, playerIds);
  if (existing !== null) return { chatThreadId: existing, created: false };
  return { chatThreadId: await createThread(db, playerIds, null, startedBy), created: true };
}
async function getThreadMemberIds(db, chatThreadId) {
  const { results } = await db.prepare("SELECT player_id FROM thread_member WHERE chat_thread_id = ?1 ORDER BY player_id").bind(chatThreadId).all();
  return results.map((r) => r.player_id);
}
async function addThreadMember(db, chatThreadId, playerId) {
  await db.prepare("INSERT OR IGNORE INTO thread_member (chat_thread_id, player_id) VALUES (?1, ?2)").bind(chatThreadId, playerId).run();
}
async function removeThreadMember(db, chatThreadId, playerId) {
  await db.prepare("DELETE FROM thread_member WHERE chat_thread_id = ?1 AND player_id = ?2").bind(chatThreadId, playerId).run();
}
async function postMessage(db, message) {
  const stored = await insertMessage(db, message);
  await db.prepare("UPDATE message_thread SET latest_message_id = ?2 WHERE chat_thread_id = ?1").bind(stored.chatThreadId, stored.chatMessageId).run();
  return stored;
}
async function markThreadRead(db, chatThreadId, playerId, chatMessageId) {
  await db.prepare(
    `UPDATE thread_member
			 SET last_read_message_id = MAX(
			   COALESCE(last_read_message_id, 0),
			   MIN(
			     COALESCE(?3, (SELECT latest_message_id FROM message_thread WHERE chat_thread_id = ?1), 0),
			     COALESCE((SELECT latest_message_id FROM message_thread WHERE chat_thread_id = ?1), 0)
			   )
			 )
			 WHERE chat_thread_id = ?1 AND player_id = ?2`
  ).bind(chatThreadId, playerId, chatMessageId ?? null).run();
}
async function setThreadFavorited(db, chatThreadId, playerId, isFavorited) {
  await db.prepare(
    "UPDATE thread_member SET is_favorited = ?3 WHERE chat_thread_id = ?1 AND player_id = ?2"
  ).bind(chatThreadId, playerId, isFavorited ? 1 : 0).run();
}
async function setThreadSnoozed(db, chatThreadId, playerId, snoozedUntil) {
  await db.prepare(
    "UPDATE thread_member SET snoozed_until = ?3 WHERE chat_thread_id = ?1 AND player_id = ?2"
  ).bind(chatThreadId, playerId, snoozedUntil).run();
}
export {
  ChatThreadType,
  SYSTEM_SENDER_ID,
  THREAD_SCHEMA_DDL,
  addThreadMember,
  createThread,
  findThreadWithMembers,
  getOrCreateThreadWithMembers,
  getPartyThreadForPlayer,
  getThreadForPlayer,
  getThreadMemberIds,
  getThreadMeta,
  getThreadsForPlayer,
  isThreadMember,
  joinedChatContents,
  leftChatContents,
  markThreadRead,
  postMessage,
  removeThreadMember,
  setThreadFavorited,
  setThreadName,
  setThreadSnoozed,
  startedChatContents
};
