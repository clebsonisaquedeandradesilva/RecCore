// Ported from apps/match/src/openapi.ts; TypeScript types erased; native runtime imports.
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
const EMPTY_OK = { description: "Acknowledged (empty body)" };
const UNAUTHORIZED_RESPONSE = { description: "Missing or invalid bearer token (empty body)" };
const AUTHED = [{ bearerAuth: [] }];
const RoomInstanceType = z.int().describe("RoomInstanceType: 0 Public, 1 Dormroom, \u2026 (see @repo/domain)");
const RoomInstanceDto = z.object({
  roomInstanceId: z.int(),
  roomId: z.int(),
  subRoomId: z.int().describe("Which subroom (scene) of the room this instance is"),
  roomInstanceType: RoomInstanceType,
  location: z.string().describe("SubRoom Unity scene id; empty is rejected by the client"),
  dataBlob: z.string(),
  eventId: z.int(),
  clubId: z.int(),
  roomCode: z.string(),
  photonRegion: z.string(),
  photonRegionId: z.string(),
  photonRoomId: z.string().describe("Shared by joiners of the same instance"),
  name: z.string().describe("`^`-prefixed (or `@owner\u2019s Dorm` for personal dorms)"),
  maxCapacity: z.int(),
  isFull: z.boolean(),
  isPrivate: z.boolean(),
  isInProgress: z.boolean().describe("Set by the owner via PUT /roominstance/:id/inprogress"),
  EncryptVoiceChat: z.boolean()
});
const RoomInstanceSummaryDto = z.object({
  roomInstanceId: z.int(),
  roomId: z.int(),
  subRoomId: z.int().describe("Which subroom (scene) of the room this instance is"),
  isFull: z.boolean(),
  createdAt: z.string().describe("ISO 8601 UTC, stamped when the instance was created"),
  playerIds: z.array(z.int()).describe("Accounts currently in the instance (live presence); empty when nobody is")
});
const PlayerDto = z.object({
  playerId: z.int(),
  isOnline: z.boolean().describe("Has a live presence row (presence expires on a TTL)"),
  errorCode: z.int().describe("0 = no error; non-zero only on a failed matchmake"),
  roomInstance: RoomInstanceDto.nullable().describe("null when not in a room"),
  appVersion: z.string(),
  deviceClass: z.int(),
  statusVisibility: z.int(),
  vrMovementMode: z.int(),
  platform: z.int(),
  photonAuthToken: z.null(),
  photonRealtimeAppId: z.null(),
  photonVoiceAppId: z.null(),
  photonChatAppId: z.null(),
  photonRegion: z.null(),
  photonRoomId: z.null(),
  voiceConnectionInfo: z.null(),
  voiceServerId: z.null(),
  experiments: z.null()
});
const MatchmakeResponse = z.object({
  result: z.int().describe("The join-result code the client checks first; same as errorCode"),
  errorCode: z.int().describe("0 = success; 20 = NoSuchRoom; 55 = banned from the room (the one non-opaque code)"),
  roomInstance: RoomInstanceDto.nullable(),
  correlationId: z.string().describe("Echoes the request\u2019s CorrelationId; all-zero GUID when it sent none")
});
const AvoidJuniorsResponse = z.boolean().describe("Whether the player asked to be kept away from junior accounts");
const AvoidJuniorsRequest = z.object({
  avoidJuniors: z.string().describe("`True`/`False` (also `1`/`0`, `yes`/`no`)")
});
const ExclusiveLoginResponse = z.object({ errorCode: z.int().describe("Always 0") });
const ConnectionExperiments = z.object({
  networkTransformSyncInterval: z.number(),
  shouldUseUnreliableOnChange: z.boolean(),
  shouldAvoidDiscontinuityRPCs: z.boolean(),
  shouldAvoidRedundantDiscontinuity: z.boolean(),
  r2RuntimeStaticBaking: z.boolean(),
  r2AutoEmbodiment: z.boolean(),
  r2RuntimeStaticBakingMinShapeThreshold: z.int(),
  r2UseCheapReplicas: z.boolean(),
  shouldUseGameServerNetworking: z.boolean().describe("true connects to a local game server instead of Photon")
});
const ConnectionInfo = z.object({
  photonAuthToken: z.string().describe("Short-lived HS256 token identifying the caller to Photon"),
  photonRealtimeAppId: z.string().describe("Photon Realtime application id"),
  photonVoiceAppId: z.string().describe("Photon Voice application id"),
  photonChatAppId: z.string().describe("Photon Chat application id"),
  photonRegion: z.string().describe("Region id, matching a room instance\u2019s `photonRegion`"),
  photonRoomId: z.string().describe("The caller\u2019s current instance; empty when they\u2019re in none"),
  voiceConnectionInfo: z.string().describe("The instance\u2019s Tachyon server, `host:port`; empty when none is configured"),
  voiceServerId: z.string().describe("That server\u2019s generated id (`tachyon-1`, \u2026); cosmetic, empty when there is none"),
  experiments: ConnectionExperiments
});
const ConnectionInfoResponse = z.object({
  success: z.literal(true),
  value: ConnectionInfo,
  error: z.null()
});
const QosRegion = z.object({
  id: z.string().describe("Region id, e.g. `us-east1`"),
  address: z.string().describe("`host:port` of the probe endpoint")
});
const LoginLockRequest = z.object({
  LoginLock: z.string().describe("The session login-lock GUID (always sent)")
});
const InProgressRequest = z.object({
  inProgress: z.string().describe('"True" | "False" (case-insensitive)')
});
const StatusVisibilityRequest = z.object({
  statusVisibility: z.string().describe("Integer string; non-numeric is ignored")
});
const NotifyDisconnectRequest = z.object({
  PlayerId: z.string().describe("The account that disconnected"),
  RoomInstanceId: z.string().describe("The room instance they dropped")
});
const CorrelationIdRequest = z.object({
  CorrelationId: z.string().optional().describe("Per-attempt GUID; echoed on the response")
});
const JoinModeRequest = CorrelationIdRequest.extend({
  JoinMode: z.string().optional().describe('"2" requests a private instance')
});
const MatchmakeRoomRequest = CorrelationIdRequest.extend({
  JoinMode: z.string().optional().describe('"2" requests a private instance'),
  AdditionalPlayerIds: z.string().optional().describe("Party members to invite into the room; repeated once per id")
});
const MatchmakeRoomV2Request = z.object({
  CorrelationId: z.string().optional().describe("Per-attempt GUID; echoed on the response"),
  JoinMode: z.int().optional().describe("2 requests a private instance"),
  AdditionalPlayerIds: z.array(z.int()).nullable().optional().describe("Party members to invite into the room; null when the player is alone"),
  InviteMode: z.int().optional(),
  ShouldKeepPlayerWithParty: z.boolean().optional(),
  BypassMovementModeRestriction: z.boolean().optional(),
  MaxPersistenceVersion: z.int().optional(),
  Ugc1SubVersion: z.int().optional(),
  Ugc2SubVersion: z.int().optional(),
  VoiceServerVersion: z.string().optional(),
  LoginLock: z.string().optional(),
  ClientJoinData: z.string().nullable().optional(),
  PlayerScores: z.unknown().optional()
});
const RoomInstanceV2Dto = z.object({
  RoomInstanceId: z.int(),
  RoomId: z.int(),
  SubRoomId: z.int(),
  Location: z.string().describe("SubRoom Unity scene id; empty is rejected by the client"),
  EventId: z.int(),
  ClubId: z.int(),
  RoomCode: z.string(),
  Name: z.string(),
  MaxCapacity: z.int(),
  IsFull: z.boolean(),
  IsPrivate: z.boolean(),
  IsInProgress: z.boolean(),
  EncryptVoiceChat: z.boolean(),
  RoomInstanceType,
  MatchmakingPolicy: z.int().describe("Always 0; this server has no policy to express")
});
const MatchmakeV2Response = z.object({
  ErrorCode: z.int().describe("0 = success; 20 = NoSuchRoom; 55 = banned from the room (the one non-opaque code)"),
  CorrelationId: z.string().describe("Echoes the request\u2019s CorrelationId; all-zero GUID when it sent none"),
  RoomInstance: RoomInstanceV2Dto.nullable()
});
const InviteRequest = z.object({
  playerId: z.string().describe("The account to invite; a non-zero integer (else 400)"),
  roomInstanceId: z.string().optional().describe("The caller\u2019s room instance to invite them into; resolves the invite\u2019s RoomId")
});
const InviteResponse = z.object({
  RoomInviteId: z.int().describe("Id of the new `room_invite` row"),
  FromPlayerId: z.int().describe("The caller (the Bearer token)"),
  ToPlayerId: z.int().describe("The invited account"),
  RoomId: z.int().nullable().describe("The room the invite points at; null when the room instance didn\u2019t resolve")
});
const InstanceIdResponse = z.int().describe("The player\u2019s room instance id, or 0 when they are not in one");
const ActiveClubhouseDto = z.object({
  RoomId: z.int().describe("The club\u2019s clubhouse room"),
  ClubId: z.int().describe("The club that clubhouse belongs to"),
  PlayerCount: z.int().describe("How many players are in the room this second")
});
export {
  AUTHED,
  ActiveClubhouseDto,
  AvoidJuniorsRequest,
  AvoidJuniorsResponse,
  ConnectionExperiments,
  ConnectionInfo,
  ConnectionInfoResponse,
  CorrelationIdRequest,
  EMPTY_OK,
  ExclusiveLoginResponse,
  InProgressRequest,
  InstanceIdResponse,
  InviteRequest,
  InviteResponse,
  JoinModeRequest,
  LoginLockRequest,
  MatchmakeResponse,
  MatchmakeRoomRequest,
  MatchmakeRoomV2Request,
  MatchmakeV2Response,
  NotifyDisconnectRequest,
  PlayerDto,
  QosRegion,
  RoomInstanceDto,
  RoomInstanceSummaryDto,
  RoomInstanceType,
  RoomInstanceV2Dto,
  StatusVisibilityRequest,
  UNAUTHORIZED_RESPONSE,
  form,
  json,
  jsonBody
};
