// Ported from apps/www/src/discord.ts; TypeScript types erased; native runtime imports.
import { logger } from "../../../packages/hono-helpers/src/index.js";
const API_BASE = "https://discord.com/api/v10";
const AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const SCOPES = "identify guilds.members.read";
const parseRoleIds = (raw) => raw.split(/[\s,]+/).map((id) => id.trim()).filter((id) => id !== "");
async function discordConfig(env) {
  const [clientId, clientSecret] = await Promise.all([
    readSecret(env.DISCORD_CLIENT_ID, "DISCORD_CLIENT_ID"),
    readSecret(env.DISCORD_CLIENT_SECRET, "DISCORD_CLIENT_SECRET")
  ]);
  const guildId = env.DISCORD_GUILD_ID ?? "";
  const roleIds = parseRoleIds(env.DISCORD_BENEFITS_ROLE_IDS ?? "");
  if (clientId !== "" && clientSecret !== "" && guildId !== "" && roleIds.length > 0) {
    return { clientId, clientSecret, guildId, roleIds };
  }
  if (clientId !== "" || clientSecret !== "" || guildId !== "" || roleIds.length > 0) {
    logger.error("discord is half-configured, so benefit claims are closed", {
      hasClientId: clientId !== "",
      hasClientSecret: clientSecret !== "",
      hasGuildId: guildId !== "",
      // The COUNT, not the ids: a value that parsed to nothing (say, a stray comma) is
      // indistinguishable from an unset one without it.
      roleIdCount: roleIds.length
    });
  }
  return null;
}
async function readSecret(secret, name) {
  try {
    return await secret.get() ?? "";
  } catch (err) {
    logger.error("failed to read a discord credential from the secrets store", {
      secret: name,
      error: String(err)
    });
    return "";
  }
}
const redirectUri = (request) => new URL(process.env.ROUTING_MODE === "subdomain" ? "/claim" : "/www/claim", request.url).toString();
async function exchangeCode(config, code, redirect) {
  try {
    const res = await fetch(`${API_BASE}/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirect
      }).toString()
    });
    if (!res.ok) {
      logger.info("discord refused a code exchange", {
        status: res.status,
        body: await res.text().catch(() => "")
      });
      return null;
    }
    const token = await res.json();
    return typeof token.access_token === "string" ? token.access_token : null;
  } catch (err) {
    logger.error("could not reach discord to exchange a code", { error: String(err) });
    return null;
  }
}
const qualifies = (memberRoles, roleIds) => memberRoles.some((role) => roleIds.includes(role));
async function fetchGuildMembership(accessToken, guildId) {
  try {
    const res = await fetch(`${API_BASE}/users/@me/guilds/${guildId}/member`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      logger.info("discord did not return a guild membership", { status: res.status });
      return null;
    }
    const member = await res.json();
    const userId = typeof member.user?.id === "string" ? member.user.id : "";
    if (userId === "") {
      logger.error("discord returned a guild member with no user id");
      return null;
    }
    return {
      userId,
      username: typeof member.user?.username === "string" ? member.user.username : "",
      roles: Array.isArray(member.roles) ? member.roles.filter((r) => typeof r === "string") : []
    };
  } catch (err) {
    logger.error("could not reach discord to read a guild membership", { error: String(err) });
    return null;
  }
}
async function revokeToken(config, accessToken) {
  try {
    await fetch(`${API_BASE}/oauth2/token/revoke`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        token: accessToken,
        token_type_hint: "access_token"
      }).toString()
    });
  } catch (err) {
    logger.info("could not revoke a discord access token", { error: String(err) });
  }
}
export {
  AUTHORIZE_URL,
  SCOPES,
  discordConfig,
  exchangeCode,
  fetchGuildMembership,
  parseRoleIds,
  qualifies,
  redirectUri,
  revokeToken
};
