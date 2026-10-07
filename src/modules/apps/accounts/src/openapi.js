// Ported from apps/accounts/src/openapi.ts; TypeScript types erased; native runtime imports.
import { resolver } from "../../../../runtime/openapi.js";
import { z } from "../../../../../vendor/zod.js";
import {
  isValidBio,
  isValidEmail,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_USERNAME_LENGTH,
  nameRejection
} from "../../../packages/domain/src/index.js";
import { nameContainsSwears } from "../../api/src/sanitize.js";
function json(schema, description) {
  return { description, content: { "application/json": { schema: resolver(schema) } } };
}
function form(schema, description) {
  const { $schema: _$schema, additionalProperties: _extra, ...jsonSchema } = z.toJSONSchema(schema);
  return {
    description,
    content: {
      // zod's JSONSchema type is far wider than OpenAPI's SchemaObject; cast at the
      // boundary (the emitted value is valid OpenAPI 3.1).
      "application/x-www-form-urlencoded": { schema: jsonSchema },
      "multipart/form-data": { schema: jsonSchema }
    }
  };
}
const AccountDto = z.object({
  accountId: z.int(),
  username: z.string(),
  displayName: z.string(),
  profileImage: z.string().describe("Avatar object key"),
  bannerImage: z.string().describe('Profile banner key \u2014 always "" (nothing sets it yet)'),
  displayEmoji: z.string().describe('Emoji beside the display name, set by PUT /account/me/emoji; "" when unset'),
  isJunior: z.boolean(),
  platforms: z.int().describe("PlatformType bitmask of linked platforms"),
  personalPronouns: z.int().describe("Pronoun flags bitmask"),
  identityFlags: z.int().describe("Identity flags bitmask"),
  createdAt: z.iso.datetime()
});
const SelfAccountDto = AccountDto.extend({
  email: z.string().describe(
    '"" when unset \u2014 never null: the client reads it as a string, and the hub frame this DTO also rides drops null values outright'
  ),
  birthday: z.iso.datetime().describe("A fixed placeholder \u2014 birthdays are not stored"),
  availableUsernameChanges: z.int().describe("Remaining username changes")
});
const BioResponse = z.object({
  accountId: z.int(),
  bio: z.string().describe('"" when unset')
});
const SuccessResponse = z.object({ success: z.literal(true) });
function envelope(value) {
  return z.object({
    success: z.boolean(),
    value,
    error: z.string().optional().describe("Present (with success:false) on failure")
  });
}
const UsernameResult = envelope(z.union([AccountDto, z.literal("")])).describe(
  'value is the updated account on success, "" on failure'
);
const CreateAccountResult = envelope(AccountDto);
const ParentalControl = z.object({ accountId: z.int(), disallowInAppPurchases: z.boolean() });
const PrivacySettings = z.object({ accountId: z.int(), isRecentHistoryVisible: z.boolean() });
const WhitelistedEmojis = z.string().array().describe("The emoji a player may set as their displayEmoji, in picker order");
const HealthResponse = z.object({ service: z.literal("accounts"), status: z.literal("ok") });
const CreateAccountRequest = z.object({
  platform: z.string().optional().describe("PlatformType integer string; defaults to 0"),
  platformId: z.string().optional().describe("Parsed for fidelity; currently unused")
});
const nameCheck = (label, max) => z.string().trim().superRefine((value, ctx) => {
  const rejection = nameRejection(value, label, max);
  if (rejection !== null) {
    ctx.addIssue({ code: "custom", message: rejection });
  } else if (nameContainsSwears(value)) {
    ctx.addIssue({ code: "custom", message: `Your ${label} can't contain that word.` });
  }
});
const DisplayNameRequest = z.object({
  displayName: nameCheck("display name", MAX_DISPLAY_NAME_LENGTH).min(1).describe(
    "Trimmed; letters and digits only, max 15, no profanity. Empty or invalid is rejected (400)"
  )
});
const UsernameRequest = z.object({
  username: nameCheck("username", MAX_USERNAME_LENGTH).min(1, "You must enter a username.").describe(
    "Trimmed; letters and digits only, max 50, no profanity. Must be unique and changes must remain"
  )
});
const EmailRequest = z.object({
  email: z.string().trim().refine(isValidEmail, "That email address looks wrong.").describe("A syntactically valid address (RFC 5321/5322, so at most 254); otherwise 400")
});
const PhoneRequest = z.object({
  // No shape rule on purpose: the client sends E.164 (`+15552223333`), which the name
  // rule above would reject outright by eating the leading `+`.
  phone: z.string().trim().min(1).describe("Trimmed; empty is rejected (400)")
});
const IdentityFlagsRequest = z.object({
  identityFlags: z.string().describe("Integer string bitmask; non-numeric is 400")
});
const PronounsRequest = z.object({
  pronounFlags: z.string().describe("Integer string bitmask; non-numeric is 400")
});
const BioRequest = z.object({
  // Not trimmed — a bio is free text, and leading whitespace is the player's business.
  bio: z.string().refine(isValidBio).describe("Free text, max 255; empty is allowed")
});
const EmojiRequest = z.object({
  displayEmoji: z.string().describe('A whitelisted emoji, or "" to clear')
});
const ProfileImageRequest = z.object({
  imageName: z.string().describe("Avatar object key; empty is rejected (400)")
});
const BannerImageRequest = z.object({
  imageName: z.string().describe("Banner object key; empty is rejected (400)")
});
export {
  AccountDto,
  BannerImageRequest,
  BioRequest,
  BioResponse,
  CreateAccountRequest,
  CreateAccountResult,
  DisplayNameRequest,
  EmailRequest,
  EmojiRequest,
  HealthResponse,
  IdentityFlagsRequest,
  ParentalControl,
  PhoneRequest,
  PrivacySettings,
  ProfileImageRequest,
  PronounsRequest,
  SelfAccountDto,
  SuccessResponse,
  UsernameRequest,
  UsernameResult,
  WhitelistedEmojis,
  envelope,
  form,
  json
};
