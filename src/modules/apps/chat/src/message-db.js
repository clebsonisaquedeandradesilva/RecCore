// Ported from apps/chat/src/message-db.ts; TypeScript types erased; native runtime imports.
const SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS message (
		chat_message_id INTEGER PRIMARY KEY AUTOINCREMENT,
		chat_thread_id INTEGER NOT NULL,
		sender_player_id INTEGER NOT NULL,
		time_sent TEXT NOT NULL,
		contents TEXT NOT NULL,
		moderation_state INTEGER NOT NULL DEFAULT 0
	)`,
  // Thread listing is always (thread, id) — newest-first pages walk this index.
  `CREATE INDEX IF NOT EXISTS idx_message_thread ON message (chat_thread_id, chat_message_id)`,
  `CREATE INDEX IF NOT EXISTS idx_message_sender ON message (sender_player_id)`
];
var ChatModerationState = /* @__PURE__ */ ((ChatModerationState2) => {
  ChatModerationState2[ChatModerationState2["None"] = 0] = "None";
  ChatModerationState2[ChatModerationState2["Flagged"] = 1] = "Flagged";
  ChatModerationState2[ChatModerationState2["Hidden"] = 2] = "Hidden";
  return ChatModerationState2;
})(ChatModerationState || {});
function toMessage(row) {
  return {
    chatMessageId: row.chat_message_id,
    chatThreadId: row.chat_thread_id,
    senderPlayerId: row.sender_player_id,
    timeSent: row.time_sent,
    contents: row.contents,
    moderationState: row.moderation_state
  };
}
async function insertMessage(db, message) {
  const row = await db.prepare(
    `INSERT INTO message (chat_thread_id, sender_player_id, time_sent, contents, moderation_state)
			 VALUES (?1, ?2, ?3, ?4, ?5)
			 RETURNING *`
  ).bind(
    message.chatThreadId,
    message.senderPlayerId,
    message.timeSent ?? (/* @__PURE__ */ new Date()).toISOString(),
    message.contents,
    message.moderationState ?? 0 /* None */
  ).first();
  if (row === null) throw new Error("failed to insert chat message");
  return toMessage(row);
}
async function getThreadMessages(db, chatThreadId, { limit = 50, before } = {}) {
  const { results } = before ? await db.prepare(
    `SELECT * FROM message WHERE chat_thread_id = ?1 AND chat_message_id < ?2
					 ORDER BY chat_message_id DESC LIMIT ?3`
  ).bind(chatThreadId, before, limit).all() : await db.prepare(
    `SELECT * FROM message WHERE chat_thread_id = ?1
					 ORDER BY chat_message_id DESC LIMIT ?2`
  ).bind(chatThreadId, limit).all();
  return results.map(toMessage);
}
async function getMessage(db, chatMessageId) {
  const row = await db.prepare("SELECT * FROM message WHERE chat_message_id = ?1").bind(chatMessageId).first();
  return row === null ? null : toMessage(row);
}
export {
  ChatModerationState,
  SCHEMA_DDL,
  getMessage,
  getThreadMessages,
  insertMessage
};
