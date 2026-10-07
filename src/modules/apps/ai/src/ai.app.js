// Ported from apps/ai/src/ai.app.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../runtime/router.js";
import { describeRoute, openAPIRouteHandler } from "../../../../runtime/openapi.js";
import { useWorkersLogger } from "../../../../runtime/logger.js";
import { withCleanSpec, withNotFound, withOnError } from "../../../packages/hono-helpers/src/index.js";
import { validateAndGetAccountId } from "../../../packages/jwt/src/index.js";
import {
  AUTHED,
  boolQuery,
  GameAiAccessDenied,
  GameAiSpendSummaryDenied,
  HealthResponse,
  idParam,
  intQuery,
  json,
  jsonBody,
  MakerAiAccessResponse,
  MakerAiBalances,
  RealtimeSessionCreateBody,
  RealtimeSessionDenied,
  RoomieAiAccess,
  RoomieUserFacts,
  UNAUTHORIZED_RESPONSE
} from "./openapi.js";
const INT32_MAX = 2147483647;
const GAME_AI_UNSUPPORTED = {
  success: false,
  error_id: "AI.RoomDoesNotSupportGameAI",
  error: "This room does not support Rec Room Game AI"
};
async function authedId(c) {
  return validateAndGetAccountId(c.req.raw, await c.env.JWT_SECRET.get());
}
function unauthorized(c) {
  return c.body(null, 401);
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
    description: "Liveness probe for the ai worker. No auth.",
    responses: { 200: json(HealthResponse, "Service is up") }
  }),
  (c) => c.json({ service: "ai", status: "ok" })
).get(
  "/gameai/user/access",
  describeRoute({
    tags: ["Game AI", "2025"],
    summary: "May the caller use Game AI here?",
    description: [
      "Asked before the client offers any Game AI feature in a room. This server hosts no",
      "Game AI, so it always refuses \u2014 with a 200 carrying `success: false`, NOT an HTTP",
      "error: the client branches on the body, and an error status would read as a failed",
      "request rather than the \u201Cnot available here\u201D state this is. `AI.RoomDoesNotSupportGameAI`",
      "is the reason the client renders.",
      "",
      "`roomId` is accepted and ignored \u2014 the answer is the same for every room, and the",
      "refusal is per-room by nature, so the client asks again for the next one. The token",
      "is still validated first, as the reference does."
    ].join(" "),
    security: AUTHED,
    parameters: [intQuery("roomId", "The room the client is asking about. Ignored.")],
    responses: {
      200: json(GameAiAccessDenied, "Always a refusal"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json(GAME_AI_UNSUPPORTED);
  }
).get(
  "/gameai/room/:roomId{[0-9]+}/spendsummary",
  describeRoute({
    tags: ["Game AI", "2025"],
    summary: "A room\u2019s Game AI spend summary",
    description: [
      "What a room has spent of its Game AI budget. Refused with the same 200-plus-",
      "`success: false` body as the access check, since a room that cannot use Game AI has",
      "no spend to summarise.",
      "",
      "The body is NOT identical to the access check\u2019s: it carries `value: null` where that",
      "one omits the key entirely. The access check answers a yes/no and has nothing to",
      "carry; this endpoint\u2019s payload slot exists and is empty. Reproduced as the reference",
      "server sends it \u2014 don\u2019t unify the two."
    ].join(" "),
    security: AUTHED,
    parameters: [idParam("roomId", "The room being asked about. Ignored.")],
    responses: {
      200: json(GameAiSpendSummaryDenied, "Always a refusal"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json({ ...GAME_AI_UNSUPPORTED, value: null });
  }
).get(
  "/roomieai/user/access",
  describeRoute({
    tags: ["Roomie AI", "2025"],
    summary: "The caller\u2019s Roomie AI energy budget",
    description: [
      "What Roomie may spend: an energy ceiling, what is left of it, and when it next",
      "refills. Nothing here meters energy, so the budget is `int.MaxValue` and never",
      "depletes \u2014 which is why `NextSubscriptionEnergyRechargeAt` is null, there being no",
      "spend to recharge from.",
      "",
      "The envelope is `{ success, error_id, error, value }`, NOT the flat body the Game AI",
      "check answers with. The two are different shapes on purpose \u2014 don\u2019t unify them."
    ].join(" "),
    security: AUTHED,
    responses: {
      200: json(RoomieAiAccess, "The energy budget \u2014 always granted, always full"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json({
      success: true,
      error_id: null,
      error: null,
      value: {
        MaxEnergyFromSubscriptions: INT32_MAX,
        EnergyLeft: INT32_MAX,
        NextSubscriptionEnergyRechargeAt: null,
        OutputAudioEnabled: true
      }
    });
  }
).get(
  "/roomieai/user/facts",
  describeRoute({
    tags: ["Roomie AI", "2025"],
    summary: "What Roomie knows about the caller",
    description: [
      "The memory Roomie is primed with: `UserContext`, a prose profile written from past",
      "conversations, and `UserFacts`, the discrete `(Predicate, Object)` claims behind it \u2014",
      "live, these are things the player told Roomie about themselves.",
      "",
      "Both are empty here. Nothing on this server observes a conversation, so there is",
      "nothing to remember, and Roomie starts every session knowing nothing about who it is",
      "talking to. A flat body, like the Maker AI balances and unlike the access check",
      "above."
    ].join(" "),
    security: AUTHED,
    responses: {
      200: json(RoomieUserFacts, "An empty profile \u2014 always"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json({ UserContext: "", UserFacts: [] });
  }
).get(
  "/makerai/user/access",
  describeRoute({
    tags: ["Maker AI", "2025"],
    summary: "May the caller use Maker AI?",
    description: [
      "Asked before the client offers Maker AI. Always granted \u2014 the gate is about",
      "entitlement, not capacity, and nothing here meters what Maker AI would cost.",
      "",
      "The envelope carries PascalCase `Success`/`Error` next to a snake_case `error_id`,",
      "which matches neither neighbour on this worker. That mix is what the reference sends;",
      "it is not an inconsistency to clean up.",
      "",
      "`roomInstanceSpecificCheck` (the client sends .NET\u2019s `True`/`False`) is accepted and",
      "ignored: it asks whether the check is about the instance the player is standing in",
      "rather than the account, and the answer is the same either way. The token is still",
      "validated first."
    ].join(" "),
    security: AUTHED,
    parameters: [
      boolQuery(
        "roomInstanceSpecificCheck",
        "Whether to check the current room instance rather than the account. Ignored."
      )
    ],
    responses: {
      200: json(MakerAiAccessResponse, "Always granted"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json({ Success: true, Error: null, error_id: null });
  }
).get(
  "/makerai/user/balances",
  describeRoute({
    tags: ["Maker AI", "2025"],
    summary: "The caller\u2019s Maker AI usage balances",
    description: [
      "What Maker AI has cost the caller. Live, these meter model usage in DOLLARS against",
      "a per-user ceiling and a separate RR+ allowance, and the client renders them as a",
      "usage bar with a status word.",
      "",
      "Nothing here bills for model usage, so every figure is zero and both usage buckets",
      "report `Good` \u2014 an untouched allowance, not an exhausted one. The time bucket is",
      "`Empty` with `TimeExpiresAt` at `DateTime.MinValue`, this server selling no timed",
      "access for it to hold.",
      "",
      "A flat body \u2014 no `{ success, error, value }` envelope, unlike the Roomie access check."
    ].join(" "),
    security: AUTHED,
    responses: {
      200: json(MakerAiBalances, "All zero \u2014 nothing is metered here"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json({
      UsageDollars: 0,
      UsersMaxUsageDollars: 0,
      RRPlusUsageDollars: 0,
      UsersMaxRRPlusUsageDollars: 0,
      TimeBalanceStatus: "Empty",
      TimeExpiresAt: "0001-01-01T00:00:00",
      UsageBalanceStatus: "Good",
      UsagePercent: 0,
      RRPlusUsageBalanceStatus: "Good",
      RRPlusUsagePercent: 0
    });
  }
).post(
  "/realtime-session/create",
  describeRoute({
    tags: ["Roomie AI", "2025"],
    summary: "Open a realtime AI session",
    description: [
      "Posted when the player actually pulls out an assistant. Live, this mints a short-",
      "lived credential the CLIENT then uses to talk to the model provider directly, and",
      "answers with `{ SessionId, ClientSecret }` in `value`.",
      "",
      "Refused here. This is the one endpoint on the worker whose answer is a working key",
      "rather than a description of one, so there is nothing static to serve \u2014 which is why",
      "the budget reads above grant everything and the refusal lands at this point instead:",
      "the client offers the feature, and the session it opens is what fails.",
      "",
      "The refusal is still a 200 with `success: false`, and `error_id` is an EMPTY STRING",
      "rather than a code \u2014 the reference server sends no id for this one. `value` is null."
    ].join(" "),
    security: AUTHED,
    requestBody: jsonBody(
      RealtimeSessionCreateBody,
      "Which assistant is being opened. Read for the log only \u2014 the answer is the same either way."
    ),
    responses: {
      200: json(RealtimeSessionDenied, "Always a refusal \u2014 no session is created"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json({
      success: false,
      error: "Realtime AI sessions are not available on this server",
      error_id: "",
      value: null
    });
  }
);
app.get(
  "/openapi.json",
  describeRoute({ hide: true }),
  withCleanSpec(
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "recflare ai",
          version: "1.0.0",
          description: [
            "The AI service for recflare, a private-server reimplementation of the Rec Room",
            "backend. The client checks here before offering any of its AI features: Game AI in a",
            "room, the Roomie assistant, and Maker AI\u2019s usage meter.",
            "",
            "No model runs behind this worker, so every answer is static \u2014 but they are not all",
            "refusals, because the features fail at different points. Game AI is a server-side",
            "feature this server cannot provide, so both its reads refuse. Roomie and Maker AI",
            "only ask what the caller may SPEND, which nothing here meters, so those reads are",
            "granted in full; the refusal lands instead on `POST /realtime-session/create`, the",
            "one call whose real answer is a working credential rather than a description of one.",
            "",
            "The refusals are 200s carrying `success: false`, which is the shape the client",
            "branches on \u2014 the worker exists so the client gets a definite answer on the host its",
            "endpoints document names, instead of a failed request."
          ].join("\n")
        },
        servers: [{ url: "https://ai.recflare.net", description: "Production" }],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
              description: "An `access_token` from the auth worker\u2019s `POST /connect/token`."
            }
          }
        }
      }
    })
  )
);
var stdin_default = app;
export {
  stdin_default as default
};
