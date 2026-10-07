// Ported from apps/auth/src/openapi.ts; TypeScript types erased; native runtime imports.
import { resolver } from "../../../../runtime/openapi.js";
import { z } from "../../../../../vendor/zod.js";
import { PlatformType } from "../../../packages/domain/src/enums.js";
function json(schema, description) {
  return { description, content: { "application/json": { schema: resolver(schema) } } };
}
function form(schema, description) {
  const { $schema: _$schema, additionalProperties: _extra, ...jsonSchema } = z.toJSONSchema(schema);
  return {
    description,
    content: {
      // zod's JSONSchema type is far wider than OpenAPI's SchemaObject (it carries
      // `~standard` and every draft keyword), so the two never match structurally
      // even though the emitted value is valid OpenAPI 3.1. Cast at the boundary.
      "application/x-www-form-urlencoded": { schema: jsonSchema }
    }
  };
}
import { PlatformType as PlatformType2 } from "../../../packages/domain/src/enums.js";
const PlatformTypeSchema = z.union([
  z.literal(-1),
  z.int().min(0).max(Math.max(...Object.values(PlatformType)))
]).describe(
  Object.entries(PlatformType).map(([name, value]) => `${value} ${name}`).join(", ")
);
const CachedLogin = z.object({
  platform: PlatformTypeSchema,
  platformId: z.string().describe("The linked platform-native id \u2014 a SteamID64 for Steam, a user id for Meta"),
  accountId: z.int().describe("Post this back as `account_id` on a cached_login grant"),
  lastLoginTime: z.iso.datetime().describe("Falls back to the account's createdAt"),
  requirePassword: z.literal(false).describe("Always false \u2014 platform ownership is the credential for a cached login")
});
const FakeCachedLogin = CachedLogin.extend({
  requirePassword: z.literal(true).describe("Always true \u2014 the entry is not platform-backed")
});
const OAuthError = z.object({
  error: z.enum(["invalid_grant", "invalid_request", "server_error"]),
  error_description: z.string()
});
const TokenResponse = z.object({
  access_token: z.string().describe("Signed JWT; `sub` is the account id"),
  expires_in: z.int().describe("Access-token lifetime in seconds (TOKEN_TTL_SECONDS)"),
  token_type: z.literal("Bearer"),
  refresh_token: z.string().describe("Single-use; redeem via grant_type=refresh_token, which rotates it"),
  scope: z.string().describe("Space-separated granted scopes"),
  key: z.string().describe("@kludge Constant the client appears to require. Purpose unknown.")
});
const TokenRequest = z.object({
  grant_type: z.enum(["create_account", "cached_login", "refresh_token", "password"]).describe("Anything unrecognised (including absent) is treated as a password grant"),
  account_id: z.string().optional().describe("Numeric account id, as a string"),
  username: z.string().optional().describe("Password grant alternative to account_id; case-insensitive, trimmed"),
  password: z.string().optional().describe("Required on a password grant. On create_account, sets the initial password"),
  platform: z.string().optional().describe("PlatformType as an integer string"),
  platform_id: z.string().optional().describe(
    "On Steam, unverified and ignored in favour of the id the ticket carries. On Meta it is the id the nonce is validated against, so it must be the real (numeric) user id"
  ),
  platform_auth: z.string().optional().describe(
    'Platform proof, required for cached_login and platform create_account, and used to link the identity on a password grant. Steam: `{"Ticket":"<hex>","AppId":\u2026}`. Meta: `{"Nonce":\u2026,"AppId":\u2026,"Source":\u2026}`'
  ),
  refresh_token: z.string().optional().describe("Required on a refresh_token grant"),
  device_id: z.string().optional().describe("Client-chosen, unverified. Recorded on the account, never trusted"),
  device_class: z.string().optional().describe("Integer string; defaults to 0"),
  ver: z.string().optional().describe(
    "The client\u2019s build, e.g. `20250718.01`. Stamped into the token\u2019s `rn.ver` claim and read back by `match` when it writes presence, so a player reports the build they are running. Absent (or empty) falls back to the server\u2019s GAME_VERSION"
  )
});
const ChangePasswordRequest = z.object({
  newPassword: z.string().describe("Required; empty is rejected"),
  oldPassword: z.string().optional().describe("Must match when the account already has a password; empty when first setting it")
});
const ChangePasswordResponse = z.object({
  success: z.boolean(),
  error: z.string().optional()
});
const ReportCategory = z.int().describe(
  "ReportCategory: -1 Moderator \xB7 0 Unknown \xB7 1 DEPRECATED_MicrophoneAbuse \xB7 2 Harassment \xB7 3 Cheating \xB7 4 DEPRECATED_ImmatureBehavior \xB7 5 AFK \xB7 6 Misc \xB7 7 Underage \xB7 10 VoteKick \xB7 11 MisleadingPurchases \xB7 100 CoC_Underage \xB7 101 CoC_Sexual \xB7 102 CoC_Discrimination \xB7 103 CoC_Trolling \xB7 104 CoC_NameOrProfile \xB7 200 InappropriateClothing \xB7 1000 IssuingInaccurateReports \xB7 1100 RoomInventoryItems \xB7 1101 InappropriateRooms \xB7 1102 InappropriateInventions \xB7 1103 RoomOffers \xB7 1200 Spam"
);
const RestrictionDto = z.object({
  AccountId: z.int().describe("The restricted account"),
  Name: z.string().describe("Display name of the restriction, e.g. `Chat Mute`. Free text"),
  Description: z.string().describe("What the player may no longer do. Free text"),
  EndDate: z.string().nullable().describe("When it lifts (ISO 8601 UTC); null for one that never does"),
  AssociatedAccountId: z.int().nullable().describe("The other account involved, when there is one"),
  AssociatedAccountUsername: z.string().nullable(),
  ReportCategory: ReportCategory.nullable().describe("The category it was issued under"),
  DisplayReason: z.string().nullable().describe("Reason shown to the player. Free text")
});
function roleLookup(role) {
  return {
    tags: ["Roles"],
    summary: `Whether a player has the ${role} role`,
    description: `Returns a bare JSON boolean (\`true\`/\`false\`), not an object. Off by default and granted only by an operator via \`runx admin grant-${role}\`. The same flag also rides in the access token's \`role\` claim, so the client rarely needs this route.`,
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "Account id. A non-numeric value is treated as unknown (404).",
        schema: { type: "string" }
      }
    ],
    responses: {
      200: json(z.boolean(), `\`true\` if the player has the ${role} role`),
      404: { description: "No such player (empty body)" }
    }
  };
}
const PlatformIdsRequest = z.object({
  id: z.union([z.string(), z.array(z.string())]).describe("Repeated `id=` form fields")
});
export {
  CachedLogin,
  ChangePasswordRequest,
  ChangePasswordResponse,
  FakeCachedLogin,
  OAuthError,
  PlatformIdsRequest,
  PlatformType2 as PlatformType,
  PlatformTypeSchema,
  ReportCategory,
  RestrictionDto,
  TokenRequest,
  TokenResponse,
  form,
  json,
  roleLookup
};
