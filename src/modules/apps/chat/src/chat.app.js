// Ported from apps/chat/src/chat.app.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../runtime/router.js";
import { describeRoute, openAPIRouteHandler } from "../../../../runtime/openapi.js";
import { useWorkersLogger } from "../../../../runtime/logger.js";
import { logger, withCleanSpec, withNotFound, withOnError } from "../../../packages/hono-helpers/src/index.js";
import { validateAndGetAccountId } from "../../../packages/jwt/src/index.js";
import { censorSwears } from "../../api/src/sanitize.js";
import { NotificationType } from "../../notify/src/notification-types.js";
import { getThreadMessages } from "./message-db.js";
import {
  AUTHED,
  ChatMessageDto,
  ChatPrivacySettingRequest,
  ChatPrivacySettings,
  ChatResult,
  ChatThreadDto,
  ChatThreadWithMessagesDto,
  CreatePartyChatResponse,
  CreateThreadRequest,
  CreateThreadResponse,
  FavoriteThreadRequest,
  form,
  json,
  messageCountParam,
  NOT_A_MEMBER_RESPONSE,
  PartyChatThread,
  PartyInviteSettings,
  RenameThreadRequest,
  SendMessageRequest,
  SendMessageResponse,
  ServiceStatus,
  SnoozeThreadRequest,
  THREAD_ID_PARAM,
  UNAUTHORIZED_RESPONSE,
  WithMembersRequest
} from "./openapi.js";
import {
  addThreadMember,
  ChatThreadType,
  createThread,
  getOrCreateThreadWithMembers,
  getThreadForPlayer,
  getThreadMemberIds,
  getPartyThreadForPlayer,
  getThreadMeta,
  getThreadsForPlayer,
  isThreadMember,
  joinedChatContents,
  leftChatContents,
  markThreadRead,
  postMessage,
  removeThreadMember,
  setThreadFavorited,
  setThreadName,
  setThreadSnoozed,
  SYSTEM_SENDER_ID
} from "./thread-db.js";
async function authedId(c) {
  return validateAndGetAccountId(c.req.raw, await c.env.JWT_SECRET.get());
}
const DEFAULT_MESSAGE_COUNT = 16;
const MAX_MESSAGE_COUNT = 100;
const DEFAULT_THREAD_MESSAGE_COUNT = 50;
function messageCount(c, fallback = DEFAULT_MESSAGE_COUNT) {
  const raw = Number.parseInt(c.req.query("MessageCount") ?? c.req.query("messageCount") ?? "", 10);
  if (Number.isNaN(raw) || raw <= 0) return fallback;
  return Math.min(raw, MAX_MESSAGE_COUNT);
}
async function formMessageCount(c, fallback) {
  const raw = Number.parseInt(await formField(c, "messageCount") ?? "", 10);
  if (Number.isNaN(raw) || raw <= 0) return messageCount(c, fallback);
  return Math.min(raw, MAX_MESSAGE_COUNT);
}
const CHAT_SUCCESS = 0;
const CHAT_INVALID_ARGUMENTS = 1;
const CHAT_MEMBERSHIP_NOT_FOUND = 3;
const CHAT_PLAYER_ALREADY_ON_THREAD = 4;
const PARTY_INVITE_LIFETIME_MINUTES = 60;
function isPartyJoinable(createdAt, now = Date.now()) {
  const opened = Date.parse(createdAt);
  if (Number.isNaN(opened)) return false;
  return now - opened <= PARTY_INVITE_LIFETIME_MINUTES * 6e4;
}
const ChatPrivacy = {
  Friends: 0,
  Favorites: 1,
  NoOne: 2
};
const CHAT_PRIVACY_NAMES = ["Friends", "Favorites", "NoOne"];
const DM_PRIVACY_KEY = "directMessagePrivacySetting";
const GROUP_PRIVACY_KEY = "groupChatPrivacySetting";
const LATEST_PARTY_CHAT_KEY = "LatestPartyChat";
function parseChatPrivacy(value) {
  const raw = (value ?? "").trim();
  if (raw === "") return void 0;
  const byName = CHAT_PRIVACY_NAMES.findIndex((n) => n.toLowerCase() === raw.toLowerCase());
  if (byName !== -1) return byName;
  const ordinal = Number.parseInt(raw, 10);
  return ordinal >= 0 && ordinal < CHAT_PRIVACY_NAMES.length ? ordinal : void 0;
}
async function getPlayerSettings(env, accountId) {
  return env.RECFLARE_PLAYER_SETTINGS.get(
    `player:${accountId}`,
    "json"
  ).catch(() => null);
}
async function readChatPrivacy(env, accountId) {
  const stored = await getPlayerSettings(env, accountId) ?? {};
  return {
    directMessagePrivacySetting: parseChatPrivacy(stored[DM_PRIVACY_KEY]) ?? ChatPrivacy.Friends,
    groupChatPrivacySetting: parseChatPrivacy(stored[GROUP_PRIVACY_KEY]) ?? ChatPrivacy.Friends
  };
}
async function writeChatPrivacy(env, accountId, settings) {
  const patch = {};
  for (const [key, value] of Object.entries(settings)) {
    if (value !== void 0) patch[key] = CHAT_PRIVACY_NAMES[value];
  }
  await mergePlayerSettings(env, accountId, patch);
}
async function mergePlayerSettings(env, accountId, patch) {
  const merged = { ...await getPlayerSettings(env, accountId), ...patch };
  await env.RECFLARE_PLAYER_SETTINGS.put(`player:${accountId}`, JSON.stringify(merged));
}
async function readLatestPartyChatId(env, accountId) {
  const stored = await getPlayerSettings(env, accountId) ?? {};
  const id = Number.parseInt(String(stored[LATEST_PARTY_CHAT_KEY] ?? ""), 10);
  return Number.isNaN(id) || id <= 0 ? null : id;
}
const HUB_INSTANCE = "global";
async function pushThreadLatestMessage(c, chatThreadId) {
  const [latest] = await getThreadMessages(c.env.DB, chatThreadId, { limit: 1 });
  if (latest === void 0) return;
  await pushChatMessage(c, latest);
}
async function announceJoin(c, chatThreadId, playerId) {
  const notice = await postMessage(c.env.DB, {
    chatThreadId,
    senderPlayerId: SYSTEM_SENDER_ID,
    contents: joinedChatContents(playerId)
  });
  await pushChatMessage(c, notice);
}
async function pushChatMessage(c, message) {
  try {
    const hub = c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE);
    const members = await getThreadMemberIds(c.env.DB, message.chatThreadId);
    await Promise.all(
      members.map(
        (playerId) => hub.notifyPlayer(playerId, NotificationType.ChatMessageReceived, { ...message })
      )
    );
  } catch (err) {
    logger.error("failed to push ChatMessageReceived notification", {
      chatThreadId: message.chatThreadId,
      chatMessageId: message.chatMessageId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
function censorContents(contents) {
  let envelope;
  try {
    envelope = JSON.parse(contents);
  } catch {
    return censorSwears(contents);
  }
  if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) {
    return censorSwears(contents);
  }
  const fields = envelope;
  const data = fields.Data;
  if (typeof data !== "string") return contents;
  const censored = censorSwears(data);
  return censored === data ? contents : JSON.stringify({ ...fields, Data: censored });
}
function toSentChatMessage(message) {
  return {
    ChatMessageId: message.chatMessageId,
    ChatThreadId: message.chatThreadId,
    SenderPlayerId: message.senderPlayerId,
    TimeSent: message.timeSent,
    Contents: message.contents,
    ModerationState: message.moderationState
  };
}
function toPartyChatThread(thread, messages) {
  return {
    ChatThreadId: thread.chatThreadId,
    ChatThreadType: thread.chatThreadType,
    LastReadMessageId: thread.lastReadMessageId,
    Messages: messages.map(toSentChatMessage),
    LatestMessage: thread.latestMessage === null ? null : toSentChatMessage(thread.latestMessage),
    PlayerIds: thread.playerIds,
    // This formatter takes the null; only the camelCase projections have to send ''.
    ChatThreadName: thread.chatThreadName === "" ? null : thread.chatThreadName,
    SnoozedUntil: thread.snoozedUntil,
    IsFavorited: thread.isFavorited,
    // No thread on this table carries a club — club chat lives in the `clubs` worker.
    ClubId: null
  };
}
async function sendToThread(c) {
  const id = await authedId(c);
  if (id === null) return c.body(null, 401);
  const chatThreadId = Number.parseInt(c.req.param("id") ?? "", 10);
  if (!await isThreadMember(c.env.DB, chatThreadId, id)) return c.notFound();
  const contents = (await formField(c, "messageContents"))?.trim();
  const posted = contents === void 0 || contents === "" ? null : await postMessage(c.env.DB, {
    chatThreadId,
    senderPlayerId: id,
    contents: censorContents(contents)
  });
  if (posted !== null) {
    await pushChatMessage(c, posted);
    await markThreadRead(c.env.DB, chatThreadId, id, posted.chatMessageId);
  }
  const thread = await threadWithMessages(c, chatThreadId, id, DEFAULT_THREAD_MESSAGE_COUNT);
  const chatResult = posted === null ? CHAT_INVALID_ARGUMENTS : CHAT_SUCCESS;
  return c.json({
    ChatMessage: posted === null ? null : toSentChatMessage(posted),
    ChatResult: chatResult,
    chatResult,
    chatThread: thread
  });
}
async function markRead(c, chatMessageId) {
  const id = await authedId(c);
  if (id === null) return c.body(null, 401);
  const chatThreadId = Number.parseInt(c.req.param("id") ?? "", 10);
  if (!await isThreadMember(c.env.DB, chatThreadId, id)) return c.notFound();
  await markThreadRead(c.env.DB, chatThreadId, id, chatMessageId);
  return c.json(CHAT_SUCCESS);
}
async function threadWithMessages(c, chatThreadId, playerId, limit) {
  const thread = await getThreadForPlayer(c.env.DB, chatThreadId, playerId);
  if (thread === null) return null;
  const messages = await getThreadMessages(c.env.DB, chatThreadId, { limit });
  const { latestMessage: _latest, ...rest } = thread;
  return { ...rest, messages };
}
const MAX_THREAD_MEMBERS = 50;
const MAX_THREAD_NAME_LENGTH = 128;
const SNOOZED_INDEFINITELY = "9999-12-31T23:59:59Z";
async function memberIds(c) {
  const raw = [...c.req.queries("ids") ?? []];
  const form2 = await c.req.formData().catch(() => null);
  if (form2 !== null) raw.push(...form2.getAll("ids").map(String));
  return raw.map((value) => Number.parseInt(value, 10)).filter((id) => Number.isInteger(id));
}
async function formBool(c, name) {
  const value = (await formField(c, name))?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}
async function formField(c, name) {
  const form2 = await c.req.formData().catch(() => null);
  const value = form2?.get(name);
  return typeof value === "string" ? value : c.req.query(name);
}
function chatResultRoute(summary, description, extra = {}) {
  return describeRoute({
    tags: ["Chat"],
    summary,
    description,
    security: AUTHED,
    parameters: [THREAD_ID_PARAM, ...extra.parameters ?? []],
    ...extra.requestBody === void 0 ? {} : { requestBody: extra.requestBody },
    responses: {
      200: json(
        ChatResult,
        extra.successDescription ?? "The ChatResult (0 on success, 3 when the caller isn\u2019t on the thread)"
      ),
      401: UNAUTHORIZED_RESPONSE,
      ...extra.notFound === true ? { 404: NOT_A_MEMBER_RESPONSE } : {}
    }
  });
}
function sendToThreadRoute(spelling) {
  return describeRoute({
    tags: ["Messages"],
    summary: `Send a message to an existing thread (${spelling})`,
    description: [
      "Every message after the one that opened the conversation. Answers FOUR keys in two",
      "spellings: `ChatMessage`/`ChatResult`, which is what the client\u2019s own send handler reads",
      "\u2014 it dereferences `ChatMessage` as soon as `ChatResult` is 0, so a success without one",
      "throws inside the client \u2014 plus `chatResult`/`chatThread`, the WHOLE thread with its",
      "messages, which the conversation re-renders from. The two result keys are one value",
      "serialized twice. `ChatMessage.Contents` is the stored envelope verbatim, and it MUST",
      "parse to `{ Type, Version, Data }` with a non-null `Data`: the client parses it into",
      "`MessageJson` in a post-deserialize hook that only logs on failure, then dereferences the",
      "null. The envelope\u2019s",
      "`Data` goes through the same profanity filter `api`\u2019s `POST /api/sanitize/v1` runs, masked",
      "one `*` per character; every other field is stored as sent. Blank or",
      "missing `messageContents` stores nothing and reports invalid-arguments (1), still with",
      "the thread attached, rather than an error status. Sending is reading: the sender\u2019s own",
      "`lastReadMessageId` comes back already at the message just posted. Pushes",
      "ChatMessageReceived to every member, the sender included \u2014 the client doesn\u2019t fold the",
      "HTTP response into its local cache, so without a self-targeted push its own outgoing",
      "message doesn\u2019t appear until the thread is refetched. Note the hub frame\u2019s `Id` is a",
      "STRING: the client dispatches on it and silently drops a numeric one."
    ].join(" "),
    security: AUTHED,
    parameters: [THREAD_ID_PARAM],
    requestBody: form(SendMessageRequest, "The message envelope"),
    responses: {
      200: json(SendMessageResponse, "The ChatResult plus the whole thread with its messages"),
      401: UNAUTHORIZED_RESPONSE,
      404: NOT_A_MEMBER_RESPONSE
    }
  });
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
    summary: "Service liveness",
    description: "A fixed `{ service, status }` body. No auth \u2014 a plain liveness probe.",
    responses: { 200: json(ServiceStatus, 'Always `{ service: "chat", status: "ok" }`') }
  }),
  (c) => c.json({ service: "chat", status: "ok" })
).get(
  "/thread",
  describeRoute({
    tags: ["Threads"],
    summary: "The caller\u2019s thread list",
    description: [
      "Every thread the caller is a member of, newest conversation first \u2014 each carrying its",
      "`latestMessage` and the caller\u2019s own read/snooze/favorite state. `MessageCount` is the",
      "page size (of THREADS, despite the name). Membership scopes the query, so a player",
      "only ever sees their own threads."
    ].join(" "),
    security: AUTHED,
    parameters: [messageCountParam(DEFAULT_MESSAGE_COUNT)],
    responses: {
      200: json(ChatThreadDto.array(), "The caller\u2019s threads, newest first (empty when none)"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return c.body(null, 401);
    return c.json(await getThreadsForPlayer(c.env.DB, id, { limit: messageCount(c) }));
  }
).post(
  "/thread",
  describeRoute({
    tags: ["Threads"],
    summary: "Open a thread with a set of players and post the first message",
    description: [
      "The client\u2019s create-thread-and-post-first-message call, in one. Resolves to the thread",
      "those players already share rather than opening a second one. `messageContents` is the",
      "same envelope a message carries and is stored verbatim, unparsed; the client also sends",
      "it blank right after `/thread/withmembers`, which opens the thread without posting and",
      "reports invalid-arguments. Answers a `{ chatThread, chatResult }` wrapper, not a bare",
      "thread. Pushes ChatMessageReceived to every member (including the sender)."
    ].join(" "),
    security: AUTHED,
    requestBody: form(CreateThreadRequest, "The member ids and the first message"),
    responses: {
      200: json(CreateThreadResponse, "The thread plus the result of the first message"),
      400: {
        description: [
          "Fewer than 2 members (naming only yourself) or more than 50, counting the caller",
          "(empty body)"
        ].join(" ")
      },
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return c.body(null, 401);
    const members = [.../* @__PURE__ */ new Set([id, ...await memberIds(c)])];
    if (members.length < 2 || members.length > MAX_THREAD_MEMBERS) return c.body(null, 400);
    const { chatThreadId, created } = await getOrCreateThreadWithMembers(c.env.DB, members, id);
    if (created) await pushThreadLatestMessage(c, chatThreadId);
    const contents = (await formField(c, "messageContents"))?.trim();
    const posted = contents === void 0 || contents === "" ? null : await postMessage(c.env.DB, {
      chatThreadId,
      senderPlayerId: id,
      contents: censorContents(contents)
    });
    if (posted !== null) {
      await pushChatMessage(c, posted);
      await markThreadRead(c.env.DB, chatThreadId, id, posted.chatMessageId);
    }
    const thread = await getThreadForPlayer(c.env.DB, chatThreadId, id);
    if (thread === null) throw new Error(`thread ${chatThreadId} vanished after creation`);
    return c.json({
      chatThread: thread,
      chatResult: posted === null ? CHAT_INVALID_ARGUMENTS : CHAT_SUCCESS
    });
  }
).get(
  "/settings/partyinvite",
  describeRoute({
    tags: ["Threads"],
    summary: "Party invite settings",
    description: [
      "How long a party invite link stays usable, in minutes, as a bare single-key object \u2014",
      "no envelope. 60 here, the reference\u2019s value. Nothing on this server stores or expires",
      "invite links, so the client is the only thing that acts on it."
    ].join(" "),
    security: AUTHED,
    responses: {
      200: json(PartyInviteSettings, "The invite-link lifetime"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return c.body(null, 401);
    return c.json({ InviteLinkLifetimeInMinutes: PARTY_INVITE_LIFETIME_MINUTES });
  }
).get(
  "/thread/party",
  describeRoute({
    tags: ["Threads"],
    summary: "The caller\u2019s current party thread (GetPartyChat)",
    description: [
      "The party the caller is currently in: the newest party thread they are a member of,",
      "answered from a single query. Failing that, the thread named by their own",
      "`LatestPartyChat` player setting \u2014 which `POST /thread/party` writes for the player",
      "who opened the party and the client writes for a player who joins someone else\u2019s.",
      "",
      "That second path JOINS: a caller who is not on any party yet is ADDED to the thread",
      "their key names and then served it, which is how a player pulled into someone else\u2019s",
      "party enters it \u2014 they hold the key but no membership row, and a membership-only read",
      'answers them "no party". The thread must exist, be a party, and be younger than the',
      "60-minute invite lifetime before anyone is added, so a key naming a DM, a deleted",
      "thread or a stale party answers `{}` and writes nothing. The age gate is on JOINING",
      "only \u2014 a player already on a party is served it however old it is. A join posts a",
      '"Player <@U\u2026> joined" notice and pushes it to the party, so the people already in it',
      "see who arrived.",
      "",
      "The BARE thread, unlike the POST on the same path, which wraps the same projection in",
      "`{ ChatThread, ChatResult }`. `maxCount` and `mode` are accepted and ignored."
    ].join(" "),
    security: AUTHED,
    parameters: [
      {
        name: "maxCount",
        in: "query",
        required: false,
        description: "Page size the client sends (1). Accepted and ignored",
        schema: { type: "integer" }
      },
      {
        name: "mode",
        in: "query",
        required: false,
        description: "Unknown mode selector the client sends (0). Accepted and ignored",
        schema: { type: "integer" }
      }
    ],
    responses: {
      200: json(PartyChatThread, "The caller\u2019s party, or `{}` when they have none"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return c.body(null, 401);
    let thread = await getPartyThreadForPlayer(c.env.DB, id);
    if (thread === null) {
      const chatThreadId = await readLatestPartyChatId(c.env, id);
      if (chatThreadId === null) return c.json({});
      const meta = await getThreadMeta(c.env.DB, chatThreadId);
      if (meta === null || meta.chatThreadType !== ChatThreadType.Party) return c.json({});
      if (!isPartyJoinable(meta.createdAt)) return c.json({});
      await addThreadMember(c.env.DB, chatThreadId, id);
      await announceJoin(c, chatThreadId, id);
      thread = await getThreadForPlayer(c.env.DB, chatThreadId, id);
      if (thread === null) throw new Error(`party thread ${chatThreadId} vanished after join`);
    }
    const messages = await getThreadMessages(c.env.DB, thread.chatThreadId, {
      limit: DEFAULT_THREAD_MESSAGE_COUNT
    });
    return c.json(toPartyChatThread(thread, messages));
  }
).post(
  "/thread/party",
  describeRoute({
    tags: ["Threads"],
    summary: "Open a party thread for the caller (CreatePartyChat)",
    description: [
      "The client\u2019s CreatePartyChat. Opens a thread of type 2 (Party) whose only member is",
      "the caller \u2014 the client fills it by inviting players on afterwards. No query params",
      "and no body. Always a new party, never a fetch-or-create: a party is a session rather",
      "than a standing conversation, so an old one would hand the invitees its history. The",
      "only create that accepts a roster of just the caller, and the only one that opens with",
      "no messages at all \u2014 no \u201Cstarted a chat\u201D notice, matching the observed",
      "`Messages: []`. Records the new thread as the caller\u2019s `LatestPartyChat` player",
      "setting, which is where `GET /thread/party` looks for it. Answers the bare PascalCase",
      "`{ ChatThread, ChatResult }` wrapper, whose thread is a projection of its own \u2014 not the",
      "camelCase shape the other thread routes serve."
    ].join(" "),
    security: AUTHED,
    responses: {
      200: json(CreatePartyChatResponse, "The new party thread, empty, with ChatResult 0"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return c.body(null, 401);
    const chatThreadId = await createThread(c.env.DB, [id], null, void 0, ChatThreadType.Party);
    await mergePlayerSettings(c.env, id, { [LATEST_PARTY_CHAT_KEY]: String(chatThreadId) });
    const thread = await getThreadForPlayer(c.env.DB, chatThreadId, id);
    if (thread === null) throw new Error(`party thread ${chatThreadId} vanished after creation`);
    const messages = await getThreadMessages(c.env.DB, chatThreadId, {
      limit: DEFAULT_THREAD_MESSAGE_COUNT
    });
    return c.json({
      ChatThread: toPartyChatThread(thread, messages),
      ChatResult: CHAT_SUCCESS
    });
  }
).get(
  "/thread/chatPrivacySetting",
  describeRoute({
    tags: ["Threads"],
    summary: "The caller\u2019s chat privacy settings",
    description: [
      "Who may direct-message the caller and who may add them to a group chat, as the",
      "`ChatPrivacy` enum by NUMBER (0 Friends \xB7 1 Favorites \xB7 2 NoOne) \u2014 note the PUT takes",
      "the same enum by NAME. Read from the caller\u2019s `playersettings` map; a player who has",
      "never set them reads `Friends` for both, as does one whose stored value won\u2019t parse.",
      "Stored but not enforced: the DM check allows every message. `playerId` is the caller,",
      "read from the token."
    ].join(" "),
    security: AUTHED,
    responses: {
      200: json(ChatPrivacySettings, "The caller\u2019s stored settings (Friends/Friends by default)"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return c.body(null, 401);
    return c.json({ playerId: id, ...await readChatPrivacy(c.env, id) });
  }
).put(
  "/thread/chatPrivacySetting",
  describeRoute({
    tags: ["Threads"],
    summary: "Set the caller\u2019s chat privacy settings",
    description: [
      "Stores the posted setting(s) in the caller\u2019s `playersettings` map and answers the",
      "resulting settings \u2014 the same body `GET /thread/chatPrivacySetting` serves, with the",
      "enum by NUMBER. The body names the enum by NAME",
      "(`directMessagePrivacySetting=Favorites`); the ordinal is accepted too. The client",
      "sends one field per call, so an absent field leaves that setting as it was, and the",
      "write merges into the settings map so the player\u2019s other settings are untouched. A",
      "body with nothing readable in it is a no-op 200 answering the stored settings, not a",
      "400. Stored, not enforced: nothing checks these when a message is sent."
    ].join(" "),
    security: AUTHED,
    requestBody: form(ChatPrivacySettingRequest, "The setting(s) to store"),
    responses: {
      200: json(ChatPrivacySettings, "The caller\u2019s settings as they now stand"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return c.body(null, 401);
    const posted = {
      [DM_PRIVACY_KEY]: parseChatPrivacy(await formField(c, DM_PRIVACY_KEY)),
      [GROUP_PRIVACY_KEY]: parseChatPrivacy(await formField(c, GROUP_PRIVACY_KEY))
    };
    if (posted[DM_PRIVACY_KEY] !== void 0 || posted[GROUP_PRIVACY_KEY] !== void 0) {
      await writeChatPrivacy(c.env, id, posted);
    }
    return c.json({ playerId: id, ...await readChatPrivacy(c.env, id) });
  }
).get(
  "/thread/checkCanSendDirectMessageWithPrivacySetting",
  describeRoute({
    tags: ["Threads"],
    summary: "May the caller DM this player?",
    description: [
      "Whether the caller may open a direct message with `receivingPlayerId`, as a bare",
      "ChatResult integer \u2014 0 (Success) means allowed; a real refusal would be 15 (the",
      "caller\u2019s own privacy setting) or 16 (the other player\u2019s). Always 0 here: the settings",
      "`/thread/chatPrivacySetting` stores are not enforced, since Friends and Favorites both",
      "need a friends list this server doesn\u2019t keep.",
      "`receivingPlayerId` is accepted and ignored; the answer is the same for every player,",
      "and the client asks again for the next one."
    ].join(" "),
    security: AUTHED,
    parameters: [
      {
        name: "receivingPlayerId",
        in: "query",
        required: false,
        description: "The player the caller wants to message. Accepted and ignored.",
        schema: { type: "integer" }
      }
    ],
    responses: {
      200: json(ChatResult, "Always 0 (Success) \u2014 the DM is allowed"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return c.body(null, 401);
    return c.json(CHAT_SUCCESS);
  }
).post(
  "/thread/withmembers",
  describeRoute({
    tags: ["Threads"],
    summary: "Fetch or open the thread with exactly these members",
    description: [
      "The client\u2019s GetChatBetweenPlayers. Fetch-or-create: the thread whose membership is",
      "exactly `ids` plus the caller, opened only if they don\u2019t already share one (returning a",
      "fresh empty thread each call would bury the real conversation). Answers the thread with",
      "a `messages` array \u2014 what `messageCount` sizes \u2014 rather than the list\u2019s single",
      "`latestMessage`, so the client can open straight into the conversation. The array is",
      "always present, empty for a brand-new thread."
    ].join(" "),
    security: AUTHED,
    requestBody: form(WithMembersRequest, "The member ids and the page size"),
    responses: {
      200: json(ChatThreadWithMessagesDto, "The thread with a page of its messages"),
      400: {
        description: [
          "Fewer than 2 members (naming only yourself) or more than 50, counting the caller",
          "(empty body)"
        ].join(" ")
      },
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return c.body(null, 401);
    const members = [.../* @__PURE__ */ new Set([id, ...await memberIds(c)])];
    if (members.length < 2 || members.length > MAX_THREAD_MEMBERS) return c.body(null, 400);
    const { chatThreadId, created } = await getOrCreateThreadWithMembers(c.env.DB, members, id);
    if (created) await pushThreadLatestMessage(c, chatThreadId);
    const limit = await formMessageCount(c, DEFAULT_THREAD_MESSAGE_COUNT);
    const thread = await threadWithMessages(c, chatThreadId, id, limit);
    if (thread === null) throw new Error(`thread ${chatThreadId} vanished after creation`);
    return c.json(thread);
  }
).get(
  "/thread/:id{[0-9]+}",
  describeRoute({
    tags: ["Threads"],
    summary: "One thread with its recent messages",
    description: [
      "What the client opens a conversation with (`/thread/13?messageCount=50`). An OBJECT \u2014",
      "the same shape `/thread/withmembers` answers: the client parses this one as a thread",
      "and rejects a bare array (\"expected '{', actual '['\"). Only `/thread/{id}/message`",
      "serves an array. 404s only for a thread the caller isn\u2019t in, not for one that\u2019s simply",
      "empty \u2014 a thread just opened with someone has no messages yet and still has to open."
    ].join(" "),
    security: AUTHED,
    parameters: [THREAD_ID_PARAM, messageCountParam(DEFAULT_THREAD_MESSAGE_COUNT)],
    responses: {
      200: json(ChatThreadWithMessagesDto, "The thread with a page of its messages"),
      401: UNAUTHORIZED_RESPONSE,
      404: NOT_A_MEMBER_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return c.body(null, 401);
    const chatThreadId = Number.parseInt(c.req.param("id"), 10);
    const limit = messageCount(c, DEFAULT_THREAD_MESSAGE_COUNT);
    const thread = await threadWithMessages(c, chatThreadId, id, limit);
    return thread === null ? c.notFound() : c.json(thread);
  }
).post("/thread/:id{[0-9]+}", sendToThreadRoute("`/thread/{id}`"), (c) => sendToThread(c)).post(
  "/thread/:id{[0-9]+}/message",
  sendToThreadRoute("`/thread/{id}/message`"),
  (c) => sendToThread(c)
).on(
  ["POST", "PUT"],
  "/thread/:id{[0-9]+}/rename",
  chatResultRoute(
    "Rename a thread",
    [
      "Any member may rename \u2014 there is no owner \u2014 and an empty name clears it back to unnamed,",
      "which renders as the member list. The name is truncated to 128 characters rather than",
      "rejected. Answers a bare ChatResult: 3 when the caller isn\u2019t on the thread, 0 on success."
    ].join(" "),
    { requestBody: form(RenameThreadRequest, "The new name") }
  ),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return c.body(null, 401);
    const chatThreadId = Number.parseInt(c.req.param("id"), 10);
    if (!await isThreadMember(c.env.DB, chatThreadId, id)) {
      return c.json(CHAT_MEMBERSHIP_NOT_FOUND);
    }
    const name = (await formField(c, "name") ?? "").trim().slice(0, MAX_THREAD_NAME_LENGTH);
    await setThreadName(c.env.DB, chatThreadId, name);
    return c.json(CHAT_SUCCESS);
  }
).on(
  ["POST", "DELETE"],
  "/thread/:id{[0-9]+}/leave",
  chatResultRoute(
    "Leave a thread",
    [
      "The thread and its history survive \u2014 only the caller\u2019s membership goes, so they stop",
      'seeing it and the remaining members keep the conversation. A "Player <@U\u2026> left" system',
      "notice is posted first so the others see why the roster changed; the leaver is still a",
      "member at that moment and gets the push too, which is what tells their client the thread",
      "is gone."
    ].join(" ")
  ),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return c.body(null, 401);
    const chatThreadId = Number.parseInt(c.req.param("id"), 10);
    if (!await isThreadMember(c.env.DB, chatThreadId, id)) {
      return c.json(CHAT_MEMBERSHIP_NOT_FOUND);
    }
    const notice = await postMessage(c.env.DB, {
      chatThreadId,
      senderPlayerId: SYSTEM_SENDER_ID,
      contents: leftChatContents(id)
    });
    await pushChatMessage(c, notice);
    await removeThreadMember(c.env.DB, chatThreadId, id);
    return c.json(CHAT_SUCCESS);
  }
).on(
  ["POST", "PUT"],
  "/thread/:id{[0-9]+}/snooze",
  chatResultRoute(
    "Snooze or unsnooze a thread",
    [
      "Per-member, for the caller alone \u2014 it never affects what anyone else sees. The client",
      "sends a boolean while the field it reads back (`snoozedUntil`) is a time, so `True` is",
      'stored as a far-future instant (9999-12-31T23:59:59Z) meaning "muted indefinitely" and',
      "`False` clears it."
    ].join(" "),
    { requestBody: form(SnoozeThreadRequest, "The snooze flag") }
  ),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return c.body(null, 401);
    const chatThreadId = Number.parseInt(c.req.param("id"), 10);
    if (!await isThreadMember(c.env.DB, chatThreadId, id)) {
      return c.json(CHAT_MEMBERSHIP_NOT_FOUND);
    }
    const on = await formBool(c, "snooze");
    await setThreadSnoozed(c.env.DB, chatThreadId, id, on ? SNOOZED_INDEFINITELY : null);
    return c.json(CHAT_SUCCESS);
  }
).on(
  ["PUT", "POST"],
  "/thread/:id{[0-9]+}/favorite",
  chatResultRoute(
    "Favorite or unfavorite a thread",
    [
      "Like snoozing, a per-member flag that pins the thread in the caller\u2019s own inbox and",
      "leaves everyone else\u2019s untouched."
    ].join(" "),
    { requestBody: form(FavoriteThreadRequest, "The favorite flag") }
  ),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return c.body(null, 401);
    const chatThreadId = Number.parseInt(c.req.param("id"), 10);
    if (!await isThreadMember(c.env.DB, chatThreadId, id)) {
      return c.json(CHAT_MEMBERSHIP_NOT_FOUND);
    }
    await setThreadFavorited(c.env.DB, chatThreadId, id, await formBool(c, "favorite"));
    return c.json(CHAT_SUCCESS);
  }
).post(
  "/thread/:id{[0-9]+}/member/:playerId{[0-9]+}",
  chatResultRoute(
    "Add a player to a thread",
    [
      "Gated on the caller already being in it \u2014 you can only pull someone into a conversation",
      "you\u2019re part of. Answers a bare ChatResult rather than an HTTP status, as the reference",
      'does: 3 when the caller isn\u2019t a member (which doubles as "no such thread", keeping a',
      "thread\u2019s existence private), 4 when the target is already on it, 0 on success.",
      "Idempotent \u2014 re-adding an existing member changes nothing. On success a",
      '"Player <@U\u2026> joined" system notice is posted and pushed to the whole thread: the',
      "existing members because the roster changed, the new one because that push is what",
      "puts the conversation on their screen."
    ].join(" "),
    {
      parameters: [
        {
          name: "playerId",
          in: "path",
          required: true,
          description: "The account id to add (digits only)",
          schema: { type: "string" }
        }
      ],
      successDescription: "0 success \xB7 3 caller not a member \xB7 4 target already on the thread"
    }
  ),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return c.body(null, 401);
    const chatThreadId = Number.parseInt(c.req.param("id"), 10);
    if (!await isThreadMember(c.env.DB, chatThreadId, id)) {
      return c.json(CHAT_MEMBERSHIP_NOT_FOUND);
    }
    const playerId = Number.parseInt(c.req.param("playerId"), 10);
    if (await isThreadMember(c.env.DB, chatThreadId, playerId)) {
      return c.json(CHAT_PLAYER_ALREADY_ON_THREAD);
    }
    await addThreadMember(c.env.DB, chatThreadId, playerId);
    await announceJoin(c, chatThreadId, playerId);
    return c.json(CHAT_SUCCESS);
  }
).on(
  ["PUT", "POST"],
  "/thread/:id{[0-9]+}/read",
  chatResultRoute(
    "Mark a whole thread read",
    [
      "Moves the caller\u2019s read pointer to the thread\u2019s latest message. The pointer only moves",
      "forward and never past the thread\u2019s real latest message, so an id the client made up",
      "can\u2019t strand the thread as permanently read. 404s for a thread the caller isn\u2019t on."
    ].join(" "),
    { successDescription: "Always 0 (success)", notFound: true }
  ),
  (c) => markRead(c)
).on(
  ["PUT", "POST"],
  "/thread/:id{[0-9]+}/message/:messageId{[0-9]+}/read",
  chatResultRoute(
    "Mark read up to a specific message",
    [
      "What the client sends when the view sits on a message rather than the bottom. Same",
      "forward-only, clamped pointer as the whole-thread form. 404s for a thread the caller",
      "isn\u2019t on."
    ].join(" "),
    {
      parameters: [
        {
          name: "messageId",
          in: "path",
          required: true,
          description: "The message to read up to (digits only)",
          schema: { type: "string" }
        }
      ],
      successDescription: "Always 0 (success)",
      notFound: true
    }
  ),
  (c) => markRead(c, Number.parseInt(c.req.param("messageId"), 10))
).get(
  "/thread/:id{[0-9]+}/message",
  describeRoute({
    tags: ["Messages"],
    summary: "A page of one thread\u2019s messages",
    description: [
      "Newest first \u2014 a bare ARRAY, unlike `/thread/{id}`, which serves the thread object.",
      "`MessageCount` is the page size. 404 rather than 403 for a thread the caller isn\u2019t in:",
      "whether a thread exists is itself private, so a non-member gets the same answer as for a",
      "thread that\u2019s gone. An empty thread is still a 200 with `[]`."
    ].join(" "),
    security: AUTHED,
    parameters: [THREAD_ID_PARAM, messageCountParam(DEFAULT_MESSAGE_COUNT)],
    responses: {
      200: json(ChatMessageDto.array(), "The page of messages, newest first (empty when none)"),
      401: UNAUTHORIZED_RESPONSE,
      404: NOT_A_MEMBER_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return c.body(null, 401);
    const chatThreadId = Number.parseInt(c.req.param("id"), 10);
    if (!await isThreadMember(c.env.DB, chatThreadId, id)) return c.notFound();
    return c.json(await getThreadMessages(c.env.DB, chatThreadId, { limit: messageCount(c) }));
  }
);
app.get(
  "/openapi.json",
  describeRoute({ hide: true }),
  withCleanSpec(
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "recflare chat",
          version: "1.0.0",
          description: [
            "Chat threads and messages for recflare, a private-server reimplementation of the Rec",
            "Room backend. A thread is a conversation \u2014 a DM pair, a named group, or a system",
            "thread \u2014 and membership is both the authorization gate and the `playerIds` the client",
            "renders. Threads, membership and messages are D1-backed; every message also fans out",
            "over the `notify` hub Durable Object as a ChatMessageReceived frame, so a conversation",
            "updates live instead of on the next poll. (The hub frame carries a STRING `Id` \u2014 the",
            "client dispatches on it and silently drops a numeric one.)"
          ].join("\n")
        },
        servers: [{ url: "https://chat.recflare.net", description: "Production" }],
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
