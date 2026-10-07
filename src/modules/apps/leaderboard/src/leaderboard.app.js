// Ported from apps/leaderboard/src/leaderboard.app.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../runtime/router.js";
import { describeRoute, openAPIRouteHandler } from "../../../../runtime/openapi.js";
import { useWorkersLogger } from "../../../../runtime/logger.js";
import { logger, withCleanSpec, withNotFound, withOnError } from "../../../packages/hono-helpers/src/index.js";
import { validateAndGetAccountId } from "../../../packages/jwt/src/index.js";
import {
  checkAndSetStat,
  getNearbyScores,
  getPlayerRank,
  getRanks,
  MAX_WINDOW,
  NO_SCORE,
  UNRANKED
} from "./leaderboard-db.js";
import {
  CheckAndSetStatBody,
  CheckAndSetStatResponse,
  GetNearbyScoresBody,
  GetPlayerRankBody,
  GetRanksBody,
  json,
  jsonBody,
  LeaderboardRows,
  PlayerRank
} from "./openapi.js";
async function readBody(c) {
  return c.req.json().catch(() => ({}));
}
const int = (v, fallback) => Number.isInteger(v) ? v : fallback;
var FilterType = /* @__PURE__ */ ((FilterType2) => {
  FilterType2[FilterType2["Global"] = 0] = "Global";
  FilterType2[FilterType2["Friends"] = 1] = "Friends";
  return FilterType2;
})(FilterType || {});
function board(body) {
  const playerId = int(body.PlayerId, 0);
  return {
    roomId: int(body.RoomId, 0),
    statChannel: int(body.StatChannel, 0),
    ...int(body.FilterType, 0) === 1 /* Friends */ && playerId !== 0 && { friendsOf: playerId }
  };
}
const app = new Hono().use(
  "*",
  // middleware
  (c, next) => useWorkersLogger(c.env.NAME, {
    environment: c.env.ENVIRONMENT,
    release: c.env.SENTRY_RELEASE
  })(c, next)
).onError(withOnError()).notFound(withNotFound()).get(
  "/",
  describeRoute({
    tags: ["Service"],
    summary: "Health check",
    description: "Liveness probe for the leaderboard worker. Answers `text/plain`, not JSON, unlike the other workers\u2019 health checks. No auth.",
    responses: {
      200: {
        description: "Service is up",
        content: { "text/plain": { schema: { type: "string" } } }
      }
    }
  }),
  async (c) => {
    return c.text("hello, world!");
  }
).post(
  "/leaderboard/GetNearbyScores",
  describeRoute({
    tags: ["Leaderboard"],
    summary: "The scores around a player",
    description: [
      "What the client shows when it opens a leaderboard ON someone rather than at the top:",
      `the rows \`WindowSize\` (at most ${MAX_WINDOW}, the default) either side of \`PlayerId\`\u2019s`,
      "rank on the board `RoomId` + `StatChannel` names, or the top of the board when the",
      "player isn\u2019t on it. `FilterType` 1 (Friends) restricts the board to `PlayerId` and",
      "their friends, ranked among themselves.",
      "",
      'An empty `Rows` is a complete answer meaning "this leaderboard has no scores", which',
      "the client renders as a blank board rather than failing. The key is always present; a",
      "bare `{}` trips its parser. An unreadable body is answered with an empty board."
    ].join(" "),
    requestBody: jsonBody(GetNearbyScoresBody, "The player and the board to centre on"),
    responses: { 200: json(LeaderboardRows, "The rows around the player") }
  }),
  async (c) => {
    const body = await readBody(c);
    logger.info("GetNearbyScores", { body });
    const rows = await getNearbyScores(
      c.env.DB,
      board(body),
      int(body.PlayerId, 0),
      int(body.WindowSize, MAX_WINDOW),
      body.SortAscending === true
    );
    return c.json({ Rows: rows });
  }
).post(
  "/leaderboard/GetRanks",
  describeRoute({
    tags: ["Leaderboard"],
    summary: "A page of the board",
    description: [
      "What the client shows when it opens a leaderboard at the TOP rather than on a player.",
      "The body names the slice (`RankStart`/`RankEnd`, both inclusive), the board (`RoomId`",
      "plus `StatChannel`), the viewer (`PlayerId`) and the ordering (`FilterType`,",
      "`SortAscending`).",
      "",
      "Answers the rows ranked `RankStart`..`RankEnd` on the board `RoomId` + `StatChannel`",
      "names (0-based, so 0..9 is the first ten), highest value first unless `SortAscending`.",
      'An empty `Rows` means "this leaderboard has no scores"; the key is always present.',
      "`FilterType` 1 (Friends) restricts the board to `PlayerId` and their friends, ranked",
      "among themselves."
    ].join(" "),
    requestBody: jsonBody(GetRanksBody, "The slice and board the client is asking for"),
    responses: { 200: json(LeaderboardRows, "The requested slice of the board") }
  }),
  async (c) => {
    const body = await readBody(c);
    logger.info("GetRanks", { body });
    const rows = await getRanks(
      c.env.DB,
      board(body),
      int(body.RankStart, 0),
      int(body.RankEnd, 9),
      body.SortAscending === true
    );
    return c.json({ Rows: rows });
  }
).post(
  "/leaderboard/GetPlayerRank",
  describeRoute({
    tags: ["Leaderboard"],
    summary: "One player\u2019s rank",
    description: [
      "What the client asks when it needs a single player\u2019s standing rather than a page of",
      "the board \u2014 the body names the player and the board (`RoomId` + `StatChannel` +",
      "`FilterType`: Global 0, Friends 1).",
      "",
      "`Score` is the player\u2019s value on the board `RoomId` + `StatChannel` names and `Rank`",
      `their 0-based position on it \u2014 the client adds one before it draws, so \`Rank\` 0 is`,
      `shown as "#1". A player with no row there answers \`Rank\` ${UNRANKED}, a sentinel meaning`,
      "unranked (0 being a real rank, first place, the sentinel has to be a big number), and",
      "`Score` 0.",
      "",
      "`FilterType` 1 (Friends) ranks the player among their friends only.",
      "",
      "`PlayerId` is echoed from the request \u2014 the response carries no board selectors, so",
      "the client matches the answer to its own question. An unreadable body is answered",
      "rather than rejected, with a `PlayerId` of 0."
    ].join(" "),
    requestBody: jsonBody(GetPlayerRankBody, "The player and the board being asked about"),
    responses: { 200: json(PlayerRank, "The player\u2019s standing") }
  }),
  async (c) => {
    const body = await readBody(c);
    logger.info("GetPlayerRank", { body });
    const playerId = int(body.PlayerId, 0);
    if (playerId === 0) return c.json({ PlayerId: 0, Score: NO_SCORE, Rank: UNRANKED });
    return c.json(
      await getPlayerRank(c.env.DB, board(body), playerId, body.SortAscending === true)
    );
  }
).post(
  "/leaderboard/CheckAndSetStat",
  describeRoute({
    tags: ["Leaderboard"],
    summary: "Write a player\u2019s stat",
    description: [
      "A compare-and-set on one of a room\u2019s tracked stats: `StatValue` is what the client",
      "wants stored, `CurrentStatValue` what it believes is stored now (null when it believes",
      "nothing is). No `PlayerId` \u2014 the stat belongs to the caller.",
      "",
      "Stores `StatValue` as the caller\u2019s value on the board `RoomId` + `StatChannel` names",
      "(the caller is the Bearer token; 401 without one). With a numeric `CurrentStatValue`",
      "the row is written only if it still holds that value; with null it is written",
      "regardless.",
      "",
      "The response is the BARE number `0`, not an envelope and not a `{ value }` wrapper \u2014",
      "what the live service answers, and what the client\u2019s parser expects \u2014 whether or not",
      "the compare passed."
    ].join(" "),
    requestBody: jsonBody(CheckAndSetStatBody, "The stat, the room and the value to store"),
    responses: {
      200: json(CheckAndSetStatResponse, "Always the bare number 0"),
      401: { description: "No valid bearer token" }
    }
  }),
  async (c) => {
    const accountId = await validateAndGetAccountId(c.req.raw, await c.env.JWT_SECRET.get());
    if (accountId === null) return c.body(null, 401);
    const body = await readBody(c);
    logger.info("CheckAndSetStat", { accountId, body });
    const target = board(body);
    if (target.roomId !== 0 && typeof body.StatValue === "number") {
      const expected = typeof body.CurrentStatValue === "number" ? body.CurrentStatValue : null;
      const written = await checkAndSetStat(
        c.env.DB,
        target,
        accountId,
        Math.trunc(body.StatValue),
        expected
      );
      if (!written) logger.info("CheckAndSetStat: stale, not written", { accountId, ...target });
    }
    return c.json(0);
  }
);
app.get(
  "/openapi.json",
  describeRoute({ hide: true }),
  withCleanSpec(
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "recflare leaderboard",
          version: "1.0.0",
          description: [
            "Leaderboards for recflare, a private-server reimplementation of the Rec Room",
            "backend \u2014 the boards a room keeps for the stats it tracks.",
            "",
            "One board per (room, stat channel): `CheckAndSetStat` stores the caller\u2019s value on",
            "one, and the reads rank them \u2014 highest first unless `SortAscending`, ties broken on",
            "the lower player id, ranks 0-based (the client adds one before it draws, so `Rank` 0",
            'is shown as "#1"). `FilterType` 1 reads a board as the viewer and',
            "their friends only (the `api` worker\u2019s `relationship` table), ranked among",
            "themselves.",
            "",
            'The two board reads answer `{ "Rows": [ { PlayerId, Score, Rank } ] }`, an empty',
            'list being a complete answer meaning "this leaderboard has no scores" (the `Rows`',
            "key is always present \u2014 a bare `{}` trips the client\u2019s parser); `GetPlayerRank`",
            "answers a player with no row a rank of 99999, the sentinel for unranked, with a",
            "score of 0; and `CheckAndSetStat` answers the bare number `0`.",
            "",
            "Only `CheckAndSetStat` needs a token \u2014 the stat belongs to whoever is calling.",
            "Unreadable bodies are answered (empty board / unranked), never rejected."
          ].join("\n")
        },
        servers: [{ url: "https://leaderboard.recflare.net", description: "Production" }]
      }
    })
  )
);
var stdin_default = app;
export {
  stdin_default as default
};
