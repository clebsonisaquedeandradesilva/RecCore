// Ported from apps/lists/src/openapi.ts; TypeScript types erased; native runtime imports.
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
  const f = toOpenApiSchema(schema);
  return {
    description,
    content: {
      "application/x-www-form-urlencoded": { schema: f },
      "multipart/form-data": { schema: f }
    }
  };
}
const UNAUTHORIZED_RESPONSE = { description: "Missing or invalid bearer token (empty body)" };
const AUTHED = [{ bearerAuth: [] }];
const LIST_IDS_PARAM = {
  name: "id",
  in: "query",
  required: false,
  description: [
    "A list id to look up, repeated once per list wanted. Ignored today \u2014 the canned list",
    "is served whatever is asked for, an unknown id included, because a 404 renders as a",
    "row that failed to load rather than one the client hides."
  ].join(" "),
  style: "form",
  explode: true,
  schema: { type: "array", items: { type: "string" } },
  example: ["17859340"]
};
const CREATOR_ACCOUNT_ID_PARAM = {
  name: "creatorAccountId",
  in: "query",
  required: false,
  description: [
    "Who owns the list. Matched exactly against a stored list, and used as the most",
    "specific key against the static captures \u2014 a creator nothing owns falls back to",
    "matching on type and name. Echoed back on an unowned reserved list, so the client",
    "still sees the list it asked for."
  ].join(" "),
  schema: { type: "integer", example: 42 }
};
const LIST_TYPE_PARAM = {
  name: "type",
  in: "query",
  required: false,
  description: [
    "The `ListEntityType` \u2014 what the list\u2019s `ItemIds` are: 0 Accounts \xB7 1 Rooms \xB7",
    "2 Inventions \xB7 3 CustomAvatarItems \xB7 4 PurchasableItems \xB7 5 Generic \xB7 6 ChipAndPort \xB7",
    "7 DiscoverySection \xB7 8 DiscoverySectionSubType. Part of a list\u2019s identity, not a",
    "filter: `__SavedForLater_Rooms` is asked for with `type=1` (its items are room ids)",
    "while every static capture is `type=7` (its items are discovery section keys)."
  ].join(" "),
  schema: { type: "integer", example: 1 }
};
const LIST_NAME_PARAM = {
  name: "name",
  in: "query",
  required: false,
  description: [
    "The list\u2019s name, matched case-insensitively (the casing that arrives is the",
    "client\u2019s). Naming NO list asks for the page default for `type`; naming one that",
    "matches nothing is a 404, unless it is one of the client\u2019s own reserved `__`",
    "playlists, which answers empty."
  ].join(" "),
  schema: { type: "string", example: "__SavedForLater_Rooms" }
};
const SAVE_LIST_NAME_PARAM = {
  name: "name",
  in: "path",
  required: true,
  description: [
    "The caller\u2019s list to save into, created if they have none by that name.",
    "`__SavedForLater_Rooms` is the one the client creates for itself \u2014 the Play menu\u2019s",
    "\u201CSaved for Later\u201D row."
  ].join(" "),
  schema: { type: "string", example: "__SavedForLater_Rooms" }
};
const ITEM_ID_PARAM = {
  name: "itemId",
  in: "path",
  required: true,
  description: [
    "The item to save, as a string \u2014 a room id for the room lists the client builds this",
    "way. Saving the same item twice leaves it in the list once."
  ].join(" "),
  schema: { type: "string", example: "953" }
};
const ALGORITHMIC_LIST_PARAM = {
  name: "list",
  in: "path",
  required: true,
  description: [
    "The row key, matched case-insensitively. `HotList`, `recentlyupdated` and `new` are",
    "ranked for real; `recentlyvisited` is per-caller; the seven `*_algoendpoint` category",
    "rows serve the public rooms carrying one tag; `summerpartycarousel` and `newitems` are",
    "hand-picked store ids. Every other key \u2014 an unknown one included \u2014 answers an empty",
    "row with a 200."
  ].join(" "),
  // Deliberately not an `enum`: an unknown slug is a legal request that answers an empty
  // row, so freezing today's keys here would document a rejection that never happens.
  schema: { type: "string", example: "HotList" }
};
const ALGORITHMIC_TYPE_PARAM = {
  name: "type",
  in: "query",
  required: false,
  description: [
    "The `ListEntityType` the caller wants the row\u2019s ids read as, ECHOED back on the",
    "response \u2014 it tells the client which service to resolve the ids against. A BYTE on",
    "the client, so a value outside 0\u2013255 (or none at all) is answered with 1, Rooms,",
    "which is what the client always asks for. 4 (PurchasableItems) and 5 (Generic) are",
    "answered by the type rather than by the row \u2014 see the endpoint\u2019s description."
  ].join(" "),
  schema: { type: "integer", minimum: 0, maximum: 255, example: 1 }
};
const CuratedListFields = {
  ListId: z.number().describe("64-bit; 0 on an unowned reserved list, since nothing was stored to have an id"),
  CreatorAccountId: z.int().describe("The owner; echoed from the query on a reserved list"),
  Name: z.string(),
  Description: z.string().nullable(),
  ImageName: z.string().nullable().describe(
    "A STRING on any list the client draws a tile for \u2014 it reads this straight into a string field, and empty or null renders that tile blank. `DefaultRoomImage.jpg` where nothing set one. Null only on a list with no tile to draw, like the `RoomGenreTags` capture, whose items are genre names rather than rooms."
  ),
  Type: z.int().describe("The `ListEntityType` \u2014 what the `ItemIds` are"),
  ItemIds: z.string().array().describe(
    "Strings even where they stand for numeric ids, in the order they were added \u2014 which is the order the row displays them."
  ),
  CreatedAt: z.string().describe("ISO-8601 UTC")
};
const CuratedListRead = z.object({
  ...CuratedListFields,
  Accessibility: z.int().optional().describe(
    "The `Accessibility` enum \u2014 0 Private \xB7 1 Public (its Unlisted/Dev members exist but nothing sets one on a list). Carried by every list the read serves, stored or captured; absent from the canned bulk list and from the save\u2019s response."
  )
});
const CuratedListSaved = z.object(CuratedListFields);
const CuratedListsBulk = CuratedListRead.array();
const ListEntityDto = z.object({
  Id: z.string().describe(
    "The room/item id the client resolves itself. On a GENERIC row (`type=5`) it is instead a `<prefix>.<id>` composite with EXACTLY ONE dot \u2014 `0.<int>` a purchasable item, `1.<guid>` a custom avatar item \u2014 since such a row can name things of more than one sort. The integer after `0.` is a `catalog_id`, which is exactly what the generated storefront lists the item under as its `PurchasableItemId` \u2014 catalog ids start at 10000 so they cannot collide with a captured storefront\u2019s own numbering."
  ),
  Context: z.string().nullable().describe("Ranking attribution; always null here")
});
const AlgorithmicList = z.object({
  Type: z.int().describe("The `ListEntityType`, echoed from `?type=` \u2014 see the parameter"),
  Entities: ListEntityDto.array().describe("Empty for a row with nothing behind it")
});
const ContextualFeaturesAck = z.object({
  success: z.literal(true),
  error_id: z.null(),
  error: z.null()
});
const SaveItemBody = z.object({
  type: z.string().optional().describe(
    "The `ListEntityType` the list is created with (integer, as text). Rooms (1) when absent \u2014 every list the client creates this way is a room list, and the type is part of the list\u2019s identity, so another value would strand it where the client\u2019s own `?type=1` read can\u2019t find it."
  ),
  accessibility: z.string().optional().describe(
    "The `Accessibility` enum \u2014 0 Private \xB7 1 Public (integer, as text). PRIVATE when absent: a list a player builds for themselves is theirs to see, and the client sends `accessibility=0`. Applied only on creation \u2014 a later save leaves an existing list\u2019s accessibility alone."
  )
});
export {
  ALGORITHMIC_LIST_PARAM,
  ALGORITHMIC_TYPE_PARAM,
  AUTHED,
  AlgorithmicList,
  CREATOR_ACCOUNT_ID_PARAM,
  ContextualFeaturesAck,
  CuratedListRead,
  CuratedListSaved,
  CuratedListsBulk,
  ITEM_ID_PARAM,
  LIST_IDS_PARAM,
  LIST_NAME_PARAM,
  LIST_TYPE_PARAM,
  ListEntityDto,
  SAVE_LIST_NAME_PARAM,
  SaveItemBody,
  UNAUTHORIZED_RESPONSE,
  form,
  json
};
