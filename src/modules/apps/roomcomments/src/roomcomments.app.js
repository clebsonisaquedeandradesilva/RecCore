// Ported from apps/roomcomments/src/roomcomments.app.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../runtime/router.js";
import { describeRoute, openAPIRouteHandler } from "../../../../runtime/openapi.js";
import { useWorkersLogger } from "../../../../runtime/logger.js";
import { createRoomComment, DEFAULT_COMMENT_COUNT, getRoomComments } from "../../../packages/domain/src/index.js";
import { withCleanSpec, withNotFound, withOnError } from "../../../packages/hono-helpers/src/index.js";
import { validateAndGetAccountId } from "../../../packages/jwt/src/index.js";
import {
  AUTHED,
  CommentCreateBody,
  form,
  HealthResponse,
  json,
  RoomCommentEntry,
  UNAUTHORIZED_RESPONSE
} from "./openapi.js";
async function authedId(c) {
  return validateAndGetAccountId(c.req.raw, await c.env.JWT_SECRET.get());
}
function unauthorized(c) {
  return c.body(null, 401);
}
function intOrNull(value) {
  if (value === void 0 || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function floatOrZero(value) {
  if (typeof value !== "string") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
const MAX_COMMENT_LENGTH = 1e3;
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
    description: "Liveness probe for the roomcomments worker. No auth.",
    responses: { 200: json(HealthResponse, "Service is up") }
  }),
  (c) => c.json({ service: "roomcomments", status: "ok" })
).get(
  "/comments/get/:roomId",
  describeRoute({
    tags: ["Room Comments"],
    summary: "A room\u2019s comments",
    description: [
      "The comments pinned in a room, newest first. Public \u2014 a comment is a fixture of the",
      "room and the client fetches the list on load, so no token is needed. `Unread` is",
      "always true; nothing marks a comment read.",
      "",
      '`minId` is an EXCLUSIVE cursor, which is why the client\u2019s "give me everything"',
      "sentinel is `-1` rather than `0`: a client holding comments up to id N polls with",
      "`minId=N` and gets only what was written since. `count` caps the page (default",
      `${DEFAULT_COMMENT_COUNT}, max 500\`); because the order is newest-first, a fresh client`,
      "asking a busy room for 100 gets the 100 that are actually on the wall rather than the",
      "oldest hundred.",
      "",
      "An unknown room simply has no comments \u2014 `[]`, not a 404."
    ].join(" "),
    parameters: [
      {
        name: "roomId",
        in: "path",
        required: true,
        schema: { type: "integer" },
        description: "The room to read"
      },
      {
        name: "count",
        in: "query",
        schema: { type: "integer" },
        description: `How many to serve (default ${DEFAULT_COMMENT_COUNT}, clamped to 1\u2013500)`
      },
      {
        name: "minId",
        in: "query",
        schema: { type: "integer" },
        description: "Exclusive id cursor; `-1` (the default) serves the newest page"
      },
      {
        name: "subRoomId",
        in: "query",
        schema: { type: "integer" },
        description: "Narrow to one subroom; omitted, the whole room\u2019s comments are served"
      }
    ],
    responses: { 200: json(RoomCommentEntry.array(), "The room\u2019s comments, newest first") }
  }),
  async (c) => {
    const roomId = intOrNull(c.req.param("roomId"));
    if (roomId === null) return c.json([]);
    return c.json(
      await getRoomComments(c.env.DB, roomId, {
        count: intOrNull(c.req.query("count")) ?? void 0,
        minId: intOrNull(c.req.query("minId")) ?? void 0,
        subRoomId: intOrNull(c.req.query("subRoomId"))
      })
    );
  }
).post(
  "/comments/create/:roomId",
  describeRoute({
    tags: ["Room Comments"],
    summary: "Leave a comment in a room",
    description: [
      "Pins a comment in a subroom\u2019s scene at the given point. The author is the bearer",
      "token\u2019s account \u2014 the body carries no account id.",
      "",
      "Answers the created comment itself, so the client can render the bubble it just placed",
      "without re-fetching the list. `Unread` is true on it like everywhere else \u2014 it is read",
      "state, not a per-viewer flag, and the author\u2019s own new comment is no exception.",
      "",
      "`positionX/Y/Z` arrive as a C# float\u2019s round-trip text and go back out as numbers.",
      `A blank \`message\` or a missing \`subRoomId\` is a 400; longer than ${MAX_COMMENT_LENGTH}`,
      "characters is truncated rather than rejected."
    ].join(" "),
    security: AUTHED,
    parameters: [
      {
        name: "roomId",
        in: "path",
        required: true,
        schema: { type: "integer" },
        description: "The room to comment in"
      }
    ],
    requestBody: form(CommentCreateBody, "The comment, form-encoded as the client posts it"),
    responses: {
      200: json(RoomCommentEntry, "The comment as stored"),
      400: { description: "Unusable room id, blank message, or missing subroom (empty body)" },
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const playerId = await authedId(c);
    if (playerId === null) return unauthorized(c);
    const roomId = intOrNull(c.req.param("roomId"));
    if (roomId === null) return c.body(null, 400);
    const body = await c.req.parseBody().catch(() => ({}));
    const subRoomId = intOrNull(typeof body.subRoomId === "string" ? body.subRoomId : void 0);
    if (subRoomId === null) return c.body(null, 400);
    const message = (typeof body.message === "string" ? body.message : "").trim().slice(0, MAX_COMMENT_LENGTH);
    if (message === "") return c.body(null, 400);
    const comment = await createRoomComment(c.env.DB, roomId, playerId, {
      subRoomId,
      message,
      style: intOrNull(typeof body.style === "string" ? body.style : void 0) ?? 0,
      positionX: floatOrZero(body.positionX),
      positionY: floatOrZero(body.positionY),
      positionZ: floatOrZero(body.positionZ)
    });
    if (comment === null) return c.body(null, 400);
    return c.json(comment);
  }
);
app.get(
  "/openapi.json",
  describeRoute({ hide: true }),
  withCleanSpec(
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "recflare roomcomments",
          version: "1.0.0",
          description: [
            "Room comments for recflare, a private-server reimplementation of the Rec Room",
            "backend \u2014 the notes a player pins in a room\u2019s scene, each with a message, a bubble",
            "style and the point in the subroom it floats at.",
            "",
            "Reads are public \u2014 a comment is a fixture of the room, so no token is needed. Writing",
            "needs one, since the comment is signed with the caller\u2019s account id.",
            "",
            "`Unread` is always true. Nothing marks a comment read, and it is read state rather",
            "than a per-viewer flag: the create response carries `Unread: true` for the author\u2019s",
            "own brand-new comment too."
          ].join("\n")
        },
        servers: [{ url: "https://roomcomments.recflare.net", description: "Production" }],
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
