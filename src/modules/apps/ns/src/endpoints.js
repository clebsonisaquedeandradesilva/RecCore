// Ported from apps/ns/src/endpoints.ts; TypeScript types erased; native runtime imports.
const SERVICE_SUBDOMAINS = {
  Accounts: "accounts",
  AI: "ai",
  API: "api",
  Auth: "auth",
  BugReporting: "bugreporting",
  Cards: "cards",
  CDN: "cdn",
  Chat: "chat",
  Clubs: "clubs",
  CMS: "cms",
  Commerce: "commerce",
  Data: "data",
  DataCollection: "datacollection",
  Discovery: "discovery",
  Econ: "econ",
  GameLogs: "gamelogs",
  Geo: "geo",
  Images: "img",
  Leaderboard: "leaderboard",
  Link: "link",
  Lists: "lists",
  Matchmaking: "match",
  Moderation: "moderation",
  Notifications: "notify",
  PlatformNotifications: "platformnotifications",
  PlayerSettings: "playersettings",
  RoomComments: "roomcomments",
  RoomieIntegrations: "roomieintegrations",
  Rooms: "rooms",
  Storage: "storage",
  Strings: "strings",
  StringsCDN: "strings-cdn",
  Studio: "studio",
  Thorn: "thorn",
  Videos: "videos",
  WWW: "www"
};
function parseOverrides(subdomains) {
  if (!subdomains) return {};
  let parsed;
  try {
    parsed = JSON.parse(subdomains);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry) => typeof entry[1] === "string" && entry[1] !== ""
    )
  );
}
function buildEndpoints(domain, subdomains) {
  const overrides = parseOverrides(subdomains);
  if (process.env.ROUTING_MODE !== "subdomain" && process.env.PUBLIC_BASE_URL) {
    const base = process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
    return Object.fromEntries(Object.entries(SERVICE_SUBDOMAINS).map(([label, sub]) => [label, `${base}/${overrides[sub] ?? sub}`]));
  }
  return Object.fromEntries(
    Object.entries(SERVICE_SUBDOMAINS).map(([label, sub]) => [
      label,
      `https://${overrides[sub] ?? sub}.${domain}`
    ])
  );
}
export {
  buildEndpoints
};
