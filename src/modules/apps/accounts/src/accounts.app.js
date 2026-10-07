// Ported from apps/accounts/src/accounts.app.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../runtime/router.js";
import { describeRoute, openAPIRouteHandler, validator } from "../../../../runtime/openapi.js";
import { useWorkersLogger } from "../../../../runtime/logger.js";
import {
  createAccount,
  defaultAccount,
  getAccount,
  getAccountByUsername,
  getAccountsByIds,
  searchAccounts,
  updateAccount
} from "../../../packages/domain/src/index.js";
import {
  logger,
  withCleanSpec,
  withDefaultCors,
  withNotFound,
  withOnError
} from "../../../packages/hono-helpers/src/index.js";
import { validateAndGetAccountId } from "../../../packages/jwt/src/index.js";
import { NotificationType } from "../../notify/src/notification-types.js";
import {
  AccountDto,
  BannerImageRequest,
  BioRequest,
  BioResponse,
  CreateAccountRequest,
  CreateAccountResult,
  DisplayNameRequest,
  EmailRequest,
  EmojiRequest,
  form,
  HealthResponse,
  IdentityFlagsRequest,
  json,
  ParentalControl,
  PhoneRequest,
  PrivacySettings,
  ProfileImageRequest,
  PronounsRequest,
  SelfAccountDto,
  SuccessResponse,
  UsernameRequest,
  UsernameResult,
  WhitelistedEmojis
} from "./openapi.js";
import { resolveWhitelistedEmoji, WHITELISTED_EMOJIS } from "./whitelisted-emojis.js";
async function authedId(c) {
  return validateAndGetAccountId(c.req.raw, await c.env.JWT_SECRET.get());
}
function unauthorized(c) {
  return c.body(null, 401);
}
const DEFAULT_USERNAME_CHANGES = 3;
function usernameResult(c, error = "", value = "") {
  return c.json({ success: error === "", error, value });
}
async function formField(c, name) {
  const body = await c.req.parseBody().catch(() => ({}));
  const value = body[name];
  return typeof value === "string" ? value : "";
}
function toAccountDto(account) {
  return {
    accountId: account.accountId,
    username: account.username,
    displayName: account.displayName,
    profileImage: account.profileImage,
    // Rows stored before these fields existed have neither key — always emit them as
    // "" rather than letting them go missing.
    bannerImage: account.bannerImage ?? "",
    displayEmoji: account.displayEmoji ?? "",
    isJunior: account.isJunior,
    platforms: account.platforms,
    personalPronouns: account.personalPronouns,
    identityFlags: account.identityFlags,
    createdAt: account.createdAt
  };
}
function toSelfAccountDto(account) {
  return {
    ...toAccountDto(account),
    email: account.email ?? "",
    // @todo he game client needs this to be set. I forget how birthdays were set, so for now
    // everyone can be old.
    birthday: "1904-01-01T00:00:00.000Z",
    availableUsernameChanges: account.availableUsernameChanges ?? DEFAULT_USERNAME_CHANGES
  };
}
const HUB_INSTANCE = "global";
async function pushAccountUpdate(c, account) {
  try {
    const hub = c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE);
    const publicDto = toAccountDto(account);
    await hub.notifyPlayer(
      account.accountId,
      NotificationType.SubscriptionUpdateSelfProfile,
      toSelfAccountDto(account)
    );
    await hub.notifyPlayer(account.accountId, NotificationType.SubscriptionUpdateProfile, publicDto);
    await hub.broadcast(NotificationType.SubscriptionUpdateProfile, publicDto);
  } catch (err) {
    logger.error("failed to push account update notifications", {
      accountId: account.accountId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
const UNAUTHORIZED_RESPONSE = { description: "Missing or invalid bearer token (empty body)" };
const AUTHED = [{ bearerAuth: [] }];
const app = new Hono().use(
  "*",
  // middleware
  (c, next) => useWorkersLogger(c.env.NAME, {
    environment: c.env.ENVIRONMENT,
    release: c.env.SENTRY_RELEASE
  })(c, next)
).use("*", withDefaultCors()).onError(withOnError()).notFound(withNotFound()).get(
  "/",
  describeRoute({
    tags: ["Meta"],
    summary: "Health check",
    responses: { 200: json(HealthResponse, "Service is up") }
  }),
  (c) => c.json({ service: "accounts", status: "ok" })
).get(
  "/emojiConfig/whitelistedEmojis",
  describeRoute({
    tags: ["Config"],
    summary: "Emoji a player may use as their displayEmoji",
    description: [
      "A bare JSON array of emoji, in the order the client draws them. Static \u2014 not",
      "auth-gated, and identical for every player."
    ].join(" "),
    responses: { 200: json(WhitelistedEmojis, "The whitelisted emoji, in picker order") }
  }),
  (c) => c.json(WHITELISTED_EMOJIS)
).get(
  "/account/me",
  describeRoute({
    tags: ["Self"],
    summary: "The caller\u2019s own account",
    description: [
      "The private self DTO, including owner-only fields (email, remaining username",
      "changes). An account with no stored row falls back to a synthesized default."
    ].join(" "),
    security: AUTHED,
    responses: {
      200: json(SelfAccountDto, "The caller\u2019s account"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const account = await getAccount(c.env.DB, id) ?? defaultAccount(id);
    return c.json(toSelfAccountDto(account));
  }
).get(
  "/account/search",
  describeRoute({
    tags: ["Lookup"],
    summary: "Prefix-search accounts by username",
    description: "Case-insensitive prefix match on username, ordered alphabetically.",
    parameters: [
      {
        name: "name",
        in: "query",
        required: false,
        description: "Username prefix; empty matches nothing meaningful",
        schema: { type: "string" }
      }
    ],
    responses: { 200: json(AccountDto.array(), "Matching public accounts") }
  }),
  async (c) => {
    const name = c.req.query("name") ?? "";
    const accounts = await searchAccounts(c.env.DB, name);
    return c.json(accounts.map(toAccountDto));
  }
).get(
  "/account/bulk",
  describeRoute({
    tags: ["Lookup"],
    summary: "Look up many accounts by id",
    description: [
      "Accepts repeated `id` query params and/or comma-separated lists. Every requested",
      "id appears in the response \u2014 ids with no stored row get a synthesized default."
    ].join(" "),
    parameters: [
      {
        name: "id",
        in: "query",
        required: false,
        description: "Repeatable; each value may be a comma-separated list of ids",
        schema: { type: "array", items: { type: "string" } }
      }
    ],
    responses: { 200: json(AccountDto.array(), "One public account per requested id") }
  }),
  async (c) => {
    const ids = c.req.queries("id")?.flatMap((v) => v.split(",")).map((s) => Number.parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n)) ?? [];
    const stored = new Map((await getAccountsByIds(c.env.DB, ids)).map((a) => [a.accountId, a]));
    return c.json(ids.map((id) => toAccountDto(stored.get(id) ?? defaultAccount(id))));
  }
).get(
  "/account/:id/bio",
  describeRoute({
    tags: ["Lookup"],
    summary: "A player\u2019s bio",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "Account id; non-numeric is 400",
        schema: { type: "string" }
      }
    ],
    responses: {
      200: json(BioResponse, "The bio (empty string when unset)"),
      400: { description: "Non-numeric id (empty body)" }
    }
  }),
  async (c) => {
    const accountId = Number.parseInt(c.req.param("id"), 10);
    if (Number.isNaN(accountId)) return c.body(null, 400);
    const account = await getAccount(c.env.DB, accountId);
    return c.json({ accountId, bio: account?.bio ?? "" });
  }
).get(
  "/account/:id",
  describeRoute({
    tags: ["Lookup"],
    summary: "A single public account",
    description: "An id with no stored row falls back to a synthesized default account.",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "Account id; non-numeric is 400",
        schema: { type: "string" }
      }
    ],
    responses: {
      200: json(AccountDto, "The public account"),
      400: { description: "Non-numeric id (empty body)" }
    }
  }),
  async (c) => {
    const accountId = Number.parseInt(c.req.param("id"), 10);
    if (Number.isNaN(accountId)) return c.body(null, 400);
    return c.json(
      toAccountDto(await getAccount(c.env.DB, accountId) ?? defaultAccount(accountId))
    );
  }
).post(
  "/account/create",
  describeRoute({
    tags: ["Self"],
    summary: "Create an account",
    description: [
      "Mints a new account with an auto-assigned random username (players don\u2019t choose",
      "one initially). Not auth-gated. `platformId` is parsed but not yet persisted."
    ].join(" "),
    requestBody: form(CreateAccountRequest, "Platform fields"),
    responses: { 200: json(CreateAccountResult, "The created account, in a result envelope") }
  }),
  async (c) => {
    const platform = await formField(c, "platform");
    await formField(c, "platformId");
    const platforms = Number.parseInt(platform, 10);
    const account = await createAccount(c.env.DB, {
      platforms: Number.isNaN(platforms) ? 0 : platforms
    });
    return c.json({ success: true, value: toAccountDto(account) });
  }
).get(
  "/parentalcontrol/me",
  describeRoute({
    tags: ["Self"],
    summary: "The caller\u2019s parental-control flags",
    description: "Nothing stores parental controls yet; purchases are always allowed.",
    security: AUTHED,
    responses: {
      200: json(ParentalControl, "Parental-control flags"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json({ accountId: id, disallowInAppPurchases: true });
  }
).get(
  "/accountprivacysettings/:id{[0-9]+}",
  describeRoute({
    tags: ["Lookup"],
    summary: "An account\u2019s privacy settings",
    description: [
      "Nothing stores per-player privacy yet; the id is echoed and recent history is",
      "reported visible (a bare `{}` fails the client\u2019s deserializer)."
    ].join(" "),
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "Account id (digits only)",
        schema: { type: "string", pattern: "^[0-9]+$" }
      }
    ],
    responses: { 200: json(PrivacySettings, "Privacy settings") }
  }),
  (c) => c.json({
    accountId: Number.parseInt(c.req.param("id"), 10),
    isRecentHistoryVisible: true
  })
).put(
  "/account/me/displayname",
  describeRoute({
    tags: ["Profile"],
    summary: "Set display name",
    description: "Persisted and broadcast via an AccountUpdate notification.",
    security: AUTHED,
    responses: {
      200: json(SuccessResponse, "Updated"),
      400: {
        description: "Empty, over 15 characters, non-alphanumeric, or profane (empty body)"
      },
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  // An EMPTY 400, which is what this route already answered for an empty name: it
  // acks with a bare SuccessResponse and has never sent the client a body on
  // failure, so enforcing the schema doesn't change what a refusal looks like.
  validator("form", DisplayNameRequest, (r, c) => r.success ? void 0 : c.body(null, 400)),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const { displayName } = c.req.valid("form");
    const account = await updateAccount(c.env.DB, id, { displayName });
    await pushAccountUpdate(c, account);
    return c.json({ success: true });
  }
).put(
  "/account/me/username",
  describeRoute({
    tags: ["Profile"],
    summary: "Change username",
    description: [
      "Letters and digits only, at most 50 characters, and free of profanity (the same",
      "word list as `api`\u2019s `POST /api/sanitize/v1/isPure`). Rejects a name taken by another",
      "account and requires a remaining change; on success the name is persisted and",
      "the counter decremented. Always HTTP 200 \u2014 failures carry a message in `error`",
      "(see the UsernameResult envelope)."
    ].join(" "),
    security: AUTHED,
    responses: {
      200: json(UsernameResult, "Result envelope (success or a validation error)"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  // Shape is checked before the handler runs, so a rejected name costs no D1 read and
  // — the part that matters — can never spend one of the account's rationed changes.
  // The message is relayed rather than zod's issue array: `nameRejection` writes the
  // sentence the player reads, and nothing can render an array of issues.
  // `c` is annotated so the hook's context matches this app's bindings, and `error` is
  // Standard Schema's flat issue list rather than a zod error object.
  validator(
    "form",
    UsernameRequest,
    (r, c) => r.success ? void 0 : usernameResult(c, r.error[0]?.message ?? "That username cannot be used.")
  ),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const { username } = c.req.valid("form");
    const existing = await getAccountByUsername(c.env.DB, username);
    if (existing && existing.accountId !== id) {
      return usernameResult(c, "That username is already taken.");
    }
    const account = await getAccount(c.env.DB, id) ?? defaultAccount(id);
    const remaining = account.availableUsernameChanges ?? DEFAULT_USERNAME_CHANGES;
    if (remaining <= 0) {
      return usernameResult(c, "You have no username changes remaining.");
    }
    const updated = await updateAccount(c.env.DB, id, {
      username,
      availableUsernameChanges: remaining - 1
    });
    await pushAccountUpdate(c, updated);
    return usernameResult(c, "", toAccountDto(updated));
  }
).post(
  "/account/me/email",
  describeRoute({
    tags: ["Profile"],
    summary: "Set email",
    description: "Persisted; surfaced only by `/account/me`. Not broadcast.",
    security: AUTHED,
    responses: {
      200: json(SuccessResponse, "Updated"),
      400: { description: "Not a syntactically valid address (empty body)" },
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  validator("form", EmailRequest, (r, c) => r.success ? void 0 : c.body(null, 400)),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const { email } = c.req.valid("form");
    await updateAccount(c.env.DB, id, { email });
    return c.json({ success: true });
  }
).post(
  "/account/me/phone",
  describeRoute({
    tags: ["Profile"],
    summary: "Set phone number",
    description: "Persisted on the account row. Not broadcast.",
    security: AUTHED,
    responses: {
      200: json(SuccessResponse, "Updated"),
      400: { description: "Empty phone (empty body)" },
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  validator("form", PhoneRequest, (r, c) => r.success ? void 0 : c.body(null, 400)),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const { phone } = c.req.valid("form");
    await updateAccount(c.env.DB, id, { phone });
    return c.json({ success: true });
  }
).put(
  "/account/me/identityflags",
  describeRoute({
    tags: ["Profile"],
    summary: "Set identity flags",
    description: [
      "`identityFlags` bitmask. In the public DTO, so the update is broadcast via",
      "AccountUpdate."
    ].join(" "),
    security: AUTHED,
    requestBody: form(IdentityFlagsRequest, "The identityFlags bitmask"),
    responses: {
      200: json(SuccessResponse, "Updated"),
      400: { description: "Non-numeric identityFlags (empty body)" },
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const identityFlags = Number.parseInt((await formField(c, "identityFlags")).trim(), 10);
    if (Number.isNaN(identityFlags)) return c.body(null, 400);
    const account = await updateAccount(c.env.DB, id, { identityFlags });
    await pushAccountUpdate(c, account);
    return c.json({ success: true });
  }
).put(
  "/account/me/personalpronouns",
  describeRoute({
    tags: ["Profile"],
    summary: "Set personal pronouns",
    description: [
      "Posted as `pronounFlags`. The response carries no account, so the client learns",
      "the new value only from the broadcast AccountUpdate."
    ].join(" "),
    security: AUTHED,
    requestBody: form(PronounsRequest, "The pronounFlags bitmask"),
    responses: {
      200: json(SuccessResponse, "Updated"),
      400: { description: "Non-numeric pronounFlags (empty body)" },
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const personalPronouns = Number.parseInt((await formField(c, "pronounFlags")).trim(), 10);
    if (Number.isNaN(personalPronouns)) return c.body(null, 400);
    const account = await updateAccount(c.env.DB, id, { personalPronouns });
    await pushAccountUpdate(c, account);
    return c.json({ success: true });
  }
).put(
  "/account/me/bio",
  describeRoute({
    tags: ["Profile"],
    summary: "Set bio",
    description: "Free text up to 255 characters; empty is allowed. Persisted and broadcast.",
    security: AUTHED,
    responses: {
      200: json(SuccessResponse, "Updated"),
      400: { description: "Bio over 255 characters (empty body)" },
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  // Refused rather than truncated: silently storing half a sentence reads as data loss.
  validator("form", BioRequest, (r, c) => r.success ? void 0 : c.body(null, 400)),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const { bio } = c.req.valid("form");
    const account = await updateAccount(c.env.DB, id, { bio });
    await pushAccountUpdate(c, account);
    return c.json({ success: true });
  }
).put(
  "/account/me/emoji",
  describeRoute({
    tags: ["Profile"],
    summary: "Set display emoji",
    description: [
      "Persists the emoji shown beside the display name and broadcasts it in the",
      "AccountUpdate payload. The value must be one the whitelist serves; an empty value",
      "clears the pick."
    ].join(" "),
    security: AUTHED,
    requestBody: form(EmojiRequest, 'A whitelisted emoji, or "" to clear'),
    responses: {
      200: json(SuccessResponse, "Updated"),
      400: { description: "Not a whitelisted emoji (empty body)" },
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const submitted = (await formField(c, "displayEmoji")).trim();
    const displayEmoji = submitted === "" ? "" : resolveWhitelistedEmoji(submitted);
    if (displayEmoji === null) return c.body(null, 400);
    const account = await updateAccount(c.env.DB, id, { displayEmoji });
    await pushAccountUpdate(c, account);
    return c.json({ success: true });
  }
).put(
  "/account/me/bannerimage",
  describeRoute({
    tags: ["Profile"],
    summary: "Set profile banner image",
    description: "Persists the banner object key and broadcasts it in the AccountUpdate payload. The key names an image the player already uploaded \u2014 typically one of their own photos (`sharecamera/\u2026`) \u2014 so nothing is uploaded here.",
    security: AUTHED,
    requestBody: form(BannerImageRequest, "The banner object key"),
    responses: {
      200: json(SuccessResponse, "Updated"),
      400: { description: "Empty imageName (empty body)" },
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const imageName = await formField(c, "imageName");
    if (!imageName) return c.body(null, 400);
    const account = await updateAccount(c.env.DB, id, { bannerImage: imageName });
    await pushAccountUpdate(c, account);
    return c.json({ success: true });
  }
).put(
  "/account/me/profileimage",
  describeRoute({
    tags: ["Profile"],
    summary: "Set profile image",
    description: "Persists the avatar object key and broadcasts it in the AccountUpdate payload.",
    security: AUTHED,
    requestBody: form(ProfileImageRequest, "The avatar object key"),
    responses: {
      200: json(SuccessResponse, "Updated"),
      400: { description: "Empty imageName (empty body)" },
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const imageName = await formField(c, "imageName");
    if (!imageName) return c.body(null, 400);
    const account = await updateAccount(c.env.DB, id, { profileImage: imageName });
    await pushAccountUpdate(c, account);
    return c.json({ success: true });
  }
);
app.get(
  "/openapi.json",
  describeRoute({ hide: true }),
  withCleanSpec(
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "recflare accounts",
          version: "1.0.0",
          description: [
            "Account reads, profile mutations and lookups for recflare, a private-server",
            "reimplementation of the Rec Room backend. Accounts live in the shared `recflare`",
            "D1 database, whose `account` schema is owned by the `auth` worker."
          ].join("\n")
        },
        servers: [{ url: "https://accounts.recflare.net", description: "Production" }],
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
