// Ported from apps/auth/src/auth.app.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../runtime/router.js";
import { describeRoute, openAPIRouteHandler } from "../../../../runtime/openapi.js";
import { useWorkersLogger } from "../../../../runtime/logger.js";
import { z } from "../../../../../vendor/zod.js";
import {
  countAccountsBySignupIp,
  createAccount,
  GAME_VERSION,
  getAccount,
  getAccountByUsername,
  getAccountsByIds,
  getPasswordHash,
  getRoomById,
  hashPassword,
  RoomInstanceType,
  setLastLoginTime,
  setLoginContext,
  setPasswordHash,
  setPresence,
  subRoomDataBlob,
  updateAccount,
  verifyPassword
} from "../../../packages/domain/src/index.js";
import {
  intVar,
  logger,
  withCleanSpec,
  withDefaultCors,
  withNotFound,
  withOnError
} from "../../../packages/hono-helpers/src/index.js";
import { generateToken, TOKEN_TTL_SECONDS, validateAndGetAccountId } from "../../../packages/jwt/src/index.js";
import { banEvasionMatch, resolveBan } from "../../api/src/bans-db.js";
import { verifyMetaNonce } from "./meta-nonce.js";
import {
  CachedLogin,
  ChangePasswordRequest,
  ChangePasswordResponse,
  FakeCachedLogin,
  form,
  json,
  OAuthError,
  PlatformIdsRequest,
  PlatformType,
  RestrictionDto,
  roleLookup,
  TokenRequest,
  TokenResponse
} from "./openapi.js";
import {
  countAccountsForPlatformIdentity,
  getLinksForPlatformId,
  getLinksForPlatformIdentity,
  isPlatformIdentityLinked,
  linkPlatformIdentity
} from "./platform-db.js";
import { consumeRefreshToken, issueRefreshToken } from "./refresh-db.js";
import { verifySteamTicket } from "./steam-ticket.js";
const TOKEN_SCOPE = "offline_access profile rn rn.accounts rn.accounts.gc rn.api rn.chat rn.clubs rn.commerce rn.match.read rn.match.write rn.notify rn.rooms rn.storage";
const BLOCKED_DESCRIPTION = "this device or network is blocked";
const SIDELOAD_PLATFORM_ID = "1";
const FAKE_OCULUS_CACHED_LOGIN = {
  platform: PlatformType.Oculus,
  platformId: SIDELOAD_PLATFORM_ID,
  accountId: 1,
  lastLoginTime: "2026-07-19T17:13:29.225Z",
  requirePassword: true
};
const DEFAULT_MAX_ACCOUNTS_PER_PLATFORM_ID = 3;
const DEFAULT_MAX_ACCOUNTS_PER_IP = 3;
const ORIENTATION_ROOM_ID = 13;
const ORIENTATION_INSTANCE_ID = -2;
async function placeNewPlayerInOrientation(env, accountId, deviceClass) {
  const room = await getRoomById(env.DB, ORIENTATION_ROOM_ID);
  if (!room) return;
  const subRooms = room.SubRooms;
  const sub = Array.isArray(subRooms) ? subRooms[0] : void 0;
  const str = (v, fallback = "") => typeof v === "string" ? v : fallback;
  const num = (v, fallback) => typeof v === "number" ? v : fallback;
  const roomInstance = {
    roomInstanceId: ORIENTATION_INSTANCE_ID,
    roomId: ORIENTATION_ROOM_ID,
    subRoomId: num(sub?.SubRoomId, 1),
    roomInstanceType: RoomInstanceType.Public,
    location: str(sub?.UnitySceneId),
    dataBlob: subRoomDataBlob(sub),
    eventId: 0,
    clubId: 0,
    roomCode: "",
    photonRegion: "us",
    photonRegionId: "us",
    photonRoomId: `rec.${ORIENTATION_ROOM_ID}`,
    name: `^${str(room.Name, "Orientation")}`,
    maxCapacity: num(sub?.MaxPlayers, 4),
    isFull: false,
    isPrivate: false,
    isInProgress: false,
    EncryptVoiceChat: false
  };
  await setPresence(env.DB, {
    accountId,
    roomInstance,
    statusVisibility: 0,
    deviceClass,
    vrMovementMode: 1,
    platform: 0,
    appVersion: GAME_VERSION
  });
}
async function authedId(c) {
  return validateAndGetAccountId(c.req.raw, await c.env.JWT_SECRET.get());
}
function accountRoles(account) {
  const roles = ["screenshare"];
  if (!account) return roles;
  if (account.isDeveloper) roles.push("developer");
  if (account.isModerator) roles.push("moderator");
  if (account.isJunior) roles.push("junior");
  return roles;
}
function accountPrivileges(account) {
  return account?.isJunior ? ["BanVChat", "BanRmChat"] : [];
}
function accountPlatform(account) {
  return account.platform ?? 0;
}
function toCachedLogin(account, link) {
  return {
    platform: link.platform,
    platformId: link.platformId,
    accountId: account.accountId,
    lastLoginTime: account.lastLoginTime ?? account.createdAt,
    requirePassword: false
  };
}
async function toCachedLogins(db, links) {
  if (links.length === 0) return [];
  const accounts = await getAccountsByIds(db, [...new Set(links.map((l) => l.accountId))]);
  const byId = new Map(accounts.map((a) => [a.accountId, a]));
  return links.flatMap((link) => {
    const account = byId.get(link.accountId);
    return account ? [toCachedLogin(account, link)] : [];
  });
}
async function linkLoginIdentity(db, accountId, platform, platformId, maxAccountsPerIdentity) {
  if (await isPlatformIdentityLinked(db, accountId, platform, platformId)) return;
  if (maxAccountsPerIdentity > 0 && await countAccountsForPlatformIdentity(db, platform, platformId) >= maxAccountsPerIdentity) {
    logger.info("platform link refused: account limit reached for this platform identity", {
      accountId,
      platform,
      platformId
    });
    return;
  }
  if (!await linkPlatformIdentity(db, accountId, platform, platformId)) return;
  logger.info("linked platform identity to account", { accountId, platform, platformId });
  const account = await getAccount(db, accountId);
  if (account && !account.platformId) {
    await updateAccount(db, accountId, { platform, platformId });
  }
}
async function verifyPlatformProof(env, platform, platformAuth, postedPlatformId) {
  if (platform === PlatformType.Oculus && postedPlatformId === SIDELOAD_PLATFORM_ID) {
    return { status: "rejected", reason: "sideload placeholder platform id is never an identity" };
  }
  if (platform === PlatformType.Steam) {
    const verified = platformAuth ? await verifySteamTicket(platformAuth) : null;
    if (!verified) return { status: "rejected", reason: "invalid or missing Steam ticket" };
    return { status: "verified", platform: PlatformType.Steam, platformId: verified.steamId };
  }
  if (platform === PlatformType.Oculus) {
    const appSecret = await env.META_APP_SECRET.get().catch(() => "");
    if (appSecret === "") return { status: "unconfigured" };
    const verified = await verifyMetaNonce(platformAuth, postedPlatformId, appSecret);
    if (!verified.ok) return { status: "rejected", reason: verified.reason };
    return {
      status: "verified",
      platform: PlatformType.Oculus,
      platformId: verified.identity.userId
    };
  }
  return { status: "unsupported" };
}
const app = new Hono().use(
  "*",
  // middleware
  (c, next) => useWorkersLogger(c.env.NAME, {
    environment: c.env.ENVIRONMENT,
    release: c.env.SENTRY_RELEASE
  })(c, next)
).use("*", withDefaultCors()).onError(withOnError()).notFound(withNotFound()).get(
  "/eac/challenge",
  describeRoute({
    tags: ["EAC"],
    summary: "Easy Anti-Cheat challenge",
    description: 'Returns a constant JSON-quoted string (`"AA=="`) as `text/plain`. Anti-cheat is not implemented; this exists so the client\'s EAC handshake succeeds.',
    responses: {
      200: {
        description: "The challenge, JSON-quoted, as text/plain",
        content: { "text/plain": { schema: { type: "string", example: '"AA=="' } } }
      }
    }
  }),
  (c) => c.text(`"AA=="`)
).on(
  ["GET", "POST"],
  "/cachedlogin/forplatformid/:platform/:id",
  describeRoute({
    tags: ["Cached login"],
    summary: "Accounts linked to a platform id",
    description: [
      "Accounts the client may offer on its login screen for this platform identity \u2014",
      "the links this identity has, so an entry here is always redeemable by a",
      "`cached_login` grant (both read the same table). An account linked to several",
      "platforms appears in each of their pickers. An unknown id yields `[]` (not a 404)",
      "and the client falls back to a fresh login or create_account.",
      "EXCEPT the exact identity `1/1` (Oculus, id `1`), which is stubbed for SIDELOADED",
      "APKs: with no Meta SDK they have no real identity to ask about and stall on an",
      "empty picker. It consults nothing and returns one canned, non-redeemable entry",
      "with `requirePassword: true`, sending the build to username/password login.",
      "Older clients GET this; the 20250424.01 build POSTs it with a",
      "`deviceId` / `platformAuth` / `time` form body attesting the platform session.",
      "That body is accepted and ignored \u2014 both methods answer identically from the",
      "path params."
    ].join(" "),
    parameters: [
      {
        name: "platform",
        in: "path",
        required: true,
        description: "PlatformType integer. A non-numeric value matches the id on any platform.",
        schema: { type: "string" }
      },
      {
        name: "id",
        in: "path",
        required: true,
        description: "Platform-native id \u2014 a SteamID64 for Steam, a user id for Meta.",
        schema: { type: "string" }
      }
    ],
    responses: {
      200: json(
        CachedLogin.or(FakeCachedLogin).array(),
        "Matching accounts; `[]` if none. The canned entry for `1/1`."
      )
    }
  }),
  async (c) => {
    const { platform, id } = c.req.param();
    logger.info("cached login lookup", { platform, id });
    const platformInt = Number.parseInt(platform, 10);
    if (platformInt === PlatformType.Oculus && id === SIDELOAD_PLATFORM_ID) {
      return c.json([FAKE_OCULUS_CACHED_LOGIN]);
    }
    const links = Number.isNaN(platformInt) ? await getLinksForPlatformId(c.env.DB, id) : await getLinksForPlatformIdentity(c.env.DB, platformInt, id);
    return c.json(await toCachedLogins(c.env.DB, links));
  }
).post(
  "/cachedlogin/forplatformids",
  describeRoute({
    tags: ["Cached login"],
    summary: "Bulk cached-login lookup (friends resolution)",
    description: [
      "Resolves many platform ids at once. Results are flattened across all ids, so the",
      "response cannot be mapped back to a specific input id \u2014 the client uses each",
      "entry\u2019s own `platformId`. No platform accompanies these ids, so each matches on",
      "any platform. Unknown ids contribute nothing; a body with no `id` yields `[]`."
    ].join(" "),
    requestBody: form(PlatformIdsRequest, "Repeated `id=` form fields"),
    responses: { 200: json(CachedLogin.array(), "Flattened accounts across every id") }
  }),
  async (c) => {
    const body = await c.req.parseBody({ all: true }).catch(() => ({}));
    const raw = body.id;
    const ids = (Array.isArray(raw) ? raw : raw != null ? [raw] : []).map(String);
    const out = [];
    for (const pid of ids) {
      out.push(...await toCachedLogins(c.env.DB, await getLinksForPlatformId(c.env.DB, pid)));
    }
    return c.json(out);
  }
).post(
  "/connect/token",
  describeRoute({
    tags: ["Token"],
    summary: "OAuth token endpoint \u2014 issues a JWT",
    description: [
      "Issues an access token (plus a single-use refresh token) for one of four grants,",
      "selected by `grant_type`. Every grant returns the same body on success.",
      "",
      "**`create_account`** \u2014 mints a new account with an auto-assigned random username",
      "(players do not pick one initially) and places it in the Orientation room. A posted",
      "`password` becomes the login credential. Subject to two independent signup caps,",
      "per verified platform id and per signup IP (`MAX_ACCOUNTS_PER_PLATFORM_ID` /",
      "`MAX_ACCOUNTS_PER_IP`; either disabled by setting it to 0). If it asserts a",
      "`platform`, that platform must be verifiable (Steam or Meta) and its `platform_auth`",
      "must verify.",
      "",
      "**`cached_login`** \u2014 logs into an already-linked account using platform ownership as",
      "the credential; no password. Requires a verifying `platform_auth`, and the posted",
      "`account_id` must be LINKED to exactly the identity it proves. An account with no",
      "link for that identity cannot be cached-logged-into.",
      "",
      "**`refresh_token`** \u2014 redeems a stored single-use refresh token, rotating it. The",
      "platform and platform id come from what was stored at issue time, not the body.",
      "",
      "**`password`** (the fallback for any unrecognised or absent `grant_type`) \u2014",
      "identifies the account by `username` or numeric `account_id` and requires the",
      "matching `password`. An account with no stored hash cannot be logged into at all,",
      "which is what closes id/username-only takeover. When it also posts a `platform_auth`",
      "that verifies, that identity is LINKED to the account \u2014 this is how a player who",
      "signed up on one platform gets a cached login on a second device. The login is",
      "never failed over the link: an unverifiable proof (or one over the per-identity",
      "cap) just leaves the account without a cached login there.",
      "",
      "**Platform identity.** An account can be reached from several platform identities;",
      "the links are the one thing both the picker and `cached_login` consult, and only a",
      "VERIFIED identity is ever linked. Two platforms can be verified. Steam (`0`) posts a",
      "Steam-signed `platform_auth` ticket, checked offline; the SteamID64 it carries",
      "replaces the client-supplied `platform_id`. Meta/Oculus (`1`) posts `platform_auth`",
      'as `{"Nonce":\u2026,"AppId":\u2026}`, which recflare sends to Meta together with the posted',
      "`platform_id` \u2014 validation is what binds the nonce to that user id, so a spoofed id",
      "fails. Meta logins therefore need the app secret (`META_APP_SECRET`) and answer 500",
      "when it is unset. The first identity linked also becomes the account\u2019s primary",
      "(what the account DTO and a refreshed token report); later ones only link.",
      "",
      "The one platform id that is never verified and never linked is `1` on platform `1`",
      "\u2014 what a SIDELOADED Oculus APK reports, having no Meta SDK to ask. Every such",
      "build reports it, so it identifies nobody. A password login that carries it still",
      "succeeds; it simply links nothing, and the player types their password each launch.",
      "",
      "**Roles.** The token embeds a `role` claim from the account, so developer/moderator",
      "powers refresh on every login and every refresh grant. `junior` rides along for an",
      "account flagged `isJunior`, and `screenshare` is on every token \u2014 it is a feature",
      "gate the client reads, not a privilege anyone is granted. A junior also carries",
      "the `rn.privilege` CLAIM (`BanVChat`, `BanRmChat`) \u2014 scope-shaped name, but the",
      "client reads it as a claim beside `role`, and it is absent for everyone else.",
      "",
      "**Bans.** A BANNED account still gets a token \u2014 every grant, including a refresh.",
      "A ban is a `report` row with `banned` set (the `api` worker owns that table); it",
      "lifts on its own when `ban_expires` passes, and never if that is null. The token",
      "is what lets the client reach `api`\u2019s `/api/PlayerReporting/v1/moderationBlockDetails`",
      "and show the player the block screen that explains the ban; the ban itself is",
      "enforced by `match`, which refuses every matchmake for a banned player, so a token",
      "gets them as far as that screen and no further.",
      "",
      "What IS refused here (`invalid_grant`) is ban EVASION: an account that shares a",
      "PROVEN platform identity (a `platform_account` link) or an IP (`signupIp`/",
      "`lastLoginIp`, or the address this request came from) with a banned one, and a",
      "`create_account` carrying either, which is refused BEFORE it mints anything. Such",
      "an account has no ban of its own for the block screen to describe, so there is",
      "nothing to let it in for. Those two arms are the operator\u2019s `BAN_EVASION_MATCH`",
      "knob (`ip`, `platform`, or `off`). The description is deliberately vague \u2014 the",
      "account refused may belong to a housemate of the banned player rather than to them."
    ].join("\n"),
    requestBody: form(
      TokenRequest,
      "Union of all grants; see the description for per-grant requirements"
    ),
    responses: {
      200: json(TokenResponse, "Access token, refresh token and granted scopes"),
      400: json(
        OAuthError,
        [
          "Unusable grant: bad credentials, an unverifiable platform or platform_auth, an",
          "invalid/expired refresh token, a missing account identifier, a signup cap reached,",
          "or an account sharing a banned one\u2019s device or network"
        ].join(" ")
      ),
      500: json(
        OAuthError,
        [
          "The server is missing a secret it cannot proceed without: JWT_SECRET (a token is",
          "refused rather than signed with an empty key) or, on a Meta login, META_APP_SECRET",
          "(no nonce can be validated without it)."
        ].join(" ")
      )
    }
  }),
  async (c) => {
    const body = await c.req.parseBody().catch(() => ({}));
    const grantType = typeof body.grant_type === "string" ? body.grant_type : "";
    let platformId = typeof body.platform_id === "string" ? body.platform_id : "";
    const platformInt = typeof body.platform === "string" ? Number.parseInt(body.platform, 10) : NaN;
    let platform = Number.isNaN(platformInt) ? PlatformType.Steam : platformInt;
    const deviceId = typeof body.device_id === "string" ? body.device_id : "";
    const deviceClassInt = typeof body.device_class === "string" ? Number.parseInt(body.device_class, 10) : NaN;
    const deviceClass = Number.isNaN(deviceClassInt) ? 0 : deviceClassInt;
    const version = typeof body.ver === "string" && body.ver !== "" ? body.ver : void 0;
    const clientIp = c.req.header("cf-connecting-ip") ?? "";
    const platformAuth = typeof body.platform_auth === "string" ? body.platform_auth : "";
    const platformAsserted = !Number.isNaN(platformInt);
    const gatedOnPlatform = grantType === "cached_login" || grantType === "create_account" && platformAsserted;
    const proof = gatedOnPlatform || platformAsserted && platformAuth !== "" ? await verifyPlatformProof(c.env, platformInt, platformAuth, platformId) : { status: "none" };
    let verifiedPlatformId = null;
    let verifiedPlatform = null;
    if (proof.status === "verified") {
      verifiedPlatform = proof.platform;
      verifiedPlatformId = proof.platformId;
    } else if (proof.status !== "none") {
      logger.info("platform_auth not verified", {
        platform: platformInt,
        platformId,
        grantType,
        status: proof.status,
        reason: proof.status === "rejected" ? proof.reason : void 0
      });
    }
    if (gatedOnPlatform && proof.status !== "verified") {
      if (proof.status === "unsupported") {
        return c.json(
          {
            error: "invalid_grant",
            error_description: "unsupported platform; only Steam and Meta can be verified"
          },
          400
        );
      }
      if (proof.status === "unconfigured") {
        logger.error("refusing a Meta login: META_APP_SECRET is empty");
        return c.json(
          {
            error: "server_error",
            error_description: "Meta platform verification is not configured"
          },
          500
        );
      }
      return c.json(
        { error: "invalid_grant", error_description: "invalid or missing platform_auth" },
        400
      );
    }
    if (verifiedPlatformId !== null) platformId = verifiedPlatformId;
    let accountId;
    if (grantType === "create_account") {
      const blocked = await resolveBan(c.env.DB, null, {
        identity: {
          ip: clientIp,
          platform: verifiedPlatform,
          platformId: verifiedPlatformId
        },
        arms: banEvasionMatch(c.env.BAN_EVASION_MATCH)
      });
      if (blocked) {
        logger.info("signup refused: player banned", {
          via: blocked.via,
          bannedAccountId: blocked.bannedAccountId,
          ip: clientIp,
          platformId: verifiedPlatformId
        });
        return c.json({ error: "invalid_grant", error_description: BLOCKED_DESCRIPTION }, 400);
      }
      const maxPerPlatformId = intVar(
        c.env.MAX_ACCOUNTS_PER_PLATFORM_ID,
        DEFAULT_MAX_ACCOUNTS_PER_PLATFORM_ID
      );
      const maxPerIp = intVar(c.env.MAX_ACCOUNTS_PER_IP, DEFAULT_MAX_ACCOUNTS_PER_IP);
      if (maxPerPlatformId > 0 && verifiedPlatformId !== null && await countAccountsForPlatformIdentity(
        c.env.DB,
        verifiedPlatform ?? 0,
        verifiedPlatformId
      ) >= maxPerPlatformId) {
        logger.info("signup rejected: platform account limit", {
          platformId: verifiedPlatformId
        });
        return c.json(
          {
            error: "invalid_grant",
            error_description: "account limit reached for this platform account"
          },
          400
        );
      }
      if (maxPerIp > 0 && clientIp !== "" && await countAccountsBySignupIp(c.env.DB, clientIp) >= maxPerIp) {
        logger.info("signup rejected: per-IP account limit", { ip: clientIp });
        return c.json(
          {
            error: "invalid_grant",
            error_description: "too many accounts created from this network"
          },
          400
        );
      }
      const account = await createAccount(c.env.DB, {
        platforms: platformInt || 0,
        platform: verifiedPlatform ?? void 0,
        platformId: verifiedPlatformId ?? void 0,
        lastLoginTime: (/* @__PURE__ */ new Date()).toISOString(),
        deviceId: deviceId || void 0,
        deviceClass: deviceId ? deviceClass : void 0,
        signupIp: clientIp || void 0,
        lastLoginIp: clientIp || void 0
      });
      accountId = String(account.accountId);
      if (verifiedPlatformId !== null) {
        await linkPlatformIdentity(
          c.env.DB,
          account.accountId,
          verifiedPlatform ?? 0,
          verifiedPlatformId
        );
      }
      const password = typeof body.password === "string" ? body.password : "";
      if (password !== "") {
        await setPasswordHash(c.env.DB, account.accountId, await hashPassword(password));
      }
      await placeNewPlayerInOrientation(c.env, account.accountId, deviceClass);
    } else if (grantType === "refresh_token") {
      const presented = typeof body.refresh_token === "string" ? body.refresh_token : "";
      const refreshed = presented ? await consumeRefreshToken(c.env.DB, presented) : null;
      if (!refreshed) {
        return c.json(
          { error: "invalid_grant", error_description: "refresh_token is invalid or expired" },
          400
        );
      }
      accountId = String(refreshed);
    } else if (grantType === "cached_login") {
      const postedId = typeof body.account_id === "string" ? body.account_id.trim() : "";
      const account = /^\d+$/.test(postedId) ? await getAccount(c.env.DB, Number(postedId)) : null;
      const linked = account !== null && await isPlatformIdentityLinked(c.env.DB, account.accountId, platformInt, platformId);
      if (!account || !linked) {
        return c.json(
          {
            error: "invalid_grant",
            error_description: "no linked account for this platform identity"
          },
          400
        );
      }
      accountId = String(account.accountId);
      await setLastLoginTime(c.env.DB, account.accountId, (/* @__PURE__ */ new Date()).toISOString());
      await setLoginContext(c.env.DB, account.accountId, { deviceId, deviceClass, ip: clientIp });
    } else {
      const postedId = typeof body.account_id === "string" ? body.account_id.trim() : "";
      const postedUsername = typeof body.username === "string" ? body.username.trim() : "";
      let resolvedId = null;
      if (/^\d+$/.test(postedId)) {
        resolvedId = Number(postedId);
      } else if (postedUsername !== "") {
        resolvedId = (await getAccountByUsername(c.env.DB, postedUsername))?.accountId ?? null;
      }
      if (resolvedId === null) {
        return c.json(
          { error: "invalid_request", error_description: "account_id or username is required" },
          400
        );
      }
      const storedHash = await getPasswordHash(c.env.DB, resolvedId);
      const password = typeof body.password === "string" ? body.password : "";
      if (!storedHash || !await verifyPassword(password, storedHash)) {
        return c.json(
          { error: "invalid_grant", error_description: "invalid account_id or password" },
          400
        );
      }
      accountId = String(resolvedId);
      if (verifiedPlatformId !== null) {
        await linkLoginIdentity(
          c.env.DB,
          resolvedId,
          verifiedPlatform ?? 0,
          verifiedPlatformId,
          intVar(c.env.MAX_ACCOUNTS_PER_PLATFORM_ID, DEFAULT_MAX_ACCOUNTS_PER_PLATFORM_ID)
        );
      }
      await setLastLoginTime(c.env.DB, resolvedId, (/* @__PURE__ */ new Date()).toISOString());
      await setLoginContext(c.env.DB, resolvedId, { deviceId, deviceClass, ip: clientIp });
    }
    const ban = await resolveBan(c.env.DB, Number(accountId), {
      identity: { ip: clientIp, platform: verifiedPlatform, platformId: verifiedPlatformId },
      arms: banEvasionMatch(c.env.BAN_EVASION_MATCH)
    });
    if (ban && ban.via !== "account") {
      logger.info("token refused: ban evasion", {
        accountId,
        grantType,
        via: ban.via,
        bannedAccountId: ban.bannedAccountId,
        reportId: ban.ban.id,
        banExpires: ban.ban.ban_expires
      });
      return c.json({ error: "invalid_grant", error_description: BLOCKED_DESCRIPTION }, 400);
    }
    if (ban) {
      logger.info("token issued to banned account", {
        accountId,
        grantType,
        reportId: ban.ban.id,
        banExpires: ban.ban.ban_expires
      });
    }
    const jwtSecret = await c.env.JWT_SECRET.get();
    if (jwtSecret === "") {
      logger.error("refusing to issue token: JWT_SECRET is empty");
      return c.json(
        { error: "server_error", error_description: "token signing is not configured" },
        500
      );
    }
    const roleAccount = await getAccount(c.env.DB, Number(accountId));
    if (grantType === "refresh_token" && roleAccount) {
      platform = accountPlatform(roleAccount);
      platformId = roleAccount.platformId ?? "";
    }
    const accessToken = await generateToken(
      accountId,
      platformId,
      platform,
      jwtSecret,
      accountRoles(roleAccount),
      accountPrivileges(roleAccount),
      version,
      // Rec Room Plus, off the same account read as the roles above — `econ` decides the
      // CampusCard and the subscriber discount from this claim alone, so it never has to
      // load the account. It therefore refreshes on every login and every refresh_token
      // grant, and only then: a player who claims Plus on the website keeps a token that
      // says otherwise until they sign in again.
      roleAccount?.hasPlus === true
    );
    const refreshToken = await issueRefreshToken(c.env.DB, Number(accountId));
    return c.json({
      access_token: accessToken,
      expires_in: TOKEN_TTL_SECONDS,
      token_type: "Bearer",
      refresh_token: refreshToken,
      scope: TOKEN_SCOPE,
      // @kludge Why is this necessary? Who knows.
      key: "8oQ+e+WQaOBPbEcakhqs3dwZZdOmmyDUmJSD9u4AHMY="
    });
  }
).post(
  "/account/me/changepassword",
  describeRoute({
    tags: ["Account"],
    summary: "Change the caller's password",
    description: [
      "Stores a PBKDF2 hash on the account row; the raw password is never persisted.",
      "When the account already has a password, `oldPassword` must match. The first time",
      "a password is set, `oldPassword` is empty \u2014 which is what the client sends."
    ].join(" "),
    security: [{ bearerAuth: [] }],
    requestBody: form(ChangePasswordRequest, "New password, plus the old one when one is set"),
    responses: {
      200: json(ChangePasswordResponse, "Password changed"),
      400: json(ChangePasswordResponse, "`newPassword` was empty, or `oldPassword` was wrong"),
      401: { description: "Missing or invalid bearer token (empty body)" },
      404: { description: "The account no longer exists (empty body)" }
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return c.body(null, 401);
    const body = await c.req.parseBody().catch(() => ({}));
    const oldPassword = typeof body.oldPassword === "string" ? body.oldPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    if (newPassword === "") {
      return c.json({ success: false, error: "You must enter a new password." }, 400);
    }
    const currentHash = await getPasswordHash(c.env.DB, id);
    if (currentHash && !await verifyPassword(oldPassword, currentHash)) {
      return c.json({ success: false, error: "Your old password is incorrect." }, 400);
    }
    const ok = await setPasswordHash(c.env.DB, id, await hashPassword(newPassword));
    if (!ok) return c.body(null, 404);
    return c.json({ success: true });
  }
).get(
  "/privileges/me/restrictions",
  describeRoute({
    tags: ["Account"],
    summary: "The caller\u2019s moderation restrictions",
    description: [
      "The restrictions in force on the caller\u2019s account (a chat mute, say), as a bare array.",
      "Always EMPTY here \u2014 nothing on this server issues restrictions \u2014 and an empty array is",
      "the normal unrestricted answer, not null. The client refills its list from this and",
      "acts on a record being present and its `EndDate`; the `Name`/`Description`/",
      "`DisplayReason` strings are display text it matches nothing against."
    ].join(" "),
    security: [{ bearerAuth: [] }],
    responses: {
      200: json(RestrictionDto.array(), "The caller\u2019s restrictions \u2014 always empty"),
      401: { description: "Missing or invalid bearer token (empty body)" }
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return c.body(null, 401);
    return c.json([]);
  }
).get("/role/developer/:id", describeRoute(roleLookup("developer")), async (c) => {
  const { id } = c.req.param();
  logger.info("developer role lookup", { id });
  const accountId = Number.parseInt(id, 10);
  const account = Number.isNaN(accountId) ? null : await getAccount(c.env.DB, accountId);
  if (!account) return c.body(null, 404);
  return c.json(account.isDeveloper === true);
}).get("/role/moderator/:id", describeRoute(roleLookup("moderator")), async (c) => {
  const { id } = c.req.param();
  logger.info("moderator role lookup", { id });
  const accountId = Number.parseInt(id, 10);
  const account = Number.isNaN(accountId) ? null : await getAccount(c.env.DB, accountId);
  if (!account) return c.body(null, 404);
  return c.json(account.isModerator === true);
}).get(
  "/oculus/nonce",
  describeRoute({
    tags: ["Account"],
    summary: "A fresh nonce for the Oculus login flow",
    description: [
      "Mints a random 64-char hex nonce and returns it as a bare JSON string. Not stored",
      "and not verified later \u2014 a best guess at the shape the client wants."
    ].join(" "),
    responses: { 200: json(z.string(), "The nonce") }
  }),
  (c) => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    logger.info("oculus nonce issued");
    return c.json(nonce);
  }
);
app.get(
  "/openapi.json",
  describeRoute({ hide: true }),
  withCleanSpec(
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "recflare auth",
          version: "1.0.0",
          description: [
            "Authentication and token issuance for recflare, a private-server reimplementation",
            "of the Rec Room backend."
          ].join("\n")
        },
        servers: [{ url: "https://auth.recflare.net", description: "Production" }],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
              description: "An `access_token` from `POST /connect/token`."
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
