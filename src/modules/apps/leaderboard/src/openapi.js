// Ported from apps/leaderboard/src/openapi.ts; TypeScript types erased; native runtime imports.
import { resolver } from "../../../../runtime/openapi.js";
import { z } from "../../../../../vendor/zod.js";
function json(schema, description) {
  return { description, content: { "application/json": { schema: resolver(schema) } } };
}
function toOpenApiSchema(schema) {
  const { $schema: _$schema, additionalProperties: _extra, ...jsonSchema } = z.toJSONSchema(schema);
  return jsonSchema;
}
function jsonBody(schema, description) {
  return { description, content: { "application/json": { schema: toOpenApiSchema(schema) } } };
}
const LeaderboardRows = z.object({
  Rows: z.array(z.lazy(() => PlayerRank)).describe("The board\u2019s rows, in rank order. Empty when the board has no scores.")
});
const PlayerRank = z.object({
  PlayerId: z.int().describe("Echoed from the request \u2014 whose rank this is"),
  Score: z.int().describe("The player\u2019s value on the board; 0 when they have no row there"),
  Rank: z.int().describe(
    "0-based position on the board \u2014 the client adds one to draw it, so 0 is \u201C#1\u201D; 99999 when the player isn\u2019t on it"
  )
});
const CheckAndSetStatResponse = z.literal(0).describe("Always the bare number 0 \u2014 the result code the live service returns");
const GetRanksBody = z.object({
  RankStart: z.int().describe("First rank of the slice, 0-based and inclusive"),
  RankEnd: z.int().describe("Last rank of the slice, inclusive \u2014 0\u20139 is the first ten"),
  PlayerId: z.int().describe("The player reading the board"),
  StatChannel: z.int().describe("Which of the room\u2019s tracked stats to rank on"),
  RoomId: z.int().describe("The room whose board is being read"),
  FilterType: z.int().describe("Who the board counts: 0 Global, 1 Friends"),
  SortAscending: z.boolean().describe("false ranks highest-first, the usual leaderboard")
});
const GetPlayerRankBody = z.object({
  PlayerId: z.int().describe("The player whose rank is being asked for"),
  StatChannel: z.int().describe("Which of the room\u2019s tracked stats to rank on"),
  RoomId: z.int().describe("The room whose board is being read"),
  FilterType: z.int().describe("Who the board counts: 0 Global, 1 Friends"),
  SortAscending: z.boolean().describe("false ranks highest-first, the usual leaderboard")
});
const CheckAndSetStatBody = z.object({
  StatChannel: z.int().describe("Which of the room\u2019s tracked stats is being written"),
  RoomId: z.int().describe("The room the stat belongs to"),
  StatValue: z.number().describe("The value to store"),
  CurrentStatValue: z.number().nullable().describe("What the client believes is stored now; null when it believes nothing is")
});
const GetNearbyScoresBody = GetPlayerRankBody.extend({
  WindowSize: z.int().describe("How many rows either side of the player to return; default and maximum 10")
});
export {
  CheckAndSetStatBody,
  CheckAndSetStatResponse,
  GetNearbyScoresBody,
  GetPlayerRankBody,
  GetRanksBody,
  LeaderboardRows,
  PlayerRank,
  json,
  jsonBody
};
