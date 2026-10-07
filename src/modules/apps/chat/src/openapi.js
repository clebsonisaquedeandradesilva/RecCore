// Ported from apps/chat/src/openapi.ts; TypeScript types erased; native runtime imports.
import { resolver } from "../../../../runtime/openapi.js";
import { z } from "../../../../../vendor/zod.js";
function json(schema, description) {
  return { description, content: { "application/json": { schema: resolver(schema) } } };
}
function toOpenApiSchema(schema) {
  const { $schema: _$schema, additionalProperties: _extra, ...jsonSchema } = z.toJSONSchema(schema);
  return jsonSchema;
}
function form(schema, description) {
  const s = toOpenApiSchema(schema);
  return {
    description,
    content: {
      "application/x-www-form-urlencoded": { schema: s },
      "multipart/form-data": { schema: s }
    }
  };
}
function jsonBody(schema, description) {
  return { description, content: { "application/json": { schema: toOpenApiSchema(schema) } } };
}
const UNAUTHORIZED_RESPONSE = { description: "Missing or invalid bearer token (empty body)" };
const AUTHED = [{ bearerAuth: [] }];
const NOT_A_MEMBER_RESPONSE = {
  description: "Not a member of the thread (or no such thread) \u2014 the two are indistinguishable"
};
const ChatMessageDto = z.object({
  chatMessageId: z.int().describe("Server-assigned, unique across all threads"),
  chatThreadId: z.int(),
  senderPlayerId: z.int().describe("-5 is the system sender (join/leave notices)"),
  timeSent: z.string().describe("ISO-8601 UTC instant, as .NET serializes DateTime"),
  contents: z.string().describe('The raw client envelope, e.g. {"Type":0,"Version":1,"Data":"hi"}'),
  moderationState: z.int().describe("0 None, 1 Flagged, 2 Hidden")
});
const threadBase = {
  chatThreadId: z.int(),
  playerIds: z.array(z.int()).describe("The thread\u2019s members, ordered by id"),
  lastReadMessageId: z.int().describe("0 when never read \u2014 never null (the client deserializes a non-nullable int)"),
  chatThreadName: z.string().describe("Empty for DMs and unnamed groups \u2014 never null (the client dereferences it)"),
  chatThreadType: z.int().describe("The ChatThreadType enum, numeric: 0 Player (DMs and groups) \xB7 1 Club \xB7 2 Party"),
  snoozedUntil: z.string().nullable().describe("An instant, or null when not snoozed"),
  isFavorited: z.boolean()
};
const ChatThreadDto = z.object({
  latestMessage: ChatMessageDto.nullable().describe("Null only for a thread with no messages yet"),
  ...threadBase
});
const ChatThreadWithMessagesDto = z.object({
  ...threadBase,
  messages: z.array(ChatMessageDto).describe("Newest first; empty for a thread with nothing in it")
});
const ChatResult = z.int().describe(
  "ChatResult, numeric: 0 Success \xB7 1 InvalidArguments \xB7 2 ThreadNotFound \xB7 3 MembershipNotFound \xB7 4 PlayerAlreadyOnThread \xB7 5 CannotMessagePlayer \xB7 6 InvalidCharacters \xB7 7 RecentlyLeftThread \xB7 8 ThreadTooLarge \xB7 9 InsufficientPermission \xB7 10 TooManyAffiliationThreads \xB7 11 UnderModeration \xB7 12 MessageNotFound \xB7 13 InvalidThreadJoinType \xB7 14 PlayerBanned \xB7 15 CannotMessagePlayerDueToLocalPrivacySetting \xB7 16 CannotMessagePlayerDueToRemotePrivacySetting \xB7 17 SuccessWithPartialPlayersAddedToThreadDueToPrivacySetting \xB7 18 CannotAddPlayersToThreadDueToPrivacySetting \xB7 19 CannotConvertDirectMessageChatToGroupChatDueToPrivacySetting"
);
const CreateThreadResponse = z.object({
  chatThread: ChatThreadDto,
  chatResult: ChatResult
});
const SentChatMessage = z.object({
  ChatMessageId: z.int(),
  ChatThreadId: z.int(),
  SenderPlayerId: z.int(),
  TimeSent: z.string().describe("ISO-8601 UTC instant"),
  Contents: z.string().describe(
    "The escaped envelope \u2014 must parse to `{ Type, Version, Data }` with a non-null Data"
  ),
  ModerationState: z.int().describe("0 Active \xB7 11 Junior_Pending \xB7 100/101/102 Moderation_* \xB7 255 MarkedForDelete")
});
const SendMessageResponse = z.object({
  ChatMessage: SentChatMessage.nullable().describe(
    "The message just posted; null only when nothing was posted (ChatResult \u2260 0)"
  ),
  ChatResult,
  chatResult: ChatResult.describe("The same value as `ChatResult` \u2014 see above"),
  chatThread: ChatThreadWithMessagesDto.nullable()
});
const PartyInviteSettings = z.object({
  InviteLinkLifetimeInMinutes: z.int().describe("Minutes a party invite link stays valid before it lapses")
});
const ChatPrivacySettings = z.object({
  playerId: z.int().describe("The caller \u2014 read from the token, not from the query"),
  directMessagePrivacySetting: z.int().describe("Who may DM the caller: 0 Friends \xB7 1 Favorites \xB7 2 NoOne"),
  groupChatPrivacySetting: z.int().describe("Who may add the caller to a group chat: 0 Friends \xB7 1 Favorites \xB7 2 NoOne")
});
const PartyChatThread = z.object({
  ChatThreadId: z.int(),
  ChatThreadType: z.int().describe("The ChatThreadType enum: 0 Player \xB7 1 Club \xB7 2 Party"),
  LastReadMessageId: z.int().describe("0 for a party that was just opened"),
  Messages: z.array(SentChatMessage).describe("Empty for a party just opened \u2014 nothing is posted into it"),
  LatestMessage: SentChatMessage.nullable().describe("Null while the thread has no messages"),
  PlayerIds: z.array(z.int()).describe("Just the caller, until players are invited on"),
  ChatThreadName: z.string().nullable().describe("NULL when unnamed \u2014 not the empty string"),
  SnoozedUntil: z.string().nullable().describe("An instant, or null when not snoozed"),
  IsFavorited: z.boolean(),
  ClubId: z.int().nullable().describe("Always null here \u2014 this worker serves no club threads")
});
const CreatePartyChatResponse = z.object({
  ChatThread: PartyChatThread,
  ChatResult
});
const ServiceStatus = z.object({
  service: z.literal("chat"),
  status: z.literal("ok")
});
const CreateThreadRequest = z.object({
  ids: z.array(z.int()).describe("Repeated: ids=2&ids=155. The caller is added automatically"),
  messageContents: z.string().optional().describe(
    [
      "The client envelope, stored as sent but for the profanity mask over its `Data`.",
      "Blank/absent opens the thread without posting a message and reports chatResult 1"
    ].join(" ")
  )
});
const WithMembersRequest = z.object({
  ids: z.array(z.int()).describe("Repeated: ids=2&ids=155. The caller is added automatically"),
  messageCount: z.int().optional().describe("Page size for `messages`; defaults to 50, capped at 100")
});
const SendMessageRequest = z.object({
  messageContents: z.string().describe(
    [
      "The client envelope (Type/Version/Data). Stored as sent except for `Data`, which",
      "comes back with any profanity masked one `*` per character. Blank or missing stores",
      "nothing and reports chatResult 1, still with the thread attached"
    ].join(" ")
  ),
  messageCount: z.int().optional().describe("Page size for the returned thread\u2019s `messages`")
});
const RenameThreadRequest = z.object({
  name: z.string().describe("Truncated to 128 chars, not rejected. Empty clears it back to unnamed")
});
const SnoozeThreadRequest = z.object({
  snooze: z.string().describe("`True`/`False` as the client spells it (`1`/`yes` also count as true)")
});
const ChatPrivacySettingRequest = z.object({
  directMessagePrivacySetting: z.string().optional().describe("Who may DM the caller: `Friends` \xB7 `Favorites` \xB7 `NoOne` (or 0 \xB7 1 \xB7 2)"),
  groupChatPrivacySetting: z.string().optional().describe(
    "Who may add the caller to a group chat: `Friends` \xB7 `Favorites` \xB7 `NoOne` (or 0 \xB7 1 \xB7 2)"
  )
});
const FavoriteThreadRequest = z.object({
  favorite: z.string().describe("`True`/`False` as the client spells it (`1`/`yes` also count as true)")
});
const THREAD_ID_PARAM = {
  name: "id",
  in: "path",
  required: true,
  description: "Chat thread id (digits only \u2014 a non-numeric path matches no route)",
  schema: { type: "string" }
};
function messageCountParam(fallback) {
  return {
    name: "MessageCount",
    in: "query",
    required: false,
    description: `Page size; defaults to ${fallback}, capped at 100. \`messageCount\` is accepted too. Anything unparseable or out of range falls back rather than 400ing`,
    schema: { type: "integer" }
  };
}
export {
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
  NOT_A_MEMBER_RESPONSE,
  PartyChatThread,
  PartyInviteSettings,
  RenameThreadRequest,
  SendMessageRequest,
  SendMessageResponse,
  SentChatMessage,
  ServiceStatus,
  SnoozeThreadRequest,
  THREAD_ID_PARAM,
  UNAUTHORIZED_RESPONSE,
  WithMembersRequest,
  form,
  json,
  jsonBody,
  messageCountParam
};
