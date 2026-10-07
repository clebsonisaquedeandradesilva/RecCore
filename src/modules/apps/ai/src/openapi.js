// Ported from apps/ai/src/openapi.ts; TypeScript types erased; native runtime imports.
import { resolver } from "../../../../runtime/openapi.js";
import { z } from "../../../../../vendor/zod.js";
function json(schema, description) {
  return { description, content: { "application/json": { schema: resolver(schema) } } };
}
const UNAUTHORIZED_RESPONSE = { description: "Missing or invalid bearer token (empty body)" };
const AUTHED = [{ bearerAuth: [] }];
function intQuery(name, description) {
  return { name, in: "query", required: false, description, schema: { type: "integer" } };
}
function boolQuery(name, description) {
  return { name, in: "query", required: false, description, schema: { type: "boolean" } };
}
function idParam(name, description) {
  return { name, in: "path", required: true, description, schema: { type: "integer" } };
}
function jsonBody(schema, description) {
  const { $schema: _$schema, additionalProperties: _extra, ...jsonSchema } = z.toJSONSchema(schema);
  return {
    description,
    content: { "application/json": { schema: jsonSchema } }
  };
}
const HealthResponse = z.object({
  service: z.literal("ai"),
  status: z.literal("ok")
});
const RoomieAiAccess = z.object({
  success: z.literal(true),
  error_id: z.null(),
  error: z.null(),
  value: z.object({
    MaxEnergyFromSubscriptions: z.int().describe("The energy ceiling a subscription buys \u2014 pinned to int32 max"),
    EnergyLeft: z.int().describe("Energy remaining. Never spent here, so also int32 max"),
    NextSubscriptionEnergyRechargeAt: z.string().nullable().describe("When the budget refills. Null \u2014 nothing depletes, so nothing recharges"),
    OutputAudioEnabled: z.boolean().describe("Whether Roomie may speak its replies")
  })
});
const GameAiAccessDenied = z.object({
  success: z.literal(false),
  error_id: z.string().describe("Machine-readable reason, e.g. `AI.RoomDoesNotSupportGameAI`"),
  error: z.string().describe("The message shown to the player")
});
const GameAiSpendSummaryDenied = GameAiAccessDenied.extend({
  value: z.null().describe("The spend summary. Null \u2014 there is no Game AI spend to report")
});
const MakerAiAccessResponse = z.object({
  Success: z.boolean().describe("Whether the caller may use Maker AI. Always true"),
  Error: z.null().describe("The failure message. Null \u2014 the check always passes"),
  error_id: z.null().describe("The failure code. Null \u2014 the check always passes")
});
const MakerAiBalances = z.object({
  UsageDollars: z.number().describe("Dollars of model usage spent this period. Always 0"),
  UsersMaxUsageDollars: z.number().describe("The caller\u2019s usage ceiling. Always 0"),
  RRPlusUsageDollars: z.number().describe("Usage spent against the RR+ allowance. Always 0"),
  UsersMaxRRPlusUsageDollars: z.number().describe("The RR+ allowance ceiling. Always 0"),
  TimeBalanceStatus: z.string().describe("Time-balance bucket state, e.g. `Empty`"),
  TimeExpiresAt: z.string().describe("When the time balance lapses. `DateTime.MinValue` \u2014 there is none"),
  UsageBalanceStatus: z.string().describe("Usage-balance bucket state, e.g. `Good`"),
  UsagePercent: z.number().describe("Share of the usage ceiling consumed. Always 0"),
  RRPlusUsageBalanceStatus: z.string().describe("RR+ usage bucket state, e.g. `Good`"),
  RRPlusUsagePercent: z.number().describe("Share of the RR+ allowance consumed. Always 0")
});
const RealtimeSessionCreateBody = z.object({
  AIType: z.string().optional().describe("Which assistant the client is opening a session for, e.g. `Roomie`")
});
const RealtimeSessionDenied = z.object({
  success: z.literal(false),
  error: z.string().describe("The message shown to the player"),
  error_id: z.string().describe("Empty \u2014 the reference server sends no code for this refusal"),
  value: z.null().describe("The session credentials. Null: no session is created")
});
const RoomieUserFacts = z.object({
  UserContext: z.string().describe("A prose profile Roomie is primed with. Empty"),
  UserFacts: z.array(
    z.object({
      Id: z.string().describe("GUID identifying the fact"),
      CreatedAt: z.string().describe("When the fact was recorded"),
      Emotion: z.string().describe("Sentiment attached to the fact, e.g. `neutral`"),
      Predicate: z.string().describe("The relation, e.g. `identifies as`"),
      Object: z.string().describe("The value the predicate points at")
    })
  ).describe("The recorded facts. Always empty \u2014 nothing here observes the player")
});
export {
  AUTHED,
  GameAiAccessDenied,
  GameAiSpendSummaryDenied,
  HealthResponse,
  MakerAiAccessResponse,
  MakerAiBalances,
  RealtimeSessionCreateBody,
  RealtimeSessionDenied,
  RoomieAiAccess,
  RoomieUserFacts,
  UNAUTHORIZED_RESPONSE,
  boolQuery,
  idParam,
  intQuery,
  json,
  jsonBody
};
