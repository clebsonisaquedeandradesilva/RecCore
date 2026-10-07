// Ported from apps/www/src/www.app.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../runtime/router.js";
import { useWorkersLogger } from "../../../../runtime/logger.js";
import { getAccount, updateAccount } from "../../../packages/domain/src/accounts-db.js";
import { PlatformType } from "../../../packages/domain/src/enums.js";
import { countOnlinePlayers } from "../../../packages/domain/src/presence-db.js";
import { logger, withDefaultCors, withOnError } from "../../../packages/hono-helpers/src/index.js";
import { validateAndGetAccountId } from "../../../packages/jwt/src/index.js";
import {
  countAccountsForPlatformIdentity,
  getLinksForAccount,
  isPlatformIdentityLinked,
  linkPlatformIdentity
} from "../../auth/src/platform-db.js";
import { authUnreachable } from "./auth-messages.js";
import {
  AUTHORIZE_URL,
  discordConfig,
  exchangeCode,
  fetchGuildMembership,
  qualifies,
  redirectUri,
  revokeToken,
  SCOPES
} from "./discord.js";
import { docsPage, fetchSpec } from "./docs.js";
import { privacyPage } from "./privacy.js";
import { turnstileKeys, verifyTurnstile } from "./turnstile.js";
import {
  accountsBase,
  apiBase,
  authBase,
  cdnBase,
  imgBase,
  notifyBase,
  postAuthForm,
  readAuthError,
  roomsBase,
  storageBase
} from "./upstream.js";
const claimant = async (c) => validateAndGetAccountId(c.req.raw, await c.env.JWT_SECRET.get());
function authorizeUrl(request, clientId) {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: SCOPES,
    redirect_uri: redirectUri(request),
    // Skip Discord's "you've already authorized this app, continue?" interstitial on a
    // repeat claim; the player has already pressed a button that says what this does.
    prompt: "none"
  }).toString();
  return url.toString();
}
const app = new Hono().use(
  "*",
  // middleware
  (c, next) => useWorkersLogger(c.env.NAME, {
    environment: c.env.ENVIRONMENT,
    release: c.env.SENTRY_RELEASE
  })(c, next)
).onError(withOnError()).get("/api/config", async (c) => {
  const [keys, discord] = await Promise.all([turnstileKeys(c.env), discordConfig(c.env)]);
  return c.json({
    signupEnabled: keys !== null,
    turnstileSiteKey: keys?.siteKey ?? null,
    // The benefits claim, on the same terms: open only when it's fully configured, and
    // the SPA is handed a ready-made consent URL rather than the parts to build one.
    // Nothing secret is served — the client id inside it is public — and the guild/role
    // ids never leave the worker, since it's the worker that asks Discord the question.
    benefitsEnabled: discord !== null,
    discordAuthorizeUrl: discord ? authorizeUrl(c.req.raw, discord.clientId) : null,
    hosts: {
      auth: authBase(c.env),
      accounts: accountsBase(c.env),
      api: apiBase(c.env),
      img: imgBase(c.env),
      notify: notifyBase(c.env),
      rooms: roomsBase(c.env),
      cdn: cdnBase(c.env),
      storage: storageBase(c.env)
    }
  });
}).get("/server-status", withDefaultCors(), async (c) => {
  return c.json({
    status: "online",
    // One presence row per account, expired rows excluded — see countOnlinePlayers.
    // Players sitting in the lobby count as online, same as anywhere else we read
    // presence.
    players: await countOnlinePlayers(c.env.DB)
  });
}).post("/api/signup", async (c) => {
  const keys = await turnstileKeys(c.env);
  if (!keys) return c.json({ error: "Account creation is currently disabled." }, 403);
  const { password, turnstileToken } = await c.req.json().catch(() => ({}));
  if (!password) return c.json({ error: "A password is required." }, 400);
  if (!turnstileToken) return c.json({ error: "Please complete the bot check." }, 400);
  const clientIp = c.req.header("cf-connecting-ip");
  const verified = await verifyTurnstile(keys.secretKey, turnstileToken, clientIp);
  if (!verified) return c.json({ error: "Bot check failed. Please try again." }, 403);
  const res = await postAuthForm(
    c.env,
    "/connect/token",
    { grant_type: "create_account", password },
    { clientIp }
  ).catch(() => null);
  if (res === null) {
    logger.error("could not reach auth to create an account");
    return c.json({ error: authUnreachable("signup") }, 502);
  }
  if (!res.ok) {
    const failure = await readAuthError(res, "signup");
    logger.info("auth refused a signup", { status: res.status, upstream: failure.upstream });
    return c.json({ error: failure.message }, failure.status);
  }
  const token = await res.json().catch(() => null);
  if (!token?.access_token) {
    logger.error("auth answered a signup with no access_token");
    return c.json({ error: authUnreachable("signup") }, 502);
  }
  return c.json(token);
}).get("/api/benefits/status", async (c) => {
  const accountId = await claimant(c);
  if (accountId === null) return c.body(null, 401);
  const [account, links] = await Promise.all([
    getAccount(c.env.DB, accountId),
    getLinksForAccount(c.env.DB, accountId)
  ]);
  return c.json({
    hasPlus: account?.hasPlus ?? false,
    // Whether this account is already tied to a Discord identity — not WHICH one. The
    // player knows their own Discord; the id is of no use to the page and every reason
    // to keep an account's linked identities off the wire.
    linked: links.some((link) => link.platform === PlatformType.Discord)
  });
}).post("/api/benefits/claim", async (c) => {
  const config = await discordConfig(c.env);
  if (!config) return c.json({ error: "Benefit claims are currently disabled." }, 403);
  const accountId = await claimant(c);
  if (accountId === null) {
    return c.json({ error: "Please sign in before claiming your benefits." }, 401);
  }
  const { code } = await c.req.json().catch(() => ({}));
  if (!code) return c.json({ error: "No Discord authorization code was provided." }, 400);
  const accessToken = await exchangeCode(config, code, redirectUri(c.req.raw));
  if (accessToken === null) {
    return c.json(
      { error: "That Discord sign-in could not be completed. Please try again." },
      400
    );
  }
  const membership = await fetchGuildMembership(accessToken, config.guildId);
  await revokeToken(config, accessToken);
  if (membership === null) {
    return c.json({ error: "You are not a member of our Discord server." }, 403);
  }
  if (!qualifies(membership.roles, config.roleIds)) {
    return c.json({ error: "Your Discord account does not have a qualifying role." }, 403);
  }
  const alreadyMine = await isPlatformIdentityLinked(
    c.env.DB,
    accountId,
    PlatformType.Discord,
    membership.userId
  );
  if (!alreadyMine) {
    const claimedElsewhere = await countAccountsForPlatformIdentity(
      c.env.DB,
      PlatformType.Discord,
      membership.userId
    );
    if (claimedElsewhere > 0) {
      logger.info("a discord account tried to claim benefits on a second account", {
        accountId
      });
      return c.json(
        { error: "That Discord account has already claimed benefits on another account." },
        409
      );
    }
  }
  await linkPlatformIdentity(c.env.DB, accountId, PlatformType.Discord, membership.userId);
  await updateAccount(c.env.DB, accountId, { hasPlus: true });
  logger.info("granted plus from a discord benefits claim", { accountId });
  return c.json({ hasPlus: true, discordUsername: membership.username });
}).get("/privacy", (c) => c.html(privacyPage())).get("/docs", (c) => c.html(docsPage())).get("/docs/openapi/:service", async (c) => {
  const slug = c.req.param("service").replace(/\.json$/, "");
  const spec = await fetchSpec(c.env, slug);
  if (spec === null) return c.notFound();
  return spec;
}).all("*", (c) => {
  if (!c.env.ASSETS) return c.notFound();
  return c.env.ASSETS.fetch(c.req.raw);
});
var stdin_default = app;
export {
  stdin_default as default
};
