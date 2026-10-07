// Ported from apps/clubs/src/openapi.ts; TypeScript types erased; native runtime imports.
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
const JsonArray = z.array(z.unknown());
const EmptyObject = z.object({});
const ClubDto = z.object({
  ClubId: z.int(),
  Name: z.string().describe("At most 40 characters; letters, digits and basic punctuation"),
  Description: z.string(),
  Category: z.string().describe("One of the /club/categoryTags values; defaults to Social"),
  Visibility: z.int().describe("ClubVisibility: 0 = Private, 1 = Public"),
  Joinability: z.int().describe("ClubJoinability: 0 = Open, 1 = InviteOnly, 2 = AskToJoin"),
  AllowJuniors: z.boolean(),
  MainImageName: z.string().describe("An image name from the storage worker; DefaultImgPurple"),
  ClubType: z.int().describe("0 = a regular club; 1 = a subscription club (never listed)"),
  ClubhouseRoomId: z.int().nullable().describe("The room a home-club member spawns into"),
  CreatorAccountId: z.int(),
  IsRRO: z.boolean(),
  MinLevel: z.int(),
  State: z.int(),
  MemberCount: z.int().describe("Derived from the club_member rows at/above Member (10)")
});
const SavedImageDto = z.object({
  Id: z.int(),
  Type: z.int().describe("SavedImageType: 1 = share camera, 3 = room, 4 = profile, \u2026"),
  Accessibility: z.int(),
  AccessibilityLocked: z.boolean(),
  ImageName: z.string().describe("The bucket key the img worker serves it back by"),
  Description: z.string().nullable(),
  PlayerId: z.int(),
  TaggedPlayerIds: z.array(z.int()),
  RoomId: z.int().nullable(),
  PlayerEventId: z.int().nullable(),
  CreatedAt: z.string(),
  CheerCount: z.int(),
  CommentCount: z.int()
});
const ClubPermissionDto = z.object({
  ClubId: z.int(),
  Type: z.int().describe("The ClubMembershipType tier these permissions describe"),
  ApproveMember: z.boolean(),
  BanUnban: z.boolean(),
  CreateEvent: z.boolean(),
  EditDetails: z.boolean(),
  EditPermissionSettings: z.boolean(),
  PostAnnouncement: z.boolean()
});
const ClubDetailsDto = z.object({
  AdditionalImages: z.array(SavedImageDto).describe(
    [
      "The club\u2019s gallery as WHOLE image records, not image names \u2014 the client",
      "deserializes each entry into an object, so a bare array of names fails its parser",
      `("expected '{'"). The list is packed and in order: removing an image shifts the`,
      "rest up, never leaving a blank slot."
    ].join(" ")
  ),
  Club: ClubDto,
  ClubId: z.int(),
  CoownerPermissions: ClubPermissionDto,
  CustomTags: z.array(z.string()).describe("Set wholesale by modifydetails\u2019 repeated customTags"),
  MemberPermissions: ClubPermissionDto,
  ModeratorPermissions: ClubPermissionDto,
  MyMembershipType: z.int().describe(
    [
      "The caller\u2019s own ClubMembershipType: -1 banned, 0 none (also a signed-out viewer),",
      "1 pending request, 2 pending invite, 3 denied, 10 member, 20 moderator, 30 co-owner,",
      "100 creator"
    ].join(" ")
  )
});
const ClubMemberDto = z.object({
  ClubMemberId: z.int(),
  ClubId: z.int(),
  AccountId: z.int(),
  MembershipType: z.int().describe("See MyMembershipType for the tiers"),
  CreatedAt: z.string().nullable().describe("When the membership row was first written")
});
const ClubAnnouncementDto = z.object({
  AnnouncementId: z.int(),
  ClubId: z.int(),
  AccountId: z.int().describe("Who posted it"),
  Title: z.string(),
  Body: z.string(),
  ImageName: z.string(),
  Meta: z.string(),
  CreatedAt: z.string().nullable()
});
const ClubDetailsEnvelope = z.object({
  error: z.string(),
  success: z.boolean(),
  value: ClubDetailsDto
});
const ClubEnvelope = z.object({
  error: z.string(),
  success: z.boolean(),
  value: ClubDto
});
const NullEnvelope = z.object({
  error: z.string(),
  success: z.boolean(),
  value: z.null()
});
const ErrorEnvelope = z.object({
  error: z.string().describe("The message shown to the player"),
  success: z.boolean().describe("Always false"),
  value: z.null()
});
const ClubMembersEnvelope = z.object({
  error: z.string(),
  success: z.boolean(),
  value: z.array(ClubMemberDto)
});
const ClubAnnouncementsEnvelope = z.object({
  error: z.string(),
  success: z.boolean(),
  value: z.object({
    Announcements: z.array(ClubAnnouncementDto).describe("Newest first"),
    ClubId: z.int(),
    LastAnnouncementId: z.int().nullable().describe("The newest one; null when there are none"),
    LastReadAnnouncementId: z.int().describe("Always 0 \u2014 nothing tracks read state yet")
  })
});
const AnnouncementIdEnvelope = z.object({
  error: z.string(),
  success: z.boolean(),
  value: z.int().describe("The new announcement\u2019s id")
});
const ClubSearchResponse = z.object({
  Clubs: z.array(ClubDto),
  ContinuationToken: z.null().describe("Always null \u2014 the whole page is served at once"),
  TotalClubs: z.int().describe("How many clubs matched, not the page size")
});
const SubscriptionDetailsResponse = z.object({
  accountId: z.int(),
  clubId: z.int().describe("Always 0 \u2014 no subscription clubs yet"),
  subscriberCount: z.int().describe("Always 0")
});
const CategoryTags = z.array(z.string());
const SubscriberCountResponse = z.int().describe("Always 0 \u2014 there are no club subscriptions yet");
const ChatDisabledResponse = z.boolean();
const CreateClubRequest = z.object({
  name: z.string().describe("Required; at most 40 characters, letters/digits/basic punctuation only"),
  description: z.string().optional().describe("At most 512 characters"),
  category: z.string().optional().describe("Defaults to Social when unset"),
  visibility: z.string().optional().describe("By name (`Public`/`Private`) or number"),
  joinability: z.string().optional().describe("By name (`Open`/`InviteOnly`/`AskToJoin`) or number"),
  allowJuniors: z.string().optional().describe("`True`/`false`/`1`/`yes`"),
  mainImageName: z.string().optional(),
  minLevel: z.string().optional()
});
const ModifyClubRequest = z.object({
  name: z.string().optional().describe('At most 40 characters. Empty means unchanged, not "clear it"'),
  description: z.string().optional().describe("At most 512 characters. Empty means unchanged"),
  category: z.string().optional(),
  visibility: z.string().optional().describe("By name (`Public`/`Private`) or number"),
  joinability: z.string().optional().describe("By name (`Open`/`InviteOnly`/`AskToJoin`) or number"),
  allowJuniors: z.string().optional().describe("`True`/`false`/`1`/`yes`"),
  mainImageName: z.string().optional(),
  minLevel: z.string().optional(),
  customTags: z.array(z.string()).optional().describe("May repeat; when present it replaces the club\u2019s tag set wholesale")
});
const HomeClubRequest = z.object({
  clubId: z.string().describe("The club to make home; the caller must be a member of it")
});
const MinLevelRequest = z.object({
  minLevel: z.string().describe("The minimum player level to join; negative/NaN is 400")
});
const ClubhouseRequest = z.object({
  roomId: z.string().optional().describe("The clubhouse room; omitting it clears the clubhouse")
});
const ImageNameRequest = z.object({
  imageName: z.string().describe("The image name the `storage` worker handed back")
});
const InviteMemberRequest = z.object({
  accountId: z.string().describe("The account to add to the club; a positive integer"),
  membershipType: z.string().optional().describe("The tier to grant \u2014 10 Member, 20 Moderator, 30 Co-owner; defaults to Member")
});
const AnnouncementRequest = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  imageName: z.string().optional(),
  meta: z.string().optional()
});
export {
  AUTHED,
  AnnouncementIdEnvelope,
  AnnouncementRequest,
  CategoryTags,
  ChatDisabledResponse,
  ClubAnnouncementDto,
  ClubAnnouncementsEnvelope,
  ClubDetailsDto,
  ClubDetailsEnvelope,
  ClubDto,
  ClubEnvelope,
  ClubMemberDto,
  ClubMembersEnvelope,
  ClubPermissionDto,
  ClubSearchResponse,
  ClubhouseRequest,
  CreateClubRequest,
  EmptyObject,
  ErrorEnvelope,
  HomeClubRequest,
  ImageNameRequest,
  InviteMemberRequest,
  JsonArray,
  MinLevelRequest,
  ModifyClubRequest,
  NullEnvelope,
  SavedImageDto,
  SubscriberCountResponse,
  SubscriptionDetailsResponse,
  UNAUTHORIZED_RESPONSE,
  form,
  json,
  jsonBody
};
