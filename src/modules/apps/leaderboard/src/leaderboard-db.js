// Ported from apps/leaderboard/src/leaderboard-db.ts; TypeScript types erased; native runtime imports.
import { RelationshipType } from "../../../packages/domain/src/index.js";
const SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS leaderboard (
		player_id INTEGER NOT NULL,
		room_id INTEGER NOT NULL,
		stat_channel INTEGER NOT NULL,
		stat_value INTEGER NOT NULL DEFAULT 0,
		PRIMARY KEY (player_id, room_id, stat_channel)
	)`,
  `CREATE INDEX IF NOT EXISTS leaderboard_board_value
		ON leaderboard (room_id, stat_channel, stat_value DESC, player_id)`
];
const UNRANKED = 99999;
const NO_SCORE = 0;
function scope(board) {
  if (board.friendsOf === void 0) {
    return {
      where: "room_id = ?1 AND stat_channel = ?2",
      binds: [board.roomId, board.statChannel],
      next: 3
    };
  }
  return {
    where: `room_id = ?1 AND stat_channel = ?2 AND (player_id = ?3 OR player_id IN (
			SELECT CASE WHEN requester_id = ?3 THEN target_id ELSE requester_id END
			FROM relationship
			WHERE relationship_type = ${RelationshipType.Friend} AND (requester_id = ?3 OR target_id = ?3)
		))`,
    binds: [board.roomId, board.statChannel, board.friendsOf],
    next: 4
  };
}
function order(sortAscending) {
  return sortAscending ? "stat_value ASC, player_id ASC" : "stat_value DESC, player_id ASC";
}
async function getRanks(db, board, rankStart, rankEnd, sortAscending) {
  const start = Math.max(0, rankStart);
  const limit = rankEnd - start + 1;
  if (limit <= 0) return [];
  const s = scope(board);
  const { results } = await db.prepare(
    `SELECT player_id, stat_value FROM leaderboard WHERE ${s.where}
			 ORDER BY ${order(sortAscending)} LIMIT ?${s.next} OFFSET ?${s.next + 1}`
  ).bind(...s.binds, limit, start).all();
  return results.map((r, i) => ({ PlayerId: r.player_id, Score: r.stat_value, Rank: start + i }));
}
async function getPlayerRank(db, board, playerId, sortAscending) {
  const s = scope(board);
  const mine = await db.prepare(`SELECT stat_value FROM leaderboard WHERE ${s.where} AND player_id = ?${s.next}`).bind(...s.binds, playerId).first();
  if (!mine) return { PlayerId: playerId, Score: NO_SCORE, Rank: UNRANKED };
  const [pid, val] = [s.next, s.next + 1];
  const ahead = sortAscending ? `(stat_value < ?${val} OR (stat_value = ?${val} AND player_id < ?${pid}))` : `(stat_value > ?${val} OR (stat_value = ?${val} AND player_id < ?${pid}))`;
  const count = await db.prepare(`SELECT COUNT(*) AS n FROM leaderboard WHERE ${s.where} AND ${ahead}`).bind(...s.binds, playerId, mine.stat_value).first();
  return { PlayerId: playerId, Score: mine.stat_value, Rank: count?.n ?? 0 };
}
const MAX_WINDOW = 10;
async function getNearbyScores(db, board, playerId, windowSize, sortAscending) {
  const window = Math.min(Math.max(windowSize, 1), MAX_WINDOW);
  const mine = await getPlayerRank(db, board, playerId, sortAscending);
  if (mine.Rank === UNRANKED) return getRanks(db, board, 0, window * 2, sortAscending);
  return getRanks(db, board, mine.Rank - window, mine.Rank + window, sortAscending);
}
async function checkAndSetStat(db, board, playerId, value, expected) {
  const result = await db.prepare(
    `INSERT INTO leaderboard (player_id, room_id, stat_channel, stat_value)
			 VALUES (?1, ?2, ?3, ?4)
			 ON CONFLICT (player_id, room_id, stat_channel) DO UPDATE SET stat_value = excluded.stat_value
			 WHERE ?5 IS NULL OR stat_value = ?5`
  ).bind(playerId, board.roomId, board.statChannel, value, expected).run();
  return (result.meta.changes ?? 0) > 0;
}
export {
  MAX_WINDOW,
  NO_SCORE,
  SCHEMA_DDL,
  UNRANKED,
  checkAndSetStat,
  getNearbyScores,
  getPlayerRank,
  getRanks
};
